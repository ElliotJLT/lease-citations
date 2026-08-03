"""Verification of model-supplied quotes against the source document.

The model is asked to support each claim with a verbatim quote. Nothing here trusts it: a
quote counts as evidence only if it can be located in the text extracted from the PDF. What
gets stored and shown to the lawyer is the *document's* span, not the model's transcription of
it, so a paraphrase can never masquerade as a quotation.

Matching normalises whitespace, unicode punctuation and case, because PDF extraction inserts
line breaks mid-sentence and substitutes typographic characters. It deliberately does not do
fuzzy or semantic matching — a near-miss is reported as unverified rather than quietly
accepted.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

# document.py writes one of these ahead of every page of extracted text.
PAGE_MARKER = re.compile(r"---\s*Page\s+(\d+)\s*---")

# Typographic characters PDF extraction introduces, mapped back to their ASCII equivalents.
_PUNCTUATION = {
    "‘": "'",
    "’": "'",
    "‚": "'",
    "“": '"',
    "”": '"',
    "„": '"',
    "‐": "-",
    "‑": "-",
    "‒": "-",
    "–": "-",
    "—": "-",
    "―": "-",
    "−": "-",
    " ": " ",
    "…": "...",
}

MIN_QUOTE_CHARS = 12


@dataclass(frozen=True)
class Citation:
    """A claim's supporting evidence, after checking it against the document."""

    label: str
    quote: str
    page: int | None
    verified: bool


def _fold(text: str) -> tuple[str, list[int]]:
    """Normalise `text`, returning it alongside a map from each output character
    back to its index in the input.

    Page markers are folded to whitespace so a quote spanning a page break still matches.
    """
    out: list[str] = []
    origin: list[int] = []
    skip_until = 0
    pending_space = False

    for index, char in enumerate(text):
        if index < skip_until:
            continue

        marker = PAGE_MARKER.match(text, index)
        if marker is not None:
            skip_until = marker.end()
            pending_space = bool(out)
            continue

        char = _PUNCTUATION.get(char, char)
        if char.isspace():
            pending_space = bool(out)
            continue

        if pending_space:
            out.append(" ")
            origin.append(index)
            pending_space = False

        for folded in unicodedata.normalize("NFKD", char.lower()):
            if unicodedata.combining(folded):
                continue
            out.append(folded)
            origin.append(index)

    return "".join(out), origin


def _reflow(span: str) -> str:
    """Collapse the line breaks PDF extraction leaves mid-sentence.

    The wording stays the document's; only its wrapping is dropped, so a quote reads as
    prose in the interface instead of carrying the page's column width around with it.
    """
    return re.sub(r"\s+", " ", PAGE_MARKER.sub(" ", span)).strip()


def _dedupe_key(quote: str) -> str:
    """Identity of a quoted span, insensitive to case, wrapping and edge punctuation."""
    folded, _ = _fold(quote)
    return folded.strip(" .,;:—-")


def _page_for_offset(document_text: str, offset: int) -> int | None:
    """The page whose marker most recently precedes `offset`."""
    page: int | None = None
    for marker in PAGE_MARKER.finditer(document_text):
        if marker.start() > offset:
            break
        page = int(marker.group(1))
    return page


def verify_quote(quote: str, document_text: str | None) -> Citation:
    """Locate `quote` in `document_text`.

    On success the citation carries the document's own wording and the page it appears on.
    On failure it carries the model's quote, flagged unverified, so the interface can warn
    rather than silently drop it.
    """
    label = ""  # set by the caller; kept out of matching entirely
    cleaned = quote.strip()

    if not document_text or len(cleaned) < MIN_QUOTE_CHARS:
        return Citation(label=label, quote=cleaned, page=None, verified=False)

    haystack, origin = _fold(document_text)
    needle, _ = _fold(cleaned)

    if not needle:
        return Citation(label=label, quote=cleaned, page=None, verified=False)

    position = haystack.find(needle)
    if position == -1:
        return Citation(label=label, quote=cleaned, page=None, verified=False)

    start = origin[position]
    end = origin[position + len(needle) - 1] + 1

    return Citation(
        label=label,
        quote=_reflow(document_text[start:end]),
        page=_page_for_offset(document_text, start),
        verified=True,
    )


def verify_all(
    raw: list[tuple[str, str]], document_text: str | None
) -> list[Citation]:
    """Verify `(label, quote)` pairs, dropping duplicates of the same document span."""
    citations: list[Citation] = []
    seen: set[str] = set()

    for label, quote in raw:
        checked = verify_quote(quote, document_text)
        key = _dedupe_key(checked.quote)
        if not key or key in seen:
            continue
        seen.add(key)
        citations.append(
            Citation(
                label=label.strip() or "Cited passage",
                quote=checked.quote,
                page=checked.page,
                verified=checked.verified,
            )
        )

    return citations
