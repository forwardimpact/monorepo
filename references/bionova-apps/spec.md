# BioNova Polaris Application

BioNova Polaris is a patient-facing application that searches clinical
trials. It lives in the separate `forwardimpact/bionova-apps` repository.
This record is the living template for that repository. It states each
capability as intent plus verification. The built repository is the
executable evidence for every statement.

Polaris carries two proofs:

1. The Forward Impact shared libraries compose into a product with a web
   surface and a CLI surface outside the monorepo.
2. `fit-terrain` and the synthetic-data DSL build a full product domain
   outside the monorepo. Every domain entity originates in one vendored
   file, `data/synthetic/story.dsl`. Nobody hand-authors domain content.

## Problem

Platform Builders evaluate Forward Impact with one question: do the shared
libraries and the synthetic-data pipeline compose into a real product
outside the monorepo? Without a live reference, the pitch to engineering
leaders has no concrete artifact that runs. Polaris is that artifact. The
record exists so the artifact can be recreated from it at any time.

## Users

| Persona | Hires the app to... |
| --- | --- |
| Patient / Advocate | Find trials for their condition with no dense protocols to read |
| Clinical Development Staff | Manage trial listings, monitor enrollment interest |
| Referring Physician | Search on behalf of patients, share trial details |

## Core capabilities

- **Search trials** — plain-language or catalog condition search. pgvector
  matches the query against condition embeddings. Filters cover phase,
  location, and enrollment status.
- **Check eligibility** — a guided screener derived from each trial's
  inclusion and exclusion criteria. An edge function scores the answers
  with no LLM.
- **Read patient-facing content** — every condition, trial, site, and
  therapy carries plain-language prose. The prose renders from seed
  tables that `story.dsl` generates.
- **Express interest** — an anonymous signal with no PII lands in
  `interest_signals`. Staff see aggregate counts per trial.
- **Manage trials (staff)** — a staff CLI command updates listings; a
  web admin view shows the trial with interest aggregates. Staff RLS
  policies also gate criteria writes. A document-upload surface and a
  criteria-editing surface are **not yet met by the shipped
  repository**.

**Technology stack.** A self-hosted Supabase stack on Docker Compose (the
PG On Rails pattern): PostgreSQL with pgvector, PostgREST as the data API,
GoTrue for auth, HuggingFace TEI for embeddings, and Deno edge functions.
The web surface is Next.js App Router with hand-rolled Tailwind
components. The surfaces and handlers consume Forward Impact shared
libraries from npm. `fit-terrain` renders the seed at build time.

## Capability inventory

These capabilities are the reference's reason to exist. Each row is a
named requirement. The plan parts state the verification for each row.

Supabase patterns:

| Capability | Requirement |
| --- | --- |
| Row-Level Security | Three policy classes: public read on seed tables, staff-JWT writes on trials and criteria, anonymous insert with staff-only read on `interest_signals`. |
| Edge functions | Four Deno functions: `embed-seed` (idempotent upsert through a unique index), `eligibility-check` (pure scorer, no LLM), `notify-updates` (pg_net trigger on status change), `sync-listings` (pg_cron schedule). |
| Data API | PostgREST is the only data API. Kong fronts it with the `/rest`, `/auth`, `/realtime`, `/storage`, and `/functions` routes. |
| Auth | GoTrue issues JWTs. The anon and service-role keys are JWTs signed by the shared `JWT_SECRET`. |
| Semantic search | pgvector similarity through a `match_conditions` RPC over 384-dim TEI embeddings. |
| Storage | MinIO behind the Supabase storage API with a `trial-documents` bucket. |
| Connection topology | Only PostgREST connects through the transaction pooler. GoTrue, Storage, and Realtime connect directly to Postgres. |

FIT capabilities:

| Capability | Requirement |
| --- | --- |
| Shared libraries | `libcli`, `libui`, `libformat`, `libtemplate`, `librepl`, and `libutil`, which the shipped CLI pins from npm (`@forwardimpact/libutil` in the Polaris CLI manifest). |
| Shared surface | One handler layer. Both surfaces dispatch through a frozen `InvocationContext`. |
| Synthetic data | `fit-terrain build` against a verbatim-vendored `story.dsl` + `prose-cache.json`, rendered with `--output-root` into a disposable directory. |
| Determinism | `PROVENANCE.md`, `SOURCE.sha256`, and `SEED.sha256` anchor a credential-free, byte-reproducible seed. |
| Scaffolding | `monorepo-setup`, `jidoka-setup`, and `kata-setup` are hard gates. The record points to them and never restates them. |
| Interviews | `kata-interview` runs against the Substrate Contract through the `fit-terrain substrate` verbs. |

## Version policy

The record states only load-bearing minimums:

- `fit-terrain` >= 0.1.41 (for `--output-root` and prose-to-SQL)
- Bun >= 1.2.9 (for `apm install`)
- Deno 2.x (for lockfile v5)

A rebuild resolves current versions and records them in `PROVENANCE.md`
and the PR body. Exact pins stay out of the record because they go stale
between passes and generate false drift findings.

## Scope

### Included

The `bionova-apps` repository as this record's plan parts specify: the
Polaris product (`site/`, `cli/`, `handlers/`), the
`services/polaris-functions/` edge functions, the PG On Rails
infrastructure, the vendored synthetic data, and the deployment.

### Excluded

- Real patient data or HIPAA compliance. All data is synthetic.
- Mobile-native apps. The web surface is responsive only.
- Integration with real trial registries.
- Managed Supabase. The entire stack is self-hosted.
- Edits to `story.dsl` in `bionova-apps`. The vendored copy is verbatim.
  Make domain changes in the monorepo, then re-vendor.

## Success criteria

1. **SC1** — `docker compose up && ./setup.sh` boots the full stack and
   seeds all data. Each prose table carries non-null, non-empty text. The
   prose-text assertion is **not yet met by the shipped repository**; its
   smoke script asserts row counts today.
2. **SC2** — `/search` returns trials that match a plain-language
   condition query. "High blood sugar" returns diabetes-related trials.
3. **SC3** — the eligibility screener returns a match score. A matching
   patient gets `eligible`.
4. **SC4** — trial FAQ, consent summary, and condition explainer render
   from the prose seed tables. The `/api/*` surface returns each field
   non-empty.
5. **SC5** — CLI search returns the same trials as the web search.
6. **SC6** — a staff CLI update to a trial shows on the web surface.
7. **SC7** — the seed is deterministic. A re-render from the vendored DSL
   matches `SEED.sha256` byte for byte, and a re-push reproduces
   identical data.

### Visual outcomes

The shipped application is functionally correct and visually flat. These
outcomes gate the next repository-side pass. Each one is **not yet met by
the shipped repository**.

1. **V1** — a patient tells a recruiting trial from a closed trial at a
   glance.
2. **V2** — no raw status enum reaches a patient surface. Every status
   renders as a human label.
3. **V3** — light and dark themes both render, and text meets WCAG AA
   contrast in both.
4. **V4** — a 390 px viewport shows no horizontal scroll, and the
   navigation stays usable.
5. **V5** — each page uses a type scale of at least three steps.
   Headings, body text, and metadata are visually distinct.

The design carries the token contract these outcomes require. Plan part
04 applies it.
