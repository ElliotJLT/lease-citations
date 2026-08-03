# Working rules — Orbital take-home

Document Q&A for commercial real estate lawyers doing due diligence. This file is binding on
every change, human- or agent-authored.

## Product rules

- The user is a CRE lawyer reviewing leases, title reports and environmental assessments —
  often dozens per deal. Their job is not reading answers; it is **verifying** them before
  advising a client. Optimise for the cost of checking a claim, not the fluency of the claim.
- Every change traces to a numbered finding in `docs/audit.md`. If it doesn't serve one,
  question it before building it.
- Never ship a trust signal the system cannot back with evidence. A badge, count or tick must
  be derived from a check against the document, or it doesn't render.
- An answer of "the document doesn't say" is a first-class result, not a failure state.

## Engineering

- Match the existing idioms: FastAPI routers → services, SQLAlchemy 2.0 mapped classes,
  alembic migrations for any schema change, SSE for streaming.
- Anything that claims correctness (e.g. citation verification) gets a pytest test. UI gets a
  browser check, not just a typecheck.
- No new dependencies without a stated reason in the commit message.

## Design

- Extend the app's existing language — IBM Plex, neutral palette, hairline borders. No
  re-theming, no generic AI aesthetics (purple gradients, cookie-cutter card grids).
- Verified vs unverified must never be distinguished by colour alone — pair with an icon or
  label.
- Every state designed: empty, loading, long content, and failure.

## Verify before done

- `just check` (ruff, pyright, biome, tsc) and `pytest` pass before every commit.
- Run the actual flow in the browser — upload, ask, click a citation, watch the reader move —
  before calling any feature complete.
