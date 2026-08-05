"""Native citation markers: rewriting `[[n]]` to `[[c:<id>]]`, and recovering claims from
where the model placed them.

The old contract had the model author a claims list as prose parsed out of JSON — no anchor
into the answer itself. Under this one, the model's own marker position *is* the anchor, so
these tests check a purely mechanical property: given the same marker positions, does the
rewrite and the derivation reproduce exactly what the position implies, with no fuzzy fallback
anywhere. Every case here is one of the marker rewrite / claim derivation rules in CLAUDE.md.
"""

from __future__ import annotations

from takehome.services.citations import verify_all_by_index, verify_all_with_origin
from takehome.services.markers import derive_claims, rewrite_markers

DOCUMENT = """--- Page 1 ---
Commercial Lease — 100 Bishopsgate

--- Page 2 ---
3.2.5 In default of agreement, the Reviewed Rent shall be determined by an independent
surveyor acting as an expert. The rent review shall be upward only.
"""


class TestRewriteMarkers:
    def test_marker_is_rewritten_to_stable_id(self) -> None:
        text = "The rent is reviewed annually. [[1]]"
        result = rewrite_markers(text, {0: "abc123"})
        assert result == "The rent is reviewed annually. [[c:abc123]]"

    def test_two_markers_deduped_to_one_citation_both_become_that_id(self) -> None:
        # The model cited the same passage twice, under two different source positions the
        # verifier folded into one row. Both markers must resolve to that one id — this is
        # explicitly correct per CLAUDE.md, not a case to collapse into a single marker.
        text = "Rent is reviewed on each Review Date. [[1]] [[2]]"
        result = rewrite_markers(text, {0: "shared-id", 1: "shared-id"})
        assert result == "Rent is reviewed on each Review Date. [[c:shared-id]] [[c:shared-id]]"

    def test_out_of_range_marker_is_dropped_with_its_stray_space(self) -> None:
        # Index 2 (marker [[3]]) has no entry in id_by_index - e.g. the model's sources array
        # was shorter than its own highest marker. It must vanish from the middle of the
        # sentence without leaving the double space its two neighbouring spaces would
        # otherwise collapse into.
        text = "The tenant may assign with consent. [[1]] [[3]] but conditions apply."
        result = rewrite_markers(text, {0: "abc123"})
        assert result == "The tenant may assign with consent. [[c:abc123]] but conditions apply."
        assert "  " not in result

    def test_marker_for_a_not_located_citation_is_kept(self) -> None:
        # A citation the verifier could not locate in the document still gets an id (the row
        # is persisted with verified=False) and its marker stays inline, against the
        # proposition it weakens - dropping it would be the fake-badge failure mode this
        # build removes, just moved one layer down.
        text = "The lease permits alterations without consent. [[1]]"
        result = rewrite_markers(text, {0: "unverified-id"})
        assert result == "The lease permits alterations without consent. [[c:unverified-id]]"

    def test_no_markers_is_left_untouched(self) -> None:
        text = "I could not identify a provision in this document addressing that."
        assert rewrite_markers(text, {}) == text

    def test_empty_id_map_drops_every_marker(self) -> None:
        # Marker sits mid-sentence so dropping it exercises the same double-space collapse
        # as the out-of-range case above, rather than leaving a single trailing space that
        # only the router's final `.strip()` (not this function) is responsible for.
        text = "A claim with nothing [[1]] behind it."
        assert rewrite_markers(text, {}) == "A claim with nothing behind it."


class TestDeriveClaims:
    def test_single_marker_claim_is_the_preceding_sentence(self) -> None:
        text = "The rent review mechanism is governed by Clause 3.2. [[1]]"
        claims = derive_claims(text, source_count=1)
        assert len(claims) == 1
        assert claims[0].text == "The rent review mechanism is governed by Clause 3.2."
        assert claims[0].source_indices == [0]

    def test_adjacent_marker_group_is_one_claim_with_both_sources(self) -> None:
        text = (
            "On each Review Date the rent is the higher of the passing rent or the open "
            "market rent. [[2]] [[3]]"
        )
        claims = derive_claims(text, source_count=3)
        assert len(claims) == 1
        assert claims[0].source_indices == [1, 2]

    def test_second_claim_starts_after_the_first_marker_group(self) -> None:
        text = (
            "The rent review mechanism is governed by Clause 3.2. [[1]]\n"
            "On each Review Date the rent is the higher of the passing rent or the open "
            "market rent. [[2]] [[3]]"
        )
        claims = derive_claims(text, source_count=3)
        assert [c.text for c in claims] == [
            "The rent review mechanism is governed by Clause 3.2.",
            "On each Review Date the rent is the higher of the passing rent or the open "
            "market rent.",
        ]
        assert [c.source_indices for c in claims] == [[0], [1, 2]]

    def test_claims_never_span_a_paragraph_break(self) -> None:
        # Two paragraphs, only the second marked. Without the paragraph boundary the claim
        # text would wrongly swallow the whole first, unmarked paragraph too.
        text = (
            "This is unmarked scene-setting that spans a whole paragraph on its own.\n\n"
            "This proposition is what the lawyer can actually check. [[1]]"
        )
        claims = derive_claims(text, source_count=1)
        assert len(claims) == 1
        assert claims[0].text == "This proposition is what the lawyer can actually check."
        assert "scene-setting" not in claims[0].text

    def test_text_before_the_first_marker_in_a_paragraph_is_not_lost_to_the_next_paragraph(
        self,
    ) -> None:
        text = (
            "Unmarked lead-in. [[1]]\n\n"
            "Second paragraph, unmarked lead-in here too, then a supported point. [[2]]"
        )
        claims = derive_claims(text, source_count=2)
        assert [c.source_indices for c in claims] == [[0], [1]]
        assert claims[1].text == (
            "Second paragraph, unmarked lead-in here too, then a supported point."
        )

    def test_no_markers_yields_no_claims(self) -> None:
        text = "I could not identify a provision in this document addressing that."
        assert derive_claims(text, source_count=0) == []

    def test_text_after_the_last_marker_is_not_a_claim(self) -> None:
        text = "A supported point. [[1]] An unsupported closing remark with no marker at all."
        claims = derive_claims(text, source_count=1)
        assert len(claims) == 1
        assert claims[0].text == "A supported point."

    def test_out_of_range_index_is_dropped_but_the_claim_survives(self) -> None:
        # The proposition was still made; that nothing (yet) backs it is the interesting
        # fact, not a reason to discard the claim - same principle as the legacy JSON path.
        text = "An assertion citing a source that doesn't exist. [[9]]"
        claims = derive_claims(text, source_count=1)
        assert len(claims) == 1
        assert claims[0].source_indices == []

    def test_bullet_list_items_are_separate_claims(self) -> None:
        text = "- First condition applies. [[1]]\n- Second condition applies. [[2]]"
        claims = derive_claims(text, source_count=2)
        assert [c.source_indices for c in claims] == [[0], [1]]


class TestIntegratesWithTheRealVerifier:
    """`rewrite_markers` itself is verified-agnostic by design — it only knows about ids, not
    verification status. The actual guarantee that a not-located citation keeps its marker
    lives one layer up, in whichever id map the caller builds from `verify_all_with_origin`'s
    output. This exercises that seam for real, the way `web/routers/messages.py` does: a
    router that filtered `if citation.verified` before building the id map would still pass
    every test in `TestRewriteMarkers` above, and only break here.
    """

    def test_a_not_located_citation_keeps_its_marker_inline(self) -> None:
        offered = [
            ("Clause 3.2.5", "the Reviewed Rent shall be determined by an independent surveyor"),
            (
                "Clause 9.1",
                "The Tenant shall maintain an asbestos register under the Control of "
                "Asbestos Regulations 2012.",
            ),
        ]
        verified_pairs = verify_all_with_origin(offered, DOCUMENT)
        assert [c.verified for _, c in verified_pairs] == [True, False]

        # A row per surviving citation, with a stand-in id (the real id comes from the DB row
        # once persisted; nothing about that changes this property).
        id_by_index = {origin: f"id-{origin}" for origin, _ in verified_pairs}

        text = (
            "The Reviewed Rent is set by an independent surveyor. [[1]]\n"
            "The lease requires an asbestos register. [[2]]"
        )
        result = rewrite_markers(text, id_by_index)

        assert "[[c:id-0]]" in result  # the verified citation's marker survives, as expected
        assert "[[c:id-1]]" in result  # so does the *unverified* one - this is the property
        assert "[[2]]" not in result  # never left as a dangling numeric marker

    def test_duplicate_verified_quotes_share_one_citation_id(self) -> None:
        # Same clause, offered twice under two different source positions - the ordinary
        # "two sentences both rely on it" case a lawyer's answer produces routinely.
        offered = [
            ("Clause 3.2.5", "The rent review shall be upward only."),
            ("Clause 3.2.5 again", "the rent review shall be upward only"),
        ]
        resolved = verify_all_by_index(offered, DOCUMENT)
        assert resolved[0].verified and resolved[1].verified
        assert resolved[0] is resolved[1]  # one citation, not two verified independently

        id_by_index = dict.fromkeys(resolved, "shared-verified-id")
        text = "Rent cannot fall below the passing rent. [[1]]\nIt is a one-way ratchet. [[2]]"
        result = rewrite_markers(text, id_by_index)

        assert result.count("[[c:shared-verified-id]]") == 2
        assert "[[1]]" not in result
        assert "[[2]]" not in result

    def test_duplicate_not_located_quotes_share_one_citation_id_and_keep_both_markers(
        self,
    ) -> None:
        # The same fabricated passage, offered twice with different case and internal
        # spacing - close enough that `_dedupe_key` (case/whitespace folding) treats them as
        # one span, even though neither locates in the document. Before `verify_all_by_index`
        # existed, the second occurrence had no row to re-verify its way back to (see the
        # module docstring in services/citations.py): its marker was silently deleted by
        # `rewrite_markers` instead of kept unverified - downgrading "evidence offered, not
        # found" to "no evidence offered" for that proposition, the worst-direction failure
        # this whole build exists to prevent.
        offered = [
            (
                "Clause 9.1",
                "The Tenant shall maintain an asbestos register under the Control of "
                "Asbestos Regulations 2012.",
            ),
            (
                "Clause 9.1 again",
                "the tenant shall maintain an asbestos register under the control of  "
                "asbestos regulations 2012.",
            ),
        ]
        resolved = verify_all_by_index(offered, DOCUMENT)
        assert resolved[0].verified is False
        assert resolved[1].verified is False
        assert resolved[0] is resolved[1]  # the near-duplicate still resolves to one citation

        id_by_index = dict.fromkeys(resolved, "shared-unverified-id")
        text = (
            "The lease requires an asbestos register. [[1]]\n"
            "This duty applies regardless of the Landlord's own obligations. [[2]]"
        )
        result = rewrite_markers(text, id_by_index)

        assert result.count("[[c:shared-unverified-id]]") == 2
        assert "[[1]]" not in result
        assert "[[2]]" not in result
