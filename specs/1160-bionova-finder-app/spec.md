# Spec 1160 — BioNova Polaris Application

Forward Impact publishes shared libraries for building products with both web
and CLI surfaces, but no complete external consumer example exists. BioNova
Polaris is a patient-facing clinical trial search application — named for the
guiding star that orients a patient toward the right trial — that proves these
libraries work for real products built outside the Forward Impact codebase.

Polaris is built around synthetic data. Every domain entity it shows — every
condition, trial, site, eligibility rule, explainer, FAQ, consent summary, and
patient story — originates in one file: `data/synthetic/story.dsl`. The app has
no hand-authored domain content. It is a surface over a generated world. This
makes Polaris a second proof: that `fit-terrain` and the synthetic-data DSL,
not just the UI libraries, work for an external team.

## Problem

There is no reference implementation demonstrating how an external team
consumes Forward Impact shared libraries (`libcli`, `libui`, `libformat`,
`libtemplate`, `librepl`) and the synthetic-data pipeline (`fit-terrain` +
`story.dsl`) to build a product with the Kata agent team. The pitch to
engineering leaders lacks a concrete, running artifact that shows end-to-end
autonomous development on top of generated, regenerable data.

### Who is affected

- **External teams** evaluating Forward Impact — no working example to follow,
  and no proof that `fit-terrain` runs outside the monorepo.
- **The Forward Impact team** — the demo pitch has no live application to
  anchor it.
- **Platform builders** — unclear whether shared libraries and the synthetic
  pipeline compose into a real product outside the monorepo.

## Proposal

Build `bionova-apps`, a MONOREPO.md-compliant repository containing the
**Polaris** product — a patient-facing app that helps people discover whether
they're eligible for BioNova clinical trials, and reads its entire domain from
synthetic data.

### Synthetic data foundation

`bionova-apps` vendors `data/synthetic/story.dsl` **verbatim** from this
monorepo, alongside the committed `prose-cache.json`. The DSL is the
repository's domain source of truth — the apex of the provenance chain, not
generated output. `bionova-apps` runs `fit-terrain` against its own copy of
`story.dsl` to produce the SQL migrations and embeddings JSONL that seed
PostgreSQL. The build is credential-free: `fit-terrain build` renders from the
committed prose cache and makes no LLM calls. Regenerating from the vendored DSL
reproduces the seed byte-for-byte.

This inverts the relationship from "vendor the rendered SQL" to "vendor the DSL
and render locally." Auditing what the app contains means reading
`story.dsl`, not reverse-engineering SQL dumps. Changing the domain means
editing the DSL and rerunning the build.

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
- **Read patient-facing content** — every condition carries a plain-language
  explainer, every trial a FAQ and a consent summary, every site a description,
  and the catalog carries patient stories and therapy descriptions. All of this
  prose is generated from `story.dsl` and stored in seed tables, not authored by
  hand.
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
with pgvector for data and semantic search. PostgREST for auto-generated REST
API. GoTrue for auth. HuggingFace TEI for embeddings. Supabase Edge Functions
for eligibility scoring and embedding generation. Next.js App Router with
Tailwind and shadcn/ui for the frontend. Forward Impact shared libraries from
npm. `@forwardimpact/libterrain` and `@forwardimpact/map` from npm provide the
synthetic-data build.

### Data seeding

All domain data is generated deterministically from the vendored `story.dsl`
via `fit-terrain build`, run inside `bionova-apps` at setup time. `setup.sh`
renders the SQL migrations and embeddings JSONL into a disposable build
directory, stages them into `products/polaris/site/supabase/migrations/`, and
applies them with `supabase db push`. The `embed-seed` Edge Function then calls
TEI on the Docker network to populate pgvector. No external API keys are needed
at any point, because the prose cache is committed and `build` makes no LLM
calls.

## Scope

### Included

- Repository structure following MONOREPO.md standard with PG On Rails
  infrastructure under `infrastructure/`.
- `data/synthetic/story.dsl` and `prose-cache.json` vendored verbatim from the
  monorepo, with recorded provenance (`PROVENANCE.md`, `SHA256SUMS`).
- `products/polaris/` — `site/` (Next.js), `cli/` (bionova-polaris), `handlers/`
  (shared business logic).
- `services/polaris-functions/` — Edge Functions (`embed-seed`,
  `eligibility-check`, `notify-updates`, `sync-listings`).
- `infrastructure/` — Kong, PostgreSQL + pgvector, PgBouncer, PostgREST,
  GoTrue, Realtime, MinIO + Storage API, imgproxy, TEI.
- PostgreSQL schema: `conditions`, `sites`, `researchers`, `trials`, `criteria`,
  `trial_conditions`, `trial_sites`, `condition_embeddings`, the prose tables
  (`condition_explainers`, `trial_faqs`, `consent_summaries`,
  `site_descriptions`, `patient_stories`, `therapy_descriptions`), and
  `interest_signals`.
- Row-Level Security policies for all tables.
- `docker-compose.yml`, `setup.sh` bootstrap (runs `fit-terrain build`),
  Railway deployment config.

### Excluded

- Real patient data or HIPAA compliance — all data is synthetic.
- Mobile-native apps — responsive web only.
- Integration with ClinicalTrials.gov or other real registries.
- Publishing to the `fit-*` namespace — this is a BioNova repo.
- Managed Supabase — the entire stack is self-hosted.
- Editing `story.dsl` in `bionova-apps` — the vendored copy is verbatim; domain
  changes are made in the monorepo and re-vendored.

## Prerequisites

These capabilities do not exist today and must ship before this spec can be
implemented. Each needs its own spec, design, and plan.

1. **External `fit-terrain` execution.** `fit-terrain` hardcodes monorepo
   paths: it writes output relative to the resolved project root and would
   `rm -rf` `products/polaris/` (the app code) in an external repo. It needs an
   `--output-root` flag so output renders into a disposable build directory
   chosen by the caller. The map schema directory it loads for pathway
   rendering (`products/map/schema/json`) is published in `@forwardimpact/map`
   but not resolvable by path outside the monorepo; pathway rendering is
   skipped when no `--schema-dir` is supplied, which is acceptable for Polaris
   (it needs only the clinical output), but the flag should resolve
   `@forwardimpact/map` by default so the verbatim DSL's `standard {}` block
   still renders if requested. `--story` and `--cache` overrides already exist.
2. **Prose entities rendered to SQL.** The clinical `content {}` block already
   generates condition explainers, trial FAQs, consent summaries, site
   descriptions, patient stories, and therapy descriptions into the prose
   cache, but the pipeline materializes them only as text fields on HTML
   output, never as SQL tables. Three changes are required: materialize the six
   prose types as records in `buildClinicalEntities`, add their table specs to
   `render-sql.js`, and pass the prose cache into `renderSql` (today it reaches
   only `renderEmbeddings`). The `polaris-seed` output block in `story.dsl`
   already lists the six prose entities (this spec's only direct DSL change);
   the renderer must learn to emit them.
3. **Spec 1140 — clinical-output pipeline** (implemented) and **spec 1150 —
   story.dsl clinical rewrite** (implemented) remain prerequisites for the
   clinical entities the prose work extends.

## Success Criteria

1. `docker compose up && ./setup.sh` starts the full stack, runs
   `fit-terrain build` against the vendored `story.dsl`, and seeds all data.
   Verify: all healthchecks pass, `condition_embeddings` table has vectors,
   prose tables are populated.

2. `/search` returns trial results matching a plain-language condition query.
   Verify: searching "high blood sugar" returns diabetes-related trials.

3. `/trials/:id/eligibility` presents a screener and returns a match score.
   Verify: completing the screener for a matching patient returns "eligible".

4. `/trials/:id` shows the trial's FAQ and consent summary, and
   `/conditions/:id` shows the condition explainer — all sourced from prose seed
   tables. Verify: the rendered text matches the corresponding `clinical_*` keys
   in `prose-cache.json`.

5. `bionova-polaris search --condition=diabetes` returns the same trials as the
   web search. Verify: CLI output matches web response data.

6. `bionova-polaris admin trial <id>` allows staff to manage trial listings.
   Verify: CLI updates are reflected in the web interface.

7. All seed data is deterministic and regenerable from the vendored DSL inside
   `bionova-apps`. Verify: `fit-terrain build` in `bionova-apps` (against the
   vendored `data/synthetic/story.dsl` + `prose-cache.json`) regenerates
   `products/polaris/site/supabase/migrations/seed_*.sql` +
   `seed_embeddings.jsonl` byte-identical to the recorded `SHA256SUMS`; running
   the same build in the monorepo at the provenance SHA reproduces the same
   bytes; `supabase db push` of the staged migrations then reproduces identical
   data.
