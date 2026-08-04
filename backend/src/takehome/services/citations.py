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

# Page-number footers are furniture too, but repetition can't find them: "Page 4" and "Page 5"
# are different strings, so each occurs exactly once.
PAGE_NUMBER_LINE = re.compile(r"^(?:page\s+)?\d+$", re.IGNORECASE)

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

# Punctuation the model tends to add or drop at the *edges* of a quote when it stops
# mid-sentence. Trimmed from the quote's ends before matching: it cannot change a word, only
# where the quotation was cut. Punctuation inside the quote is left strictly alone.
BOUNDARY_PUNCTUATION = " \t\n.,;:\"'“”‘’"

# A hyphen the extractor left behind when the PDF wrapped a word across two lines
# ("accord-\nance"). The hyphen belongs to the layout, not to the word.
LINE_BREAK_HYPHEN = re.compile(r"[-‐‑‒–—―−]\s*\n")

SOFT_HYPHEN = "­"


@dataclass(frozen=True)
class Citation:
    """A claim's supporting evidence, after checking it against the document."""

    label: str
    quote: str
    page: int | None
    verified: bool


def page_furniture(document_text: str) -> frozenset[str]:
    """Running headers and footers, detected by repetition across pages.

    A clause that runs over a page break has the page's header extracted into the middle of
    its own sentence, so a lawyer's correct quote fails to match. These lines are furniture,
    not text, and folding has to step over them the same way it steps over page markers.

    Detected rather than configured: a line is furniture if it appears on at least half the
    pages. Length-capped so a genuinely repeated clause can never be mistaken for a header.
    """
    starts = [m.end() for m in PAGE_MARKER.finditer(document_text)]
    if len(starts) < 2:
        return frozenset()

    bounds = list(zip(starts, [*starts[1:], len(document_text)], strict=True))
    counts: dict[str, int] = {}
    for start, end in bounds:
        seen_on_this_page = {
            line.strip()
            for line in document_text[start:end].splitlines()
            if line.strip() and len(line.strip()) <= 100
        }
        for line in seen_on_this_page:
            counts[line] = counts.get(line, 0) + 1

    threshold = max(2, len(bounds) // 2)
    return frozenset(line for line, count in counts.items() if count >= threshold)


def _fold(text: str, furniture: frozenset[str] = frozenset()) -> tuple[str, list[int]]:
    """Normalise `text`, returning it alongside a map from each output character
    back to its index in the input.

    Page markers and any `furniture` lines are folded to whitespace, so a quote spanning a
    page break still matches across whatever the extractor inserted at the boundary.
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

        # At the start of a line, step over the whole line if it's page furniture.
        if index == 0 or text[index - 1] == "\n":
            line_end = text.find("\n", index)
            line_end = len(text) if line_end == -1 else line_end
            line = text[index:line_end].strip()
            if line and (line in furniture or PAGE_NUMBER_LINE.match(line)):
                skip_until = line_end
                pending_space = bool(out)
                continue

        # A word broken across lines by the PDF's wrapping: drop the hyphen *and* the break
        # after it, so "accord-\nance" folds to "accordance" rather than "accord ance".
        wrapped = LINE_BREAK_HYPHEN.match(text, index)
        if wrapped is not None:
            skip_until = wrapped.end()
            continue

        if char == SOFT_HYPHEN:
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


def reflow(span: str, furniture: frozenset[str] = frozenset()) -> str:
    """Collapse the line breaks PDF extraction leaves mid-sentence, and drop any running
    header, footer or page number that falls inside a quote spanning a page break.

    A quote that crosses a page boundary has the next page's furniture sitting between its
    words in the raw extracted text: `document_text[start:end]` is a plain character slice, so
    it carries those lines along even though `_fold()` already knows to step over them for
    matching. Passing the same `furniture` set here means a span is judged and displayed by the
    same rule — what survives is the document's own wording, never a header spliced into a
    clause because the clause happened to turn a page.
    """
    lines = [
        line
        for line in PAGE_MARKER.sub("\n", span).splitlines()
        if line.strip() not in furniture and not PAGE_NUMBER_LINE.match(line.strip())
    ]
    return re.sub(r"\s+", " ", " ".join(lines)).strip()


def _dedupe_key(quote: str) -> str:
    """Identity of a quoted span, insensitive to case, wrapping and edge punctuation."""
    folded, _ = _fold(quote)
    return folded.strip(" .,;:—-")


def page_for_offset(document_text: str, offset: int) -> int | None:
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
    # Trim punctuation the model added or dropped where it cut the quotation. Every word must
    # still match exactly — this only forgives *where* the quote starts and stops, which is
    # the model's editorial choice rather than the document's wording.
    cleaned = quote.strip().strip(BOUNDARY_PUNCTUATION)

    if not document_text or len(cleaned) < MIN_QUOTE_CHARS:
        return Citation(label=label, quote=cleaned, page=None, verified=False)

    furniture = page_furniture(document_text)
    haystack, origin = _fold(document_text, furniture)
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
        quote=reflow(document_text[start:end], furniture),
        page=page_for_offset(document_text, start),
        verified=True,
    )


def _verify_all(
    raw: list[tuple[str, str]], document_text: str | None
) -> tuple[list[tuple[int, Citation]], dict[int, Citation]]:
    """Verify every offered quote in a single pass, keeping two views of the result.

    The first is the surviving, deduplicated citations in first-occurrence order — what
    `verify_all_with_origin` has always returned. The second maps *every* offered index,
    including the later duplicates the first view drops, onto the citation its span actually
    resolved to. A lawyer's citation list should show one row per span, not one per quote the
    model happened to write — but something that refers to sources by their original position
    (a marker naming source 5, say, when 5 duplicated source 2) still needs an answer for every
    index, not just the ones that survived deduplication. Both views come from the same loop
    because verifying is the only expensive step here; nothing about *how* a quote is checked
    changes between them.
    """
    results: list[tuple[int, Citation]] = []
    by_index: dict[int, Citation] = {}
    seen: dict[str, Citation] = {}

    for index, (label, quote) in enumerate(raw):
        checked = verify_quote(quote, document_text)
        key = _dedupe_key(checked.quote)
        if not key:
            continue
        if key in seen:
            by_index[index] = seen[key]
            continue
        citation = Citation(
            label=label.strip() or "Cited passage",
            quote=checked.quote,
            page=checked.page,
            verified=checked.verified,
        )
        seen[key] = citation
        by_index[index] = citation
        results.append((index, citation))

    return results, by_index


def verify_all_with_origin(
    raw: list[tuple[str, str]], document_text: str | None
) -> list[tuple[int, Citation]]:
    """`verify_all`, but each citation keeps its index in `raw`.

    Deduplication means the surviving citations no longer line up with the list the model
    supplied, so anything referring to sources by position — a claim naming the sources it
    rests on — needs the original index to map onto them.
    """
    results, _ = _verify_all(raw, document_text)
    return results


def verify_all_by_index(
    raw: list[tuple[str, str]], document_text: str | None
) -> dict[int, Citation]:
    """Every offered index, mapped onto the citation its quote resolved to.

    Unlike `verify_all_with_origin`, this does not drop the later index of an exact-duplicate
    quote — it maps that index onto the same citation the earlier one resolved to. Built for
    callers where a duplicate index is still a live reference that has to resolve to
    *something* (an inline `[[n]]` marker, say), where `verify_all_with_origin`'s silent drop
    would otherwise be indistinguishable from "this citation could not be checked at all".
    """
    _, by_index = _verify_all(raw, document_text)
    return by_index


def verify_all(raw: list[tuple[str, str]], document_text: str | None) -> list[Citation]:
    """Verify `(label, quote)` pairs, dropping duplicates of the same document span."""
    return [citation for _, citation in verify_all_with_origin(raw, document_text)]
