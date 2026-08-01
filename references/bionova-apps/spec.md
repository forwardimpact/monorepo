# Spec 1160 — BioNova Polaris Application

Forward Impact publishes shared libraries to build products with both web and
CLI surfaces. No complete external consumer example exists. BioNova Polaris is
a patient-facing application that searches clinical trials. Its name comes from
the star that orients a patient toward the right trial. Polaris proves these
libraries work for real products built outside the Forward Impact codebase.

Polaris builds on synthetic data. Every domain entity it shows originates in
one file: `data/synthetic/story.dsl`. That covers every condition, trial, site,
eligibility rule, explainer, FAQ, consent summary, and patient story. The app
has no hand-authored domain content. It is a surface over a generated world.
This makes Polaris a second proof. It shows that `fit-terrain` and the
synthetic-data DSL also work for an external team.

## Problem

No reference implementation shows how an external team consumes Forward Impact
shared libraries (`libcli`, `libui`, `libformat`, `libtemplate`, `librepl`).
None shows how a team pairs them with the synthetic-data pipeline
(`fit-terrain` + `story.dsl`) to build a product with the Kata agent team. The
pitch to engineering leaders lacks a concrete artifact that runs and shows
end-to-end autonomous development on top of generated, regenerable data.

### Who is affected

- **External teams** that evaluate Forward Impact — they have no example that
  works, and no proof that `fit-terrain` runs outside the monorepo.
- **The Forward Impact team** — the demo pitch has no live application to
  anchor it.
- **Platform builders** — they do not know whether shared libraries and the
  synthetic pipeline compose into a real product outside the monorepo.

## Proposal

Build `bionova-apps`, a MONOREPO.md-compliant repository that holds the
**Polaris** product. Polaris is a patient-facing app. It helps people discover
whether they are eligible for BioNova clinical trials. It reads its entire
domain from synthetic data.

### Synthetic data foundation

`bionova-apps` vendors `data/synthetic/story.dsl` **verbatim** from this
monorepo, alongside the committed `prose-cache.json`. The DSL is the
repository's domain source of truth. It is the apex of the provenance chain. It
is not generated output. `bionova-apps` runs `fit-terrain` against its own copy
of `story.dsl` to produce the SQL migrations and embeddings JSONL that seed
PostgreSQL. The build is credential-free. `fit-terrain build` renders from the
committed prose cache. It makes no LLM calls. A rebuild from the vendored DSL
reproduces the seed byte-for-byte.

This inverts the relationship from "vendor the rendered SQL" to "vendor the DSL
and render locally." To audit what the app contains, read `story.dsl`. You do
not reverse-engineer SQL dumps. To change the domain, edit the DSL and run the
build again.

### Users

| Persona | Hires the app to... |
| --- | --- |
| Patient / Advocate | Find trials relevant to their condition with no dense protocols to read |
| Clinical Development Staff | Manage trial listings, update criteria, monitor enrollment interest |
| Referring Physician | Search on behalf of patients, bookmark and share trial details |

### Core capabilities

- **Search trials** — plain-language or catalog-based condition search. It
  uses pgvector to match the query semantically against condition embeddings.
  Filter by phase, location, and enrollment status.
- **Check eligibility** — guided screener derived from trial inclusion/exclusion
  criteria. The Edge function evaluates answers. It returns a match score
  (eligible, possibly eligible, not eligible).
- **Read patient-facing content** — every condition carries a plain-language
  explainer. Every trial carries a FAQ and a consent summary. Every site carries
  a description. The catalog carries patient stories and therapy descriptions.
  `story.dsl` generates all of this prose. Seed tables store it. Nobody authors
  it by hand.
- **Express interest** — anonymous interest signal (no PII) stored in the
  `interest_signals` table. Staff see aggregate counts per trial.
- **Manage trials (staff)** — CLI and web admin for trial listings, criteria
  updates, protocol document uploads, interest signal review.

### Shared surface design

Both surfaces (Next.js web, `bionova-polaris` CLI) dispatch to the same
`handlers/` functions through `InvocationContext`. `libformat` renders output to
ANSI or HTML. The surface determines which one.

### Technology stack

Self-hosted Supabase stack with Docker Compose (PG On Rails pattern). PostgreSQL
with pgvector for data and semantic search. PostgREST for an auto-generated REST
API. GoTrue for auth. HuggingFace TEI for embeddings. Supabase Edge Functions
score eligibility and generate embeddings. Next.js App Router with Tailwind and
shadcn/ui for the frontend. Forward Impact shared libraries from npm. The
`fit-terrain` package from npm provides the synthetic-data build.

### Data seeding

`fit-terrain build` generates all domain data deterministically from the
vendored `story.dsl`. It runs inside `bionova-apps` at setup time. `setup.sh`
renders the SQL migrations and embeddings JSONL into a disposable build
directory. It stages them into `products/polaris/site/supabase/migrations/`. It
applies them with `supabase db push`. The `embed-seed` Edge Function then calls
TEI on the Docker network to populate pgvector. The build needs no external API
keys at any point, because the prose cache is committed and `build` makes no LLM
calls.

## Scope

### Included

- Repository scaffolding that the **monorepo-setup skill** stands up: the
  skeleton, instruction layers, agent team, check workflows, wiki, and remote.
  The skill runs `jidoka-setup` and `kata-setup`. The spec layers the Polaris
  product and its PG On Rails infrastructure (`infrastructure/`) onto that
  skeleton. The spec does not re-specify what the skill owns.
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
- Publication to the `fit-*` namespace — this is a BioNova repo.
- Managed Supabase — the entire stack is self-hosted.
- Edits to `story.dsl` in `bionova-apps` — the vendored copy is verbatim. Make
  domain changes in the monorepo. Then re-vendor the copy.

## Prerequisites

These capabilities did not exist when the spec was first written, and they gated
implementation. All of them shipped since then. The published `fit-terrain`
package (0.1.41 and later) carries items 1 and 2. So a fresh build needs no
unreleased code.

1. **External `fit-terrain` execution** (implemented, ships in
   `fit-terrain` on npm). `fit-terrain` hardcodes monorepo
   paths. It writes output relative to the resolved project root. In an
   external repo it would `rm -rf` `products/polaris/` (the app code). It needs
   an `--output-root` flag so output renders into a disposable build directory
   that the caller chooses. It loads a standard schema directory to render
   pathway content. `@forwardimpact/libskill` publishes that directory in its
   `schema/json`. That package is a hard dependency of `libterrain`. So
   `--schema-dir` resolves it by default. The verbatim DSL's `standard {}`
   block then renders with no extra package. `--story` and `--cache` overrides
   already exist.
2. **Prose entities rendered to SQL** (implemented, ships in the same
   `fit-terrain` release). The clinical `content {}` block already
   generates six prose types into the prose cache: condition explainers, trial
   FAQs, consent summaries, site descriptions, patient stories, and therapy
   descriptions. But the pipeline materializes them only as text fields on HTML
   output. It never materializes them as SQL tables. This needs three changes:
   materialize the six prose types as records in `buildClinicalEntities`, add
   their table specs to `render-sql.js`, and pass the prose cache into
   `renderSql`. Today it reaches only `renderEmbeddings`. The `polaris-seed`
   output block in `story.dsl` already lists the six prose entities. That list
   is the spec's only direct DSL change. The renderer must learn to emit them.
3. **Spec 1140 — clinical-output pipeline** (implemented) and **spec 1150 —
   story.dsl clinical rewrite** (implemented) remain prerequisites for the
   clinical entities the prose work extends.

## Success Criteria

1. `docker compose up && ./setup.sh` starts the full stack, runs
   `fit-terrain build` against the vendored `story.dsl`, and seeds all data.
   Verify: all healthchecks pass, the `condition_embeddings` table has vectors,
   and the prose tables are populated.

2. `/search` returns trial results that match a plain-language condition query.
   Verify: a search for "high blood sugar" returns diabetes-related trials.

3. `/trials/:id/eligibility` presents a screener and returns a match score.
   Verify: a patient who matches completes the screener and gets "eligible".

4. `/trials/:id` shows the trial's FAQ and consent summary. `/conditions/:id`
   shows the condition explainer. Both come from prose seed tables. Verify: the
   rendered text matches its `clinical_*` keys in `prose-cache.json`.

5. `bionova-polaris search --condition=diabetes` returns the same trials as the
   web search. Verify: CLI output matches web response data.

6. `bionova-polaris admin trial <id>` lets staff manage trial listings. Verify:
   the web interface shows the CLI updates.

7. All seed data is deterministic. You can regenerate it from the vendored DSL
   inside `bionova-apps`. Verify: `fit-terrain build` in `bionova-apps` runs
   against the vendored `data/synthetic/story.dsl` + `prose-cache.json`. It
   regenerates `products/polaris/site/supabase/migrations/seed_*.sql` +
   `seed_embeddings.jsonl` byte-identical to the recorded `SHA256SUMS`. The
   same build in the monorepo at the provenance SHA reproduces the same bytes.
   A `supabase db push` of the staged migrations then reproduces identical
   data.
