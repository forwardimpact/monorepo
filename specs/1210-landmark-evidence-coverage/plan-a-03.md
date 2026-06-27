# Plan 1210-a Part 03: Artifact-driven producer

Add `transform/evidence-artifact.js` as the new sibling producer that
reads `github_artifacts`, derives the persona's marker matrix from
pathway data, applies the design's bounded heuristic, and emits rows
tagged `provenance: "artifact_interpreted"`. Wire it into the
orchestrator before the round-robin pass. Add unit tests against the
heuristic and a fresh-install e2e harness that asserts criteria 1 + 6.

Libraries used: libskill (`deriveSkillMatrix`).

## Step 3.1 — New producer module

Created: `products/map/src/activity/transform/evidence-artifact.js`

### Read path

The producer reads two tables and the in-memory `mapData` passed by
the orchestrator (Step 3.2):

```js
// Step 1: artifacts joined to org people for profile context.
// Use a left-join (no !inner) — artifacts whose email has not
// loaded into organization_people yet should still be retained so
// the harness can count them in the denominator; rows without a
// matching org row contribute to denominator coverage but cannot
// produce interpreted evidence (no profile → no skill matrix).
// supabase-js expresses the join via the nested select syntax used
// by products/map/src/activity/queries/evidence.js:19:
const { data: rows, error } = await supabase
  .from("github_artifacts")
  .select(`
    artifact_id, email, repository, artifact_type, metadata, occurred_at,
    organization_people(discipline, level, track)
  `)
  .not("email", "is", null);
if (error) throw new Error(`evidence-artifact: ${error.message}`);

// Track skipped personas so the result.skipped counter is accurate.
let skipped = 0;
for (const row of rows ?? []) {
  if (!row.organization_people) {
    skipped++; // no profile; cannot derive matrix
    continue;
  }
  // ...heuristic logic
}
```

Each returned row carries the persona's
`organization_people.{discipline, level, track}` (string IDs). Group
the returned rows by `email` so the heuristic runs per-persona — Rule
3's per-`(repo, skill)` floor applies within a single persona's
repos, not across personas; cross-persona row leakage would
double-count repositories and break criterion 1's per-persona
verification.

### Profile → matrix resolution

`deriveSkillMatrix` from
`libraries/libskill/src/derivation.js:180-186` expects discipline /
level / track *objects*, not string IDs. The producer resolves them
once per unique `(discipline, level, track)` triple seen in the joined
rows:

```js
function resolveProfileObjects(personRow, mapData) {
  const discipline = (mapData.disciplines ?? []).find(
    (d) => d.id === personRow.discipline,
  );
  const level = (mapData.levels ?? []).find((l) => l.id === personRow.level);
  const track = personRow.track
    ? (mapData.tracks ?? []).find((t) => t.id === personRow.track)
    : null;
  if (!discipline || !level) return null; // skip persona; record as skipped
  return { discipline, level, track };
}
```

For each unique resolved profile, call:

```js
const matrix = deriveSkillMatrix({
  discipline,
  level,
  track,
  skills: mapData.skills,
  capabilities: mapData.capabilities,
});
```

The matrix entries carry `skillId`, `skillName`, and `proficiency`.
For each entry, look up `skill.markers?.[proficiency]` (shape
`{ human: string[], agent: string[] }` per
`products/map/src/validation/skill.js:316-335` + the marker layout in
`products/map/starter/capabilities/delivery.yaml:46-66`). Flatten to a
single ordered list of marker strings for the heuristic.

### Heuristic emit

For each `(persona, repository)` pair the persona has artifacts in,
for each matrix entry's marker list:

1. **Rule 1 (token-overlap threshold).** Marker keywords are the
   marker text tokenised on whitespace, lowercased, stop-words removed,
   tokens of length <4 dropped. Artifact text surface is `title + body`
   for PRs, `body` for reviews, `message` for commits. A marker
   matches an artifact when ≥2 distinct keywords appear in the
   artifact's text surface.
2. **Rule 2 (per-artifact ceiling).** No more than one row per
   `(artifact_id, skill_id)`.
3. **Rule 3 (per-`(repo, skill)` floor).** For each `(repository,
   skill_id)` pair where the persona has ≥1 artifact in that
   repository, emit at least one row. Selection: pick the
   `(artifact, marker)` pair with the highest token-overlap score; on
   a tie or zero overlap, pick the lexicographically earliest marker
   text and the chronologically earliest artifact.

### Write path

Per-class delete + upsert:

```js
await supabase
  .from("evidence")
  .delete()
  .eq("provenance", "artifact_interpreted");

await supabase.from("evidence").upsert(rows, {
  onConflict: "artifact_id,skill_id,level_id,marker_text",
  ignoreDuplicates: true,
});
```

Heuristic (verbatim from design § Artifact-driven producer):

- **Tokenisation.** Marker keywords are the marker text tokenised on
  whitespace, lowercased, stop-words removed, tokens of length <4
  dropped. Artifact text surface is `title + body` for PRs, `body` for
  reviews, `message` for commits.
- **Rule 1 (token-overlap threshold).** A marker matches an artifact
  when ≥2 distinct keywords appear in the artifact's text surface.
- **Rule 2 (per-artifact ceiling).** No more than one row per
  `(artifact_id, skill_id)`.
- **Rule 3 (per-`(repo, skill)` floor).** For each `(repository,
  skill_id)` pair where the persona has ≥1 artifact in that repository,
  emit at least one row. Selection: pick the
  `(artifact, marker)` pair with the highest token-overlap score;
  on a tie or zero overlap, pick the lexicographically earliest marker
  text and the chronologically earliest artifact.

Row shape:

```js
// for rows scored ≥2 keywords (Rule 1 hit):
{
  artifact_id,
  skill_id,
  level_id: matrixEntry.proficiency,
  marker_text: marker, // verbatim from the matrix marker array
  matched: true,
  rationale: `Token-overlap score ${score}; ${matchedKeywords.length} keywords matched: ${matchedKeywords.join(", ")}.`,
  provenance: "artifact_interpreted",
  created_at: artifact.occurred_at,
}

// for rows fired by Rule 3 alone (per-(repo, skill) floor, no Rule 1 match):
{
  artifact_id,
  skill_id,
  level_id: matrixEntry.proficiency,
  marker_text: marker,
  matched: true,
  rationale: `Structural floor: persona has artifacts in ${repository} but no marker scored ≥2 keywords against this skill; row emitted to satisfy the per-repo, per-skill floor.`,
  provenance: "artifact_interpreted",
  created_at: artifact.occurred_at,
}
```

The two rationale shapes are distinct prefixes (`Token-overlap` vs
`Structural floor`); a reader of `fit-landmark evidence` can tell at
a glance whether a row reflects a real Rule 1 interpretation or the
floor-only guarantee. Both rows are honestly tagged
`provenance: "artifact_interpreted"` — the provenance class names the
producer, not the producer's confidence (criterion 2's three-class
set is at the provenance level, not the rationale level; finer
gradation lives in the rationale prefix without breaking the spec
contract).

`created_at` uses `artifact.occurred_at` to match the round-robin
producer's `ev.observed_at` semantics — both bucket evidence to the
quarter the *artifact* happened (`groupEvidenceByQuarter` at
`products/landmark/src/lib/evidence-helpers.js:33-41` is the consumer).
The two producers therefore land rows for the same artifact in the
same quarter regardless of which path wrote it.

Stop-words list (one place, keep small):

```js
const STOP_WORDS = new Set([
  "the","and","for","with","that","this","from","into","over","under",
  "have","been","were","will","would","could","should","your","their",
  "about","after","before","while","because","when","where","what",
]);
```

Notes:

- The function exports `transformEvidenceArtifact(supabase, { mapData })`
  to mirror the existing `transformEvidence(supabase)` signature plus
  the one collaborator the new producer needs.
- **Return shape**: `{ inserted: number, skipped: number, errors: string[] }`
  — same shape as `transformEvidence` (per
  `products/map/src/activity/transform/evidence.js:7-12` JSDoc). The
  orchestrator's `transformAllTargets` summing accumulator (Step 3.2 #3)
  and the `TRANSFORM_TARGETS["evidence-artifact"].summarize` reducer
  (Step 3.2 #4) both depend on this shape; the producer must conform.
  `skipped` is the count of artifacts whose persona could not be
  resolved (no `organization_people` row OR
  `discipline`/`level` not in `mapData`); `errors` is the list of
  surfaced supabase errors.
- The pure helpers (`tokeniseMarker`, `tokeniseArtifact`,
  `scoreMarkerAgainstArtifact`, `pickFloorRow`) are kept in the same
  file as exported functions so the unit tests can drive them directly
  without paying the supabase setup cost.
- `marker_text` is the verbatim marker string from the standard
  vocabulary; this keeps the round-robin/artifact-driven `marker_text`
  shapes disjoint (round-robin emits artifact titles / messages /
  fallback strings).

Verify: `git diff products/map/src/activity/transform/evidence-artifact.js`
shows a single new file; no test stubs leaked into the source module.

## Step 3.2 — Orchestrator wires the new producer

Modified:

- `products/map/src/activity/transform/index.js`
- `products/map/src/commands/activity.js` (`transformAllTargets`,
  `TRANSFORM_TARGETS`, `transform`, AND `seed` — the seed command at
  `products/map/src/commands/activity.js:196,234,257` invokes
  `transformAll(supabase, runtime)` and reports `result.evidence` only;
  the plan must thread `mapData` into the seed call and add a parallel
  `evidenceArtifact` report there, or `fit-map activity seed`'s post-
  seed summary silently omits the new producer)
- `products/map/bin/fit-map.js`

```js
import { transformAllGitHub } from "./github.js";
import { transformAllGetDX } from "./getdx.js";
import { transformPeople } from "./people.js";
import { transformEvidenceArtifact } from "./evidence-artifact.js";
import { transformEvidence } from "./evidence.js";

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {import('@forwardimpact/libutil/runtime').Runtime} runtime
 * @param {object} [collaborators]
 * @param {object} [collaborators.mapData] - Standard data; required for
 *   the artifact-driven evidence producer. When omitted, that producer
 *   is skipped.
 */
export async function transformAll(supabase, runtime, { mapData } = {}) {
  const people = await transformPeople(supabase, runtime);
  const getdx = await transformAllGetDX(supabase, runtime);
  const github = await transformAllGitHub(supabase);
  let evidenceArtifact = { inserted: 0, skipped: 0, errors: [] };
  if (mapData) {
    evidenceArtifact = await transformEvidenceArtifact(supabase, { mapData });
  }
  const evidence = await transformEvidence(supabase);

  return { people, getdx, github, evidenceArtifact, evidence };
}
```

### Thread `mapData` through the call chain

`transformAll`'s two call sites today
(`products/map/src/commands/activity.js:74,234`) pass `(supabase, runtime)`
only. The plan threads `mapData` through:

1. **bin/fit-map.js `dispatchActivity` `case "transform"`.** Today
   reads:

   ```js
   case "transform":
     return activity.transform(rest[0] ?? "all", await mapClient(), runtime);
   ```

   Change to (loader-load is gated on targets that need `mapData`):

   ```js
   case "transform": {
     const target = rest[0] ?? "all";
     let mapData;
     if (target === "all" || target === "evidence-artifact") {
       const dataDir = await findDataDir(values.data, runtime);
       const { createDataLoader } = await import("../src/index.js");
       const loader = createDataLoader(runtime);
       mapData = await loader.loadAllData(dataDir);
     }
     return activity.transform(target, await mapClient(), runtime, { mapData });
   }
   ```

   The gate avoids paying the `loadAllData` parse cost when the
   target is `people`, `getdx`, `github`, or `evidence` — none of
   them need the pathway data.

   `findDataDir` is a module-scope import at line 16; `createDataLoader`
   is **not** — fit-map.js obtains it via the existing dynamic-import
   pattern at lines 246-253 + 299-304 (the `runValidate` and
   `runExport` paths already do this). The case branch repeats that
   pattern; do not hoist the import — it preserves the cold-start cost
   for non-transform dispatches.

2. **`activity.transform(target, supabase, runtime, { mapData })`.** Add the
   fourth parameter; thread it into both branches:

   ```js
   export async function transform(target, supabase, runtime, { mapData } = {}) {
     if (target === "all" || target === undefined) {
       return transformAllTargets(supabase, runtime, { mapData });
     }
     // ... evidence + evidence-artifact targets handled via TRANSFORM_TARGETS
   }
   ```

3. **`transformAllTargets(supabase, runtime, { mapData })`.** Pass
   `{ mapData }` into the orchestrator's third argument; add a
   per-target report for `evidence-artifact`:

   ```js
   async function transformAllTargets(supabase, runtime, { mapData } = {}) {
     const summary = makeSummary(runtime);
     const r = await transformAll(supabase, runtime, { mapData });
     // existing reports for people, getdx, github, evidence
     report(
       summary,
       "evidence-artifact",
       {
         inserted: r.evidenceArtifact.inserted,
         skipped: r.evidenceArtifact.skipped,
         errors: r.evidenceArtifact.errors.length,
       },
       r.evidenceArtifact.errors.length === 0,
     );
     const totalErrors =
       r.people.errors.length +
       r.getdx.errors.length +
       r.github.errors.length +
       r.evidence.errors.length +
       r.evidenceArtifact.errors.length;
     return totalErrors === 0 ? 0 : 1;
   }
   ```

4. **`TRANSFORM_TARGETS` adds an `evidence-artifact` entry.**
   `fit-map activity transform evidence-artifact` becomes a runnable target for
   partial reruns:

   ```js
   const TRANSFORM_TARGETS = {
     // ...existing
     evidence: {
       fn: transformEvidence,
       summarize: (r) => ({ inserted: r.inserted, skipped: r.skipped, errors: r.errors.length }),
     },
     "evidence-artifact": {
       fn: (supabase, runtime, deps) => transformEvidenceArtifact(supabase, { mapData: deps?.mapData }),
       summarize: (r) => ({ inserted: r.inserted, skipped: r.skipped, errors: r.errors.length }),
     },
   };
   ```

   Update the single-target dispatch line in `transform` to pass the third
   `{ mapData }` argument to `cfg.fn`:

   ```js
   const r = await cfg.fn(supabase, runtime, { mapData });
   ```

   `transformPeople`, `transformAllGetDX`, `transformAllGitHub`, and
   `transformEvidence` all ignore extra positional arguments today; the new
   third arg is harmless for them.

5. **`seed` command** (`activity.js:196-265`). Thread `mapData` into the
   `transformAll` call (`activity.js:234`) and add a parallel `evidenceArtifact`
   report alongside the existing `result.evidence` report
   (`activity.js:257-261`). `seed` is callable as `fit-map activity seed` and is
   wired in `bin/fit-map.js` at `dispatchActivity` `case "seed"`; thread
   `mapData` there too via the same dynamic-import pattern as the transform
   case:

   ```js
   case "seed": {
     const dataDir = await findDataDir(values.data, runtime);
     const data = dirname(dataDir);
     const { createDataLoader } = await import("../src/index.js");
     const loader = createDataLoader(runtime);
     const mapData = await loader.loadAllData(dataDir);
     return activity.seed({ data, supabase: await mapClient(), runtime, mapData });
   }
   ```

   `activity.seed({ data, supabase, runtime, mapData })` passes `{ mapData }`
   into `transformAll(supabase, runtime, { mapData })`.

6. **Ordering**: `transformAllGitHub` first (populates
   `github_artifacts`), then `transformEvidenceArtifact` (writes
   `artifact_interpreted` rows), then `transformEvidence` (round-robin;
   its `upsert(..., { ignoreDuplicates: true })` is the guard if a key
   collision happens). This matches design § Determinism rule 2.

7. **Fall-back when `mapData` is absent**: the orchestrator's
   `{ mapData } = {}` guard skips the artifact-driven producer and
   returns the zero-result. This keeps the Edge Function path
   (`products/map/supabase/functions/transform/index.ts` — pre-existing
   single-arg call) functional without forcing it to load `mapData`;
   the Edge Function will silently skip the new producer until a
   follow-on lands the loader there. **This is not a clean-break
   violation**: the artifact-driven producer is a clean extension on
   top of round-robin, not a wrapper around it; the Edge Function
   path's `mapData` gap is pre-existing
   (`transformPeople(supabase, undefined)` already passes `runtime`
   as undefined there). File a follow-on Issue at PR open referencing
   spec 1210 + the Edge Function gap so the loader-threading task
   doesn't get lost; cite the Issue number in the commit body.

Verify: `git diff products/map/src/activity/transform/index.js` shows the
import, the parameter add, the new ordered call, and the return-object
addition.

## Step 3.3 — Unit tests

Created: `products/map/test/activity/transform-evidence-artifact.test.js`

Cases:

1. **Rule 1 (≥2 keyword threshold) selects matching pairs.** Build a
   fake supabase that returns 3 artifacts and a `mapData` with a
   single skill carrying a marker text whose two-keyword tokens appear
   in artifact 1 and 3 but not artifact 2. Assert only artifact 1 and
   artifact 3 produce rows for that skill.
2. **Rule 2 (per-artifact ceiling).** Build inputs where the same
   artifact's text surface matches three distinct markers for the same
   skill. Assert exactly one row per `(artifact_id, skill_id)`; the
   selected marker is the highest-score one with lexicographic
   tie-break.
3. **Rule 3 (per-`(repo, skill)` floor fires unconditionally).**
   Build inputs where the persona has 2 artifacts in repository
   `mes-connector` and 1 marker for skill `task_completion` but the
   artifact texts share zero keywords with the marker. Assert exactly
   one row is emitted for `(mes-connector, task_completion)` with the
   chronologically earliest artifact and the lexicographic marker
   tie-break.
4. **Per-class DELETE narrows correctly.** Drive the producer twice
   against the same input; assert the second call's `.delete()` chain
   filters by `provenance = "artifact_interpreted"` (not by every row).
5. **Tokenisation rules.** Drive `tokeniseMarker("Delivered a small
   feature end-to-end with minimal rework")`; assert the output drops
   tokens of length <4 and the stop-word set; result is exactly the
   set design § Artifact-driven producer rule 1 specifies.
6. **Determinism on rerun (criterion 6 unit-scope).** Drive the
   producer twice against the same fake inputs; assert the projected
   `(artifact_id, skill_id, level_id, marker_text, matched, provenance)`
   set is equal between the two `upsert` calls.

Hand-roll the fake supabase the same way `transform-evidence.test.js`
does (the existing mock doesn't cover the join chain we need).

Verify:
`bun test products/map/test/activity/transform-evidence-artifact.test.js` passes
all six cases.

## Step 3.4 — Criteria 1 + 6 verification harness

Created: `products/map/test/activity/transform-evidence-bionova.test.js`

The harness is a **contract test**, not an integration test — it does
not require a live supabase. It exercises both producers against an
in-memory fixture that mirrors the BioNova persona's shape from
`data/synthetic/story.dsl`. This keeps the test runnable in `bun test`
on every PR while still verifying the spec's success criteria.

Shape:

1. Load `products/map/starter/` via `loader.loadAllData(...)` to get
   the real `mapData` (disciplines, levels, tracks, skills,
   capabilities).
2. Build a fake supabase client (hand-rolled, same pattern as
   `transform-evidence.test.js` Step 2.2):
   - `github_artifacts` returns a fixture set: for the BioNova persona
     `daedalus@bionova.example` (discipline `data_engineering`, level
     `J080`), 15 PR + review + commit artifacts split across the two
     `manufacturing_it` repos (`mes-connector`, `scada-bridge`) with
     titles + bodies drawn from `data/synthetic/story.dsl` (e.g.
     `"feat(mes-connector): v2 schema cutover for line monitors"`).
     The fixture explicitly mirrors story.dsl so the asserted ratio
     reflects the persona the spec names. Capture the artifact array
     in a local const so the assertion phase can join captured
     evidence rows back to `repository` via `artifact_id` lookup.
   - `organization_people` returns one row for `daedalus@bionova.example`
     with `discipline: 'data_engineering'`, `level: 'J080'`,
     `track: null` so the producer's join chain (see Step 3.1 § Read
     path) resolves the profile.
   - `storage.from("raw").download("getdx/evidence.json")` returns a
     small JSON payload `{ evidence: [...] }` containing 3-4
     persona-matching rows from the BioNova story so the round-robin
     half of the harness emits non-zero `synthetic_placeholder` rows;
     the round-robin coverage augments the artifact-driven coverage
     toward the ≥30% target. Reuse `createMockSupabaseClient`'s
     `storage` mock from `@forwardimpact/libmock` as
     `transform-evidence.test.js` does.
   - `evidence` `.delete()`, `.upsert()`, `.select()` chains: record
     calls for assertion.
3. Run `transformEvidenceArtifact(supabase, { mapData })` once, then
   `transformEvidence(supabase)` once (order matches the orchestrator).
4. Capture the union of upserted rows. Replay step 3 a second time.

Assertions:

- **Criterion 1(a) ratio target.** Compute
  `coverage = computeCoverageRatio(allArtifacts, allArtifacts.filter(a => !scoredIds.has(a.artifact_id)))`
  from `evidence-helpers.js:114-120` using the captured rows. Assert
  `coverage.ratio >= COVERAGE_CONFIDENCE_FLOOR` (`0.30`).
- **Criterion 1(b) ≥14 artifact-interpreted rows.** Assert the captured row set
  contains `>=14` rows whose `provenance === "artifact_interpreted"`.
  Round-robin `synthetic_placeholder` rows do **not** count toward this
  threshold — the count predicate filters on provenance class.
- **Criterion 1(c) per-`(repo, skill)` floor.** Captured evidence rows carry
  `artifact_id` but not `repository`; join back to the fixture artifact array
  (`artifactsById = new Map(fixtureArtifacts.map(a => [a.artifact_id, a]))`) and
  project on `(artifactsById.get(row.artifact_id).repository, row.skill_id)` for
  `row.provenance === "artifact_interpreted"`; assert at least one row exists
  for each of `("mes-connector", *)` and `("scada-bridge", *)` for at least one
  skill in the persona's matrix.
- **Criterion 6 determinism.** Project both run captures on
  `(artifact_id, skill_id, level_id, marker_text, matched, provenance)`;
  assert the two sets are equal.

Notes:

- The harness uses `transformEvidenceArtifact` + `transformEvidence`
  directly (the producers exposed in their modules), not the
  orchestrator, so the criterion 6 assertion exercises the per-class
  DELETE + ON CONFLICT contract without needing the bin/CLI runtime.
- A separate `transform-evidence-bionova.integration.test.js` is
  **not** added; the spec's criterion 1 verification recipe (`npx
  fit-landmark coverage --email daedalus@bionova.example` against a
  fresh `fit-map init` + `fit-terrain build`) is a manual smoke an
  operator runs once per release to confirm the end-to-end path. The
  manual recipe is documented in this part's commit body for the
  release-engineer's reference.
- The harness is the only automated path that asserts criterion 1(c)
  end-to-end; if the fixture's keyword overlap with starter markers is
  weak, the per-`(repo, skill)` floor (Rule 3) absorbs the gap so
  the assertion still holds.

## Verification

```text
bun test products/map
```

All six unit cases plus the BioNova contract test pass. The producer
contract holds against a fixture that mirrors the BioNova persona's
shape from `data/synthetic/story.dsl`. Manual e2e against
`fit-landmark coverage --email daedalus@bionova.example` is recorded in
the commit body for the release-engineer to run once per release.
