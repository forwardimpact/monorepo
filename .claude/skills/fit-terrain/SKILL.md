---
name: fit-terrain
description: >
  Produce a complete eval dataset from a single DSL file so you can prove
  agent changes with reproducible evidence, and run substrate identity
  verbs against any Supabase stack implementing the Substrate Contract.
  Use when setting up an eval, bootstrapping a realistic environment,
  regenerating a dataset after a schema change, or provisioning, picking,
  and issuing personas for an interview run.
---

# fit-terrain CLI

Generate synthetic data for the entire Forward Impact suite from a single DSL
file. The CLI orchestrates parsing, entity generation, optional LLM prose, and
rendering into multiple output formats.

## When to Use

**Generate eval datasets and test data:**

- Building from cached prose (no LLM needed) — `npx fit-terrain build`
- Regenerating prose with an LLM —
  `ANTHROPIC_API_KEY=... npx fit-terrain generate`
- Validating a terrain DSL file — `npx fit-terrain check`

**Bootstrap a realistic environment:**

- Creating synthetic engineering standards for new installations
- Producing organizational documents, activity records, and KB content
- Testing pipeline changes end-to-end with synthetic data

**Build a healthcare deployment:**

- Declaring trials, sites, and conditions in a `clinical {}` DSL block
- Generating Synthea-backed patient cohorts filtered to those conditions
- Rendering patient-facing prose and Schema.org `MedicalCondition` /
  `MedicalTrial` / `MedicalClinic` microdata pages

---

## How It Works

### Pipeline

Generation flows through four stages:

1. **DSL parsing** — the terrain file is parsed into an AST containing the
   org hierarchy, people, projects, engineering-standard definitions, content
   specs, and optionally a `clinical {}` domain (conditions, sites, trials,
   criteria, content keys).
2. **Entity generation** — the AST is expanded deterministically (seeded RNG)
   into a full entity graph: orgs, departments, teams, people, repos,
   projects, and — when `clinical {}` is present — conditions, sites, trials,
   criteria, and researchers with bidirectional cross-references.
3. **Prose generation** — prose keys are collected (one per article, FAQ,
   briefing, condition explainer, trial FAQ, etc.) with context (topic, tone,
   length). The `build` verb reads from `prose-cache.json`; `generate` sends
   each key to an LLM and writes the result back to the cache before
   building. Clinical prose uses a medical-communications system prompt.
4. **Rendering** — entities and prose render into YAML standard files
   (`pathway`), HTML articles + clinical pages with Schema.org microdata
   (`html`), JSON/YAML activity records (`raw`), Markdown briefings
   (`markdown`). External `dataset` blocks emit through `output` blocks to
   formats including JSON, CSV, Parquet, SQL, `supabase_migration`, and
   `embeddings_jsonl`.

### Content Validation

After rendering, cross-content validation runs automatically: internal HTML
links are checked for resolution, entities referenced in prose are verified
against the entity graph, and rendered YAML is validated against pathway
schemas.

### Prose Caching

The prose cache maps each content key to its generated text. `build` reads
from the cache (no LLM calls). `generate` regenerates entries and writes the
updated cache, then runs the same render+write as `build`.

Structured pathway entities use a stable cache key derived from the entity
key alone (e.g. `pathway:track:platform`), so prompt changes (such as
preamble updates) do not invalidate existing entries — use `generate` to
refresh them. General prose entries (articles, comments, briefings) use a
cache key that includes the content context (topic, tone, length).

### Output Cleanup

The CLI cleans output directories before writing new files, preventing stale
files from prior runs from persisting. This means each run produces a clean,
complete output set.

---

## CLI Reference

See [`references/cli.md`](references/cli.md) for full command listings.

---

## Terrain DSL

See [`references/dsl.md`](references/dsl.md) for syntax, top-level blocks, and
key block descriptions.

---

## Data Resolution

Use `--story=path` to specify a custom terrain DSL file. Without `--story`,
the CLI falls back to the minimal reference DSL bundled with the package.
Generated output writes to the `data/` directories in
[`references/cli.md`](references/cli.md) § Content Types.

---

## Prose Cache

The prose cache lives at `data/synthetic/prose-cache.json` (pre-populated
for the BioNova terrain). For a full regeneration, delete the cache file
first and run `fit-terrain generate`.

---

## Dataset Blocks

See [`references/datasets.md`](references/datasets.md) for external tool
requirements.

---

## Environment

The `generate` verb requires `ANTHROPIC_API_KEY`:

```sh
ANTHROPIC_API_KEY=<your-key> npx fit-terrain generate
```

The `check`, `validate`, and `build` verbs require no LLM credentials — they
read from the prose cache.

DSL files that declare a Synthea `dataset` block also need Java 11+ on
`PATH` and the Synthea JAR available via `SYNTHEA_JAR` (or in the default
`vendor/synthea/synthea-with-dependencies.jar` location). When either is
missing the pipeline logs an "unavailable" line and skips the Synthea block
— it does not fail the run. See
[`references/datasets.md`](references/datasets.md) for the one-time install.

---

## Logging

Set `DEBUG=terrain` for verbose debug output. Operational progress logs to
stderr; stdout is reserved for file counts, validation results, and prose
cache statistics.

---

## Substrate Identity Verbs

Seven `substrate` verbs (`up`, `init`, `check`, `provision`, `pick`,
`roster`, `issue`) bring up a Supabase stack and run the identity
capability against the
[Substrate Contract](https://www.forwardimpact.team/docs/libraries/substrate-contract/index.md)
— a `substrate` Postgres schema of consumer-defined views (`people`
required; `evidence` and `discovery` optional with declared
degradation). The verbs query only contract relations, never your
vendor tables. Command lines and exit codes:
[`references/cli.md`](references/cli.md).

## Feeding Generated Content to Guide

After generation, bootstrap the full Guide pipeline:

```sh
npx fit-process resources   # Create resource index from knowledge files
npx fit-process graphs      # Build RDF graph from resources
npx fit-process vectors     # Generate vector embeddings (requires TEI)
npx fit-rc start            # Start services
npx fit-guide               # Verify end-to-end
```

## Verification

After generation, the CLI runs cross-content validation automatically and
reports pass/fail for each check. Validate the generated pathway data
separately with `npx fit-map validate`.

## Documentation

- [Prove Agent Changes](https://www.forwardimpact.team/docs/libraries/prove-changes/index.md)
  — End-to-end workflow from dataset generation through evaluation to trace
  analysis
- [Generate an Eval Dataset](https://www.forwardimpact.team/docs/libraries/prove-changes/generate-dataset/index.md)
  — Using the Terrain DSL to define and generate synthetic datasets
- [The Substrate Contract](https://www.forwardimpact.team/docs/libraries/substrate-contract/index.md)
  — The consumer-implemented relations, auth model, env vars, and
  degradation semantics behind the substrate identity verbs
- [Provision Engineer Auth Users](https://www.forwardimpact.team/docs/products/provisioning-engineers/index.md)
  — Reconcile auth.users against the roster so identity-derived RLS works
