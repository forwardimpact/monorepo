# Plan A — Part 07: `--evidenced` and `--outcomes` integrations

## Goal

Layer two optional cross-cutting flags over the deterministic commands
shipped in Parts 02–06:

- `--evidenced` — available on `coverage`, `risks`, `growth`,
  `trajectory`. Reads Map's activity schema for evidence aggregates
  via `getEvidence` / `getPracticePatterns`.
- `--outcomes` — available on `growth`. Reads GetDX driver scores via
  `getSnapshotScores` / `getItemTrend` and reweights recommendations.

Both flags are optional. Summit must remain fully functional when the
activity schema is empty or unreachable — "it just works" without
them.

## Inputs

- Spec 090: "Practiced Capability" (spec.md:229–259), "Outcome-Weighted
  Growth" (spec.md:440–475), Empty States (spec.md:704–725).
- Map activity queries: `getEvidence`, `getPracticePatterns` from
  `@forwardimpact/map/activity/queries/evidence`; `getSnapshotScores`,
  `listSnapshots`, `getItemTrend`, `getSnapshotComparison` from
  `@forwardimpact/map/activity/queries/snapshots`.
- `products/map/src/lib/client.js:createMapClient` as a reference (but
  Summit writes its own local copy — Map's `client.js` is not
  exported).

## Approach

Evidence and outcomes are **decorators** over the existing analytical
data flow:

1. Run the deterministic pipeline (Parts 02–06) as usual.
2. If `--evidenced`:
   - Open a Supabase client via Part 07's `createSummitClient`.
   - Call `getPracticePatterns(supabase, { managerEmail? })`.
   - Transform into an `EvidenceMap<skillId, EvidenceStats>`.
   - Re-decorate every `SkillCoverage` with `evidencedDepth`.
   - Re-evaluate `TeamRisks` with evidence-weighted depth where
     applicable.
3. If `--outcomes`:
   - Load the most recent snapshot via `listSnapshots(supabase)`.
   - Call `getSnapshotScores(supabase, snapshotId, { managerEmail? })`.
   - Build a `Map<driverId, DriverScore>`.
   - For each growth recommendation, look up the driver via
     `drivers.yaml` `contributingSkills` and attach `driverContext`.
4. If the Supabase connection fails or the required table is empty,
   degrade gracefully per spec.md:715–716.

## Files Created

### `products/summit/src/lib/supabase.js`

Mirrors `products/map/src/lib/client.js` but local to Summit:

```js
import { createClient } from "@supabase/supabase-js";

export function createSummitClient(opts = {}) {
  const url = opts.url ?? process.env.MAP_SUPABASE_URL;
  const key = opts.serviceRoleKey ?? process.env.MAP_SUPABASE_SERVICE_ROLE_KEY;
  const schema = opts.schema ?? "activity";

  if (!url || !key) {
    throw new EvidenceUnavailableError(
      "No Supabase connection. Run `fit-map activity start` and export MAP_SUPABASE_URL / MAP_SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient(url, key, { db: { schema } });
}
```

DI point: the command handlers accept an optional `supabase` parameter
to make tests injectable. Production dispatches through
`createSummitClient`.

### `products/summit/src/evidence/index.js`

Public evidence surface:

```js
export { loadEvidence, decorateCoverageWithEvidence, decorateRisksWithEvidence }
  from "./decorator.js";
export { EvidenceUnavailableError } from "./errors.js";
```

### `products/summit/src/evidence/decorator.js`

#### `loadEvidence(supabase, { team, lookbackMonths }): Promise<EvidenceMap>`

- Calls `getPracticePatterns(supabase, { managerEmail: team.managerEmail })`
  from `@forwardimpact/map/activity/queries/evidence`.
- Filters rows by `matched === true` (per spec's "matched evidence
  row at working level or above" — spec.md:249–251).
- Maps to `Map<skillId, { count: number, practitioners: Set<email> }>`.
- Filters by `created_at >= now() - lookbackMonths` (default 12, per
  spec.md:250).
- Returns the `EvidenceMap`.

#### `decorateCoverageWithEvidence(coverage, evidence): TeamCoverage`

- Clones `coverage` (no mutation).
- For each skill, adds `evidencedDepth: number` and
  `evidencedHolders: string[]` fields.
- `evidencedDepth = evidence.get(skillId)?.practitioners?.size ?? 0`.

#### `decorateRisksWithEvidence(risks, coverage, evidence, data): TeamRisks`

- Re-assesses risks using `evidencedDepth` in place of `headcountDepth`
  where the spec says "a skill may not be a single point of failure by
  derivation (two people hold it) but becomes one by evidence" —
  spec.md:298–300.
- Specifically:
  - A skill with `evidencedDepth === 1` is an SPOF even if
    `headcountDepth > 1`.
  - A skill with `evidencedDepth === 0` is a critical gap regardless
    of derivation.
- Returns a new `TeamRisks` with evidence-informed severity tiers.

### `products/summit/src/outcomes/index.js`

Public outcomes surface:

```js
export { loadDriverScores, decorateRecommendationsWithOutcomes, mapSkillsToDrivers }
  from "./decorator.js";
```

### `products/summit/src/outcomes/decorator.js`

#### `loadDriverScores(supabase, { team }): Promise<Map<driverId, DriverScore>>`

- `snapshots = await listSnapshots(supabase)`; pick the latest.
- `scores = await getSnapshotScores(supabase, latest.id, { managerEmail:
  team.managerEmail })`.
- Maps to `Map<driverId, { percentile, vsOrg, vsPrev, snapshotId }>`.

#### `mapSkillsToDrivers(data): Map<skillId, driverId[]>`

- Walks `data.drivers`; for each driver, adds `(driver.contributingSkills[*],
  driver.id)` pairs.
- A skill may map to multiple drivers.

#### `decorateRecommendationsWithOutcomes(recommendations, driverScores, data): Recommendation[]`

- For each recommendation, looks up contributing drivers via
  `mapSkillsToDrivers(data).get(skillId)`.
- Attaches `driverContext: { driverId, percentile, vsOrg }` for the
  worst-scoring driver.
- Boosts recommendation priority: a recommendation whose worst driver
  is below the 50th percentile becomes "High impact (addresses
  critical gaps + poor outcomes)" per spec.md:451.
- Re-sorts: critical+poor-outcome > critical alone > SPOF+poor-outcome
  > SPOF alone > coverage.
- Returns a new array.

### `products/summit/test/evidence.test.js`

- `loadEvidence` with an injected fake Supabase client returns an
  `EvidenceMap` with the expected size.
- `decorateCoverageWithEvidence` adds `evidencedDepth` to every skill
  and preserves original fields.
- `decorateRisksWithEvidence` flips a skill from non-SPOF to SPOF when
  only one practitioner has evidence.
- Missing evidence: calling with an empty `EvidenceMap` returns
  all-zero `evidencedDepth` (matches spec.md:715).
- `EvidenceUnavailableError` is thrown when `createSummitClient` has
  no env vars.
- The command handler catches the error and falls back to non-evidenced
  output with a stderr note matching spec.md:715.

### `products/summit/test/outcomes.test.js`

- `mapSkillsToDrivers` correctly expands a driver's `contributingSkills`
  into the reverse map.
- `decorateRecommendationsWithOutcomes` attaches driverContext when a
  match exists and leaves it null otherwise.
- A below-50th-percentile driver bumps the recommendation's impact tier.
- Fallback: when `listSnapshots` returns empty, the handler prints the
  spec.md:716 message and falls back to unweighted ranking.
- A skill with no linked driver still appears in recommendations
  (spec.md:717) but with `driverContext === null`.

## Files Modified

### `products/summit/src/commands/coverage.js`

After computing coverage, if `options.evidenced`:

```js
try {
  const supabase = options.supabase ?? createSummitClient();
  const evidence = await loadEvidence(supabase, {
    team: resolved,
    lookbackMonths: options.lookbackMonths ?? 12,
  });
  coverage = decorateCoverageWithEvidence(coverage, evidence);
} catch (e) {
  if (e instanceof EvidenceUnavailableError) {
    console.error(`summit: ${e.message}`);
    // Decorate with zero evidence so the formatter can show "no evidence data"
    coverage = decorateCoverageWithEvidence(coverage, new Map());
  } else throw e;
}
```

The text formatter uses the existence of `evidencedDepth` fields to
decide whether to render a two-column (derived / evidenced) view.

### `products/summit/src/commands/risks.js`

Same pattern — if `options.evidenced`, decorate the risks.

### `products/summit/src/commands/growth.js`

Two optional decorators:

- `--evidenced` — excludes already-practising candidates from growth
  recommendations. Passes the evidence map through to
  `computeGrowthAlignment` as the optional `evidence` parameter added
  in Part 05.
- `--outcomes` — loads driver scores and calls
  `decorateRecommendationsWithOutcomes` on the result.

### `products/summit/src/commands/trajectory.js`

Optional evidence decoration: when `--evidenced` is set, each
quarter's coverage is decorated with the evidence map *as of that
quarter*. The spec's example (spec.md:528–536) shows per-quarter
evidenced numbers. Implementation caveat: getting historical evidence
is hard because the Map activity schema does not store per-quarter
snapshots of evidence. For Part 07, apply the current evidence map to
every quarter — this is a known simplification. Document in the
formatter with a footnote: "Evidence reflects current data applied
uniformly across quarters. Historical evidence snapshots are not yet
supported."

### `products/summit/src/formatters/coverage/text.js`

Branch on the presence of `evidencedDepth` to render the two-column
view from spec.md:236–244.

### `products/summit/src/formatters/risks/text.js`

Branch on evidence availability: when a skill's SPOF status is
evidence-driven rather than derivation-driven, add a parenthetical
note.

### `products/summit/src/formatters/growth/text.js`

Render the `driverContext` block for recommendations that have one,
matching spec.md:454–460.

### `products/summit/bin/fit-summit.js`

Add `--evidenced` (boolean) and `--outcomes` (boolean) to the options
table. Document per-command availability in the help text.

### `products/summit/src/index.js`

```js
export { createSummitClient } from "./lib/supabase.js";
export {
  loadEvidence, decorateCoverageWithEvidence, decorateRisksWithEvidence,
  EvidenceUnavailableError,
} from "./evidence/index.js";
export {
  loadDriverScores, decorateRecommendationsWithOutcomes, mapSkillsToDrivers,
} from "./outcomes/index.js";
```

### `products/summit/package.json`

Add `@supabase/supabase-js` as a direct dependency (match Map's
version range).

### `products/summit/test/cli.test.js`

Smoke test: `bin/fit-summit.js coverage platform --evidenced --roster
… --data …` with no Supabase env vars prints the fallback message and
an all-zero-evidenced view.

## Verification

1. `bun run check` passes.
2. `bun run test` passes with new evidence and outcomes tests.
3. `bunx fit-summit coverage platform --evidenced --roster … --data …`
   falls back gracefully when Supabase env vars are not set.
4. With Supabase configured (e.g. via `fit-map activity start` and
   `fit-map activity seed` per spec.md:898–902), `--evidenced`
   produces populated evidenced depths.
5. `bunx fit-summit growth platform --outcomes --roster … --data …`
   attaches driverContext to recommendations whose skills match a
   driver.
6. `--format json` for evidenced views includes both `derivedDepth` and
   `evidencedDepth` per spec.md:809–810.

## Commit

```
feat(summit): add evidence decorator and outcome weighting for coverage/risks/growth
```

## Risks

- **Supabase dependency weight.** `@supabase/supabase-js` pulls in a
  non-trivial tree. Summit's core commands still must not require it
  — the import must be lazy or conditional. Guard with:
  ```js
  async function maybeLoadSupabase() {
    return import("@supabase/supabase-js"); // only loaded when --evidenced/--outcomes
  }
  ```
  and wrap `createSummitClient` to use the dynamic import. This keeps
  cold-start cost low for core commands.
- **Degraded modes multiply.** `--evidenced` has three failure modes:
  no env vars, connection failed, empty evidence. Each needs a distinct
  error message. Test each path.
- **Privacy at director audience.** Evidenced depth reveals individual
  practice patterns. At director audience, `evidencedHolders` must be
  dropped, leaving only aggregate counts. Enforce in the formatter.
- **Trajectory with evidence is a simplification.** See note in
  "commands/trajectory.js" above — the formatter footnote documents
  the limitation so users aren't misled.
- **Outcome weighting can push a coverage-strengthening recommendation
  above a critical gap.** Don't allow this. The impact tier hierarchy
  stays critical > SPOF > coverage regardless of driver score; outcome
  weighting only breaks ties within a tier.

## Notes for the implementer

- Keep the evidence and outcomes code behind the flag. Do not let
  these paths run as the default for any command.
- The `maybeLoadSupabase` dynamic-import trick must actually work — a
  test ensures that a fresh process running `fit-summit coverage`
  without `--evidenced` never requires `@supabase/supabase-js`.
- Document the `lookbackMonths` option in the command help text; it's
  on the `options` table in bin/fit-summit.js (as a number-valued
  string option).
- This part ends with a release-ready `summit@0.2.0` cut. Part 08
  owns the actual release workflow call-out.
