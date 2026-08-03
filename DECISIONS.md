# Decisions

## What I built, and why

Real citations. The baseline already renders a trust signal — "N sources cited" — but it's a
regex over the model's own reply, so it counts hallucinated clause numbers as sources and, as
the audit shows (`docs/audit.md`, F1), rewards exactly the answers a lawyer most needs to
doubt. I replaced it end to end: the model now returns verbatim quotes alongside its answer,
the backend verifies each quote against the extracted document text and resolves its page, and
the UI renders each citation as a chip — click it and the reader panel jumps to the page and
highlights the passage. Verified and unverified citations are visibly distinct, and the
verifier is the one component in the repo with tests, because it's the one component that
claims correctness.

The reasoning is about cost, not features. Testing showed the model is already good — accurate
clause-level citations, clean refusals when the document is silent. What the product lacked
was any way for the lawyer to *know* that without re-reading the document, which is the work
the tool exists to remove. Due diligence is a verification job; this build prices verifying a
claim at one click instead of one document.

## Why this over the other options

Multi-document support was the loudest alternative — the brief's users handle dozens of
documents per deal and the app enforces one. I chose against it because it multiplies an
answer the lawyer still can't check: more scope on top of an unverifiable core. Citations are
the right first move *because* they're the foundation multi-doc needs — a citation gains a
`document_id` and the same chip → page → highlight loop works across a deal room. A broader
UI overhaul I ruled out as polish without a thesis, and chunking/RAG solves a scale problem
these document sizes don't have yet. I did fix one thing off-thesis: the shipped
`.env.example` crashes the backend on current dependency resolutions (F5), and a reviewer's
first `just dev` failing is worth two lines and a lockfile.

## What I'd do next

In order: lift the one-document limit onto the citation model (F3), so a deal's documents
share one conversation and every claim carries its source document; make the document prefix
cacheable and use structured message history instead of a flattened prompt string (F4), which
matters as soon as documents get long; and grow the verifier's tests into a small grounding
eval over the sample documents — a harness that asks known questions and asserts the citations
resolve — so answer quality is measured on every change rather than vibes-checked. Further
out, the unverified-citation state is a product surface of its own: today it warns, but
logged and aggregated it tells you which documents and question types the system is weakest
on.
