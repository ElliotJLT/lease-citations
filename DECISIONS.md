# Decisions

## What I built, and why

I had no access to user interviews, behavioural analytics or production usage data for this
product, so I could not confirm with real lawyers that verification cost is what actually slows
them down, as against trust in the underlying answer, document coverage or workflow fit.
Everything below rests on that assumption: that verification cost is a real bottleneck for
commercial real estate lawyers doing document Q&A, enough that cutting it from re-reading the
document to one click is worth building for. The audit (`docs/audit.md`) grounds it in testing
of the existing app and in the documented shape of the professional risk, including the finding
that even purpose-built legal research tools hallucinate fluently (Magesh et al., *JELS* 2025).
That covers the tool and the domain. A real lawyer's priorities are still untested.

Real citations, native to the answer instead of a second list describing it. The baseline
already renders a trust signal, "N sources cited", but it's a regex over the model's own
reply, so it counts hallucinated clause numbers as sources and, as the audit shows
(`docs/audit.md`, F1), rewards exactly the answers a lawyer most needs to doubt. I replaced it
end to end, and changed the contract along the way: the model now writes an inline `[[n]]`
marker immediately after each proposition as it drafts its prose, at the exact point a lawyer
would need to check it, naming which of its own quoted sources the proposition rests on. A
deterministic verifier, its matching rules unchanged, independently checks whether each
quoted wording can be located in the extracted document text and resolves its page; nothing
renders as evidence unless that check passes. The backend then rewrites every marker to a
stable id and recovers the claims a lawyer sees from where those markers land (the span from
the previous marker group to this one, inside a single paragraph) rather than asking the model
to author a second, paraphrased list of what it just said. The old contract had exactly that
second list, and two representations of the same answer drift: a claim's text was never
provably the sentence it stood for, only the model's gloss on it. This one has no fuzzy
matching anywhere on either side of the boundary: marker position is exact because the model
placed it itself, and the verifier still trusts nothing about wording. In the interface a
matched marker is a small teal square, hoverable for the quote and clickable to jump the
reader; a marker whose quote could not be located renders as a colourless dashed square with an
alert glyph, sitting against the specific proposition it weakens rather than as a stray warning
on the answer as a whole. Where a matched passage names a defined term or another clause, the
citation inspector's "Read with" list resolves and surfaces it. A citation answers *where this
came from*, not *do I have the whole position*.

The citation inspector docked in the reader panel earned a rework mid-build once duplication
became obvious in real use: it doesn't repeat the claim (the chat above it already shows that)
or the quotation (the document is already highlighted on the passage), and it carries no
model-written explanation anywhere in it. What it shows is what only the system can show: the
clause label and page, a matched or not-located status, a close control, a "Source N of M"
position indicator with previous and next controls, a "Used in N statements" line when a
passage supports more than one proposition, and the deterministic "Read with" list. The N/M
navigation lets a lawyer step through every unique passage behind an answer without going back
to the chat to find the next marker: it moves in the order the answer makes its claims, updates
the active inline marker as it goes, jumps and highlights in the PDF, and counts a passage once
even when several propositions cite it, so "Used in N statements" and "Source 2 of 5" never
contradict each other. Not-located sources are inspectable too, deliberately, rather than
sitting outside the review flow as dead weight: selecting one opens the same inspector showing
"Source not located" and one sentence, "This source was offered for the selected proposition,
but the quoted wording could not be matched in the current document." It says exactly that and
nothing more, and no more than that: not that the proposition is false, not that the clause
doesn't exist, not that the answer has been legally checked, not that the document is complete.
"View all sources" runs the same rule across the whole answer: it deduplicates by unique
passage, marks "Used in N statements" where it applies, and keeps not-located sources listed and
explicit rather than folding them away. Nothing here is called "verified". The language
throughout is "matched" and "not located", because what the system checked is wording against
text, not the correctness of a proposition.

The chain a lawyer actually walks is short, even though the machinery under it isn't: a
proposition, its inline marker, a hover preview, a click to the highlighted source, "Read with"
for what the source depends on, then the next source. Each step is one glance or one click. The
model's decomposition into propositions, the verifier's matching, the marker rewrite and the
trail resolution all sit underneath that chain, and none of them should ever be something the
lawyer has to look at directly in order to trust the one visible step on top.

The boundary is the whole safety case. The model asserts which source belongs to which proposition. The system independently checks
whether the quoted wording exists in the document. Whether that wording legally supports the
proposition remains a judgement for the lawyer. Nothing here verifies legal correctness, and
nothing in the interface claims to. The verifier carries the repo's tests because it's the
component making the strongest claim, checking its own output rather than trusting the model,
alongside tests for the marker rewrite and claim derivation, the parser that reads the
model's structured output, the trail resolver, and a small grounding eval over the sample
documents.

The reasoning is about cost. Testing showed the model is already good: accurate
clause-level citations, clean refusals when the document is silent. What the product lacked
was any way for the lawyer to *know* that without re-reading the document, which is the work
the tool exists to remove. Due diligence is a verification job; this build prices verifying a
claim at one click instead of one document.

One refinement matters beyond correctness: citation accuracy is not legal completeness. "The
tenant may assign with consent" can be perfectly supported by clause 7.1.1 and still be
dangerous advice if the conditions in 7.1.2 aren't on the table. So the prompt requires the
evidence for an answer to span what the position depends on (operative clause, definitions,
conditions and exceptions), and the markers, together with the citation inspector's "Read with"
trail, make that composition visible rather than treating one passage as sufficient.

Real use found one defect in the verifier itself. A quote spanning a page break carried the next page's running header into the middle of
the displayed text. Clause 3.2.4 turning the page mid-sentence produced a quote reading
"…carried out by Commercial Lease — 100 Bishopsgate PRIVATE & CONFIDENTIAL Page 5 and at the
expense of the Tenant…", because `reflow()` collapsed the raw character slice without stepping
over the furniture `page_furniture()` already knew how to detect. Fixed, and pinned with a
regression test that reproduces the bug's exact shape rather than a synthetic stand-in. The
same defect explains a `DocumentViewer` failure that looked, until this was found, like a
frontend bug: the reader's text-layer search was failing honestly, because the quote it was
asked to find was never the document's actual wording in the first place.

Tested beyond the lease it was built against. The title report verifies all of the citations the model offers against it.
The environmental assessment matches most, and leaves several not located, and the not-located
ones are the model stitching a quote from two separate passages under one label, rather than
quoting either verbatim. That is the verifier catching the failure mode it exists to catch, and
surfacing it as "not located" rather than rendering a spliced quote as evidence.

Seven limitations.

1. **The build buys precision, not recall.** Every marked claim is checkable, but nothing
   guarantees the model surfaced every relevant provision, so the language is careful never to
   claim absence: "No supporting provision identified" is a statement about the search, not
   about the document.
2. **A matched quotation is not a legal opinion.** The wording can genuinely be found in the
   document and still be the wrong passage for the point, or the right passage read the wrong
   way, and the claim-to-source binding underneath it is still a model assertion that the system
   checks for existence rather than for relevance.
3. **Single-document**, by scope decision (see "Why this over the other options" below) rather
   than by any limit in the citation model itself.
4. **`services/trail.py` is lease-shaped.** It resolves "clause/schedule/paragraph N" and
   `"X" means` definitions, which is how this lease is drafted but not how the title report or
   the environmental assessment name their own provisions, so "Read with" degrades to nothing
   there rather than guessing at a convention it doesn't recognise.
5. **A failed highlight now says nothing.** The reader's old "couldn't automatically highlight
   this passage" banner is gone, so a failed text-layer match lands the lawyer on the right page
   with no highlight and no notice. That's a real deviation from "every state designed", logged
   here rather than hidden, and the fix is to make the text-layer search agree with the
   backend's own match rather than to narrate the gap.
6. **Orange does two jobs.** `CLAUDE.md` reserves it for primary actions, and it also marks the
   marker or pill the lawyer is currently hovering or has selected. A deliberate revision rather
   than a drift: orange marks the thing being acted on, not only the thing that could be acted
   on next.
7. **None of this has been checked against a real lawyer's actual priorities**, which is the
   assumption at the top of this document. Whether verification is genuinely the highest-value
   place to have spent this build is still open, and user research is what would close it.

## Why this over the other options

Multi-document support was the loudest alternative, since the brief's users handle dozens of
documents per deal and the app enforces one. I chose against it because it multiplies an
answer the lawyer still can't check: more scope on top of an unverifiable core. Citations are
the right first move *because* they're the foundation multi-doc needs: a citation gains a
`document_id` and the same marker → page → highlight loop works across a deal room. A broader
UI overhaul I ruled out as polish without a thesis, and chunking/RAG solves a scale problem
these document sizes don't have yet. I did fix one thing off-thesis: the shipped
`.env.example` crashes the backend on current dependency resolutions (F5), and a reviewer's
first `just dev` failing is worth two lines and a lockfile.

One item that sat in this table in an earlier draft has since shipped: inline per-sentence
markers, in the streamed answer's own prose rather than a grouped block below it.

| Considered | Why not now |
|---|---|
| Multi-document deal room | The citation model is its foundation: evidence loop first, then scale it |
| "Directly stated vs inferred" labels on answers | A model's account of its own reasoning is an unverifiable self-report, the same failure class as the badge this build removes. The interface renders only states it can check |
| Typed evidence trail *on the citations themselves* (categorising each one as definition / condition / cross-reference, distinct from "Read with" above, which resolves those from the document rather than labelling the model's) | Adopted at the substance level, since the prompt requires citing the full set of provisions a position depends on, and the model's own labels already read "Definition: Review Dates", but typed categories and grouped navigation of the citations list are v2 polish on the same schema |
| Contradiction detection | Secondary to grounding, and needs the evidence loop anyway |
| Risk scoring, drafting, redlining, agentic review | Different jobs; none reduce verification cost |

Answers beside a document with highlighted sources is the
grammar of legal AI, Orbital's products included, and it's the starter's own layout. That's
deliberate: the category converged on this shape because it matches how lawyers check work.
The contribution is the mechanism underneath it: nothing renders as
evidence unless the server has located it in the document, absence is rendered honestly, and
that property is tested on every commit.

## Where the model does the work, and where it doesn't

The sharpest challenge to this build is that the checking layer is a workaround for a prompt
that needs fixing. On the environmental assessment the model joined wording from two separate
passages into a single quote, three times out of seven, so the obvious response is to fix the
prompt.

The prompt already says it. The instruction reads "Quote the document's exact wording.
Do not paraphrase, summarise, join separate passages, or correct apparent errors." The model
read that and joined passages anyway, on the first document it had not been tuned against.
Better prompting would lower the rate. It would not tell a lawyer which of their answers landed
in the residue, and a rare failure with no signal is more dangerous to someone professionally
liable than a visible one. The check is also the only reason I know the stitching happens at
all: it surfaced as three not-located markers whose labels read "Section 5.3.1 and 5.3.2".
Remove the check and that failure stops being visible rather than stopping. The not-located
rate is now the number I would tune a prompt against, which makes this the instrument for
improving the prompt rather than a substitute for it.

So the split is deliberate. The model does what it is genuinely good at: reading the question,
breaking its answer into propositions a lawyer would evaluate separately, choosing which
passages support each one, marking the exact point in its own prose where a proposition ends,
and declining when it finds nothing. Deterministic code does the part that has to be true:
locating the quoted wording, resolving its page, resolving the defined terms and clause
references a passage names. Judging whether the passage actually supports the point is left to
the lawyer.

Several options would have used more of the model and left the product worse. Having it gloss
each defined term in the "Read with" list, or shorten the claim line, puts model-written text
beside checked text with nothing to tell them apart. Asking it to rate its own confidence, or
to label a claim as directly stated against inferred, produces a self-report, which is the
failure class the audit found in the baseline badge. A second pass in which the model critiques
its own quotes is still the model marking its own homework. A larger model for extraction buys
a lower error rate and no new information about which answers are wrong. Every one of those
adds model surface and subtracts from the single property the interface is selling.

## How the work was directed

The docs came before the
code and were written to be *binding on agents*, not to describe the work afterwards: audit
first, then `CLAUDE.md` as the spec, then implementation held to it. That ordering is visible
in the commit history, and it's what made the rest of the routing possible.

Models were chosen per task rather than by default. The audit, the product framing and the
spec ran on the top reasoning tier, because every later decision inherits from them and a bad
call there propagates. Implementation ran a tier down against the spec, because well-specified
component work is where cheaper models are at parity, and paying frontier rates to write code
against a settled design saves nothing.

The non-obvious cost lever turned out not to be the model tier at all. A long session re-reads
its entire history every turn and prompt caches are model-scoped, so the expensive thing is
context, not intelligence. Once the spec was settled, the cheapest correct move was a fresh
session pointed at `CLAUDE.md`, roughly an order of magnitude less context per turn than
continuing the conversation that produced it. That only works if the spec is genuinely
complete, which is the real reason to write one: the test of these documents is whether an
agent with no memory of the discussion can build the right thing from them alone.

## What I'd do next

The assumption stated at the top of this document is the real first item, ahead of any of the
engineering below: test it against real lawyers doing real due diligence, ideally with usage
data rather than a demo reaction, because everything that follows assumes the bet on
verification cost is right and none of it is evidence that it is. On the build itself, in
order: lift the one-document limit onto the citation model (F3), so a deal's documents
share one conversation and every claim carries its source document; make the document prefix
cacheable and use structured message history instead of a flattened prompt string (F4), which
matters as soon as documents get long; extend the grounding eval (which today runs offline
against the verifier alone, over text extracted from the real sample documents) into a live
one that asks the model real questions and asserts its citations resolve, so answer quality,
not just extraction quality, is measured on every change rather than vibes-checked; and
generalise `services/trail.py`'s reference pattern beyond "clause/schedule/paragraph N", which
is one word away from also covering the title report's and environmental assessment's own
"Section N" convention, so "Read with" stops degrading to nothing on two of the three sample
documents. Alongside that, close the silent-highlight-failure gap noted above: make the
reader's text-layer search agree with the backend's own match, rather than continuing to land
on the right page with no notice when it fails. Further out, the not-located-citation state is
a product surface of its own: today it warns, but logged and aggregated it tells you which
documents and question types the system is weakest on. And the markers point at the step the
lawyer's workflow ultimately demands: approve or flag per citation, so matched evidence stops
being something they check and becomes something they sign off: the seed of a report-review
loop in which every claim carries both its source and its reviewer.
