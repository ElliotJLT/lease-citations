"""The "read with" list — what a cited passage depends on.

The rule under test throughout: this resolves, it never infers. Anything the document doesn't
actually define or contain must not appear, because an unverifiable "related provision" is the
same failure class as the badge this build removed.
"""

from __future__ import annotations

from takehome.services.trail import build_trail

DOCUMENT = """--- Page 1 ---
Commercial Lease — 100 Bishopsgate

1. DEFINITIONS

"the Premises" means the office accommodation comprising Floors 8, 9 and 10 of the
building known as 100 Bishopsgate, London EC2M 1GT.

"the Review Dates" means the fifth (5th) and tenth (10th) anniversaries of the Term
Commencement Date, being 1 January 2029 and 1 January 2034.

--- Page 2 ---
3.2.1 The rent payable under this Lease shall be reviewed on each Review Date in
accordance with the provisions of this clause 3.2, being the open market rent of the
Premises determined in accordance with clauses 3.2.2 to 3.2.5 below.

3.2.2 The open market rent shall be such rent as might reasonably be expected to be
obtained on a letting of the Premises in the open market.

3.2.5 In default of agreement, the Reviewed Rent shall be determined by an independent
surveyor acting as an expert.
"""


class TestResolvesWhatThePassageDependsOn:
    def test_cross_references_are_resolved_to_their_clauses(self) -> None:
        trail = build_trail(
            "the open market rent of the Premises determined in accordance with "
            "clauses 3.2.2 to 3.2.5 below.",
            DOCUMENT,
        )
        labels = [item.label for item in trail if item.kind == "cross-reference"]
        assert "Clause 3.2.2" in labels
        assert "Clause 3.2.5" in labels

    def test_defined_terms_used_in_the_quote_are_resolved(self) -> None:
        trail = build_trail(
            "reviewed on each Review Date in accordance with the provisions", DOCUMENT
        )
        definitions = {i.label: i for i in trail if i.kind == "definition"}
        assert "Review Date" in definitions, "singular use must match a plural definition"
        assert "fifth (5th) and tenth" in definitions["Review Date"].text

    def test_items_carry_the_page_they_are_on(self) -> None:
        trail = build_trail("the Premises determined in accordance with clauses 3.2.2", DOCUMENT)
        assert all(item.page is not None for item in trail)


class TestNeverInvents:
    def test_unresolvable_reference_is_omitted_not_guessed(self) -> None:
        # Clause 9.9 does not exist in this document.
        trail = build_trail("as set out in clause 9.9 of this Lease", DOCUMENT)
        assert [i for i in trail if i.label == "Clause 9.9"] == []

    def test_capitalised_words_that_are_not_defined_terms_are_ignored(self) -> None:
        trail = build_trail(
            "The Tenant shall notify the Landlord in London before each Review Date",
            DOCUMENT,
        )
        labels = {i.label for i in trail}
        assert "London" not in labels
        assert "Tenant" not in labels  # never defined in this document

    def test_self_reference_to_the_containing_clause_is_dropped(self) -> None:
        # "this clause 3.2" resolves to the block the quote already sits in.
        trail = build_trail(
            "The rent payable under this Lease shall be reviewed on each Review Date in "
            "accordance with the provisions of this clause 3.2",
            DOCUMENT,
        )
        assert [i for i in trail if i.label == "Clause 3.2"] == []

    def test_no_document_yields_nothing(self) -> None:
        assert build_trail("clauses 3.2.2 to 3.2.5", None) == []

    def test_quote_with_no_dependencies_yields_nothing(self) -> None:
        assert build_trail("The rent review shall be upward only.", DOCUMENT) == []
