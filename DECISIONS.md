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

One refinement matters beyond correctness: citation accuracy is not legal completeness. "The
tenant may assign with consent" can be perfectly supported by clause 7.1.1 and still be
dangerous advice if the conditions in 7.1.2 aren't on the table. So the prompt requires the
evidence for an answer to span what the position depends on — operative clause, definitions,
conditions and exceptions — and the chips make that composition visible rather than treating
one passage as sufficient.

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

Other directions considered and set aside, with the reason each lost:

| Considered | Why not now |
|---|---|
| Multi-document deal room | The citation model is its foundation — evidence loop first, then scale it |
| Per-sentence evidence binding (hover a claim → highlight its clause) | The right v2 on this schema; a mis-bound highlight damages trust more than chips build it, so it needs care the time budget doesn't allow |
| "Directly stated vs inferred" labels on answers | A model's account of its own reasoning is an unverifiable self-report — the same failure class as the badge this build removes. The interface renders only states it can check |
| Typed evidence trail (citations categorised definition / condition / cross-reference) | Adopted at the substance level — the prompt requires citing the full set of provisions a position depends on, and labels already read "Definition: Review Dates" — but typed categories and grouped navigation are v2 polish on the same schema |
| Contradiction detection | Secondary to grounding, and needs the evidence loop anyway |
| Risk scoring, drafting, redlining, agentic review | Different jobs; none reduce verification cost |

A note on the shape of the result. Answers beside a document with highlighted sources is the
grammar of legal AI — Orbital's products included — and it's the starter's own layout. That's
deliberate: the category converged on this shape because it matches how lawyers check work.
The contribution here isn't the pattern, it's the mechanism underneath it: nothing renders as
evidence unless the server has located it in the document, absence is rendered honestly, and
that property is tested on every commit. A highlight the system hasn't checked is decoration.

## How the work was directed

Worth stating, since it shaped the repo as much as the feature did. The docs came before the
code and were written to be *binding on agents*, not to describe the work afterwards: audit
first, then `CLAUDE.md` as the spec, then implementation held to it. That ordering is visible
in the commit history, and it's what made the rest of the routing possible.

Models were chosen per task rather than by default. The audit, the product framing and the
spec ran on the top reasoning tier, because every later decision inherits from them and a bad
call there propagates. Implementation ran a tier down against the spec — well-specified
component work is where cheaper models are at parity, and paying frontier rates to write code
against a settled design is the routing mistake, not the saving.

The non-obvious cost lever turned out not to be the model tier at all. A long session re-reads
its entire history every turn and prompt caches are model-scoped, so the expensive thing is
context, not intelligence. Once the spec was settled, the cheapest correct move was a fresh
session pointed at `CLAUDE.md` — roughly an order of magnitude less context per turn than
continuing the conversation that produced it. That only works if the spec is genuinely
complete, which is the real reason to write one: the test of these documents is whether an
agent with no memory of the discussion can build the right thing from them alone.

## What I'd do next

In order: lift the one-document limit onto the citation model (F3), so a deal's documents
share one conversation and every claim carries its source document; make the document prefix
cacheable and use structured message history instead of a flattened prompt string (F4), which
matters as soon as documents get long; and grow the verifier's tests into a small grounding
eval over the sample documents — a harness that asks known questions and asserts the citations
resolve — so answer quality is measured on every change rather than vibes-checked. Further
out, the unverified-citation state is a product surface of its own: today it warns, but
logged and aggregated it tells you which documents and question types the system is weakest
on. And the chips point at the step the lawyer's workflow ultimately demands: approve or flag
per citation, so verified evidence stops being something they check and becomes something they
sign off — the seed of a report-review loop in which every claim carries both its source and
its reviewer.
