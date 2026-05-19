# PLAN-05: Pipeline Integration

> Add a `clinical-output` pipeline stage that wires the clinical entity
> graph, prose cache, and output configs together to produce SQL migrations
> and embeddings JSONL. Extend the pipeline DAG, output routing, and the
> `write` stage.

## Dependencies

- **PLAN-02** — `entities.clinical` must exist in the entity graph.
- **PLAN-03** — Clinical prose keys must be registered in `collectProseKeys()`.
- **PLAN-04** — `renderSql()` and `renderEmbeddings()` must exist.

## Dependency Graph

```
PLAN-02 ─┐
PLAN-03 ─┤→ PLAN-05
PLAN-04 ─┘
```

## Files to Modify

| File | Change |
|------|--------|
| `libraries/libterrain/src/nodes.js` | New `clinical-output` stage, extend `write` deps, extend `mergeOutputFiles()` |

## Design

### Why a New Pipeline Stage

`supabase_migration` and `embeddings_jsonl` outputs walk the *entity graph*
(`entities.clinical`), not dataset tool output. They cannot use the existing
`datasets` stage which depends only on `parse` and dispatches to tool runners.
The new stage mirrors the `pathway` pattern:

- **pathway**: deps `[entities]`, walks `entities.standard`, produces YAML
- **clinical-output**: deps `[parse, entities, cache-lookup]`, walks
  `entities.clinical`, produces SQL + JSONL

The `parse` dependency provides output configuration (path, prefix, entities
list) from the DSL `output` blocks. The `entities` dependency provides
resolved clinical entities with relationships. The `cache-lookup` dependency
provides prose for embedding text blocks.

### Output Routing

The `clinical-output` stage filters `parse.outputs` for
`supabase_migration` and `embeddings_jsonl` formats. The existing `datasets`
stage skips these outputs because their `dataset` field (the freeform name
like `finder_seed`) doesn't match any generated dataset — the silent skip in
`renderDatasetOutputs()` (nodes.js:284-290) handles this without changes.

### Pipeline DAG After This Plan

```
parse ──→ entities ──→ prose-keys ──→ cache-lookup ─┐
  │         │                             │          │
  │         ├──→ skeleton ←───────────────┤          │
  │         │      ↓                      │          │
  │         ├──→ enriched ←───────────────┘          │
  │         │                                        │
  │         ├──→ raw ←────── cache-lookup             │
  │         │                                        │
  │         ├──→ markdown ←─ cache-lookup             │
  │         │                                        │
  │         ├──→ pathway                             │
  │         │                                        │
  │         └──→ clinical-output ←── parse, cache-lookup  ←── NEW
  │                    │
  └──→ datasets        │
          │            │
          ↓            ↓
        write ←── validate
```

## Steps

### 1. Add clinical-output Stage

In `buildNodes()` (nodes.js:29-250), add a new stage after `datasets`:

```javascript
"clinical-output": {
  deps: ["parse", "entities", "cache-lookup"],
  async run({ parse, entities, "cache-lookup": prose }) {
    const files = new Map();
    if (!entities.clinical) return { files };

    const clinicalOutputs = (parse.outputs || []).filter(
      (o) => o.format === "supabase_migration" || o.format === "embeddings_jsonl",
    );
    if (clinicalOutputs.length === 0) return { files };

    logger.info("pipeline", `Rendering ${clinicalOutputs.length} clinical output(s)`);

    for (const out of clinicalOutputs) {
      if (out.format === "supabase_migration") {
        const rendered = renderSql(entities.clinical, out.config);
        for (const [path, content] of rendered) files.set(path, content);
      } else if (out.format === "embeddings_jsonl") {
        const rendered = renderEmbeddings(entities.clinical, prose, out.config);
        for (const [path, content] of rendered) files.set(path, content);
      }
    }

    logger.info("pipeline", `Clinical output: ${files.size} files`);
    return { files };
  },
},
```

Import `renderSql` and `renderEmbeddings` from `@forwardimpact/libsyntheticrender`
at the top of `nodes.js` (alongside the existing `renderDataset` import at line 18).

### 2. Extend write Stage Dependencies

In the `write` stage (nodes.js:234-249), add `clinical-output` to `deps`:

```javascript
write: {
  deps: ["enriched", "raw", "markdown", "pathway", "datasets", "clinical-output", "validate"],
  run({ enriched, raw, markdown, pathway, datasets, "clinical-output": clinicalOutput, validate }) {
    const files = mergeOutputFiles(
      options.only,
      enriched, raw, markdown, pathway, datasets, clinicalOutput,
    );
    // ...
  },
},
```

### 3. Extend mergeOutputFiles()

In `mergeOutputFiles()` (nodes.js:299-319), add `clinical-output` as a
source. Clinical output files go directly to their configured paths (not
prefixed like `data/knowledge/` or `data/personal/`):

```javascript
function mergeOutputFiles(only, enriched, raw, markdown, pathway, datasets, clinicalOutput) {
  const files = new Map();
  const include = (type) => !only || only === type;

  const sources = [
    ["html", enriched.files],
    ["pathway", pathway.files],
    ["raw", raw.files],
    ["markdown", markdown.files],
  ];
  for (const [type, source] of sources) {
    if (include(type)) {
      for (const [k, v] of source) files.set(k, v);
    }
  }
  // datasets and clinical output bypass --only (structured data, not prose)
  for (const [k, v] of datasets.files) files.set(k, v);
  for (const [k, v] of clinicalOutput.files) files.set(k, v);

  return files;
}
```

### 4. Guard: No Clinical Block

When `ast.clinical` is null (the current state of `story.dsl`), the
`clinical-output` stage returns `{ files: new Map() }`. The `write` stage
receives an empty map and merges nothing. No behavior change for existing
DSL files.

## Verification

### Unit Test (extend pipeline.test.js)

The existing pipeline test in `libraries/libterrain/test/pipeline.test.js`
runs the full DAG with a minimal DSL fixture.

1. **No clinical block** — existing test passes without changes. The
   `clinical-output` stage produces zero files.

2. **With clinical block** — create a test DSL fixture with a minimal
   `clinical {}` block and `supabase_migration` + `embeddings_jsonl`
   output blocks. Run the pipeline. Assert:
   - `clinical-output` stage ran
   - Output contains SQL files at the configured path
   - Output contains JSONL file at the configured path
   - File count matches expected (9 SQL + 1 JSONL) when `include_embeddings: true`, or (8 SQL + 1 JSONL) without

3. **write stage includes clinical files** — the merged output from
   `write` includes the SQL and JSONL files.

4. **Existing outputs unaffected** — `datasets` stage still produces
   the existing output files (claims parquet, etc.).

### Integration Smoke Test

```sh
cd libraries/libterrain && bun test
```

### Full Pipeline Test (after PLAN-07 lands)

Once the story.dsl is rewritten with the clinical block:

```sh
bun run fit-terrain generate --mode no-prose
ls -la output/products/finder/site/supabase/migrations/
```

Verify SQL files are generated and numbered correctly. Load into a local
Supabase instance to verify schema validity.
