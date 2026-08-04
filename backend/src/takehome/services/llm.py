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
        "- If you cannot find a provision addressing the question, say that you could not "
        "identify one in this document, and stop. Do not say the document is silent on the "
        "subject or that it does not address it — you have read this document, but you cannot "
        "establish that a subject is absent from a transaction, and a lawyer may rely on the "
        "difference. Not finding something is a useful answer, not a failure.\n"
        "- Be concise and precise. Reference the clause or section you are relying on.\n\n"
        "EVIDENCE\n"
        f"- After your answer, output the line {SOURCES_SENTINEL} and then a JSON object with "
        'two keys: "sources" and "claims".\n'
        '- "sources" is an array of {"label": "...", "quote": "..."}. `label` is how a lawyer '
        'would cite it ("Clause 3.2.1", "Schedule 3, paragraph 2"). `quote` is the passage '
        "itself.\n"
        '- "claims" is an array of {"text": "...", "sources": [0, 2]}. Each entry is one '
        "proposition your answer asks the lawyer to rely on, written as a single plain "
        "sentence, and the indices of the sources in the array above that support that "
        "specific proposition.\n"
        "- Break the answer into the propositions a lawyer would evaluate separately, and "
        "attach each source to the proposition it actually supports rather than listing "
        "everything against everything. Every source should appear under at least one claim.\n"
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
class ClaimRef:
    """One proposition the answer rests on, and the sources offered for it (by index)."""

    text: str
    source_indices: list[int]


@dataclass(frozen=True)
class CitationBlock:
    """The model's evidence, still unverified: `(label, quote)` pairs and the claims
    each was offered for. `claims` is empty when the model returns the older bare array."""

    items: list[tuple[str, str]]
    claims: list[ClaimRef]


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


def _extract_json(raw: str) -> object | None:
    """Pull the JSON object or array out of the model's trailing block, repairing the
    literal newlines a quoted passage tends to carry in with it."""
    text = raw.strip()
    if not text:
        return None

    # Whichever bracket opens first is the outer value. Searching for "{" unconditionally
    # would pick the first *element* out of a bare array of sources.
    pairs = [("{", "}"), ("[", "]")]
    pairs.sort(key=lambda p: text.find(p[0]) if p[0] in text else len(text))

    for opener, closer in pairs:
        start, end = text.find(opener), text.rfind(closer)
        if start == -1 or end <= start:
            continue
        block = text[start : end + 1]
        for candidate in (block, _escape_literal_newlines(block)):
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                continue

    logger.warning("Evidence block failed to parse", raw=text[:300])
    return None


def _read_sources(entries: object) -> list[tuple[str, str]]:
    if not isinstance(entries, list):
        return []
    items: list[object] = list(entries)  # type: ignore[arg-type]
    pairs: list[tuple[str, str]] = []
    for entry in items:
        if not isinstance(entry, dict):
            continue
        quote = entry.get("quote")  # type: ignore[union-attr]
        if not isinstance(quote, str) or not quote.strip():
            continue
        label = entry.get("label")  # type: ignore[union-attr]
        pairs.append((label if isinstance(label, str) else "", quote))
    return pairs


def _read_claims(entries: object, source_count: int) -> list[ClaimRef]:
    """Claims, keeping only source indices that actually exist. A claim whose sources all
    fall away is still kept — the proposition was made, and that it has nothing behind it
    is the more interesting fact."""
    if not isinstance(entries, list):
        return []
    rows: list[object] = list(entries)  # type: ignore[arg-type]
    claims: list[ClaimRef] = []
    for entry in rows:
        if not isinstance(entry, dict):
            continue
        text = entry.get("text")  # type: ignore[union-attr]
        if not isinstance(text, str) or not text.strip():
            continue
        raw_indices: object = entry.get("sources")  # type: ignore[union-attr]
        candidates: list[object] = (
            list(raw_indices) if isinstance(raw_indices, list) else []  # type: ignore[arg-type]
        )
        indices = [
            i for i in candidates if isinstance(i, int) and 0 <= i < source_count
        ]
        claims.append(ClaimRef(text=text.strip(), source_indices=indices))
    return claims


def parse_citation_block(raw: str) -> CitationBlock:
    """Read the model's evidence out of its trailing JSON.

    Accepts the object form (`{"sources": [...], "claims": [...]}`) and the older bare array
    of sources, so a model that ignores half the instruction still produces usable citations.
    Malformed output yields no evidence rather than an error: the answer is still useful, and
    an answer with nothing behind it is a state the interface already handles honestly.
    """
    parsed = _extract_json(raw)
    if parsed is None:
        return CitationBlock(items=[], claims=[])

    if isinstance(parsed, list):
        # Older bare-array form: sources only, no claim bindings.
        return CitationBlock(items=_read_sources(list(parsed)), claims=[])  # type: ignore[arg-type]

    if isinstance(parsed, dict):
        body: dict[str, object] = parsed  # type: ignore[assignment]
        sources = _read_sources(body.get("sources"))
        return CitationBlock(
            items=sources, claims=_read_claims(body.get("claims"), len(sources))
        )

    return CitationBlock(items=[], claims=[])


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

    yield parse_citation_block(sources_buffer)
