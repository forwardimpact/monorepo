# 550 — Seed Contract: Landmark Coverage

`fit-map activity seed` promises a working activity layer from synthetic data,
but delivers only half of one. At least five of twelve Landmark views return
empty or broken results after seeding because the `evidence` table is never
populated and the `getdx_snapshot_comments` table is empty. Three more views
degrade partially because they reference evidence data.

## Why

### Landmark's promise is broken for seeded environments

The leadership getting-started guide tells users that `activity seed` lets them
"explore the activity layer before connecting real data sources." After running
seed, a user trying Landmark for the first time sees this:

| Landmark view | Result after seed                                         | Root cause                              |
| ------------- | --------------------------------------------------------- | --------------------------------------- |
| `evidence`    | "Guide has not yet interpreted artifacts for this scope." | `evidence` table empty                  |
| `readiness`   | "No markers defined at target level"                      | Derives from `evidence` — empty cascade |
| `voice`       | "Snapshot comments not available"                         | `getdx_snapshot_comments` table empty   |
| `practice`    | Empty                                                     | Derives from `evidence` — empty cascade |
| `timeline`    | Partial                                                   | Evidence-dependent columns empty        |

That's 5 empty views and 3 more partially degraded — 8 of 12 views are affected
in some way. A first-time user evaluating Landmark sees a product that appears
to not work. Confirmed in two separate evaluation sessions (2026-04-12,
2026-04-19) — both hit the same wall.

### The original seed spec scoped evidence out

Spec 0380 defined seed's success criteria as non-zero counts in
`organization_people`, `github_events`, and `getdx_snapshots`. The `evidence`
table was explicitly not in scope because it requires Guide to interpret
artifacts. This was a reasonable boundary at the time — Guide wasn't ready and
the evidence schema was still evolving.

Guide is now stable and the evidence schema is settled. The gap between what
seed delivers and what Landmark consumes is no longer a timing issue — it's a
missing contract.

### Evidence requires a service that seed users don't have

The `evidence` table is populated by Guide interpreting GitHub artifacts — a
running gRPC service backed by an LLM. Seed users (internal contributors and
first-time evaluators) don't have Guide running. There is no way to populate
evidence without either running the full Guide stack or inserting synthetic rows
directly.

The same pattern exists for `getdx_snapshot_comments` — the getdx transform
handles them, but the synthetic data generator does not produce comment files,
leaving the table empty after seed.

## What

### 1. Synthetic evidence generation

The synthetic data pipeline should generate plausible evidence rows conforming
to the existing `evidence` table schema, linking `github_artifacts` to skills
from the framework. The generated data must be realistic enough that all
evidence-dependent Landmark views render meaningful, non-empty output for at
least one person in the synthetic roster.

### 2. Synthetic snapshot comments generation

The synthetic data pipeline should generate GetDX snapshot comments that the
getdx transform can ingest into the `getdx_snapshot_comments` table. The
generated comments must be realistic enough that Landmark's `voice` view returns
non-empty results.

### 3. Seed ingests evidence and comments

`fit-map activity seed` should populate the `evidence` and
`getdx_snapshot_comments` tables alongside the existing tables it already
handles. After seed completes, all twelve Landmark views should return non-empty
results for at least one person in the synthetic roster.

### 4. Verify checks all Landmark-consumed tables

`fit-map activity verify` currently checks only `organization_people`,
`getdx_snapshots`, and `github_events`. It should also report counts for
`evidence` and `getdx_snapshot_comments`, so contributors can confirm the full
activity layer is populated.

## Scope

### Affected entities

- Synthetic data generator — evidence and comments output
- `fit-map activity seed` — ingest evidence and comments
- `fit-map activity verify` — report all Landmark-consumed tables
- `data/activity/` — new synthetic evidence and comments files after generation

### Excluded

- Changes to the `evidence` table schema — the existing schema is sufficient
- Changes to Guide's evidence interpretation logic — seed bypasses Guide
  entirely
- Changes to Landmark's query logic or empty-state messages — those are correct
  for the data they receive
- Real-data workflows (`fit-map getdx sync`, webhook ingestion) — unaffected
- External user documentation — seed is internal-only (per spec 0380)

## Success criteria

1. After `just synthetic && fit-map activity seed`, `fit-map activity verify`
   reports non-zero row counts for `organization_people`, `github_events`,
   `getdx_snapshots`, `evidence`, and `getdx_snapshot_comments`.

2. After seeding, all twelve Landmark views return non-empty output for at least
   one person in the synthetic roster: `coverage`, `evidence`, `health`,
   `initiative`, `marker`, `org`, `practice`, `practiced`, `readiness`,
   `snapshot`, `timeline`, `voice`.

3. `bun test` in `products/map` and `products/landmark` continues to pass.

4. Seed remains idempotent — running it twice produces the same database state
   without errors.
