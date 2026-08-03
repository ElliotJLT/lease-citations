from __future__ import annotations

import json
from collections.abc import AsyncIterator
from dataclasses import dataclass

import structlog
from pydantic_ai import Agent

from takehome.config import settings

# Importing settings is what exports ANTHROPIC_API_KEY into the environment; pydantic-ai's
# Anthropic client reads it when the Agent below is constructed. Bound explicitly so the
# dependency is visible to readers and linters rather than resting on import order.
_ = settings.anthropic_api_key

logger = structlog.get_logger()

# Separates the prose answer from the machine-readable evidence that follows it. Never shown
# to the user: the stream parser stops forwarding text here.
SOURCES_SENTINEL = "<<<SOURCES>>>"

agent = Agent(
    "anthropic:claude-haiku-4-5-20251001",
    system_prompt=(
        "You are a legal document assistant for commercial real estate lawyers reviewing "
        "documents during due diligence. Your answers are acted on by a professional who is "
        "accountable for every statement they pass to a client, so being wrong is far worse "
        "than being incomplete.\n\n"
        "ANSWERING\n"
        "- Answer only from the document provided. Never supply legal knowledge the document "
        "does not contain.\n"
        "- If the document does not address the question, say so plainly and stop. That is a "
        "useful answer, not a failure.\n"
        "- Be concise and precise. Reference the clause or section you are relying on.\n\n"
        "EVIDENCE\n"
        f"- After your answer, output the line {SOURCES_SENTINEL} and then a JSON array "
        "supporting your claims.\n"
        '- Each entry is {"label": "...", "quote": "..."}. `label` is how a lawyer would '
        'cite it ("Clause 3.2.1", "Schedule 3, paragraph 2"). `quote` is the passage itself.\n'
        "- Quote the document's exact wording. Do not paraphrase, summarise, join separate "
        "passages, or correct apparent errors.\n"
        "- Write each quote on a single line: replace the line breaks the document wraps with "
        "single spaces. The words must be exact; only the line wrapping may change.\n"
        "- Quote a complete phrase of roughly 10-40 words — long enough to stand as evidence "
        "on its own.\n"
        "- Cite the full set of provisions the position depends on, not only the passage that "
        "states the conclusion: the operative clause, any definitions it relies on, and any "
        "conditions, exceptions or schedule provisions that qualify it. A correctly cited "
        "answer that misses a qualifying provision is still wrong for the lawyer relying on "
        "it.\n"
        "- Every quote is checked automatically against the document. A quote that cannot be "
        "found is shown to the lawyer as unverified, which undermines the whole answer, so "
        "never guess at wording you are unsure of.\n"
        "- If nothing in the document supports your answer, output an empty array. Do not cite "
        "passages that merely sound relevant.\n"
        "- Output nothing after the JSON array."
    ),
)


@dataclass(frozen=True)
class TextDelta:
    """A chunk of the answer, for display."""

    text: str


@dataclass(frozen=True)
class CitationBlock:
    """The model's `(label, quote)` pairs, still unverified."""

    items: list[tuple[str, str]]


ChatEvent = TextDelta | CitationBlock


async def generate_title(user_message: str) -> str:
    """Generate a 3-5 word conversation title from the first user message."""
    result = await agent.run(
        f"Generate a concise 3-5 word title for a conversation that starts with: '{user_message}'. "
        "Return only the title, nothing else."
    )
    title = str(result.output).strip().strip('"').strip("'")
    if len(title) > 100:
        title = title[:97] + "..."
    return title


def _escape_literal_newlines(text: str) -> str:
    """Escape raw control characters that appear inside JSON string literals.

    Quoting a PDF tempts the model to carry the document's line wrapping into the JSON, which
    is not legal JSON. The words are still exactly right, so the block is worth repairing
    rather than discarding.
    """
    out: list[str] = []
    in_string = False
    escaped = False

    for char in text:
        if escaped:
            out.append(char)
            escaped = False
            continue
        if char == "\\":
            out.append(char)
            escaped = True
            continue
        if char == '"':
            in_string = not in_string
            out.append(char)
            continue
        if in_string and char in "\n\r\t":
            out.append({"\n": "\\n", "\r": "\\r", "\t": "\\t"}[char])
            continue
        out.append(char)

    return "".join(out)


def parse_citation_block(raw: str) -> list[tuple[str, str]]:
    """Read `(label, quote)` pairs out of the model's trailing JSON.

    Malformed output yields no citations rather than an error: the answer is still useful,
    and an answer with no evidence is a state the interface already has to handle honestly.
    """
    text = raw.strip()
    if not text:
        return []

    start, end = text.find("["), text.rfind("]")
    if start == -1 or end <= start:
        logger.warning("Citation block was not a JSON array", raw=text[:200])
        return []

    block = text[start : end + 1]
    try:
        parsed = json.loads(block)
    except json.JSONDecodeError:
        try:
            parsed = json.loads(_escape_literal_newlines(block))
        except json.JSONDecodeError:
            logger.warning("Citation block failed to parse", raw=block[:300])
            return []

    if not isinstance(parsed, list):
        return []

    pairs: list[tuple[str, str]] = []
    for entry in parsed:  # type: ignore[union-attr]
        if not isinstance(entry, dict):
            continue
        quote = entry.get("quote")  # type: ignore[union-attr]
        if not isinstance(quote, str) or not quote.strip():
            continue
        label = entry.get("label")  # type: ignore[union-attr]
        pairs.append((label if isinstance(label, str) else "", quote))

    return pairs


async def chat_with_document(
    user_message: str,
    document_text: str | None,
    conversation_history: list[dict[str, str]],
) -> AsyncIterator[ChatEvent]:
    """Stream an answer, then the evidence the model offers for it.

    Text deltas are forwarded as they arrive, holding back just enough to recognise the
    sentinel before any of it reaches the user. Everything after the sentinel is buffered and
    emitted once, parsed, as a single `CitationBlock`.
    """
    prompt_parts: list[str] = []

    if document_text:
        prompt_parts.append(
            "The following is the content of the document being discussed:\n\n"
            "<document>\n"
            f"{document_text}\n"
            "</document>\n"
        )
    else:
        prompt_parts.append(
            "No document has been uploaded yet. If the user asks about a document, "
            "let them know they need to upload one first.\n"
        )

    if conversation_history:
        prompt_parts.append("Previous conversation:\n")
        for msg in conversation_history:
            role, content = msg["role"], msg["content"]
            if role in ("user", "assistant"):
                prompt_parts.append(f"{role.capitalize()}: {content}\n")
        prompt_parts.append("\n")

    prompt_parts.append(f"User: {user_message}")
    full_prompt = "\n".join(prompt_parts)

    display_buffer = ""
    sources_buffer = ""
    in_sources = False

    async with agent.run_stream(full_prompt) as result:
        async for delta in result.stream_text(delta=True):
            if in_sources:
                sources_buffer += delta
                continue

            display_buffer += delta
            marker = display_buffer.find(SOURCES_SENTINEL)

            if marker != -1:
                in_sources = True
                sources_buffer = display_buffer[marker + len(SOURCES_SENTINEL) :]
                remaining = display_buffer[:marker]
                display_buffer = ""
                if remaining:
                    yield TextDelta(remaining)
                continue

            # Hold back enough characters that a sentinel split across deltas is still caught.
            safe = len(display_buffer) - (len(SOURCES_SENTINEL) - 1)
            if safe > 0:
                yield TextDelta(display_buffer[:safe])
                display_buffer = display_buffer[safe:]

    if display_buffer and not in_sources:
        yield TextDelta(display_buffer)

    yield CitationBlock(parse_citation_block(sources_buffer))
