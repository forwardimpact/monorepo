# Dataset Blocks

The terrain DSL may include `dataset` and `output` blocks that invoke
external tools (Faker, Synthea, SDV). The pipeline skips an unavailable tool
and writes an info log. It continues and writes all other generated files.

| Tool    | Requirement              | Always available? |
| ------- | ------------------------ | ----------------- |
| Faker   | Built-in (pure JS)       | Yes               |
| Synthea | Java 11+ and the JAR     | No                |
| SDV     | Python with `sdv` module | No                |

The `--only` flag gates render types (html, pathway, raw, markdown). It does
**not** affect dataset generation.

## Install Synthea

Download the JAR once. Set `SYNTHEA_JAR`:

```sh
mkdir -p vendor/synthea
curl -fSL \
  -o vendor/synthea/synthea-with-dependencies.jar \
  https://github.com/synthetichealth/synthea/releases/download/v3.3.0/synthea-with-dependencies.jar
export SYNTHEA_JAR="$(pwd)/vendor/synthea/synthea-with-dependencies.jar"
```

`fit-terrain` checks `SYNTHEA_JAR` first. It then falls back to
`vendor/synthea/synthea-with-dependencies.jar` relative to the working
directory. Confirm `java -version` reports 11 or newer.

## Dataset Block Reference

A `dataset` block names the generator tool and its config. An `output` block
names a dataset and renders it to a file format.

```dsl
dataset trial_patients {
  tool synthea
  population 100
  conditions [diabetes_t2, hypertension]
}

output trial_patients_patient json    { path "output/patients.json" }
output trial_patients_patient parquet { path "output/patients.parquet" }
```

### Synthea fields

| Field        | Type     | Purpose                                              |
| ------------ | -------- | ---------------------------------------------------- |
| `tool`       | ident    | Must be `synthea`                                    |
| `population` | number   | Patient count to request from Synthea                |
| `modules`    | ident[]  | Synthea modules to enable (optional)                 |
| `conditions` | ident[]  | DSL `clinical.condition` ids. `fit-terrain` resolves them to modules and keeps only patients with a matching FHIR Condition |

When the DSL contains a `clinical {}` block, `fit-terrain` looks up each id
in `conditions` against `clinical.condition.{id}.synthea_module`. The
resolved modules merge with any explicit `modules` entries. After Synthea
runs, `fit-terrain` drops from the output every patient whose FHIR
`Condition` resources match none of the requested conditions. It also drops
the Encounter, Observation, and other resources linked to those patients.

When the DSL has no `clinical {}` block, `fit-terrain` ignores `conditions`.
Only `modules` controls Synthea's module set. No filter runs after generation.

### Faker fields

| Field    | Type   | Purpose                                          |
| -------- | ------ | ------------------------------------------------ |
| `tool`   | ident  | Must be `faker`                                  |
| `rows`   | number | Record count                                     |
| `fields` | block  | Map of field name to Faker namespace path        |

### SDV fields

| Field      | Type   | Purpose                                       |
| ---------- | ------ | --------------------------------------------- |
| `tool`     | ident  | Must be `sdv`                                 |
| `metadata` | string | Path to SDV metadata JSON                     |
| `data`     | block  | Map of table name to CSV file path            |
| `rows`     | number | Synthetic record count per table              |

## Output Formats

The `output` block routes a dataset through a format-specific renderer.

| Format               | Output                                                            |
| -------------------- | ----------------------------------------------------------------- |
| `json`               | Single JSON file with the records as an array                     |
| `yaml`               | YAML document                                                     |
| `csv`                | One CSV file with header row                                      |
| `markdown`           | Markdown table                                                    |
| `parquet`            | Apache Parquet binary file                                        |
| `sql`                | Single SQL `INSERT` statement                                     |
| `supabase_migration` | Numbered SQL migration files (CREATE TABLE + INSERT + RLS) you apply with `supabase db push` |
| `embeddings_jsonl`   | JSONL where each line is `{ id, table, text }`, ready for vector embedding |

`supabase_migration` and `embeddings_jsonl` are the natural fit for clinical
datasets. The first lands schemas and seed data in a Supabase project. The
second produces text blocks that combine entity fields with cached prose.
Those blocks are ready to embed into pgvector or another vector store.

## Output Names for Synthea Datasets

Synthea produces one underlying dataset per FHIR resource type
(`Patient`, `Condition`, `Encounter`, `Observation`, etc.). So a single
`dataset trial_patients { tool synthea }` block fans out into
`trial_patients_patient`, `trial_patients_condition`,
`trial_patients_encounter`, and so on. Reference each one in its own
`output` block:

```dsl
output trial_patients_patient    json { path "output/patients.json" }
output trial_patients_condition  json { path "output/conditions.json" }
output trial_patients_encounter  json { path "output/encounters.json" }
```
