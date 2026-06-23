# Spec 1160 — BioNova Polaris Application

Forward Impact publishes shared libraries for building products with both web
and CLI surfaces, but no complete external consumer example exists. BioNova
Polaris is a patient-facing clinical trial search application — named for the
guiding star that orients a patient toward the right trial — that proves these
libraries work for real products built outside the Forward Impact codebase.

## Problem

There is no reference implementation demonstrating how an external team
consumes Forward Impact shared libraries (`libcli`, `libui`, `libformat`,
`libtemplate`, `librepl`) to build a product with the Kata agent team. The
pitch to engineering leaders lacks a concrete, running artifact that shows
end-to-end autonomous development.

### Who is affected

- **External teams** evaluating Forward Impact — no working example to follow.
- **The Forward Impact team** — the demo pitch has no live application to
  anchor it.
- **Platform builders** — unclear whether shared libraries compose into a real
  product outside the monorepo.

## Proposal

Build `bionova-apps`, a MONOREPO.md-compliant repository containing the
**Polaris** product — a patient-facing app that helps people discover whether
they're eligible for BioNova clinical trials.

### Users

| Persona | Hires the app to... |
| --- | --- |
| Patient / Advocate | Find trials relevant to their condition without reading dense protocols |
| Clinical Development Staff | Manage trial listings, update criteria, monitor enrollment interest |
| Referring Physician | Search on behalf of patients, bookmark and share trial details |

### Core capabilities

- **Search trials** — plain-language or catalog-based condition search using
  pgvector semantic matching against condition embeddings. Filter by phase,
  location, and enrollment status.
- **Check eligibility** — guided screener derived from trial inclusion/exclusion
  criteria. Edge function evaluates answers and returns match score (eligible,
  possibly eligible, not eligible).
- **Express interest** — anonymous interest signal (no PII) stored in
  `interest_signals` table. Staff see aggregate counts per trial.
- **Manage trials (staff)** — CLI and web admin for trial listings, criteria
  updates, protocol document uploads, interest signal review.

### Shared surface design

Both surfaces (Next.js web, `bionova-polaris` CLI) dispatch to the same
`handlers/` functions via `InvocationContext`. `libformat` renders output to
ANSI or HTML depending on the surface.

### Technology stack

Self-hosted Supabase stack via Docker Compose (PG On Rails pattern). PostgreSQL
+ pgvector for data and semantic search. PostgREST for auto-generated REST API.
GoTrue for auth. HuggingFace TEI for embeddings. Supabase Edge Functions for
eligibility scoring and embedding generation. Next.js App Router + Tailwind +
shadcn/ui for the frontend. Forward Impact shared libraries from npm.

### Data seeding

All domain data is generated deterministically from `story.dsl` via
`fit-terrain generate` (specs 1140 and 1150). SQL migrations and embeddings
JSONL are loaded on container startup. The `embed-seed` Edge Function calls TEI
on the Docker network to populate pgvector. No external API keys needed.

## Scope

### Included

- Repository structure following MONOREPO.md standard with PG On Rails
  infrastructure under `infrastructure/`.
- `products/polaris/` — `site/` (Next.js), `cli/` (bionova-polaris), `handlers/`
  (shared business logic).
- `services/polaris-functions/` — Edge Functions (`embed-seed`,
  `eligibility-check`, `notify-updates`, `sync-listings`).
- `infrastructure/` — Kong, PostgreSQL + pgvector, PgBouncer, PostgREST,
  GoTrue, Realtime, MinIO + Storage API, imgproxy, TEI.
- PostgreSQL schema: `conditions`, `sites`, `researchers`, `trials`, `criteria`,
  `trial_conditions`, `trial_sites`, `condition_embeddings`,
  `interest_signals`.
- Row-Level Security policies for all tables.
- `docker-compose.yml`, `setup.sh` bootstrap, Railway deployment config.

### Excluded

- Real patient data or HIPAA compliance — all data is synthetic.
- Mobile-native apps — responsive web only.
- Integration with ClinicalTrials.gov or other real registries.
- Publishing to the `fit-*` namespace — this is a BioNova repo.
- Managed Supabase — the entire stack is self-hosted.

## Success Criteria

1. `docker compose up && ./setup.sh` starts the full stack and seeds all data.
   Verify: all healthchecks pass, `condition_embeddings` table has vectors.

2. `/search` returns trial results matching a plain-language condition query.
   Verify: searching "high blood sugar" returns diabetes-related trials.

3. `/trials/:id/eligibility` presents a screener and returns a match score.
   Verify: completing the screener for a matching patient returns "eligible".

4. `bionova-polaris search --condition=diabetes` returns the same trials as the
   web search. Verify: CLI output matches web response data.

5. `bionova-polaris admin trial <id>` allows staff to manage trial listings.
   Verify: CLI updates are reflected in the web interface.

6. All seed data is deterministic and regenerable. Verify: in the monorepo at
   the vendored provenance SHA, `npx fit-terrain generate` in `data/synthetic/`
   regenerates `products/polaris/site/supabase/migrations/seed_*.sql` +
   `seed_embeddings.jsonl` byte-identical to bionova-apps' vendored copies
   under `data/synthetic/seed/`; `supabase db push` of the vendored migrations
   then reproduces identical data.
