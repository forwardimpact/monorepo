# 1140 Part 04 — Output Format Extensions + Renderers

Add `supabase_migration` and `embeddings_jsonl` as new output formats in the DSL
parser, and implement `renderSql()` and `renderEmbeddings()` in
`libsyntheticrender`.

## Goal

The parser accepts `supabase_migration` and `embeddings_jsonl` output blocks
with their config fields. The renderers produce Supabase-loadable SQL migrations
and JSONL text blocks from clinical entities and prose cache.

## Files

| Action | Path |
|--------|------|
| Modified | `libraries/libsyntheticgen/src/dsl/parser-standard.js` |
| Modified | `libraries/libsyntheticgen/test/parser-dataset.test.js` |
| Modified | `libraries/libsyntheticrender/src/index.js` |
| Created | `libraries/libsyntheticrender/src/render/render-sql.js` |
| Created | `libraries/libsyntheticrender/src/render/render-embeddings.js` |
| Created | `libraries/libsyntheticrender/test/render-sql.test.js` |
| Created | `libraries/libsyntheticrender/test/render-embeddings.test.js` |

## Steps

### Step 1 — Extend DATASET_FORMATS

In `parser-standard.js:221-228`, add `supabase_migration` and `embeddings_jsonl`
to the `DATASET_FORMATS` set.

**Verify:** `bun test` in `libsyntheticgen`.

### Step 2 — Extend parseOutput() config fields

In `parser-standard.js:283-303`, add handlers for `prefix`, `entities`,
`include_embeddings`, and `text_fields`:

```javascript
else if (kw.value === "prefix") out.config.prefix = parseStringValue();
else if (kw.value === "entities") out.config.entities = parseArray();
else if (kw.value === "include_embeddings") out.config.include_embeddings = parseBooleanIdent();
else if (kw.value === "text_fields") out.config.text_fields = parseMappedArrays("text_fields");
```

Add `parseBooleanIdent()`:

```javascript
function parseBooleanIdent() {
  const val = parseStringOrIdent();
  return val === "true";
}
```

Import `parseMappedArrays` from `parser-helpers.js` (added in Part 01).

**Verify:** `bun test` in `libsyntheticgen`.

### Step 3 — SQL migration renderer

Create `render-sql.js` exporting `renderSql(clinicalEntities, outputConfig)` →
`Map<path, content>`.

Walks `outputConfig.entities` (e.g. `["clinical.conditions", ...]`), resolves
each entity type from `clinicalEntities`, generates numbered SQL files in
dependency order:

```text
{prefix}_001_conditions.sql       — CREATE TABLE + INSERT
{prefix}_002_sites.sql
{prefix}_003_researchers.sql
{prefix}_004_trials.sql           — FK → conditions, sites (text refs)
{prefix}_005_criteria.sql         — FK → trials
{prefix}_006_trial_sites.sql      — junction table
{prefix}_007_trial_conditions.sql — junction table
{prefix}_008_rls.sql              — RLS policies (always generated)
{prefix}_009_condition_embeddings.sql — pgvector table (when include_embeddings)
```

Column type inference: string → `text`, integer → `integer`, date → `text`,
boolean → `boolean`, `string[]` → `text[]`, object → `jsonb`. SQL safety: `$$`
dollar-quoting for strings, `ARRAY['a', 'b']` for arrays, `$$...$$::jsonb` for
objects.

Junction tables auto-generated from array cross-references (`trial.conditions[]`
→ `trial_conditions`, `trial.sites[]` → `trial_sites`).

RLS always generated: `ENABLE ROW LEVEL SECURITY` + `public_read` SELECT policy
on all tables.

Embeddings table (when `include_embeddings: true`):
`CREATE EXTENSION IF NOT EXISTS vector` + `condition_embeddings` table with
`vector(384)` column. No INSERTs.

**Verify:** `bun test` in `libsyntheticrender`.

### Step 4 — Embeddings JSONL renderer

Create `render-embeddings.js` exporting
`renderEmbeddings(clinicalEntities, proseCache, outputConfig)` →
`Map<path, content>`.

Walks `outputConfig.entities`, for each entity concatenates fields listed in
`outputConfig.text_fields`:

- Direct fields (`name`, `synonyms`, `therapeutic_area`, `arms`) — read from
  entity. Arrays space-joined.
- Synthetic fields (`prose_explainer`, `prose_description`) — resolve against
  prose cache: `prose_explainer` → `clinical_condition_explainer_{id}`,
  `prose_description` → `clinical_consent_summary_{id}`.

Each line:
`{"id": "<entity_id>", "table": "<source_table>", "text": "<concatenated>"}`.

Missing prose cache entries are silently omitted (text block still includes
entity fields).

**Verify:** `bun test` in `libsyntheticrender`.

### Step 5 — Export from libsyntheticrender

In `libsyntheticrender/src/index.js`:

```javascript
export { renderSql } from "./render/render-sql.js";
export { renderEmbeddings } from "./render/render-embeddings.js";
```

**Verify:** Import resolves from test files.

### Step 6 — Tests

**parser-dataset.test.js:**

- `supabase_migration` output parses with `prefix`, `entities` (DOTTED_IDENT),
  `include_embeddings true`.
- `embeddings_jsonl` output parses with `entities` and `text_fields {}`.
- All eight formats accepted.
- `text_fields` with dotted identifiers parses correctly.

**render-sql.test.js:**

- 9 SQL files for full entity set with `include_embeddings: true`, 8 without.
- Each file contains `CREATE TABLE IF NOT EXISTS`.
- INSERT statements per entity.
- Junction tables generated.
- RLS policies always generated.
- Embeddings table has `vector(384)`.
- Dependency ordering (conditions before trials before criteria).
- SQL escaping (dollar-quoting for strings with quotes).

**render-embeddings.test.js:**

- Valid JSONL output.
- Entity fields space-joined in `text`.
- Prose cache lookup appears in text block.
- Missing prose handled gracefully.

## Blast Radius

Created: `render-sql.js`, `render-embeddings.js`, `render-sql.test.js`,
`render-embeddings.test.js`. Modified: `parser-standard.js`,
`parser-dataset.test.js`, `libsyntheticrender/src/index.js`.

## Verification

```sh
cd libraries/libsyntheticgen && bun test
cd libraries/libsyntheticrender && bun test
```
