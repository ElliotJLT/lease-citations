"""Parsing the model's evidence block.

Every case here was either observed from the live model or is a way it can plausibly deviate.
A malformed block must degrade to "no citations" — never to an error, and never to a citation
the interface would present as evidence.
"""

from __future__ import annotations

from takehome.services.llm import SOURCES_SENTINEL, parse_citation_block


class TestWellFormed:
    def test_reads_label_and_quote(self) -> None:
        pairs = parse_citation_block(
            '[{"label": "Clause 3.2.1", "quote": "the rent payable shall be the higher of"}]'
        )
        assert pairs == [("Clause 3.2.1", "the rent payable shall be the higher of")]

    def test_ignores_prose_around_the_array(self) -> None:
        pairs = parse_citation_block(
            '\nHere are my sources:\n[{"label": "A", "quote": "some passage"}]\nDone.'
        )
        assert len(pairs) == 1

    def test_empty_array_means_no_evidence(self) -> None:
        assert parse_citation_block("[]") == []


class TestRepairable:
    def test_document_line_wrapping_inside_a_quote_is_repaired(self) -> None:
        # Observed live: the model carried the PDF's line breaks into the JSON string.
        pairs = parse_citation_block(
            '[{"label": "Clause 3.2.1", "quote": "The rent payable under this Lease\n'
            'shall be reviewed on each Review Date"}]'
        )
        assert len(pairs) == 1
        assert "\n" in pairs[0][1]  # preserved for the verifier, which folds whitespace

    def test_repair_does_not_corrupt_already_escaped_content(self) -> None:
        pairs = parse_citation_block('[{"label": "A", "quote": "a \\"quoted\\" term"}]')
        assert pairs == [("A", 'a "quoted" term')]


class TestDegradesSafely:
    def test_missing_block_yields_nothing(self) -> None:
        assert parse_citation_block("") == []
        assert parse_citation_block("I could not find supporting passages.") == []

    def test_irreparable_json_yields_nothing(self) -> None:
        assert parse_citation_block('[{"label": "A", "quote": ') == []

    def test_entries_without_a_quote_are_dropped(self) -> None:
        pairs = parse_citation_block(
            '[{"label": "A"}, {"label": "B", "quote": ""}, {"label": "C", "quote": "real text"}]'
        )
        assert pairs == [("C", "real text")]

    def test_missing_label_is_tolerated(self) -> None:
        pairs = parse_citation_block('[{"quote": "an unlabelled passage"}]')
        assert pairs == [("", "an unlabelled passage")]

    def test_non_list_payload_yields_nothing(self) -> None:
        assert parse_citation_block('{"label": "A", "quote": "x"}') == []


def test_sentinel_is_distinctive_enough_not_to_occur_in_legal_prose() -> None:
    assert SOURCES_SENTINEL.startswith("<<<") and SOURCES_SENTINEL.endswith(">>>")
