# PRD — verifiable citations

One page. Who the user is, what they're afraid of, the slice of the problem this build takes,
the bet, and how we'd know it's working. `docs/audit.md` holds the evidence from testing the
baseline; `DECISIONS.md` holds the choice and trade-offs.

## The user and their workflow

A commercial real estate lawyer running due diligence on a deal: leases, title reports,
environmental assessments — dozens of documents per transaction. Two things about their
workflow shape everything here:

1. **Their output is sourced statements.** The deliverable at the end of DD is a report on
   title or certificate of title in which every material statement is traceable to a document
   and clause. They don't consume answers; they produce citations. An AI answer they can't
   source is not a head start on that work product — it's extra work, because they must
   re-find the source before they can use the claim.
2. **Verification is non-delegable.** Professional duty makes the lawyer responsible for
   every statement regardless of what tooling produced it. A tool can't remove the
   verification step; it can only change what the step costs.

*(This layer is domain knowledge, not survey data — it's the first thing I'd validate in user
conversations, ideally by watching a lawyer produce one report section with the tool.)*

## What they're apprehensive about — grounded

The fear is specific, well-documented, and rational:

- **Fabricated citations have a body count.** A public tracker of court decisions involving
  AI-hallucinated content reached ~1,668 cases by July 2026 — 653 involving practising
  lawyers — with sanctions escalating from a $5,000 fine in 2023 to five-figure penalties and
  suspensions in 2026. US courts recorded 487 instances in 2025 alone, 10× the 2024 total.
- **Accuracy is the #1 stated blocker.** In the 2025 Generative AI in Professional Services
  survey, among professionals who felt GenAI shouldn't be part of daily work, 40% cited
  accuracy/reliability as the primary concern — roughly double any other.
- **Purpose-built legal tools don't escape it.** Peer-reviewed testing of leading AI legal
  research platforms (Magesh et al., *JELS* 2025) found they still hallucinate at meaningful
  rates while presenting answers fluently.

The composite: lawyers aren't afraid the tool is *useless* — they're afraid it's *confidently
wrong in a way they'll be held responsible for*, and that fluency hides which sentences are
which. A blanket "AI can make mistakes" disclaimer answers none of that, and a fake "3 sources
cited" badge (audit F1) actively makes it worse.

## The problem slice

Not "make the model more accurate" — testing showed it's already strong (audit F2), and
accuracy claims are exactly what this audience won't take on faith. The slice is:

> **Cut the cost of the lawyer's non-delegable verification step — per claim — from
> "re-read the document" to "one click".**

## The bet

If every claim in an answer carries a machine-verified, one-click-inspectable quote from the
document — and the absence of support is shown just as honestly — lawyers will calibrate trust
**per sentence** instead of being asked to trust the system wholesale. That matches how they
already work (sourced statements), respects their duty (verification stays theirs, it just
gets cheap), and directly answers their documented fear (fabricated citations become visibly
distinguishable from grounded ones).

## What good looks like

The 60-second path: ask a real question → answer streams → citation chips appear beneath it
(`Clause 3.2.1 · p.4 ✓` — tick means the backend found this exact quote in the document) →
click a chip → the reader jumps to the page and highlights the passage → chevron unfolds the
verbatim quote inline. Ask a question the document doesn't answer → clean refusal, zero chips,
and an honest "no supporting passages" line where the old app showed "3 sources cited".

Rules of the surface:

- Verified vs unverified is structural (icon + border treatment), never colour alone.
- Verbatim quotes render in serif italic; serif is reserved for words the document actually
  says. UI copy stays sans.
- Panels hand width to each other: sidebar collapses to a rail, reader auto-opens on citation
  click. The layout serves the ask→verify journey and changes for no other reason.
- Every state designed: streaming, no-citations, unverified, empty, loading.

Done means: the rent-review question yields ≥3 verified chips each jumping to the right page;
the asbestos question yields zero chips and the honest empty state; the verifier has tests;
`just check` passes; the old badge is deleted.

## How we'd know it's working

| Signal | What it tells us |
|---|---|
| Citation click/expand rate | Are lawyers actually inspecting evidence? (early trust behaviour) |
| % answers with ≥1 verified citation | Is the system producing checkable output? (quality floor) |
| Unverified-citation rate | Grounding failures, surfaced per answer — an alarm, not a vanity metric |
| Claim+citation copy/export events | The real job proxy: answers entering the lawyer's work product |
| Questions per document, return sessions | Deepening reliance over time |

**Counter-metric:** citation clicks trending toward zero is ambiguous — earned trust or
rubber-stamping. Pair usage metrics with a periodic grounding eval (known questions over known
documents, asserting citations resolve) so accuracy is measured continuously rather than
inferred from engagement. That eval harness is first in line in `DECISIONS.md` → next steps.
