# Generalize Synthetic Data for Arbitrary Domains

Make the synthetic data system domain-agnostic so it can generate datasets for
any domain — not just pharmaceutical organizations and engineering frameworks.
FDEs prototype AI applications against synthetic data while waiting for
production access; the system must support healthcare (Synthea), tabular
(SDV), and general-purpose (Faker) generation out of the box.

```
specs/063-synthetic-generalize/
  spec.md       This document (WHAT and WHY)
  plan.md       Implementation plan (HOW)
```

## Why

The current synthetic data system (libsyntheticgen, libsyntheticprose,
libsyntheticrender, libuniverse) generates exactly one universe: a
pharmaceutical organization with an engineering career framework. Every layer
is coupled to that domain:

1. **DSL grammar is domain-locked.** The parser recognizes `org`, `department`,
   `team`, `people`, `project`, `framework`, `scenarios`, `content` — all
   specific to the org-and-pathway domain. There is no way to describe a
   healthcare patient cohort, a financial transaction stream, or a SaaS usage
   log.

2. **Entity generation is monolithic.** `EntityGenerator.generate()` produces a
   fixed graph: orgs → departments → teams → people → projects → activity.
   Prose keys hardcode `"pharmaceutical industry"`. GitHub usernames append
   `"-bio"`. The 16 GetDX driver IDs are constants. None of this is
   parameterized.

3. **Rendering assumes the domain.** Five hardcoded render modules
   (HTML with pharma microdata, pathway YAML, raw JSON, activity YAML,
   markdown) each assume specific entity shapes. There are no generic output
   formats — no CSV, no Parquet, no SQL INSERT.

4. **No external tool integration.** FDEs working on healthcare applications
   need Synthea patient records. FDEs working on analytics need SDV-generated
   tabular data that preserves statistical properties. FDEs building demos need
   Faker for quick realistic records. The current system cannot invoke any of
   these.

5. **Pipeline is not composable.** The 10-step pipeline
   (parse → entities → prose → HTML → enrich → pathway → raw → markdown →
   format → validate) is a single fixed sequence. There is no way to run just
   "generate 1000 patients and write CSV" without executing the entire
   org-and-pathway pipeline.

This means FDEs either wait for production data, hand-craft fixtures, or leave
the monorepo entirely to use standalone tools with no shared conventions. The
synthetic data system — which already solves the hard problems of deterministic
seeded generation, LLM prose caching, and multi-format rendering — could serve
them all if it were domain-agnostic.

## What

Generalize the synthetic data system to support arbitrary domains via three
hard-coded tools and six output renderers, while preserving the existing
org-and-pathway generation as the built-in default.

### Dataset abstraction

Introduce a single new concept: **dataset**. A dataset is an array of typed
records produced by a tool and written to one or more output formats by
renderers. Every tool produces datasets. Every renderer consumes datasets.

```
dataset = {
  name: string,             // identifier, e.g. "patients", "claims"
  schema: object,           // JSON Schema describing one record
  records: object[],        // generated data
  metadata: object          // tool-specific context (FHIR resource type, table name, etc.)
}
```

This is the only new abstraction. Tools produce datasets. Renderers consume
them. The pipeline connects the two.

### Three hard-coded tools

Each tool is a concrete class. No plugin interface, no tool registry, no
dynamic loading. If a fourth tool is needed later, add another class.

| Tool        | What it wraps                  | Input                               | Output                                       |
| ----------- | ------------------------------ | ----------------------------------- | -------------------------------------------- |
| **Synthea** | Synthea CLI (Java)             | Population size, modules, seed      | FHIR R4 bundles → flattened patient datasets  |
| **SDV**     | SDV library (Python)           | Metadata JSON, sample CSVs, row count, seed | Tabular datasets preserving distributions     |
| **Faker**   | @faker-js/faker (JS, in-proc) | Field definitions, row count, seed  | Record arrays with realistic field values     |

**Synthea tool.** Invokes `java -jar synthea.jar` as a child process with
the configured population, modules, and seed. Reads FHIR Bundle JSON from the
output directory. Flattens bundles into one dataset per FHIR resource type
(Patient, Encounter, Condition, Observation, etc.). Each record is one FHIR
resource with its fields as properties.

**SDV tool.** Invokes a Python subprocess that imports `sdv`, fits a
GaussianCopula model to sample data described by the provided metadata (column
types, distributions, constraints), and generates rows preserving statistical
properties. A thin Python script (`tools/sdv_generate.py`) bridges the
JS ↔ Python boundary — the tool writes config to a temp file, calls the
script, reads JSON output. Each table in the metadata becomes one dataset.
The DSL `data` block maps table names to CSV file paths containing sample data
for fitting.

**Faker tool.** Runs in-process (JS). Takes a field definition map
(`{ name: "person.fullName", email: "internet.email", ... }`) and a row count.
Calls `@faker-js/faker` with the universe seed for determinism. Produces a
single dataset.

### Availability and graceful failure

Each tool checks whether its external dependency is available before generation:
- Synthea: `java -version` succeeds and `synthea.jar` exists at configured path
- SDV: `python3 -c "import sdv"` succeeds
- Faker: always available (JS dependency)

If a dependency is unavailable, the tool throws with a clear message explaining
what to install. No silent fallback, no partial generation.

### Six hard-coded renderers

Each renderer is a standalone function. No registry, no format discovery.

| Renderer       | Output                             | Use case                               |
| -------------- | ---------------------------------- | -------------------------------------- |
| **JSON**       | `.json` (array of objects)         | API mocking, document stores           |
| **YAML**       | `.yaml` (array of objects)         | Config fixtures, K8s manifests         |
| **CSV**        | `.csv` (header + rows)             | Spreadsheets, data pipelines, imports  |
| **Markdown**   | `.md` (table per dataset)          | Documentation, readable fixtures       |
| **Parquet**    | `.parquet` (columnar binary)       | Analytics, data lakes, Spark/DuckDB    |
| **SQL INSERT** | `.sql` (INSERT statements)         | Database seeding, migration fixtures   |

Each renderer takes a dataset and a file path, returns a `Map<path, content>`
(or `Map<path, Buffer>` for Parquet). The renderer handles type coercion (dates
to ISO strings for CSV, nested objects to JSON strings for SQL, etc.).

### DSL extension

Add a `dataset` block and an `output` block to the universe DSL. The existing
blocks (`org`, `department`, `team`, `people`, `project`, `framework`,
`scenarios`, `content`) remain unchanged — they define the built-in
org-and-pathway generation.

```
universe HealthcareDemo {
  seed 42

  dataset patients {
    tool synthea
    population 1000
    modules [diabetes, cardiovascular]
  }

  dataset claims {
    tool sdv
    metadata "schemas/claims_metadata.json"
    data {
      claims "data/claims_sample.csv"
    }
    rows 50000
  }

  dataset contacts {
    tool faker
    rows 500
    fields {
      name "person.fullName"
      email "internet.email"
      phone "phone.number"
      company "company.name"
      joined "date.past"
    }
  }

  output patients json { path "output/patients.json" }
  output patients csv  { path "output/patients.csv" }
  output claims parquet { path "output/claims.parquet" }
  output contacts sql  { path "output/contacts.sql" table "contacts" }
}
```

A universe can mix tools freely. A universe can also combine the built-in
org-and-pathway blocks with `dataset` blocks — they are independent.

### Pipeline changes

The pipeline gains two new steps that run after DSL parsing:

1. **Tool execution.** For each `dataset` block, instantiate the named
   tool, invoke `generate()`, collect the resulting datasets.
2. **Output rendering.** For each `output` block, find the named dataset, invoke
   the named renderer, collect the resulting files.

These steps are independent of the existing org-and-pathway pipeline. If a
universe has no `dataset` blocks, no tool code runs. If a universe has no
org/department/team blocks, no org-and-pathway code runs. Both can coexist.

### What stays the same

- **Existing DSL blocks** — `org`, `department`, `team`, `people`, `project`,
  `framework`, `scenarios`, `content` are unchanged.
- **Existing entity generation** — `EntityGenerator` continues to produce the
  org-and-pathway entity graph for universes that declare those blocks.
- **Existing renderers** — HTML, pathway YAML, raw JSON, activity YAML,
  markdown renderers continue to work for org-and-pathway universes.
- **ProseEngine** — LLM prose generation and caching unchanged.
- **PathwayGenerator** — Engineering framework generation unchanged.
- **Seeded RNG** — Unchanged and shared with new tools via the universe seed.
- **ContentValidator** — Existing 25 checks unchanged; new tools add their own
  validation.
- **ContentFormatter** — Prettier formatting unchanged.

### What does NOT change

- No plugin system, tool registry, or dynamic loading.
- No changes to the pathway JSON schemas (`products/map/schema/json/`).
- No changes to the installed pathway data (`data/pathway/`).
- No changes to existing generated output under `examples/`.
- No changes to `fit-map validate`.

## Success Criteria

1. `fit-universe` generates Faker datasets from a DSL file with `dataset` +
   `output` blocks, producing valid JSON/CSV/YAML/Markdown/SQL output.
2. `fit-universe` generates Synthea patient data when Java and Synthea are
   available, producing FHIR-derived datasets in any output format.
3. `fit-universe` generates SDV tabular data when Python and SDV are available,
   producing statistically representative datasets in any output format.
4. Existing `examples/universe.dsl` continues to work unchanged — no regression
   in org-and-pathway generation.
5. Each tool produces deterministic output given the same seed.
6. Each tool fails clearly when its external dependency is unavailable.
7. All six renderers produce correct output for flat and nested record shapes.
8. A single universe can mix built-in org blocks with `dataset` blocks.
9. Parquet output is readable by DuckDB / Pandas without errors.
10. SQL INSERT output is valid SQL for PostgreSQL.

## Scope

### In scope

- `dataset` and `output` DSL blocks (parser extension).
- Three tool classes: Synthea, SDV, Faker.
- Six renderer functions: JSON, YAML, CSV, Markdown, Parquet, SQL INSERT.
- Pipeline integration: tool execution and output rendering steps.
- Availability checks and clear error messages for external dependencies.
- Unit tests for each tool and renderer.
- One example DSL file per tool demonstrating usage.

### Out of scope

- Plugin interface or tool registry (hard-coded is sufficient for now).
- LLM prose enrichment for tool-generated data (tools produce structural data
  only; prose enrichment is an org-and-pathway concern).
- Web UI for browsing or configuring datasets.
- Dataset versioning or registry.
- Streaming generation for very large datasets (batch is sufficient).
- Changes to the existing org-and-pathway generation pipeline.
