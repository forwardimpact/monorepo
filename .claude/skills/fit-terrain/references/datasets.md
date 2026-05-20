# Dataset Blocks

The terrain DSL may include `dataset` and `output` blocks that invoke
external tools (Faker, Synthea, SDV). Unavailable tools are skipped with an
info log — the pipeline continues and writes all other generated files.

| Tool    | Requirement              | Always available? |
| ------- | ------------------------ | ----------------- |
| Faker   | Built-in (pure JS)       | Yes               |
| Synthea | Java 11+ and the JAR     | No                |
| SDV     | Python with `sdv` module | No                |

The `--only` flag gates render types (html, pathway, raw, markdown). It does
**not** affect dataset generation.

## Installing Synthea

Download the JAR once, set `SYNTHEA_JAR`:

```sh
mkdir -p vendor/synthea
curl -fSL \
  -o vendor/synthea/synthea-with-dependencies.jar \
  https://github.com/synthetichealth/synthea/releases/download/v3.3.0/synthea-with-dependencies.jar
export SYNTHEA_JAR="$(pwd)/vendor/synthea/synthea-with-dependencies.jar"
```

`fit-terrain` checks `SYNTHEA_JAR` first, then falls back to
`vendor/synthea/synthea-with-dependencies.jar` relative to the working
directory. Confirm `java -version` reports 11 or newer.

## Dataset Block Reference

A `dataset` block names the generator tool and its config; an `output` block
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
| `conditions` | ident[]  | DSL `clinical.condition` ids; resolved to modules and used to keep only patients carrying a matching FHIR Condition |

When the DSL contains a `clinical {}` block, each id in `conditions` is
looked up against `clinical.condition.{id}.synthea_module`. The resolved
modules merge with any explicit `modules` entries. After Synthea runs,
patients whose FHIR `Condition` resources do not match any of the requested
conditions are dropped from the output, along with the Encounter,
Observation, and other linked resources belonging to those patients.

When the DSL has no `clinical {}` block, `conditions` is ignored and only
`modules` controls Synthea's module set; no post-generation filtering runs.

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
| `supabase_migration` | Numbered SQL migration files (CREATE TABLE + INSERT + RLS) applicable via `supabase db push` |
| `embeddings_jsonl`   | JSONL where each line is `{ id, table, text }`, ready for vector embedding |

`supabase_migration` and `embeddings_jsonl` are the natural fit for clinical
datasets: the first lands schemas + seed data in a Supabase project; the
second produces text blocks combining entity fields with cached prose for
downstream embedding into pgvector or another vector store.

## Output Naming for Synthea Datasets

Synthea produces one underlying dataset per FHIR resource type
(`Patient`, `Condition`, `Encounter`, `Observation`, etc.), so a single
`dataset trial_patients { tool synthea }` block fans out into
`trial_patients_patient`, `trial_patients_condition`,
`trial_patients_encounter`, and so on. Reference each one in its own
`output` block:

```dsl
output trial_patients_patient    json { path "output/patients.json" }
output trial_patients_condition  json { path "output/conditions.json" }
output trial_patients_encounter  json { path "output/encounters.json" }
```
