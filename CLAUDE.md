# CLAUDE.md — Orbital take-home

Document Q&A for commercial real estate lawyers doing due diligence. This file is the product
spec and the working rules in one, binding on every change, human- or agent-authored.
Evidence behind it: `docs/audit.md` (findings from testing the baseline). The choice and
trade-offs: `DECISIONS.md`.

## The user

A CRE lawyer running due diligence: leases, title reports, environmental assessments — dozens
per deal. Two workflow facts shape everything:

1. **Their output is sourced statements.** The DD deliverable is a report on title in which
   every material statement traces to a document and clause. They don't consume answers; they
   produce citations. An answer they can't source is extra work, not a head start.
2. **Verification is non-delegable.** The lawyer is professionally responsible for every
   statement regardless of tooling. A tool can't remove the verification step — only change
   what it costs.

Their documented fear is specific: confidently wrong output they'll be held responsible for.
A public tracker of court decisions involving AI-hallucinated content reached ~1,668 cases by
July 2026 (653 involving practising lawyers), with sanctions escalating from fines to
suspensions; accuracy is the #1 stated blocker among professionals who reject GenAI; even
purpose-built legal research tools hallucinate fluently (Magesh et al., *JELS* 2025). A
blanket disclaimer answers none of that. A fake "3 sources cited" badge makes it worse
(audit F1).

## The problem slice and the bet

Not "make the model more accurate" — testing showed it already is (audit F2). The slice:

> **Cut the cost of the lawyer's non-delegable verification step — per claim — from
> "re-read the document" to "one click".**

The bet: if every claim carries a machine-verified, one-click-inspectable quote from the
document — and absence of support is shown just as honestly — lawyers calibrate trust **per
sentence** instead of being asked to trust the system wholesale. That matches how they already
work, respects their duty, and answers their documented fear.

## What good looks like

The 60-second path: ask a real question → answer streams → citation chips appear beneath it
(`Clause 3.2.1 · p.4 ✓` — tick means the backend found this exact quote in the document) →
click a chip → the reader jumps to the page and highlights the passage → chevron unfolds the
verbatim quote inline. Ask a question the document doesn't answer → clean refusal, zero chips,
and an honest "no supporting passages" line where the old app showed "3 sources cited".

Done means: the rent-review question yields ≥3 verified chips each jumping to the right page;
the asbestos question yields zero chips and the honest empty state; the verifier has tests;
`just check` passes; the old badge is deleted.

## Product rules

- Every change traces to a numbered finding in `docs/audit.md`. If it doesn't serve one,
  question it before building it.
- Never ship a trust signal the system cannot back with evidence. A badge, count or tick must
  derive from a check against the document, or it doesn't render.
- "The document doesn't say" is a first-class result, not a failure state.

## Design rules

- Extend the app's existing language — IBM Plex, hairline borders, no generic AI aesthetics.
- Palette is sampled from orbital.tech, not invented: `ground` #ddf8ff (pale ice, the surface
  the cards sit on), `brand` #006a87 (deep teal), `accent` #ff6e30 (orange). Reading surfaces
  stay white — the ground is a frame, never something text sits on.
- Colour carries one meaning each: teal is structure and verified evidence, orange is primary
  actions and nothing else. The one exception is the logo mark, which reproduces the brand's
  own orange-on-teal pairing — identity, not an action. An unverified citation is deliberately colourless — a dashed
  border and an icon — so it reads as "unconfirmed", not as an error, and never competes with
  the accent.
- Verified vs unverified is structural (icon + border), never colour alone.
- Verbatim quotes render in IBM Plex Serif italic; serif is reserved for words the document
  actually says. UI copy stays sans.
- Panels hand width to each other: sidebar collapses to a rail, reader auto-opens on citation
  click. The layout serves the ask→verify journey and changes for no other reason.
- Every state designed: streaming, no-citations, unverified, empty, loading, failure.

## Engineering rules

- Match existing idioms: FastAPI routers → services, SQLAlchemy 2.0 mapped classes, alembic
  for schema changes, SSE for streaming.
- Anything that claims correctness gets a pytest test. UI gets a browser check.
- No new dependencies without a stated reason in the commit message.

## How we'd know the bet is working

| Signal | Reads as |
|---|---|
| Citation click/expand rate | Are lawyers inspecting evidence? (early trust behaviour) |
| % answers with ≥1 verified citation | Is output checkable? (quality floor) |
| Unverified-citation rate | Grounding failures surfaced per answer — an alarm |
| Claim+citation copy/export | The job proxy: answers entering the work product |
| Questions per document, return sessions | Deepening reliance |

Counter-metric: clicks trending to zero is ambiguous (earned trust vs rubber-stamping) — pair
usage with a periodic grounding eval over known documents. That harness is first in
`DECISIONS.md` → next steps.

## Model routing

Two separate decisions, deliberately made:

- **Dev-time (building this repo).** Planning, audit and spec ran on the top reasoning tier
  (Claude Fable 5) because every later decision inherits from them. Implementation runs on
  Opus 5 — the agentic-coding sweet spot at half the per-token cost — against this file as
  the binding spec. Mechanical fixes can drop a tier further. Route by task, not by default.
- **Runtime (what the product calls).** The app keeps its existing Haiku 4.5 for chat and
  citation extraction. The citation verifier is a string match against the document — it
  doesn't trust the model — so model tier is a cost/latency knob here, not a trust knob.
  Buying trust with a bigger model is the exact mistake this build exists to remove.

## Verify before done

- `just check` and `pytest` pass before every commit.
- Run the actual flow in the browser — upload, ask, click a citation, watch the reader move —
  before calling any feature complete.
