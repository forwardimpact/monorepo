---
name: fit-terrain
description: >
  Produce a complete eval dataset from a single DSL file so you can prove
  agent changes with reproducible evidence. Also run substrate identity
  verbs against any Supabase stack that implements the Substrate Contract.
  Use when you set up an eval, bootstrap a realistic environment, or
  regenerate a dataset after a schema change. Use when you provision, pick,
  and issue personas for an interview run.
---

# fit-terrain CLI

Generate synthetic data for the entire Forward Impact suite from a single DSL
file. The CLI parses the file, generates entities, adds optional LLM prose,
and renders into multiple output formats.

## When to Use

**Generate eval datasets and test data:**

- Build from cached prose (no LLM needed) — `npx fit-terrain build`
- Regenerate prose with an LLM —
  `ANTHROPIC_API_KEY=... npx fit-terrain generate`
- Validate a terrain DSL file — `npx fit-terrain check`

**Bootstrap a realistic environment:**

- Create synthetic engineering standards for new installations
- Produce organizational documents, activity records, and KB content
- Test pipeline changes end-to-end with synthetic data

**Build a healthcare deployment:**

- Declare trials, sites, and conditions in a `clinical {}` DSL block
- Generate Synthea-backed patient cohorts filtered to those conditions
- Render patient-facing prose and Schema.org `MedicalCondition` /
  `MedicalTrial` / `MedicalClinic` microdata pages

---

## How It Works

### Pipeline

The pipeline runs four stages:

1. **Parse the DSL** — the parser turns the terrain file into an AST. The
   AST holds the org hierarchy, people, projects, engineering-standard
   definitions, content specs, and optionally a `clinical {}` domain
   (conditions, sites, trials, criteria, content keys).
2. **Generate entities** — the generator expands the AST deterministically
   (seeded RNG) into a full entity graph: orgs, departments, teams, people,
   repos, and projects. A `clinical {}` block adds conditions, sites, trials,
   criteria, and researchers with bidirectional cross-references.
3. **Generate prose** — the CLI collects prose keys (one per article, FAQ,
   briefing, condition explainer, trial FAQ, etc.) with context (topic, tone,
   length). The `build` verb reads from `prose-cache.json`. The `generate` verb
   sends each key to an LLM and writes the result back to the cache before it
   builds. Clinical prose uses a medical-communications system prompt.
4. **Render** — entities and prose render into YAML standard files
   (`pathway`), HTML articles + clinical pages with Schema.org microdata
   (`html`), JSON/YAML activity records (`raw`), Markdown briefings
   (`markdown`). External `dataset` blocks emit through `output` blocks to
   formats including JSON, CSV, Parquet, SQL, `supabase_migration`, and
   `embeddings_jsonl`.

### Content Validation

After the render stage, cross-content validation runs automatically. The CLI
checks that internal HTML links resolve. It verifies entities referenced in
prose against the entity graph. It validates rendered YAML against pathway
schemas.

### Prose Caching

The prose cache maps each content key to its generated text. `build` reads
from the cache (no LLM calls). `generate` regenerates entries and writes the
updated cache. It then runs the same render+write as `build`.

Structured pathway entities use a stable cache key derived from the entity
key alone (e.g. `pathway:track:platform`). So prompt changes, such as
preamble updates, do not invalidate existing entries. Use `generate` to
refresh them. General prose entries (articles, comments, briefings) use a
cache key that includes the content context (topic, tone, length).

### Output Cleanup

The CLI cleans output directories before it writes new files. No stale file
from a prior run persists. Each run produces a clean, complete output set.

---

## CLI Reference

See [`references/cli.md`](references/cli.md) for the full command list.

---

## Terrain DSL

See [`references/dsl.md`](references/dsl.md) for syntax, top-level blocks, and
key block descriptions.

---

## Data Resolution

Use `--story=path` to specify a custom terrain DSL file. Without `--story`,
the CLI falls back to the minimal reference DSL bundled with the package.
The CLI writes generated output to the `data/` directories in
[`references/cli.md`](references/cli.md) § Content Types.

---

## Prose Cache

The prose cache lives at `data/synthetic/prose-cache.json` (pre-populated
for the BioNova terrain). To regenerate everything, delete the cache file
first. Then run `fit-terrain generate`.

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

The `check`, `validate`, and `build` verbs require no LLM credentials. They
read from the prose cache.

DSL files that declare a Synthea `dataset` block also need Java 11+ on
`PATH` and the Synthea JAR available through `SYNTHEA_JAR` (or in the
default `vendor/synthea/synthea-with-dependencies.jar` location). When
either is missing, the pipeline logs an "unavailable" line and skips the
Synthea block. It does not fail the run. See
[`references/datasets.md`](references/datasets.md) for the one-time install.

---

## Logging

Set `DEBUG=terrain` for verbose debug output. Operational progress logs to
stderr. Stdout carries only file counts, validation results, and prose cache
statistics.

---

## Substrate Identity Verbs

Seven `substrate` verbs (`up`, `init`, `check`, `provision`, `pick`,
`roster`, `issue`) bring up a Supabase stack. They run the identity
capability against the
[Substrate Contract](https://www.forwardimpact.team/docs/libraries/substrate-contract/index.md).
That contract is a `substrate` Postgres schema of consumer-defined views.
`people` is required. `evidence` and `discovery` are optional with declared
degradation. The verbs query only contract relations. They never query your
vendor tables. In `pick` output, `parent_email` is the persona's *upward*
manager. Manager-scoped views take the persona's own email. For command
lines and exit codes, see [`references/cli.md`](references/cli.md).

## Feed Generated Content to Guide

After you generate content, bootstrap the full Guide pipeline:

```sh
npx fit-process resources   # Create resource index from knowledge files
npx fit-process graphs      # Build RDF graph from resources
npx fit-process vectors     # Generate vector embeddings (requires TEI)
npx fit-rc start            # Start services
npx fit-guide               # Verify end-to-end
```

## Verification

After the CLI generates content, it runs cross-content validation
automatically. It reports pass/fail for each check. Validate the generated
pathway data separately with `npx fit-map validate`.

## Documentation

- [Prove Agent Changes](https://www.gemba.team/docs/prove-changes/index.md)
  — End-to-end workflow from dataset generation through evaluation to trace
  analysis
- [Generate a Synthetic Dataset](https://www.forwardimpact.team/docs/libraries/generate-dataset/index.md)
  — Use the Terrain DSL to define and generate synthetic datasets
- [The Substrate Contract](https://www.forwardimpact.team/docs/libraries/substrate-contract/index.md)
  — The consumer-implemented relations, auth model, env vars, and
  degradation semantics behind the substrate identity verbs
- [Provision Engineer Auth Users](https://www.forwardimpact.team/docs/products/provisioning-engineers/index.md)
  — Reconcile auth.users against the roster so identity-derived RLS works
