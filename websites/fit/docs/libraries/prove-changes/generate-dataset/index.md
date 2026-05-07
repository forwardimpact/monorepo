---
title: Generate an Eval Dataset
description: Go from a DSL file to a complete, validated evaluation dataset — entities generated, prose resolved, output rendered, and results verified.
---

You need to produce a dataset for an agent evaluation. The dataset must include
an organization graph, people, an engineering standard, knowledge-base documents,
and activity records -- and you need to regenerate the whole thing when the schema
changes. `fit-terrain generate` does all of that from a single `.dsl` file.

For the end-to-end workflow that connects dataset generation to evaluation
sessions and trace analysis, see
[Prove Whether Agent Changes Improved Outcomes](/docs/libraries/prove-changes/).

## Prerequisites

- Node.js 18+
- `ANTHROPIC_API_KEY` set in the shell (the `generate` verb calls an LLM to
  produce realistic prose for each entity)
- `@forwardimpact/libterrain` installed:

```sh
npm install -g @forwardimpact/libterrain
```

Or invoke ephemerally:

```sh
npx --yes @forwardimpact/libterrain fit-terrain --help
```

## Write the DSL file

Create a `.dsl` file that declares the organization, people distribution,
and engineering standard. The minimum viable DSL needs four top-level blocks:

```
// evals/terrain/story.dsl

terrain Acme {
  domain "acme.example"
  industry "fintech"
  seed 42

  org headquarters {
    name "Acme HQ"
    location "London, UK"
  }

  department engineering {
    name "Engineering"
    parent headquarters
    headcount 20

    team payments {
      name "Payments Team"
      size 8
      repos ["payments-api", "ledger-service"]
    }
  }

  people {
    count 20
    distribution { J060 50%  J070 30%  J080 20% }
    disciplines  { software_engineering 80%  data_engineering 20% }
  }

  standard {
    // Full standard block: proficiencies, maturities, levels,
    // capabilities, behaviours, disciplines, tracks, drivers.
    // See the complete example in the end-to-end guide.
  }
}
```

A complete `standard` block with capabilities, behaviours, disciplines, and
levels is shown in the
[end-to-end guide](/docs/libraries/prove-changes/#1-define-the-dataset-in-a-dsl-file).
The `seed` field makes the entity graph deterministic -- the same seed produces
the same people, assignments, and proficiency ratings on every run.

## Generate the dataset

Run `generate` to fill the prose cache and build all output:

```sh
npx fit-terrain generate --story=evals/terrain/story.dsl
```

The pipeline walks a DAG of stages in dependency order:

| Stage          | What it does                                                  |
| -------------- | ------------------------------------------------------------- |
| `parse`        | Reads and parses the DSL file                                 |
| `entities`     | Generates the organization graph, people, and assignments     |
| `prose-keys`   | Collects every key that needs prose (bios, summaries, reviews)|
| `cache-lookup` | Resolves each key through an LLM, caching results to disk    |
| `skeleton`     | Renders deterministic HTML structure for knowledge documents  |
| `enriched`     | Fills the skeleton with cached prose                          |
| `raw`          | Renders raw activity documents                                |
| `markdown`     | Renders personal markdown documents                           |
| `pathway`      | Renders engineering standard YAML from the `standard` block   |
| `datasets`     | Runs any external dataset tools (Faker, Synthea, SDV)         |
| `validate`     | Checks entity consistency and HTML structure                  |
| `write`        | Merges all output and writes to disk                          |

The prose cache persists to `data/synthetic/prose-cache.json` by default.
Subsequent runs with the same DSL reuse cached prose, so only new or changed
keys cost API calls.

After the run completes, the `data/` directory contains the full dataset:

```text
data/
  pathway/          Engineering standard YAML (capabilities, levels, disciplines)
  knowledge/        HTML knowledge-base documents with microdata
  personal/         Personal markdown documents
  activity/         Activity records and evidence
  synthetic/        Prose cache
```

## Verify without regenerating

Two verbs let you check the dataset without making LLM calls.

**Check cache completeness** -- reports how many prose keys are cached versus
missing. Exit code `1` if any key is a miss:

```sh
npx fit-terrain check --story=evals/terrain/story.dsl
```

**Validate structure** -- runs entity and cross-content checks without writing
files. Use after editing the DSL to catch errors before a full rebuild:

```sh
npx fit-terrain validate --story=evals/terrain/story.dsl
```

## Rebuild a subset

When only part of the dataset needs refreshing, use `build` with `--only` to
render a single content type:

```sh
npx fit-terrain build --story=evals/terrain/story.dsl --only=pathway
```

Valid `--only` values: `html`, `pathway`, `raw`, `markdown`. Omitting `--only`
renders everything.

The `build` verb uses the existing prose cache but does not call the LLM. If the
cache has misses, the output will include a warning:

```text
⚠ 12 prose cache misses — run "fit-terrain generate" to fill the cache.
```

## Override defaults

| Option    | Default                            | Purpose                          |
| --------- | ---------------------------------- | -------------------------------- |
| `--story` | `data/synthetic/story.dsl`         | Path to the DSL file             |
| `--cache` | `data/synthetic/prose-cache.json`  | Path to the prose cache file     |
| `--model` | `claude-haiku-4-5` (via config)    | LLM model for `generate`        |

All paths are relative to the working directory.

## Inspect a pipeline stage

To debug or understand the intermediate output of any stage, use `inspect`:

```sh
npx fit-terrain inspect entities --story=evals/terrain/story.dsl
```

This prints the stage's output as formatted JSON. Valid stage names match the
pipeline table above: `parse`, `entities`, `prose-keys`, `cache-lookup`,
`skeleton`, `enriched`, `raw`, `markdown`, `pathway`, `datasets`, `validate`,
`write`.

## What's next

<div class="grid">

<!-- part:card:.. -->

</div>
