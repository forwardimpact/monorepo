---
title: Generate an Eval Dataset
description: Go from a DSL file to a complete, validated evaluation dataset. The pipeline generates entities, resolves prose, renders output, and verifies results.
---

You need to produce a dataset for an agent evaluation. The dataset must include
an organization graph, people, an engineering standard, knowledge-base
documents, and activity records. You also need to regenerate the whole dataset
when the schema changes. `fit-terrain generate` does all of that from a single
`.dsl` file.

Read
[Prove Whether Agent Changes Improved Outcomes](/docs/libraries/prove-changes/)
for the end-to-end workflow. That workflow connects dataset generation to
evaluation sessions and trace analysis.

## Prerequisites

- Node.js 22+
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

```text
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
    disciplines  { software-engineering 80%  data-engineering 20% }
  }

  standard {
    // Full standard block: proficiencies, maturities, levels,
    // capabilities, behaviours, disciplines, tracks, drivers.
    // See the complete example in the end-to-end guide.
  }
}
```

The
[end-to-end guide](/docs/libraries/prove-changes/#1-define-the-dataset-in-a-dsl-file)
shows a complete `standard` block with capabilities, behaviours, disciplines,
and levels. The `seed` field makes the entity graph deterministic. The same seed
produces the same people, assignments, and proficiency ratings on every run.

For healthcare deployments, add a `clinical {}` block that declares conditions,
sites, and trials. The pipeline then generates a parallel patient-and-trial
entity graph. It emits seven patient-facing HTML pages with Schema.org
`MedicalCondition` / `MedicalTrial` / `MedicalClinic` microdata. It also
resolves `dataset.conditions [...]` references to the Synthea modules that
filter the generated patient cohorts:

```dsl
clinical {
  condition diabetes_t2 {
    name "Type 2 Diabetes"
    icd10 ["E11"]
    synthea_module diabetes
    severity chronic
  }

  site cambridge {
    name "Cambridge Medical Center"
    city "Cambridge"
    state "MA"
    org headquarters
    specialties ["endocrinology"]
  }

  trial oncora_p3 {
    name "ONCORA-301"
    phase "phase_3"
    conditions [diabetes_t2]
    sites [cambridge]
    principal_investigator @sarah_chen
    sponsor "Acme Bio"
    status "recruiting"
    target_enrollment 450
    start_date 2025-03
    estimated_end_date 2027-06

    criteria {
      inclusion { age_min 18 age_max 75 conditions_required [diabetes_t2] }
    }
  }

  content {
    condition_explainers per_condition
    trial_faqs per_trial
    consent_summaries per_trial
    patient_stories 4
    patient_story_conditions [diabetes_t2]
  }
}

dataset trial_patients {
  tool synthea
  population 100
  conditions [diabetes_t2]
}

output trial_patients_patient   json { path "output/patients.json" }
output trial_patients_condition json { path "output/conditions.json" }
```

`synthea_module` maps each DSL condition to a Synthea module name. The
`dataset.conditions` field resolves through those mappings. The pipeline also
uses the field to post-filter the generated cohort. It keeps the patients that
carry a matching FHIR `Condition` resource.

Synthea needs Java 11+ and the `synthea-with-dependencies.jar` available at
`$SYNTHEA_JAR` (or in `vendor/synthea/` relative to the working directory).
Without either, the dataset stage logs an "unavailable" line and skips the
block. The rest of the pipeline still runs:

```sh
mkdir -p vendor/synthea
curl -fSL \
  -o vendor/synthea/synthea-with-dependencies.jar \
  https://github.com/synthetichealth/synthea/releases/download/v3.3.0/synthea-with-dependencies.jar
export SYNTHEA_JAR="$(pwd)/vendor/synthea/synthea-with-dependencies.jar"
```

## Generate the dataset

Run `generate` to fill the prose cache and build all output:

```sh
npx fit-terrain generate --story=evals/terrain/story.dsl
```

The pipeline walks a DAG of stages in dependency order:

| Stage          | What it does                                                                |
| -------------- | --------------------------------------------------------------------------- |
| `parse`        | Reads and parses the DSL file                                               |
| `entities`     | Generates the organization graph, people, and assignments. When the DSL declares a `clinical {}` block, also generates the conditions, sites, trials, criteria, and researchers |
| `prose-keys`   | Collects every key that needs prose (bios, summaries, reviews, condition explainers, trial FAQs, consent summaries) |
| `cache-lookup` | Resolves each key through an LLM and caches the results to disk             |
| `skeleton`     | Renders deterministic HTML structure for knowledge documents and patient-facing clinical pages |
| `enriched`     | Fills the skeleton with cached prose                                        |
| `raw`          | Renders raw activity documents                                              |
| `markdown`     | Renders personal markdown documents                                         |
| `pathway`      | Renders engineering standard YAML from the `standard` block                 |
| `datasets`     | Runs any external dataset tools (Faker, Synthea, SDV). Resolves the `dataset.conditions` field against the clinical block when both are present |
| `validate`     | Checks entity consistency and HTML structure                                |
| `write`        | Merges all output and writes to disk                                        |

`fit-terrain` orchestrates three libraries across these stages. The
libsyntheticgen library parses the DSL and generates the deterministic entity
graph. The libsyntheticprose library resolves the LLM prose and YAML. The
libsyntheticrender library renders and validates the output. You install and run
`fit-terrain`. The three libraries work behind it.

The prose cache persists to `data/synthetic/prose-cache.json` by default.
Subsequent runs with the same DSL reuse cached prose, so only new or changed
keys cost API calls.

After the run completes, the `data/` directory contains the full dataset:

```text
data/
  pathway/          Engineering standard YAML (capabilities, levels, disciplines)
  knowledge/        HTML knowledge-base documents with microdata
                    (plus seven patient-facing pages when the DSL declares a clinical {} block)
  personal/         Personal markdown documents
  activity/         Activity records and evidence
  synthetic/        Prose cache
```

Datasets declared with `dataset` + `output` blocks land at the paths each
`output` block names. Available output formats include `json`, `yaml`,
`csv`, `markdown`, `parquet`, and `sql`. They also include
`supabase_migration`, `embeddings_jsonl`, and `fhir_microdata_html`.
`supabase_migration` produces numbered SQL files that you apply with
`supabase db push`. `embeddings_jsonl` produces one JSON object per line that
combines entity fields with cached prose, ready for vector embedding.
`fhir_microdata_html` produces one Schema.org-microdata HTML page per FHIR
`Patient` from a Synthea-produced dataset. It adds an `index.html` and reverse
links from the clinical trial / condition / site pages to the matching
synthetic patients.

## Verify without regenerating

Two verbs let you check the dataset with no LLM calls.

**Check cache completeness** -- reports how many prose keys the cache holds and
how many it misses. Exit code `1` if any key is a miss:

```sh
npx fit-terrain check --story=evals/terrain/story.dsl
```

**Validate structure** -- runs entity and cross-content checks and writes no
files. Use it after you edit the DSL to catch errors before a full rebuild:

```sh
npx fit-terrain validate --story=evals/terrain/story.dsl
```

## Rebuild a subset

When only part of the dataset needs a refresh, use `build` with `--only` to
render a single content type:

```sh
npx fit-terrain build --story=evals/terrain/story.dsl --only=pathway
```

Valid `--only` values: `html`, `pathway`, `raw`, `markdown`. Omit `--only` to
render everything.

The `build` verb uses the existing prose cache but does not call the LLM. If the
cache has misses, the output includes a warning:

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

The command prints the stage's output as formatted JSON. Valid stage names
match the pipeline table above: `parse`, `entities`, `prose-keys`,
`cache-lookup`, `skeleton`, `enriched`, `raw`, `markdown`, `pathway`,
`datasets`, `validate`, `write`.

## What's next

<div class="grid">

<!-- part:card:.. -->

</div>
