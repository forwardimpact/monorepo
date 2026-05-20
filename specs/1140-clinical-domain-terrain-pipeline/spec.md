# Spec 1140 — Clinical Domain Support in Terrain Pipeline

The terrain pipeline generates organizational and engineering data but has no
clinical domain support. There are no clinical trials as a first-class entity,
no trial sites, no eligibility criteria, no medical conditions with
patient-facing descriptions, no patient-facing content types, and no output
format that produces SQL migrations or vector-embeddable text. These gaps
prevent the pipeline from seeding any healthcare application.

## Problem

### Evidence — missing domain model

The terrain DSL has no way to express clinical concepts. Generic names like
`site` and `condition` would collide the moment the DSL expands into
manufacturing, commercial, or any other domain. There is no precedent for
domain-scoped entity blocks — only `org`, `department`, `team`, and `project`
exist at the terrain root.

### Evidence — missing output formats

The pipeline produces `json`, `yaml`, `csv`, `markdown`, `parquet`, and `sql`
outputs. None produce coordinated SQL migrations loadable by Supabase, and none
produce text blocks optimized for vector embedding. The existing `sql` format
writes a single `INSERT` statement per dataset, not a set of related migrations
with foreign keys, junction tables, and RLS policies.

### Evidence — incomplete dataset tooling

The `trial_patients` dataset block declares `tool synthea` but Synthea is not
operationally available (no JAR download path, no condition-aware filtering).
The `researchers` faker dataset generates 100 random records with no trial
links — it should be replaced by entity-generated researchers derived from PI
refs and the people graph.

### Evidence — no patient-facing prose

The prose pipeline supports `guide_html` (internal engineering knowledge base)
and `outpost_markdown` (persona briefings). Neither produces patient-facing
clinical content. Six new template types are needed for conditions, therapies,
trials, consent, sites, and patient stories — all requiring a different system
prompt (medical communications writer vs. technical writer).

### Who is affected

- The BioNova Finder application (spec 1160) — cannot be seeded without
  clinical domain output.
- Any future healthcare demo or product using the terrain pipeline.
- The terrain pipeline itself — no domain-scoped entity block pattern exists
  for future domains (manufacturing, commercial).

## Proposal

### 1. New DSL construct: `clinical {}` domain block

A `clinical {}` top-level block containing `condition`, `site`, and `trial`
(with nested `criteria`) sub-blocks, plus a scoped `content {}` sub-block for
patient-facing prose. Domain-scoped keywords avoid namespace collisions with
future domains. The AST gains `ClinicalBlock` as a new container node on
`TerrainAST.clinical`.

### 2. Clinical content types

Per-entity cardinality keywords (`per_condition`, `per_trial`, `per_site`) so
content counts stay in sync with entity counts. Six clinical prose template
types: condition explainers, therapy descriptions, trial FAQs, consent
summaries, site descriptions, and patient stories. A patient-facing system
prompt for clinical prose generation via the existing `generateStructured()`
path.

### 3. Clinical entity generation

Five new entity types under `entities.clinical`: conditions, sites, trials,
criteria, and researchers. Bidirectional relationship generation (trial ↔
condition, trial ↔ site). Cross-domain reference resolution (trial → project,
site → org, trial → PI person). Researcher generation from PI refs and the
people graph, replacing the standalone faker dataset. Enrollment interpolation
over snapshots.

### 4. New output formats

`supabase_migration` — coordinated SQL migration files with dependency-ordered
`CREATE TABLE` + `INSERT` statements, junction tables inferred from array
cross-references, RLS policies, and optional pgvector embeddings table.
`embeddings_jsonl` — text blocks assembled from entity fields and prose cache
lookups, formatted as JSONL for downstream vector embedding.

### 5. Pipeline integration

A `clinical-output` pipeline stage that wires the entity graph, prose cache,
and output configs together. Format-based output routing so the existing
`datasets` stage and the new `clinical-output` stage don't conflict.
Dotted-identifier tokenizer extension (`clinical.conditions`) for
domain-qualified entity references in output blocks.

### 6. Dataset evolution

Synthea tool operationalization with JAR download-on-demand and clinical-aware
FHIR post-processing. A `conditions` field in dataset blocks that
cross-references `clinical {}` entities and resolves to Synthea modules.
Removal of the standalone `researchers` faker dataset.

### 7. Clinical HTML templates

Seven HTML templates following the existing two-pass pattern (skeleton with
`data-enrich` placeholders → LLM enrichment). Schema.org microdata for
`MedicalTrial`, `MedicalCondition`, `MedicalClinic`, `MedicalTherapy`.

## Scope

### Included

- `libsyntheticgen` — tokenizer, parser, AST, entity generator, prose key
  generator.
- `libsyntheticprose` — 6 prompt templates, clinical system prompt.
- `libsyntheticrender` — `render-sql`, `render-embeddings`, 7 HTML templates.
- `libterrain` — `clinical-output` pipeline stage, output format registration,
  Synthea operationalization.

### Excluded

- The concrete `story.dsl` content changes — specified in spec 1150.
- The BioNova Finder application — specified in spec 1160.
- Non-clinical domain blocks (manufacturing, commercial) — future work that
  follows the pattern established here.
- Changes to the existing `generatePlain()` prose path or the engineering
  system prompt.

## Success Criteria

1. A DSL file containing a `clinical {}` block with conditions, sites, trials,
   criteria, and content parses to a valid AST with `ast.clinical` populated.
   Verify: `bun test` in `libsyntheticgen` passes.

2. The entity generator produces `entities.clinical` with five entity types,
   bidirectional relationships, and resolved cross-domain references. Verify:
   `bun test` in `libsyntheticgen` passes.

3. Clinical prose keys are collected and flow through the cache-lookup pipeline.
   Verify: `bun test` in `libsyntheticgen` (clinical-prose-keys tests) passes
   and `bun run fit-terrain build` completes without error.

4. `supabase_migration` output produces numbered SQL files loadable by
   `supabase db push`. Verify: generated SQL files create tables with correct
   foreign keys, junction tables, and RLS policies.

5. `embeddings_jsonl` output produces valid JSONL with entity fields and prose
   cache lookups. Verify: each line parses as valid JSON with `id`, `table`,
   and `text` fields.

6. The existing `story.dsl` (without a clinical block) still parses and
   generates without error. Verify: `bun run fit-terrain generate` produces
   identical output before and after the library changes.

7. `just synthea-install && just synthea-status` reports availability. Verify:
   Synthea JAR is downloaded and Java version is reported.

8. Clinical HTML templates render with Schema.org microdata and `data-enrich`
   placeholders that the existing enricher fills. Verify: `bun test` in
   `libsyntheticrender` passes.
