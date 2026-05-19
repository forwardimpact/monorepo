# PLAN-06: Dataset Evolution

> Make the Synthea tool clinical-aware by adding a `conditions` field to the
> dataset parser that cross-references `clinical {}` entities. Remove the
> standalone `researchers` faker dataset (replaced by the entity-generated
> `ClinicalResearcherEntity` in PLAN-02).

## Dependencies

- **PLAN-01** — Parser must support the `conditions` keyword in dataset blocks.
- **PLAN-02** — Entity generator must produce `entities.clinical.researchers`
  (so the faker dataset can safely be removed without losing researcher data).

## Dependency Graph

```
PLAN-01 ─┐
PLAN-02 ─┤→ PLAN-06 → PLAN-07 (story.dsl rewrite)
         │        └─→ PLAN-09 (Synthea operationalization)
```

## Files to Modify

| File | Change |
|------|--------|
| `libraries/libsyntheticgen/src/dsl/parser-standard.js` | Add `conditions` to `DATASET_DISPATCH` (line 242) |
| `libraries/libsyntheticgen/src/tools/synthea.js` | Accept `conditions` config, resolve `synthea_module` per condition |
| `libraries/libsyntheticgen/test/parser-dataset.test.js` | Tests for `conditions` field |

## Steps

### 1. Add `conditions` to DATASET_DISPATCH

In `parser-standard.js:242-264`, add a handler for the `conditions` keyword:

```javascript
const DATASET_DISPATCH = {
  tool: (ds) => { ds.tool = parseStringOrIdent(); },
  population: (ds) => { ds.config.population = parseNumberValue(); },
  modules: (ds) => { ds.config.modules = parseArray(); },
  metadata: (ds) => { ds.config.metadata = parseStringValue(); },
  data: (ds) => { ds.config.data = parseDatasetFields(); },
  rows: (ds) => { ds.config.rows = parseNumberValue(); },
  fields: (ds) => { ds.config.fields = parseDatasetFields(); },
  conditions: (ds) => { ds.config.conditions = parseArray(); },  // <-- new
};
```

The `conditions` field holds an array of condition IDs from the `clinical {}`
block (e.g. `[lung_cancer, diabetes_t2, cardiovascular]`).

### 2. Synthea Tool: Condition-Aware Module Resolution

In `libraries/libsyntheticgen/src/tools/synthea.js`, the `generate(config)`
method currently uses `config.modules` directly. When `config.conditions`
is present, the tool must resolve each condition ID to its `synthea_module`
value.

This requires access to the parsed `clinical {}` AST. Two approaches:

#### Approach A: Resolve at generation time (deferred)

Pass the `ClinicalBlock` entities alongside the dataset config when calling
`tool.generate()`. The `datasets` stage in `nodes.js` currently depends
only on `parse`, not `entities`. Adding `entities` as a dependency would
create a longer critical path.

#### Approach B: Resolve at parse time (simpler)

The `conditions` field in the DSL is just an array of identifiers. The
Synthea tool uses these to look up `synthea_module` values from the AST.
But the tool doesn't have AST access — it receives `config` only.

#### Approach C: Resolve in a pre-processing step (recommended)

Add a pre-processing step in the `datasets` pipeline stage that resolves
`config.conditions` against `ast.clinical` and populates `config.modules`:

```javascript
// In generateDatasets() (nodes.js:253-278), before calling tool.generate():
if (ds.config.conditions && ast.clinical) {
  const modules = [];
  for (const condId of ds.config.conditions) {
    const cond = ast.clinical.conditions.find(c => c.id === condId);
    if (cond?.synthea_module) modules.push(cond.synthea_module);
  }
  ds.config.modules = modules;
}
```

This requires `generateDatasets()` to receive the parsed AST (or just the
clinical block). Currently it receives `parse.datasets` and `parse.seed`.
Change the `datasets` stage to also pass `parse.clinical`:

```javascript
datasets: {
  deps: ["parse"],
  async run({ parse }) {
    const files = new Map();
    if (!parse.datasets?.length || !toolFactory) return { files };
    const datasets = await generateDatasets(
      parse.datasets, parse.seed, toolFactory, logger, parse.clinical,
    );
    await renderDatasetOutputs(parse.outputs, datasets, files, logger);
    return { files };
  },
},
```

And in `generateDatasets()`:

```javascript
async function generateDatasets(definitions, seed, toolFactory, logger, clinical) {
  // ... existing code ...
  for (const ds of definitions) {
    // Resolve clinical conditions to Synthea modules
    if (ds.config.conditions && clinical) {
      ds.config.modules = ds.config.conditions
        .map(condId => clinical.conditions.find(c => c.id === condId)?.synthea_module)
        .filter(Boolean);
    }
    // ... rest of existing code ...
  }
}
```

The Synthea tool itself needs no changes — it already reads `config.modules`.

### 3. Story.dsl: Dataset Block Changes (documented for PLAN-07)

The `trial_patients` dataset block changes from:

```dsl
dataset trial_patients {
  tool synthea
  population 200
  modules [diabetes, cardiovascular]
}
```

To:

```dsl
dataset trial_patients {
  tool synthea
  population 200
  conditions [lung_cancer, diabetes_t2, cardiovascular,
              breast_cancer, hypertension, copd]
}
```

The `modules` field is replaced by `conditions`. The tool resolves condition
IDs to Synthea modules at generation time. This change is executed in PLAN-07.

### 4. Researchers Dataset Removal (documented for PLAN-07)

The `researchers` faker dataset and its output blocks are removed from
`story.dsl` in PLAN-07. No parser or tool changes needed — the faker tool
and its parser support remain for other use cases. The removal is purely a
DSL content change.

Lines to remove from `story.dsl`:
- Lines 791-802: `dataset researchers { ... }` block
- Line 811: `output researchers yaml { ... }`
- Line 812: `output researchers markdown { ... }`

Researcher data is now produced by `entities.clinical.researchers` (PLAN-02)
and rendered via `supabase_migration` output (PLAN-04/05).

## Verification

### Parser Tests (parser-dataset.test.js)

1. **conditions in synthea dataset** — parses `conditions [a, b, c]` into
   `ds.config.conditions: ["a", "b", "c"]`.

2. **conditions alongside modules** — both can coexist (conditions takes
   precedence at generation time, but parser accepts both).

3. **conditions with modules absent** — `conditions` without `modules`
   parses cleanly.

### Unit Tests

4. **Module resolution** — given a `ClinicalBlock` with conditions that
   have `synthea_module` values, `generateDatasets()` populates
   `config.modules` from the condition refs.

5. **Missing condition ref** — condition ID not in clinical block is
   silently skipped (no crash, just fewer modules).

6. **No clinical block** — when `clinical` is null, `config.conditions`
   is ignored (falls back to `config.modules` if present).

### Smoke Test

```sh
cd libraries/libsyntheticgen && bun test
```

Existing dataset tests pass unchanged.
