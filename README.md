# Orbital — Product Engineering Take-Home

## Submission

**Walkthrough:** https://www.loom.com/share/7ec2e2bd55444a9087e0b6c3dbb8948c
**Part 1:** [`PART1.md`](PART1.md) · **Reasoning:** [`DECISIONS.md`](DECISIONS.md) · **Baseline audit:** [`docs/audit.md`](docs/audit.md)

**The problem.** The baseline's "N sources cited" badge is a regex over the model's own reply.
It counts clause numbers in the answer text, never checks them against the document, and so
rewards exactly the answers a lawyer most needs to doubt (`docs/audit.md`, F1). Asked about
asbestos, it printed "3 sources cited" beneath an answer whose whole point was that the lease
is silent on it.

**What replaces it.** The model writes an inline `[[n]]` marker immediately after each
proposition as it drafts its prose, naming the quote that proposition rests on. A deterministic
verifier then checks whether each quoted wording can be located in the document, with no fuzzy
matching anywhere. The backend rewrites every marker to a stable id and recovers the claims a
lawyer sees from where those markers actually land in the text, rather than from a second,
model-authored list that could drift from the prose it describes.

**What that looks like.** A matched marker is a small teal square: hover for the quote, click to
jump the reader to the page and highlight the passage. A marker whose quote could not be located
is a colourless dashed square with an alert glyph, sitting inline against the proposition it
weakens rather than as a stray warning on the answer as a whole. Where the document doesn't
answer the question at all, the interface renders no markers and says so.

**The inspector** docks in the reader panel and carries only what isn't already on screen: where
the source sits in the answer's evidence ("Source 3 of 7", with controls to step through the
rest), whether more than one proposition leans on it, and a "Read with" list of the defined terms
and cross-references the passage itself names, resolved from the document's own text rather than
suggested by the model. Selecting a not-located source opens the same inspector to say so against
the proposition it was offered for.

**The boundary that makes this safe to trust:** the model asserts which source belongs to which
proposition, the system independently checks whether the quoted wording exists in the document,
and whether that wording legally supports the proposition remains the lawyer's judgement.

Full reasoning in `DECISIONS.md`; the testing behind it in `docs/audit.md`.

**60-second demo path**, after `just dev` (see Setup below):

1. Upload `sample-docs/commercial-lease-100-bishopsgate.pdf`.
2. Ask *"What does the lease say about rent review?"* The answer streams in with numbered
   citation markers appearing inline as it's written. Hover a marker to preview the quote behind
   it; click it and the reader jumps to the page, highlights the passage, and opens the
   inspector. Click one of the "Read with" pills on Clause 3.2.1 (Clause 3.2.2, Clause 3.2.5,
   Review Date, Premises) and the inspector's header becomes a breadcrumb back. Then use the
   ‹ › controls to walk the answer's evidence in order without returning to the chat.
3. Ask *"What does the lease say about the tenant's asbestos management duties?"* You get a clean
   refusal, no markers, and an honest "No supporting provision identified", where the baseline
   showed its badge on the same question.
4. For the not-located state, upload `sample-docs/environmental-assessment-manchester.pdf` and
   ask what contamination was identified and what remediation is recommended. Some sources come
   back not located, because the model joined wording from two separate passages into one quote
   and the verifier declined to accept it. Selecting that marker opens the inspector on the
   proposition it affects and says so.

---

Welcome! This is a take-home assessment for a Product Engineering role at Orbital.

You've been given a working baseline application: a document Q&A tool for commercial real estate lawyers. Users upload legal documents (leases, title reports, environmental assessments) and ask questions about them. The AI assistant answers questions grounded in the document content.

The app works, but it has limitations. Your job is to extend it.

---

## Setup

### Prerequisites
- Docker and Docker Compose
- just (command runner) — install via `brew install just` or `cargo install just`

That's it. Everything else runs inside containers.

### Getting Started

1. Clone this repository

2. Run the setup command:
```
just setup
```
   This copies `.env.example` to `.env` and builds the Docker images.

3. Add your Anthropic API key to `.env`:
```
ANTHROPIC_API_KEY=your_key_here
```
   We've provided an API key in the task email. You can also use your own.

4. Start everything:
```
just dev
```
   This starts PostgreSQL, the FastAPI backend (port 8000), and the React frontend (port 5173).
   Database migrations run automatically when the backend starts — no separate step needed.

5. Open http://localhost:5173 in your browser.

Your local `backend/src/` and `frontend/src/` directories are mounted into the containers —
edit files normally on your machine and changes hot-reload automatically.

### Sample Documents

We've included sample legal documents in `sample-docs/` for testing.

### Project Structure

- `frontend/` — React frontend (Vite + Tailwind + shadcn/Radix UI)
- `backend/` — FastAPI backend (Python 3.12 + SQLAlchemy + PydanticAI)
- `alembic/` — Database migrations
- `sample-docs/` — Sample PDF documents for testing

### Useful Commands

- `just dev` — Start full stack (Postgres + backend + frontend)
- `just stop` — Stop all services
- `just reset` — Stop everything and clear database
- `just check` — Run all linters and type checks
- `just fmt` — Format all code
- `just db-init` — Run database migrations
- `just db-shell` — Open a psql shell
- `just shell-backend` — Shell into backend container
- `just logs-backend` — Tail backend logs
