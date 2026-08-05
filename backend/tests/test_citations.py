"""The verifier is the only component here that claims correctness, so it is the one
component with tests. Each case is a way the model can be wrong that the interface must not
present as evidence.
"""

from __future__ import annotations

from takehome.services.citations import verify_all, verify_quote

DOCUMENT = """--- Page 1 ---
Commercial Lease — 100 Bishopsgate
Section 3 — Rent

--- Page 2 ---
3.2.1 The rent payable under this Lease shall be reviewed on each Review Date in
accordance with the provisions of this clause 3.2. With effect from each Review Date,
the rent payable shall be the higher of (a) the rent payable immediately before the
relevant Review Date and (b) the open market rent of the Premises.

--- Page 3 ---
3.2.5 In default of agreement between the Landlord and the Tenant as to the Reviewed
Rent by the relevant Review Date, the Reviewed Rent shall be determined by an
independent surveyor acting as an expert (and not as an arbitrator). The rent review
shall be upward only.
"""


class TestVerifiedQuotes:
    def test_exact_quote_is_verified_and_paged(self) -> None:
        result = verify_quote("The rent review shall be upward only.", DOCUMENT)
        assert result.verified
        assert result.page == 3

    def test_quote_broken_by_extraction_line_breaks_still_matches(self) -> None:
        # The document wraps this mid-phrase; the model quotes it as running text.
        result = verify_quote(
            "the Reviewed Rent shall be determined by an independent surveyor", DOCUMENT
        )
        assert result.verified
        assert result.page == 3

    def test_typographic_punctuation_is_folded(self) -> None:
        result = verify_quote(
            "reviewed on each Review Date in accordance with the provisions", DOCUMENT
        )
        assert result.verified

    def test_stored_quote_is_the_documents_wording_not_the_models(self) -> None:
        # Model lowercases and re-punctuates; what we store must come from the document.
        result = verify_quote("the rent review shall be upward only", DOCUMENT)
        assert result.verified
        assert result.quote == "The rent review shall be upward only"

    def test_quote_spanning_a_page_break_resolves_to_its_starting_page(self) -> None:
        result = verify_quote(
            "Section 3 — Rent 3.2.1 The rent payable under this Lease", DOCUMENT
        )
        assert result.verified
        assert result.page == 1

    def test_quote_spanning_a_page_break_does_not_splice_in_the_next_pages_furniture(
        self,
    ) -> None:
        # A running header/footer repeated on every page — the shape `page_furniture()`
        # actually detects (DOCUMENT above has none repeated, since each page's text is
        # unique). This reproduces the live bug: (c) trails off, the page turns mid-clause,
        # and the next page's masthead used to land inside the displayed quote.
        document = """--- Page 1 ---
Commercial Lease — 100 Bishopsgate
PRIVATE & CONFIDENTIAL
Page 1
3.2.4 In determining the open market rent, the following matters shall be disregarded: (a) any
improvement to the Premises carried out by

--- Page 2 ---
Commercial Lease — 100 Bishopsgate
PRIVATE & CONFIDENTIAL
Page 2
the Tenant during the Term.
"""
        result = verify_quote(
            "improvement to the Premises carried out by the Tenant during the Term", document
        )
        assert result.verified
        assert result.page == 1
        assert "Bishopsgate" not in result.quote
        assert "PRIVATE" not in result.quote
        assert "Page 2" not in result.quote
        assert result.quote == (
            "improvement to the Premises carried out by the Tenant during the Term"
        )


class TestHarmlessFormattingIsForgiven:
    """Variation the model introduces at the edge of a quotation, or that the PDF's layout
    introduces inside it. None of these change a word — that is the line."""

    def test_trailing_full_stop_added_where_the_quote_was_cut(self) -> None:
        # Observed live: the model ended its quote early and punctuated the truncation.
        # The document continues "...below (the "Reviewed Rent")."
        result = verify_quote(
            "the rent payable shall be the higher of (a) the rent payable immediately "
            "before the relevant Review Date.",
            DOCUMENT,
        )
        assert result.verified

    def test_trailing_comma_and_leading_quote_mark_are_trimmed(self) -> None:
        result = verify_quote('"The rent review shall be upward only,', DOCUMENT)
        assert result.verified

    def test_word_hyphenated_across_a_line_break_still_matches(self) -> None:
        wrapped = "The rent review shall be upward only, as deter-\nmined by the surveyor."
        assert verify_quote("as determined by the surveyor", wrapped).verified

    def test_curly_quotation_marks_match_straight_ones(self) -> None:
        # The document writes "Reviewed Rent" with straight quotes; the model uses curly.
        result = verify_quote(
            "the Reviewed Rent shall be determined by an independent surveyor", DOCUMENT
        )
        assert result.verified


class TestRejectedQuotes:
    def test_fabricated_quote_is_unverified(self) -> None:
        result = verify_quote(
            "The Tenant shall maintain an asbestos register under the Control of "
            "Asbestos Regulations 2012.",
            DOCUMENT,
        )
        assert not result.verified
        assert result.page is None

    def test_plausible_near_miss_is_not_accepted(self) -> None:
        # One word changed: "downward" for "upward". Semantically inverted, visually close.
        result = verify_quote("The rent review shall be downward only.", DOCUMENT)
        assert not result.verified

    def test_quote_too_short_to_be_evidence_is_rejected(self) -> None:
        result = verify_quote("rent", DOCUMENT)
        assert not result.verified

    def test_boundary_trimming_cannot_shrink_a_quote_below_the_minimum(self) -> None:
        # Trimming happens before the length check, so punctuation can't smuggle a
        # too-short quote past it.
        assert not verify_quote('".,;: rent .,;:"', DOCUMENT).verified

    def test_a_word_removed_from_the_middle_is_rejected(self) -> None:
        # "shall be determined" → "shall determined". Formatting forgiveness must not
        # extend to the wording itself.
        assert not verify_quote(
            "the Reviewed Rent shall determined by an independent surveyor", DOCUMENT
        ).verified

    def test_an_inserted_word_is_rejected(self) -> None:
        assert not verify_quote(
            "The rent review shall always be upward only", DOCUMENT
        ).verified

    def test_punctuation_removed_from_the_middle_is_rejected(self) -> None:
        # Dropping the quote marks around a defined term changes the document's text.
        # Only the *edges* of a quotation are forgiven.
        assert not verify_quote(
            "In default of agreement between the Landlord and the Tenant as to the "
            "Reviewed Rent by the relevant Review Date the Reviewed Rent shall be",
            DOCUMENT,
        ).verified

    def test_no_document_means_nothing_is_verified(self) -> None:
        result = verify_quote("The rent review shall be upward only.", None)
        assert not result.verified


class TestVerifyAll:
    def test_labels_are_preserved_and_defaulted(self) -> None:
        citations = verify_all(
            [
                ("Clause 3.2.5", "The rent review shall be upward only."),
                ("", "the open market rent of the Premises"),
            ],
            DOCUMENT,
        )
        assert [c.label for c in citations] == ["Clause 3.2.5", "Cited passage"]
        assert all(c.verified for c in citations)

    def test_duplicate_spans_are_collapsed(self) -> None:
        citations = verify_all(
            [
                ("Clause 3.2.5", "The rent review shall be upward only."),
                ("Clause 3.2.5 again", "the rent review shall be upward only"),
            ],
            DOCUMENT,
        )
        assert len(citations) == 1

    def test_mixed_batch_keeps_both_verdicts(self) -> None:
        citations = verify_all(
            [
                ("Clause 3.2.5", "The rent review shall be upward only."),
                ("Clause 9.1", "The Tenant shall indemnify the Landlord against all claims."),
            ],
            DOCUMENT,
        )
        assert [c.verified for c in citations] == [True, False]
