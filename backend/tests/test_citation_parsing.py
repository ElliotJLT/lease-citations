"""Parsing the model's evidence block.

Every case here was either observed from the live model or is a way it can plausibly deviate.
A malformed block must degrade to "no evidence" — never to an error, and never to a citation
or a claim the interface would present as established.
"""

from __future__ import annotations

from takehome.services.llm import SOURCES_SENTINEL, parse_citation_block


class TestWellFormed:
    def test_reads_sources_and_claims(self) -> None:
        result = parse_citation_block(
            """{
              "sources": [
                {"label": "Clause 3.2.1", "quote": "the rent payable shall be the higher of"},
                {"label": "Clause 3.2.5", "quote": "determined by an independent surveyor"}
              ],
              "claims": [
                {"text": "Rent is reviewed to the higher of two figures.", "sources": [0]},
                {"text": "A surveyor decides any dispute.", "sources": [1]}
              ]
            }"""
        )
        assert result.items == [
            ("Clause 3.2.1", "the rent payable shall be the higher of"),
            ("Clause 3.2.5", "determined by an independent surveyor"),
        ]
        assert [c.text for c in result.claims] == [
            "Rent is reviewed to the higher of two figures.",
            "A surveyor decides any dispute.",
        ]
        assert [c.source_indices for c in result.claims] == [[0], [1]]

    def test_one_source_can_support_several_claims(self) -> None:
        result = parse_citation_block(
            """{"sources": [{"label": "A", "quote": "a passage of some length"}],
                "claims": [{"text": "first", "sources": [0]},
                           {"text": "second", "sources": [0]}]}"""
        )
        assert [c.source_indices for c in result.claims] == [[0], [0]]

    def test_ignores_prose_around_the_block(self) -> None:
        result = parse_citation_block(
            'Here are my sources:\n{"sources": [{"label": "A", "quote": "some passage"}]}\nDone.'
        )
        assert len(result.items) == 1

    def test_empty_evidence_means_no_evidence(self) -> None:
        result = parse_citation_block('{"sources": [], "claims": []}')
        assert result.items == []
        assert result.claims == []


class TestBackwardCompatible:
    def test_bare_array_of_sources_still_parses(self) -> None:
        # The older contract, in case the model ignores half the instruction.
        result = parse_citation_block(
            '[{"label": "Clause 3.2.1", "quote": "the rent payable shall be the higher of"}]'
        )
        assert result.items == [
            ("Clause 3.2.1", "the rent payable shall be the higher of")
        ]
        assert result.claims == []


class TestRepairable:
    def test_document_line_wrapping_inside_a_quote_is_repaired(self) -> None:
        # Observed live: the model carried the PDF's line breaks into the JSON string.
        result = parse_citation_block(
            '{"sources": [{"label": "Clause 3.2.1", "quote": "The rent payable under this Lease\n'
            'shall be reviewed on each Review Date"}]}'
        )
        assert len(result.items) == 1
        assert "\n" in result.items[0][1]  # preserved for the verifier, which folds whitespace

    def test_repair_does_not_corrupt_already_escaped_content(self) -> None:
        result = parse_citation_block(
            '{"sources": [{"label": "A", "quote": "a \\"quoted\\" term"}]}'
        )
        assert result.items == [("A", 'a "quoted" term')]


class TestDegradesSafely:
    def test_missing_block_yields_nothing(self) -> None:
        assert parse_citation_block("").items == []
        assert parse_citation_block("I could not find supporting passages.").items == []

    def test_irreparable_json_yields_nothing(self) -> None:
        result = parse_citation_block('{"sources": [{"label": "A", "quote": ')
        assert result.items == []
        assert result.claims == []

    def test_entries_without_a_quote_are_dropped(self) -> None:
        result = parse_citation_block(
            '{"sources": [{"label": "A"}, {"label": "B", "quote": ""}, '
            '{"label": "C", "quote": "real text"}]}'
        )
        assert result.items == [("C", "real text")]

    def test_missing_label_is_tolerated(self) -> None:
        result = parse_citation_block(
            '{"sources": [{"quote": "an unlabelled passage"}]}'
        )
        assert result.items == [("", "an unlabelled passage")]

    def test_claim_pointing_at_a_source_that_does_not_exist_drops_the_reference(
        self,
    ) -> None:
        result = parse_citation_block(
            '{"sources": [{"label": "A", "quote": "only one source here"}], '
            '"claims": [{"text": "a claim", "sources": [0, 7]}]}'
        )
        assert result.claims[0].source_indices == [0]

    def test_claim_left_with_no_sources_is_still_kept(self) -> None:
        # The proposition was made; that nothing backs it is the interesting part.
        result = parse_citation_block(
            '{"sources": [], "claims": [{"text": "an unsupported claim", "sources": [3]}]}'
        )
        assert [c.text for c in result.claims] == ["an unsupported claim"]
        assert result.claims[0].source_indices == []

    def test_claim_without_text_is_dropped(self) -> None:
        result = parse_citation_block(
            '{"sources": [], "claims": [{"sources": [0]}, {"text": "  ", "sources": []}]}'
        )
        assert result.claims == []

    def test_non_object_payload_yields_nothing(self) -> None:
        assert parse_citation_block("42").items == []


def test_sentinel_is_distinctive_enough_not_to_occur_in_legal_prose() -> None:
    assert SOURCES_SENTINEL.startswith("<<<") and SOURCES_SENTINEL.endswith(">>>")
