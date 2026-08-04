"""Grounding eval — the verifier against the real sample documents.

The unit tests use a small fixture; this runs the same verifier over text extracted from the
actual PDFs a reviewer will upload, which is where extraction quirks (hyphenation, ligatures,
column breaks, page splits) actually live.

It is deterministic and offline — no model calls — so it belongs in `just check` and can gate
every commit. Its purpose is to make a grounding regression fail loudly rather than show up as
"the citations feel worse". Extending this into a live eval that asks the model real questions
and asserts its citations resolve is the first item in DECISIONS.md → next steps.
"""

from __future__ import annotations

from pathlib import Path

import fitz  # PyMuPDF
import pytest

from takehome.services.citations import page_furniture, verify_quote

SAMPLE_DOCS = Path(__file__).resolve().parents[2] / "sample-docs"


def _extract(filename: str) -> str:
    """Mirror of the extraction in services/document.py, including page markers."""
    doc = fitz.open(SAMPLE_DOCS / filename)
    pages: list[str] = []
    for number in range(len(doc)):
        text = str(doc[number].get_text())  # type: ignore[union-attr]
        if text.strip():
            pages.append(f"--- Page {number + 1} ---\n{text}")
    doc.close()
    return "\n\n".join(pages)


@pytest.fixture(scope="module")
def lease() -> str:
    return _extract("commercial-lease-100-bishopsgate.pdf")


@pytest.fixture(scope="module")
def title_report() -> str:
    return _extract("title-report-lot-7.pdf")


@pytest.fixture(scope="module")
def environmental() -> str:
    return _extract("environmental-assessment-manchester.pdf")


# Passages the model has actually cited in live runs, with the page they must resolve to.
LEASE_PASSAGES = [
    ("The rent review shall be upward only", 5),
    ("the Reviewed Rent shall be determined by an independent surveyor", 5),
    (
        "the rent payable shall be the higher of (a) the rent payable immediately before "
        "the relevant Review Date",
        4,
    ),
]


class TestRealDocumentsGroundTrueQuotes:
    @pytest.mark.parametrize(("quote", "page"), LEASE_PASSAGES)
    def test_known_passage_verifies_on_the_right_page(
        self, lease: str, quote: str, page: int
    ) -> None:
        result = verify_quote(quote, lease)
        assert result.verified, f"failed to locate: {quote!r}"
        assert result.page == page

    def test_every_sample_document_extracts_and_self_verifies(
        self, lease: str, title_report: str, environmental: str
    ) -> None:
        # A sentence drawn from each document must verify against that document. Guards the
        # extraction path as much as the matcher.
        for text in (lease, title_report, environmental):
            assert text.strip(), "document extracted to nothing"
            body = [
                line.strip()
                for line in text.splitlines()
                if len(line.strip()) > 60 and not line.startswith("---")
            ]
            assert body, "no substantial lines found"
            assert verify_quote(body[len(body) // 2], text).verified


class TestPageSpanningQuotes:
    def test_clause_running_over_a_page_break_still_verifies(self, lease: str) -> None:
        """Clause 3.2.4 runs from page 4 onto page 5, so extraction drops the running
        header, the confidentiality line and the page number into the middle of the
        sentence. A lawyer quoting the clause as it reads must still verify — this was a
        live false negative before page furniture was stepped over."""
        result = verify_quote(
            "In determining the open market rent, the following matters shall be "
            "disregarded: (a) any effect on rent of the fact that the Tenant or any "
            "undertenant has been in occupation of the Premises; (b) any goodwill attached "
            "to the Premises by reason of the carrying on thereat of the business of the "
            "Tenant or any undertenant; (c) any improvement to the Premises carried out by "
            "and at the expense of the Tenant during the Term otherwise than in pursuance "
            "of an obligation to the Landlord.",
            lease,
        )
        assert result.verified
        assert result.page == 4  # resolves to where the passage starts

    def test_furniture_detection_finds_the_running_header(self, lease: str) -> None:
        furniture = page_furniture(lease)
        assert any("Bishopsgate" in line for line in furniture)


class TestRealDocumentsRejectFalseQuotes:
    def test_fabricated_statutory_obligation_is_rejected(self, lease: str) -> None:
        assert not verify_quote(
            "The Tenant shall comply with the Control of Asbestos Regulations 2012 and "
            "maintain an asbestos register for the Premises.",
            lease,
        ).verified

    def test_passage_from_another_document_does_not_verify(
        self, lease: str, title_report: str
    ) -> None:
        # The failure mode multi-document support will introduce: right words, wrong file.
        lines = [
            line.strip()
            for line in title_report.splitlines()
            if len(line.strip()) > 80 and not line.startswith("---")
        ]
        assert lines, "no substantial lines in the title report"
        borrowed = lines[len(lines) // 2]
        assert verify_quote(borrowed, title_report).verified
        assert not verify_quote(borrowed, lease).verified

    def test_negated_clause_is_rejected(self, lease: str) -> None:
        # "shall not" for "shall" — a single word that inverts the obligation.
        assert not verify_quote("The rent review shall not be upward only", lease).verified
