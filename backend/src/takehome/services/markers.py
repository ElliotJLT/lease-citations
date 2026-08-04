"""Native citation markers: from the `[[n]]` the model writes inline to the `[[c:<id>]]`
stored on the message, and the claims a lawyer sees — recovered from where those markers
land, not from a second, separate list the model authors.

The old contract had the model write prose, then a detached JSON array of claims paraphrasing
what it had just said. Two representations of the same answer drift: a claim's text was never
provably the sentence it stood for, only the model's gloss on it. Under this contract the model
places the marker itself, at the exact point in its own prose a proposition ends — so marker
position is model-authored and exact. Everything here is a pure, deterministic read of that
position: no fuzzy matching, no re-deriving what the model "meant", the same discipline
`services/citations.py` and `services/trail.py` hold themselves to.
"""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class ClaimRef:
    """One proposition the answer rests on, and the sources offered for it (by index).

    Defined here rather than beside the model client because this is where propositions now
    come from: recovered from where the model placed its inline `[[n]]` markers. Keeping it
    here also keeps this module free of any import that reaches the Anthropic client, so the
    marker logic — which is pure string work — stays testable without an API key.
    """

    text: str
    source_indices: list[int]


# `[[n]]` — the model's own anchor, written immediately after the proposition it supports.
# `n` is 1-based, matching how the prompt asks the model to count its own `sources` array.
MARKER = re.compile(r"\[\[(\d+)\]\]")

# A run of markers separated only by horizontal whitespace is one group: "...rent. [[2]] [[3]]"
# cites two sources for a single proposition, not two adjacent (and oddly empty) propositions.
_MARKER_RUN = re.compile(r"\[\[\d+\]\](?:[ \t]*\[\[\d+\]\])*")

# Paragraphs are blank-line separated — the same convention the prompt asks the model to write
# in (plain prose paragraphs, simple "- " bullets, nothing the renderer can't show). A claim
# never crosses this boundary: a proposition belongs to the paragraph that states it, so a
# marker at the top of paragraph two can never accidentally absorb the tail of paragraph one.
_PARAGRAPH_BREAK = re.compile(r"\n[ \t]*\n+")


@dataclass(frozen=True)
class _MarkerGroup:
    """One run of adjacent `[[n]]` markers, as found in the model's raw prose."""

    start: int  # offset of the run's first "["
    end: int  # offset just past the run's last "]"
    indices: list[int]  # 0-based positions into the model's `sources` array (n - 1)


def _groups(text: str) -> list[_MarkerGroup]:
    groups: list[_MarkerGroup] = []
    for run in _MARKER_RUN.finditer(text):
        indices = [int(n) - 1 for n in MARKER.findall(run.group(0))]
        groups.append(_MarkerGroup(start=run.start(), end=run.end(), indices=indices))
    return groups


def _paragraphs(text: str) -> list[tuple[int, int]]:
    """Character spans of each paragraph, covering the whole text with no gaps.

    Falls back to the entire text as one paragraph when there is no blank line at all —
    a short answer is still a valid answer, just one with nothing to be a boundary.
    """
    spans: list[tuple[int, int]] = []
    pos = 0
    for brk in _PARAGRAPH_BREAK.finditer(text):
        if brk.start() > pos:
            spans.append((pos, brk.start()))
        pos = brk.end()
    if pos < len(text):
        spans.append((pos, len(text)))
    return spans


def rewrite_markers(text: str, id_by_index: dict[int, str]) -> str:
    """Replace each `[[n]]` with the stable `[[c:<citation_id>]]` the frontend renders.

    `id_by_index` is keyed by the model's own 0-based source position (n - 1) and should cover
    every offered source that resolved to a citation row, verified or not — a not-located
    citation still keeps its marker, so the lawyer sees it against the proposition it weakens
    rather than as a stray warning on the answer as a whole (see CLAUDE.md's marker rewrite
    rules). A marker whose index resolves to nothing — out of range, or a source the caller
    chose not to persist — is dropped from the content entirely, along with the now-orphaned
    space that used to separate it from its neighbour.

    Two markers that both resolve to the same id (the model cited one passage twice, or two
    quotes deduped to the same document span) both rewrite to that id — that is correct, not a
    bug to collapse: the model made two separate assertions that happen to share one proof.
    """

    def replace(match: re.Match[str]) -> str:
        index = int(match.group(1)) - 1
        citation_id = id_by_index.get(index)
        return f"[[c:{citation_id}]]" if citation_id is not None else ""

    rewritten = MARKER.sub(replace, text)
    # Dropping a marker can strand the space that separated it from its neighbour next to
    # another space. Collapse runs of the plain space character only, so the blank lines that
    # mark a paragraph break (which are newlines, never spaces) are left untouched.
    return re.sub(r" {2,}", " ", rewritten)


def derive_claims(text: str, source_count: int) -> list[ClaimRef]:
    """Recover the claims a lawyer sees from where the model placed its own markers.

    A claim is exactly the prose between the end of one marker group and the start of the
    next, inside a single paragraph — the paragraph start stands in for "the previous group"
    when there isn't one. Text before the first marker in a paragraph, or after the last, is
    simply not a claim: the model offered nothing there to check, and inventing a claim for it
    would be exactly the kind of inference this module exists to avoid.

    `source_count` bounds which marker indices are kept on each claim, mirroring the same
    range check `services/llm.py` applies to the legacy JSON `"claims"` array — an
    out-of-range index is dropped from the claim, not the claim itself: the proposition was
    still made, and that nothing (yet) backs it is the more interesting fact.
    """
    claims: list[ClaimRef] = []
    groups = _groups(text)
    for para_start, para_end in _paragraphs(text):
        cursor = para_start
        for group in groups:
            if group.start < para_start or group.start >= para_end:
                continue
            claim_text = text[cursor : group.start].strip()
            cursor = group.end
            if not claim_text:
                continue
            indices = [i for i in group.indices if 0 <= i < source_count]
            claims.append(ClaimRef(text=claim_text, source_indices=indices))
    return claims
