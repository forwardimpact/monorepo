---
name: fit-terrain
description: >
  Produce a complete eval dataset from a single DSL file so you can prove
  agent changes with reproducible evidence. Use when setting up an eval
  and you need to coordinate generation, rendering, and validation, when
  bootstrapping a realistic environment for demos or testing, or when
  regenerating a dataset after a schema change.
---

# fit-terrain CLI

Generate synthetic data for the entire Forward Impact suite from a single DSL
file. The CLI orchestrates parsing, entity generation, optional LLM prose, and
rendering into multiple output formats.

## When to Use

**Generate eval datasets and test data:**

- Building from cached prose (no LLM needed) — `npx fit-terrain build`
- Regenerating prose with an LLM — `ANTHROPIC_API_KEY=... npx fit-terrain generate`
- Validating a terrain DSL file — `npx fit-terrain check`

**Bootstrap a realistic environment:**

- Creating synthetic engineering standards for new installations
- Producing organizational documents, activity records, and KB content
- Testing pipeline changes end-to-end with synthetic data

---

## How It Works

### Pipeline

Generation flows through four stages:

1. **DSL parsing** — the terrain file is tokenized and parsed into an AST
   containing organizational hierarchy, people, projects, agent-aligned
   engineering standard definitions, and content specifications
2. **Entity generation** — the AST is expanded deterministically (using a seeded
   RNG) into a full entity graph: orgs, departments, teams, people with roles
   and skill assignments, repos, and projects
3. **Prose generation** — prose keys are collected from the entity graph (one
   per article, FAQ, briefing, etc.) with context (topic, tone, length). The
   `build` verb reads from `prose-cache.json`; the `generate` verb sends each
   key to an LLM and writes the result back to the cache before building
4. **Rendering** — entities and prose are rendered into output formats: YAML
   standard files (`pathway`), HTML articles (`html`), JSON/YAML activity
   records (`raw`), and Markdown briefings (`markdown`)

### Content Validation

After rendering, cross-content validation runs automatically: internal HTML
links are checked for resolution, entities referenced in prose are verified
against the entity graph, and rendered YAML is validated against pathway
schemas.

### Prose Caching

The prose cache maps each content key to its generated text. The `build` verb
reads from the cache, making generation fully repeatable without LLM calls. The
`generate` verb regenerates all entries and writes the updated cache, then runs
the same render+write the `build` verb performs.

Structured pathway entities (agent-aligned engineering standard, levels,
behaviours, capabilities, etc.) use a stable cache key derived from the entity
key alone (e.g. `pathway:track:platform`). This means prompt changes (such as
adding context forwarding or updating preambles) do not invalidate existing
cache entries — use `fit-terrain generate` to regenerate with updated prompts.

General prose entries (articles, comments, briefings) use a cache key that
includes the content context (topic, tone, length).

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

Use `--story=path` to specify a custom terrain DSL file. Without `--story`, the
CLI falls back to the minimal reference DSL bundled with the package.

Generated output writes to the `data/` directories listed under Content Types
above.

---

## Prose Cache

The prose cache is stored at `data/synthetic/prose-cache.json`. This file is
pre-populated for the BioNova terrain. The default mode reads from it without
LLM calls.

`fit-terrain generate` regenerates prose and writes the cache after generation
completes. To do a full regeneration, delete the cache file first and run
`fit-terrain generate`.

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

---

## Logging

Set `DEBUG=terrain` for verbose debug output during generation. Operational
progress is logged to stderr via libtelemetry Logger (RFC 5424 format with
timestamps). Stdout is reserved for file counts, validation results, and prose
cache statistics.

---

## Feeding Generated Content to Guide

After generation, bootstrap the full Guide pipeline:

```sh
npx fit-process-resources   # Create resource index from knowledge files
npx fit-process-graphs      # Build RDF graph from resources
npx fit-process-vectors     # Generate vector embeddings (requires TEI)
npx fit-rc start            # Start services
npx fit-guide               # Verify end-to-end
```

## Verification

After generation, the CLI runs cross-content validation automatically and
reports pass/fail for each check. Validate the generated pathway data
separately:

```sh
npx fit-map validate
```

## Documentation

- [Prove Agent Changes](https://www.forwardimpact.team/docs/libraries/prove-changes/index.md)
  — End-to-end workflow from dataset generation through evaluation to trace
  analysis
- [Generate an Eval Dataset](https://www.forwardimpact.team/docs/libraries/prove-changes/generate-dataset/index.md)
  — Using the Terrain DSL to define and generate synthetic datasets
