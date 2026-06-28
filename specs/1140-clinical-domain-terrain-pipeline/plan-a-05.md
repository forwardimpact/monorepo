# 1140 Part 05 — Pipeline Integration

Add a `clinical-output` pipeline stage that wires the clinical entity graph,
prose cache, and output configs together to produce SQL migrations and
embeddings JSONL.

## Goal

The pipeline DAG gains a `clinical-output` stage. Clinical output files flow
through `write` alongside existing outputs. The existing `datasets` stage
silently skips clinical outputs.

## Files

| Action | Path |
|--------|------|
| Modified | `libraries/libterrain/src/nodes.js` |

## Steps

### Step 1 — Add clinical-output stage

In `buildNodes()` (`nodes.js:29-250`), add a new stage:

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

Import `renderSql` and `renderEmbeddings` from
`@forwardimpact/libsyntheticrender` alongside the existing `renderDataset`
import.

**Verify:** `bun test` in `libterrain`.

### Step 2 — Extend write stage dependencies

Add `clinical-output` to the `write` stage's `deps` array (`nodes.js:234-249`).
Add it to the `run` destructured params and pass to `mergeOutputFiles()`.

**Verify:** `bun test` in `libterrain`.

### Step 3 — Extend mergeOutputFiles()

In `mergeOutputFiles()` (`nodes.js:299-319`), add clinical output as a source.
Clinical output files bypass `--only` filtering (structured data, not prose):

```javascript
for (const [k, v] of clinicalOutput.files) files.set(k, v);
```

**Verify:** `bun test` in `libterrain`.

### Step 4 — Guard: no clinical block

When `ast.clinical` is null, `clinical-output` returns `{ files: new Map() }`.
The `write` stage merges nothing. No behavior change for existing DSL files.

**Verify:** Existing pipeline test passes without changes.

### Step 5 — Tests

Extend `pipeline.test.js`:

- No clinical block — existing test passes, `clinical-output` produces zero
  files.
- With clinical block — DSL fixture with minimal `clinical {}` and output
  blocks. Assert SQL files and JSONL file in output.
- Write stage includes clinical files — merged output contains SQL and JSONL.
- Existing outputs unaffected — `datasets` stage still produces existing files.

## Blast Radius

Modified: `nodes.js`.

## Verification

```sh
cd libraries/libterrain && bun test
```
