"""What a cited passage depends on — the "read with" list.

A citation answers *where did this come from*. It does not answer *do I now have the whole
position*, and in a lease those are different questions: clause 3.2.1 defers to clauses 3.2.2
to 3.2.5 for how the rent is actually determined, and turns on "Reviewed Rent", a term defined
elsewhere. A lawyer reading only the cited passage has been told the truth and still doesn't
have the answer.

The discipline is the same as the verifier's: this **resolves, it never infers**. A defined
term is listed only if the document defines it; a cross-reference only if the clause it names
can be located. Nothing here guesses which provisions are "related" — that would be exactly
the unverifiable trust signal this build exists to remove.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from takehome.services.citations import PAGE_MARKER, page_for_offset, reflow

# `"the Reviewed Rent" means ...` / `"Premises" means ...` — the standard definitions form.
DEFINITION = re.compile(
    r"[\"“]([^\"”\n]{2,60})[\"”]\s+means\b",
    re.IGNORECASE,
)

# A capitalised term used mid-sentence, which in a lease signals a defined term.
CANDIDATE_TERM = re.compile(r"\b(?:[A-Z][a-z]+)(?:\s+[A-Z][a-z]+)*\b")

# "clause 3.2.2", "clauses 3.2.2 to 3.2.5", "Schedule 3"
REFERENCE = re.compile(
    r"\b(?:clauses?|schedules?|paragraphs?)\s+(\d+(?:\.\d+)*)"
    r"(?:\s*(?:to|and|-|–)\s*(\d+(?:\.\d+)*))?",
    re.IGNORECASE,
)

MAX_ITEMS = 6
SNIPPET_CHARS = 260


@dataclass(frozen=True)
class TrailItem:
    """A provision the cited passage depends on. `kind` is "definition" or "cross-reference"."""

    kind: str
    label: str
    text: str
    page: int | None


def _definitions_index(document_text: str) -> dict[str, tuple[str, int | None]]:
    """Every `"X" means ...` in the document, mapped to its text and page."""
    index: dict[str, tuple[str, int | None]] = {}
    for match in DEFINITION.finditer(document_text):
        term = match.group(1).strip()
        # Leases write both `"the Review Dates"` and `Review Dates`; index the bare form.
        bare = re.sub(r"^(the|a|an)\s+", "", term, flags=re.IGNORECASE).strip()
        end = document_text.find("\n\n", match.end())
        end = match.end() + SNIPPET_CHARS if end == -1 else min(end, match.end() + SNIPPET_CHARS)
        snippet = reflow(document_text[match.start() : end])
        page = page_for_offset(document_text, match.start())
        keys = {term.lower(), bare.lower()}
        # Leases define "the Review Dates" but clauses say "each Review Date".
        keys |= {k[:-1] for k in list(keys) if k.endswith("s")}
        for key in keys:
            index.setdefault(key, (snippet, page))
    return index


def _locate_clause(document_text: str, number: str) -> tuple[str, int | None] | None:
    """Find where a clause number is *defined* — a line that opens with it."""
    pattern = re.compile(rf"^\s*{re.escape(number)}\s+(?=[A-Z\"“])", re.MULTILINE)
    match = pattern.search(document_text)
    if match is None:
        return None
    end = document_text.find("\n\n", match.end())
    end = match.end() + SNIPPET_CHARS if end == -1 else min(end, match.end() + SNIPPET_CHARS)
    body = reflow(PAGE_MARKER.sub(" ", document_text[match.start() : end]))
    return body, page_for_offset(document_text, match.start())


def build_trail(quote: str, document_text: str | None) -> list[TrailItem]:
    """The provisions `quote` depends on, in the order a lawyer would follow them.

    Cross-references first (they carry the operative detail), then definitions.
    """
    if not document_text or not quote.strip():
        return []

    items: list[TrailItem] = []
    seen: set[str] = set()

    for match in REFERENCE.finditer(quote):
        for number in (match.group(1), match.group(2)):
            if not number or number in seen:
                continue
            located = _locate_clause(document_text, number)
            if located is None:
                continue  # a reference we can't resolve is simply not shown
            seen.add(number)
            # "this clause 3.2" resolves to the block the quote already sits inside. Sending
            # a lawyer back to what they're already reading is noise, not evidence.
            if reflow(quote)[:60].lower() in located[0].lower():
                continue
            items.append(
                TrailItem(
                    kind="cross-reference",
                    label=f"Clause {number}",
                    text=located[0],
                    page=located[1],
                )
            )

    definitions = _definitions_index(document_text)
    if definitions:
        for match in CANDIDATE_TERM.finditer(quote):
            term = match.group(0)
            key = term.lower()
            if key in seen or key not in definitions:
                continue
            seen.add(key)
            snippet, page = definitions[key]
            items.append(
                TrailItem(kind="definition", label=term, text=snippet, page=page)
            )

    return items[:MAX_ITEMS]
