# Audit — the baseline app, tested before anything was built

Method: I ran the app against the provided sample documents and asked real due-diligence
questions, then checked every claim in the answers against the source text. The findings below
come from that testing plus a code read. Each is numbered; every change in this repo traces
back to one of them.

The stakes frame the bar. A lawyer acts on these answers on behalf of a client. In a domain
with an objectively right answer, a plausible-sounding response is the failure mode, not the
goal — so the question throughout is not "does it answer well?" but "can the lawyer afford to
check it?"

## F1 — The "sources cited" count measures nothing *(the central finding)*

`backend/src/takehome/services/llm.py` counts regex matches for `section N` / `clause N` /
`page N` **in the model's own reply**, never consulting the document. The count is stored on
the message and rendered in the UI as "N sources cited".

Reproduced live against `commercial-lease-100-bishopsgate.pdf`:

> **Q:** What does the lease say about the tenant's asbestos management duties under the
> Control of Asbestos Regulations 2012?
>
> **A:** "The lease does not contain any provisions regarding the tenant's asbestos
> management duties…" — correctly noting that Sections 4, 5 and 9 cover repair, insurance and
> indemnities instead. *(The word "asbestos" does not appear in the document.)*
>
> **Badge: "3 sources cited."**

The answer was right — and the honest thing about it was the absence. The badge counted the
section numbers in the sentence explaining that none of them applied. On exactly the answers
where a lawyer most needs to trust a negative finding, the signal is anti-correlated with
groundedness. → This build replaces it (see `DECISIONS.md`).

## F2 — Answers are accurate, and unverifiable

The model itself performed well in testing: a rent-review question returned six clause-level
citations, all of which checked out against the source text; the asbestos question above was
refused cleanly rather than invented. But confirming those six citations required extracting
the document text and grepping it — access no user has. In the product, the answer cites
"Clause 3.2.5" and the reader panel sits on page 1 with no search, no jump-to-reference, no
highlight. Checking a citation costs about what reading the lease costs, which is the value
of the tool gone. → Citations become clickable evidence: chip → page → highlighted passage.

## F3 — One document per conversation, enforced against the user's job

`services/document.py` raises if a conversation already has a document, while the brief's
users handle dozens of documents per deal. The schema already models the right thing —
`Conversation.documents` is a list — so the limit is policy, not structure. → Out of scope
for this build, but the citation model is designed to extend (a citation gains a `document_id`
when this lifts). See `DECISIONS.md`.

## F4 — Every turn resends the whole document, uncached

`chat_with_document` rebuilds one flat prompt string per turn: full document text + entire
history flattened into `User:`/`Assistant:` lines + the new message. Spend grows with every
turn on a document that never changes — and a stable document prefix followed by a volatile
question is the textbook shape for prompt caching, unclaimed. Fine at 9 sample pages; wrong
shape for a 100-page environmental report. → Noted as next work; not the highest-value fix at
this document size.

## F5 — First run crashes on the shipped `.env.example`

`Settings` in `config.py` rejects unknown keys, and `.env.example` ships four the model
doesn't declare (`API_PORT`, `POSTGRES_*`). With no `uv.lock` committed, the backend resolves
pydantic-settings fresh — current releases forbid extra keys, so `just setup` → `just dev`
dies with validation errors before serving a request. Dependency drift: the frontend lockfile
is committed, the Python one isn't. → Fixed in this build (tolerate extra env keys, commit
`uv.lock`) so the reviewer's first run works.

## F6 — Two sources of truth for the database URL

`alembic.ini` hardcodes the docker-compose hostname while `config.py` reads `DATABASE_URL`
from the environment; the app runs migrations through the hardcoded one at startup. Works in
compose, breaks anywhere else. → Noted; left as-is to keep the diff on-thesis.

## F7 — No tests

`backend/tests/` contains an empty `__init__.py`, with pytest fully configured and unused.
→ This build adds the repo's first tests, on the one component that claims correctness: the
citation verifier.

## F8 — The documented quality gate doesn't pass

`just check` is the repo's own definition of clean, and on the untouched baseline it fails:
three ruff errors (an unsorted import block, two exception re-raises missing `from`) and five
pyright errors (PyMuPDF ships no type stubs; `page.get_text()` is untyped). A gate that is red
on arrival can't be used to hold anything to a standard. → Fixed in this build, so the gate
means something for every commit after it.

## What the baseline gets right

Kept deliberately. The three-panel layout (conversations / chat / reader) is the correct
skeleton for this job, and the reader panel is the right investment — this build gives it a
job to do rather than replacing it. SSE streaming with a persisted final message is cleanly
done. The service split is small and legible, the schema is sensible, and prompt instructions
already ask the model to cite sections and admit absence — the model honours both; the product
just gives the user no way to see that it did.
