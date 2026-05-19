# PLAN-04: Output Format Extensions + Renderers

> Add `supabase_migration` and `embeddings_jsonl` as new output formats in
> the DSL parser, and implement the `render-sql` and `render-embeddings`
> renderer functions that produce Supabase-loadable SQL migrations and
> JSONL text blocks for vector embedding.

## Dependencies

- **PLAN-01** — `DOTTED_IDENT` token and `parseMappedArrays()` helper must
  exist for parsing `entities [clinical.conditions]` and `text_fields {}`.

## Dependency Graph

```
PLAN-01 → PLAN-04 → PLAN-05 (pipeline integration)
```

## Files to Modify

| File | Change |
|------|--------|
| `libraries/libsyntheticgen/src/dsl/parser-standard.js` | Add to `DATASET_FORMATS`, extend `parseOutput()` config fields |
| `libraries/libsyntheticrender/src/index.js` | Export new renderer functions |
| `libraries/libsyntheticgen/test/parser-dataset.test.js` | Tests for new output formats |

## Files to Create

| File | Purpose |
|------|---------|
| `libraries/libsyntheticrender/src/render/render-sql.js` | SQL migration renderer |
| `libraries/libsyntheticrender/src/render/render-embeddings.js` | Embeddings JSONL renderer |
| `libraries/libsyntheticrender/test/render-sql.test.js` | Tests for SQL renderer |
| `libraries/libsyntheticrender/test/render-embeddings.test.js` | Tests for embeddings renderer |

## Steps

### 1. Extend DATASET_FORMATS

In `parser-standard.js:221-228`, add the two new formats:

```javascript
const DATASET_FORMATS = new Set([
  "json", "yaml", "csv", "markdown", "parquet", "sql",
  "supabase_migration",   // <-- new
  "embeddings_jsonl",     // <-- new
]);
```

### 2. Extend parseOutput() Config Fields

In `parser-standard.js:283-303`, the output config parser currently handles
`path` and `table`. Add support for the new config fields needed by
`supabase_migration` and `embeddings_jsonl`:

```javascript
function parseOutput(datasetId) {
  const format = parseStringOrIdent();
  if (!DATASET_FORMATS.has(format)) {
    throw new Error(
      `Unknown output format '${format}'. Expected one of: ${[...DATASET_FORMATS].join(", ")}`,
    );
  }
  expect("LBRACE");
  const out = { dataset: datasetId, format, config: {} };
  while (peek().type !== "RBRACE") {
    const kw = advance();
    if (kw.value === "path") out.config.path = parseStringValue();
    else if (kw.value === "table") out.config.table = parseStringValue();
    else if (kw.value === "prefix") out.config.prefix = parseStringValue();
    else if (kw.value === "entities") out.config.entities = parseArray();
    else if (kw.value === "include_embeddings") out.config.include_embeddings = parseBooleanIdent();
    else if (kw.value === "text_fields") out.config.text_fields = parseMappedArrays("text_fields");
    else
      throw new Error(
        `Unexpected '${kw.value}' in output at line ${kw.line}`,
      );
  }
  expect("RBRACE");
  return out;
}
```

Where `parseBooleanIdent()` reads a keyword/ident and converts to boolean:

```javascript
function parseBooleanIdent() {
  const val = parseStringOrIdent();
  return val === "true";
}
```

And `parseMappedArrays` is imported from `parser-helpers.js` (added in
PLAN-01, step 4).

### 3. SQL Migration Renderer

Create `render-sql.js` in `libsyntheticrender/src/render/`.

#### Input

```javascript
renderSql(clinicalEntities, outputConfig)
```

- `clinicalEntities` — the `entities.clinical` object with conditions,
  sites, researchers, trials, criteria
- `outputConfig` — `{ path, prefix, entities, include_embeddings }`

#### Output

Returns `Map<path, content>` — one SQL file per table, numbered by
dependency order.

#### Table Generation

The renderer walks `outputConfig.entities` (e.g.
`["clinical.conditions", "clinical.sites", "clinical.researchers",
"clinical.trials", "clinical.criteria"]`) and for each, resolves the
entity type from `clinicalEntities`, generates `CREATE TABLE IF NOT EXISTS`
+ `INSERT` statements.

**Dependency order for numbering:**

```
001_conditions.sql       — no FKs
002_sites.sql            — no FKs (org_ref is text, not FK)
003_researchers.sql      — no FKs
004_trials.sql           — FK → conditions (text ref), sites (text ref)
005_criteria.sql         — FK → trials
006_trial_sites.sql      — junction table
007_trial_conditions.sql — junction table
008_rls.sql              — Row-Level Security policies (always generated)
009_condition_embeddings.sql — pgvector table (when include_embeddings is true; empty, no INSERTs)
```

Each file is prefixed with `outputConfig.prefix` (e.g. `seed`):
`seed_001_conditions.sql`.

#### Column Type Inference

| AST field type | PostgreSQL type |
|---------------|-----------------|
| string | `text` |
| number (integer) | `integer` |
| number (decimal) | `numeric` |
| date (YYYY-MM) | `text` (stored as text, not date, to match DSL format) |
| boolean | `boolean` |
| string[] | `text[]` |
| object (criteria) | `jsonb` |

#### Junction Tables

Array cross-references (`trial.conditions[]`, `trial.sites[]`) produce
junction tables automatically:

```sql
CREATE TABLE IF NOT EXISTS trial_conditions (
  trial_id text NOT NULL REFERENCES trials(id),
  condition_id text NOT NULL REFERENCES conditions(id),
  PRIMARY KEY (trial_id, condition_id)
);
```

#### RLS Policies (always generated)

```sql
-- 008_rls.sql
ALTER TABLE conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE trials ENABLE ROW LEVEL SECURITY;
ALTER TABLE criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE researchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE trial_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE trial_conditions ENABLE ROW LEVEL SECURITY;

-- Public read access (all seed data is public)
CREATE POLICY "public_read" ON conditions FOR SELECT USING (true);
CREATE POLICY "public_read" ON sites FOR SELECT USING (true);
CREATE POLICY "public_read" ON trials FOR SELECT USING (true);
CREATE POLICY "public_read" ON criteria FOR SELECT USING (true);
CREATE POLICY "public_read" ON researchers FOR SELECT USING (true);
CREATE POLICY "public_read" ON trial_sites FOR SELECT USING (true);
CREATE POLICY "public_read" ON trial_conditions FOR SELECT USING (true);
```

RLS is always generated for `supabase_migration` output — it's a security
concern, not an embeddings concern. The seed data is non-sensitive and the
Finder app needs anonymous reads. Write policies are omitted (admin writes
happen via service role key, which bypasses RLS).

#### Embeddings Table (when include_embeddings is true)

```sql
-- 009_condition_embeddings.sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS condition_embeddings (
  id text PRIMARY KEY,
  source_table text NOT NULL,
  embedding vector(384),
  text_content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE condition_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read" ON condition_embeddings FOR SELECT USING (true);
```

No INSERTs — the `embed-seed` Edge Function populates this at runtime.

#### SQL Safety

- All string values are escaped with `$$` dollar-quoting (avoids injection
  via single quotes in trial names).
- Array values use PostgreSQL array literal syntax: `ARRAY['a', 'b']`.
- JSONB values use `$$...$$::jsonb`.

### 4. Embeddings JSONL Renderer

Create `render-embeddings.js` in `libsyntheticrender/src/render/`.

#### Input

```javascript
renderEmbeddings(clinicalEntities, proseCache, outputConfig)
```

- `clinicalEntities` — the `entities.clinical` object
- `proseCache` — `Map<string, string>` from the `cache-lookup` stage
- `outputConfig` — `{ path, entities, text_fields }`

#### Output

Returns `Map<path, content>` — a single JSONL file at `outputConfig.path`.

Each line is:

```json
{"id": "lung_cancer", "table": "conditions", "text": "Non-Small Cell Lung Cancer high risk smoking related cancer lung cancer ..."}
```

#### Text Block Assembly

The `text_fields` config maps entity types to field lists:

```javascript
{
  "clinical.conditions": ["name", "synonyms", "prose_explainer"],
  "clinical.trials": ["name", "therapeutic_area", "arms", "prose_description"]
}
```

For each entity type, walk the entities array. For each entity, concatenate
the named fields:

- **Direct fields** (`name`, `synonyms`, `therapeutic_area`, `arms`) —
  read from entity object. Arrays are joined with spaces.

- **Synthetic fields** (`prose_explainer`, `prose_description`) — resolve
  against the prose cache:
  - `prose_explainer` on conditions → key `clinical_condition_explainer_{id}`
  - `prose_description` on trials → key `clinical_consent_summary_{id}`

If a prose cache entry is missing (e.g. `no-prose` mode), the text block
still includes the entity fields — the embedding will just be less rich.

### 5. Export from libsyntheticrender

In `libsyntheticrender/src/index.js`, export the new functions:

```javascript
export { renderSql } from "./render/render-sql.js";
export { renderEmbeddings } from "./render/render-embeddings.js";
```

These are standalone functions, not methods on the `Renderer` class —
they follow the same pattern as `renderDataset()` in `dataset-renderers.js`.

## Verification

### Parser Tests (parser-dataset.test.js)

1. **supabase_migration output** — parses with `prefix`, `entities` array
   (containing DOTTED_IDENT values), `include_embeddings true`.

2. **embeddings_jsonl output** — parses with `entities` array and
   `text_fields {}` block.

3. **All eight formats accepted** — extend the existing "all six formats"
   test to verify `supabase_migration` and `embeddings_jsonl` are valid.

4. **text_fields with dotted identifiers** — `text_fields { clinical.conditions [name, synonyms] }` parses correctly.

### Renderer Tests (render-sql.test.js)

Build a minimal `entities.clinical` fixture.

5. **File count** — renders 9 SQL files for a full entity set (with
   `include_embeddings: true`), or 8 without embeddings.

6. **Table creation** — each file contains `CREATE TABLE IF NOT EXISTS`.

7. **INSERT statements** — conditions file contains one INSERT per condition.

8. **Junction tables** — `trial_conditions` and `trial_sites` tables
   generated from array cross-references.

9. **RLS policies** — `008_rls.sql` always generated, enables RLS and
   creates `public_read` policies on all entity tables.

10. **Embeddings table** — when `include_embeddings: true`,
    `009_condition_embeddings.sql` creates a `vector(384)` column with
    its own RLS policy.

11. **Dependency ordering** — conditions before trials, trials before
    criteria. File numbering is monotonically increasing.

12. **SQL escaping** — trial name containing a single quote is properly
    dollar-quoted.

### Renderer Tests (render-embeddings.test.js)

12. **JSONL format** — output is valid JSONL (one JSON object per line).

13. **Text field concatenation** — entity fields are space-joined in the
    `text` field.

14. **Prose cache lookup** — when prose cache contains the condition
    explainer, it appears in the text block.

15. **Missing prose graceful** — when prose cache is empty, the text
    block still contains entity fields without error.

### Smoke Test

```sh
cd libraries/libsyntheticgen && bun test
cd libraries/libsyntheticrender && bun test
```

### Supabase Verification

The generated SQL files should be loadable into a fresh Supabase instance:

```sh
supabase start
cat seed_*.sql | supabase db push --local
supabase db dump --local  # verify tables exist
```
