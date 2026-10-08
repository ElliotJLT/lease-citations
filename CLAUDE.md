# CLAUDE.md — lease citations

Document Q&A for commercial real estate lawyers doing due diligence. This file is the product
spec and the working rules in one, binding on every change, human- or agent-authored.
Evidence behind it: `docs/audit.md` (findings from testing the baseline). The choice and
trade-offs: `DECISIONS.md`.

## The user

A CRE lawyer running due diligence: leases, title reports, environmental assessments, dozens
per deal. Two workflow facts shape everything:

1. **Their output is sourced statements.** The DD deliverable is a report on title in which
   every material statement traces to a document and clause. They don't consume answers; they
   produce citations. An answer they can't source is extra work, not a head start.
2. **Verification is non-delegable.** The lawyer is professionally responsible for every
   statement regardless of tooling. A tool can't remove the verification step, only change
   what it costs.

Their documented fear is specific: confidently wrong output they'll be held responsible for.
A public tracker of court decisions involving AI-hallucinated content reached ~1,668 cases by
July 2026 (653 involving practising lawyers), with sanctions escalating from fines to
suspensions; accuracy is the #1 stated blocker among professionals who reject GenAI; even
purpose-built legal research tools hallucinate fluently (Magesh et al., *JELS* 2025). A
blanket disclaimer answers none of that. A fake "3 sources cited" badge makes it worse
(audit F1).

## The problem slice and the bet

Not "make the model more accurate", since testing showed it already is (audit F2). The slice:

> **Cut the cost of the lawyer's non-delegable verification step, per claim, from
> "re-read the document" to "one click".**

The bet: if every claim carries a machine-verified, one-click-inspectable quote from the
document, and absence of support is shown just as honestly, lawyers calibrate trust **per
sentence** instead of being asked to trust the system wholesale. That matches how they already
work, respects their duty, and answers their documented fear.

## What good looks like

The 60-second path: ask a real question → the answer streams with a numbered marker appearing
inline at the end of each proposition → hover a marker to preview the clause and its quote (is
this worth the click?) → click it and the reader jumps to the page, highlights the passage, and
opens the inspector. Cheap glance, cheap jump. Ask a question the document doesn't answer →
clean refusal, no markers, and an honest "No supporting provision identified" where the old app
showed "3 sources cited".

Markers are the only citation surface: evidence sits against the proposition it supports, never
in a separate block beneath the answer that a lawyer has to reconcile back to the prose.

Done means: the rent-review question yields ≥3 matched markers each jumping to the right page;
the asbestos question yields zero markers and the honest empty state; the verifier has tests;
`just check` passes; the old badge is deleted.

## Product rules

- Every change traces to a numbered finding in `docs/audit.md`. If it doesn't serve one,
  question it before building it.
- Never ship a trust signal the system cannot back with evidence. A badge, count or tick must
  derive from a check against the document, or it doesn't render.
- "The document doesn't say" is a first-class result, not a failure state.
- Evidence is judged on completeness as well as support. A legal position usually rests on
  more than the sentence that states it: the operative clause, a definition, a condition or
  exception elsewhere. The prompt asks for that full set, and the markers make the composition
  visible.
- The interface renders only trust states it can check: quote found, quote not found, no
  evidence offered. The model's account of its own reasoning ("inferred", "confident") is
  never rendered as a trust state, because that's a self-report, the same failure class as the badge
  this build removed.

## Design rules

- Extend the app's existing language: IBM Plex, hairline borders, no generic AI aesthetics.
- Palette is fixed, not invented: `ground` #ddf8ff (pale ice, the surface
  the cards sit on), `brand` #006a87 (deep teal), `accent` #ff6e30 (orange). Reading surfaces
  stay white, since the ground is a frame, never something text sits on.
- Colour carries one meaning each: teal is structure and matched evidence, orange is primary
  actions and nothing else. The one exception is the logo mark, which reproduces the brand's
  own orange-on-teal pairing: identity rather than an action. A not-located citation is deliberately colourless (a dashed
  border and an icon) so it reads as "unconfirmed", not as an error, and never competes with
  the accent.
- Matched vs not-located is structural (icon + border), never colour alone.
- Verbatim quotes render in IBM Plex Serif italic; serif is reserved for words the document
  actually says. UI copy stays sans.
- Panels hand width to each other: sidebar collapses to a rail, reader auto-opens on marker
  click. The layout serves the ask→verify journey and changes for no other reason.
- Every state designed: streaming, no-citations, not-located, empty, loading, failure.

## Engineering rules

- Match existing idioms: FastAPI routers → services, SQLAlchemy 2.0 mapped classes, alembic
  for schema changes, SSE for streaming.
- Anything that claims correctness gets a pytest test. UI gets a browser check.
- No new dependencies without a stated reason in the commit message.

## How we'd know the bet is working

| Signal | Reads as |
|---|---|
| Marker click/inspect rate | Are lawyers inspecting evidence? (early trust behaviour) |
| % answers with ≥1 matched citation | Is output checkable? (quality floor) |
| Not-located rate | Grounding failures surfaced per answer, an alarm |
| Claim+citation copy/export | The job proxy: answers entering the work product |
| Questions per document, return sessions | Deepening reliance |

Counter-metric: clicks trending to zero is ambiguous (earned trust vs rubber-stamping), so pair
usage with a periodic grounding eval over known documents. That harness is first in
`DECISIONS.md` → next steps.

## Model routing

Two separate decisions, deliberately made:

- **Dev-time (building this repo).** Planning, audit and spec ran on the top reasoning tier
  (Claude Fable 5) because every later decision inherits from them. Implementation runs a tier
  down against this file as the binding spec. Route by task.
- **Context length is the cost.** A long session re-reads its whole history every
  turn, and prompt caches are model-scoped, so switching models mid-thread pays a cold read of
  everything. Once the spec is settled, a fresh session pointed at this file is roughly an order
  of magnitude cheaper than continuing the thread that produced it, on any model. That only
  works if the spec is genuinely complete, which is the real argument for writing it down: the
  test of these docs is whether an agent with no memory of the discussion can build the right
  thing from them.
- **A second model reviews the first.** Codex made a final pass over the implementation and the
  tests. A model reviewing its own output is the self-report problem this build exists to
  remove; a different one at least fails differently.
- **Runtime (what the product calls).** The app keeps its existing Haiku 4.5 for chat and
  citation extraction. The citation verifier is a string match against the document and
  doesn't trust the model, so model tier is a cost/latency knob here, not a trust knob.
  Buying trust with a bigger model is the exact mistake this build exists to remove.

## Verify before done

- `just check` and `pytest` pass before every commit.
- Run the actual flow in the browser (upload, ask, click a citation, watch the reader move)
  before calling any feature complete.
