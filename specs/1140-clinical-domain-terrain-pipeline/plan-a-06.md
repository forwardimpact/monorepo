# 1140 Part 06 — Dataset Evolution

Make the Synthea tool clinical-aware by adding a `conditions` field to the
dataset parser that cross-references `clinical {}` entities. Remove the
standalone `researchers` faker dataset (replaced by entity-generated
`ClinicalResearcherEntity` in Part 02).

## Goal

`dataset trial_patients { conditions [lung_cancer, ...] }` parses and resolves
condition IDs to Synthea modules at generation time. The Synthea tool itself
needs no changes — it already reads `config.modules`.

## Files

| Action | Path |
|--------|------|
| Modified | `libraries/libsyntheticgen/src/dsl/parser-standard.js` |
| Modified | `libraries/libsyntheticgen/test/parser-dataset.test.js` |
| Modified | `libraries/libterrain/src/nodes.js` |

## Steps

### Step 1 — Add `conditions` to DATASET_DISPATCH

In `parser-standard.js:242-264`:

```javascript
conditions: (ds) => { ds.config.conditions = parseArray(); },
```

**Verify:** `bun test` in `libsyntheticgen`.

### Step 2 — Resolve conditions to modules at generation time

In `generateDatasets()` (`nodes.js`), pass `parse.clinical` and resolve
`config.conditions` against the clinical block:

```javascript
if (ds.config.conditions && clinical) {
  ds.config.modules = ds.config.conditions
    .map(condId => clinical.conditions.find(c => c.id === condId)?.synthea_module)
    .filter(Boolean);
}
```

The `datasets` stage passes `parse.clinical` to `generateDatasets()`:

```javascript
const datasets = await generateDatasets(
  parse.datasets, parse.seed, toolFactory, logger, parse.clinical,
);
```

**Verify:** `bun test` in `libterrain`.

### Step 3 — Tests

**parser-dataset.test.js:**

- `conditions [a, b, c]` parses to `ds.config.conditions: ["a", "b", "c"]`.
- `conditions` alongside `modules` — both coexist.
- `conditions` without `modules` — parses cleanly.

**Unit tests:**

- Module resolution — given a `ClinicalBlock` with conditions,
  `generateDatasets()` populates `config.modules`.
- Missing condition ref — silently skipped.
- No clinical block — `config.conditions` ignored, falls back to
  `config.modules`.

## Blast Radius

Modified: `parser-standard.js`, `parser-dataset.test.js`, `nodes.js`.

## Verification

```sh
cd libraries/libsyntheticgen && bun test
cd libraries/libterrain && bun test
```
