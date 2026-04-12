---
title: Landmark Internals
description: Architecture and implementation details for the Landmark analysis product.
---

# Landmark Internals

Landmark (`@forwardimpact/landmark`) is a read-only CLI analysis layer over
Map's activity schema. It mirrors Summit's package layout and CLI conventions.

## Package Layout

```
products/landmark/
  bin/fit-landmark.js     CLI entry point
  src/
    index.js              Public API re-exports
    lib/                  Shared helpers
      cli.js              resolveDataDir, loadMapData, resolveFormat
      supabase.js         createLandmarkClient factory
      context.js          buildContext for command handlers
      empty-state.js      Central registry of empty-state messages
      evidence-helpers.js Shared evidence join/grouping logic
      initiative-helpers.js Initiative impact computation (pure)
      summit.js           Dynamic import wrapper for Summit's growth function
    commands/             One file per top-level command
    formatters/           One file per command (toText, toJson, toMarkdown)
  test/                   node:test with stub queries, no network
```

## Data Contracts

Landmark consumes Map's activity queries via subpath imports:

| Import                                            | Query functions                                                               |
| ------------------------------------------------- | ----------------------------------------------------------------------------- |
| `@forwardimpact/map/activity/queries/org`         | `getOrganization`, `getTeam`, `getPerson`                                     |
| `@forwardimpact/map/activity/queries/snapshots`   | `listSnapshots`, `getSnapshotScores`, `getItemTrend`, `getSnapshotComparison` |
| `@forwardimpact/map/activity/queries/evidence`    | `getEvidence`, `getPracticePatterns`                                          |
| `@forwardimpact/map/activity/queries/artifacts`   | `getArtifacts`, `getUnscoredArtifacts`                                        |
| `@forwardimpact/map/activity/queries/comments`    | `getSnapshotComments`                                                         |
| `@forwardimpact/map/activity/queries/initiatives` | `listInitiatives`, `getInitiative`                                            |

Framework data is loaded via `@forwardimpact/map/loader` (`createDataLoader`).

## Join Contracts

### `item_id ↔ driver.id`

The `getdx_snapshot_team_scores.item_id` field must match a `driver.id` in
`drivers.yaml`. Unknown items produce warnings in the health view. Installations
must align their GetDX scorecard item IDs with driver definitions.

### `scorecard_id ↔ driver.id`

Initiatives link to drivers via `getdx_initiatives.scorecard_id`. The impact
command uses this to compute before/after score deltas.

## Summit Import Pattern

`src/lib/summit.js` wraps `@forwardimpact/summit`'s `computeGrowthAlignment` via
dynamic `import()`. This provides:

- **Optional runtime**: if Summit is absent, health degrades to driver scores +
  evidence + comments without growth recommendations.
- **Test injection**: `__setSummitForTests()` allows unit tests to stub Summit
  without touching `node_modules`.
- **`GrowthContractError` handling**: framework data violations become health
  view warnings, not crashes.

## Comments and Initiatives Pipeline

Both follow the same ELT pattern:

1. **Extract** —
   `products/map/supabase/functions/_shared/activity/extract/getdx.js` fetches
   from GetDX API and stores raw JSON to Supabase Storage.
2. **Transform** — `.../transform/getdx.js` reads raw documents and upserts
   structured rows into the activity schema.
3. **Query** — `products/map/src/activity/queries/{comments,initiatives}.js`
   export thin SELECT wrappers.
4. **Landmark** — commands import query modules and present the data.

## Testing Strategy

All command tests use injectable `queries` parameters to avoid network calls.
Fixtures are in-memory objects. The pattern:

```js
const result = await runHealthCommand({
  options: { manager: "alice@example.com" },
  mapData: MAP_DATA_FIXTURE,
  supabase: {},
  format: "text",
  queries: stubQueries(),     // injected stubs
  summitFn: summitPresent,    // injected Summit stub
});
```

## Behaviour Rendering — Non-Goal

Drivers declare `contributingBehaviours`, but Landmark does not render behaviour
evidence in the health view. Behaviours are maturity profiles (derived from
discipline + level + track), not artifact-level markers. The spec's health view
mock-up shows skills only.
