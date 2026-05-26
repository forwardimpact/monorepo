# 330 — libskill API Cleanup — Plan

## Approach

The spec identifies 15 defects (C1–C6, M1–M6, H1–H3) in a single library. The
safe and efficient approach is **one library, several small PRs, landed in a
deliberate order**. Bundling everything into one PR would be too large to review
and would tangle correctness fixes with surface changes; doing each item as its
own PR multiplies review cost and merge conflicts across 26 consumers.

The guiding order is: **correctness first, then architecture, then surface, then
housekeeping.** Each phase is independently landable and leaves the tree in a
better state than it found it. Inside each phase, items are sequenced so that
earlier items enable later ones without rebase pain.

Phases:

1. **Correctness fixes** (C1, C2, C5) — bugs that have shipped. Small, surgical.
2. **Remove duplication** (C3, C6, M4, M3) — collapse the accidental copies so
   subsequent refactors only touch one body of code.
3. **Architecture fix** (C4) — remove the module-level cache, align with the
   pure-function exemption.
4. **API shape** (M1, M2, M5, M6) — one call convention, one way to do things.
5. **Surface reduction** (H1, H2, H3) — shrink the index, pick one import
   convention.

Every phase keeps the library's observable behaviour stable for correct callers.
C1 and C2 change behaviour for two specific buggy call sites — that is
intentional and must be covered by tests.

**Risk headline:** C4 (removing the module-level cache) is the only step with
meaningful blast radius — it changes a signature consumers import today and
forces `pathway` to hold a cache at its composition root. Every other step is
either internal, additive, or mechanical.

## Ground rules

- **One phase per PR.** Phases are independently reviewable; do not bundle.
- **Tests green at every phase boundary.** Run `bun run test` and
  `bun run check` before each commit. The cross-monorepo test suite under
  `tests/model-*.test.js` exercises libskill through its consumers — trust it.
- **No TypeScript migration.** JSDoc stays; only the `import()` targets change.
- **No behaviour changes outside the documented bug fixes.** If a refactor
  produces a different result for a correct input, stop and reconsider.
- **Keep the `@forwardimpact/libskill` public surface honest**: anything that
  stops being exported from the root `index.js` must have zero external
  consumers (verified by grep across `products/`, `services/`, `tests/`).

## Phase 1 — Correctness fixes

### Step 1.1 — Fix `estimateBestFitLevel` signature (C2)

**Files:** `libraries/libskill/matching.js`,
`libraries/libskill/matching-development.js`, relevant matching tests under
`libraries/libskill/test/` and `tests/model-matching-*.test.js`.

**Change:** At `matching.js:397`, the destructured parameter `_skills` is
intentionally unused but the JSDoc still advertises `params.skills`. The
function body relies only on `selfAssessment.skillProficiencies`. Two options:

- **(A) Remove the vestigial parameter.** Drop `_skills` from the destructure,
  drop `@param skills` from the JSDoc, and update the one call site at
  `matching-development.js:312` to stop passing `skills`.
- **(B) Wire the skills through.** Use the `skills` list to look up each
  assessed skill's capability and weight the average by skill type. This is real
  logic, not a signature fix, and should not land silently under a cleanup spec.

**Decision: take option (A).** The spec's framing is "signature matches its
callers"; a design change belongs in its own spec. If anyone wants the weighted
version, it is a fresh proposal.

**Verification:** `bun run test` — existing tests at
`tests/model-matching-*.test.js` should continue to pass. Grep for
`estimateBestFitLevel` across the repo; update any test that still passes
`skills:`.

### Step 1.2 — Fix `getOrCreateJob` cache key (C1)

**Files:** `libraries/libskill/job-cache.js`,
`libraries/libskill/test/job-cache.test.js` (or whichever test file covers it).

**Change:** Expand `buildJobKey` to include the contribution of `capabilities`
and `validationRules` so that two calls for the same discipline × level × track
but with different derivation inputs cannot collide.

Concretely, the cache key should be a stable stringification of the full set of
derivation-affecting inputs:

```js
// before
export function buildJobKey(disciplineId, levelId, trackId = null) {
  if (trackId) return `${disciplineId}_${levelId}_${trackId}`;
  return `${disciplineId}_${levelId}`;
}

// after
export function buildJobKey({
  disciplineId,
  levelId,
  trackId = null,
  capabilityIds = null,
  validationRulesHash = null,
}) {
  const parts = [disciplineId, levelId, trackId ?? "-"];
  if (capabilityIds?.length) parts.push(`caps:${capabilityIds.join(",")}`);
  if (validationRulesHash) parts.push(`rules:${validationRulesHash}`);
  return parts.join("_");
}
```

Update `getOrCreateJob` and `invalidateCachedJob` to pass the richer key. The
`capabilityIds` is derived from the `capabilities` array (stable
`.map(c => c.id).sort()`); `validationRulesHash` is a cheap string hash of
`JSON.stringify(validationRules ?? null)`.

**Note:** This step ships the immediate fix but leaves the module-level cache in
place. Phase 3 removes the cache entirely; the fix here ensures the cache is at
least sound until then so that Phase 3 can be reverted if it uncovers problems
without leaving C1 unfixed.

**Test:** Add a focused regression test that calls `getOrCreateJob` twice for
the same discipline × level × track, once with capabilities and once without,
and asserts that `derivedResponsibilities` is populated on the capability call
regardless of the order of the two calls.

### Step 1.3 — Repoint JSDoc type references (C5)

**Files:** `derivation.js`, `derivation-validation.js`,
`derivation-responsibilities.js`, `modifiers.js`, `interview.js`,
`interview-specialized.js` (six files, ~81 occurrences).

**Change:** Replace `import('./levels.js')` with
`import('@forwardimpact/map/levels')` across all six files. The target module
exists at `libraries/libskill/node_modules/@forwardimpact/map/src/levels.js` and
is exported as `./levels` from the map package. All the type names libskill
references (`Discipline`, `Level`, `SkillMatrixEntry`, etc.) live there.

This is a mechanical global replacement. A single `sed`-style pass is fine but
drive it through the Edit tool with `replace_all: true` so the diff is
reviewable file-by-file.

**Verification:** Open any libskill file in the editor and hover a `@param` —
types should resolve. There is no formal type-check command in the monorepo, but
`bun run check` will catch any JSDoc syntax errors introduced by the
replacement.

**Ship Phase 1 as one PR:
`fix(libskill): correctness and type reference repairs (330)`.**

## Phase 2 — Remove duplication

### Step 2.1 — Delete orphaned `products/pathway/src/lib/job-cache.js` (C6)

**Files:** `products/pathway/src/lib/job-cache.js` (delete),
`products/pathway/src/index.html`, `handout.html`, `slides.html` (verify import
map entries still resolve).

**Change:** Confirm no file imports from `products/pathway/src/lib/job-cache.js`
directly (grep `src/lib/job-cache`). The three HTML files use
`@forwardimpact/libskill/job-cache` via their import map, which
`commands/dev.js:162` serves from `modelLibDir` — i.e., from the libskill
package. Deleting the pathway-local copy changes nothing for the dev server or
for built consumers.

Delete the file. Leave the import map entries alone — they already point at
libskill.

**Verification:** `bunx fit-pathway` dev and build commands still serve the
pages. `bun run test` still passes.

### Step 2.2 — Collapse duplicated agent helpers (C3)

**Files:** `libraries/libskill/agent.js`, `libraries/libskill/agent-stage.js`,
`libraries/libskill/index.js`.

**Current state (verified):**

- `agent.js:101` exports `deriveAgentSkills`.
- `agent.js:116` exports `deriveAgentBehaviours`.
- `agent.js:202` exports `deriveStageTransitions`.
- `agent-stage.js:90` redefines `deriveAgentSkills` (local, not exported).
- `agent-stage.js:105` redefines `deriveAgentBehaviours` (local, not exported).
- `agent-stage.js:122` **also exports** its own `deriveStageTransitions`.
- `index.js:111` exports `deriveStageTransitions` from `agent.js`.
- Internal callers inside `agent-stage.js` use the local copies, not the
  `agent.js` versions.

**Change:**

1. Delete the three local/duplicate definitions in `agent-stage.js` (lines ~90,
   ~105, ~122).
2. Import the three functions from `./agent.js` at the top of `agent-stage.js`.
3. Leave `agent-stage.js`'s internal call sites unchanged — they now resolve to
   the imports, which are the canonical definitions.
4. Remove `deriveStageTransitions` from `agent-stage.js`'s exports so `index.js`
   has only one source of truth (check no consumer imports it from the subpath;
   grep `libskill/agent-stage`).

**Why this order:** deleting the duplicates first (before Phase 3's cache work
or Phase 4's signature changes) means any later refactor only needs to touch the
canonical definitions. If both copies still exist when Phase 4 changes a
signature, we risk drift.

**Verification:** Every agent/test that previously passed
(`tests/model-agent.test.js` and libskill's internal agent tests) must still
pass. Diff `bunx fit-pathway agent --list` before/after to confirm no output
change.

### Step 2.3 — Unify job-key generation (M4)

**Files:** `libraries/libskill/derivation.js`,
`libraries/libskill/job-cache.js`.

**Change:** At `derivation.js:300` there is a private `generateJobId` producing
`${discipline.id}_${level.id}_${track.id}`. In Phase 1 Step 1.2, we rewrote
`buildJobKey` to take an object. We now have two different formats that both
encode "job identity."

Decision: keep the simple id-string format as `generateJobId` for human-facing
job IDs (what shows up in output files, URLs, and slugs), and keep `buildJobKey`
as the internal cache-key function for cache-invalidation semantics. They are
not the same concept — conflating them was the M4 smell, but unifying them would
mean cache keys leak into user-facing IDs.

Instead:

1. Move `generateJobId` to `job-cache.js` (or a new `job-id.js`) and export it
   from there, so the two functions live next to each other and any future drift
   is visible.
2. Have `derivation.js` import it.
3. Add a comment at both definitions naming the other ("for the internal cache
   key, see `buildJobKey`" / "for the user-facing job id, see `generateJobId`").

**Verification:** Grep for `generateJobId` usage — it should now all come from
the new location. Snapshot tests under `products/pathway/test` that emit job ids
must be unchanged.

### Step 2.4 — Share iteration between `generateAllJobs` and `findMatchingJobs` (M3)

**Files:** `libraries/libskill/derivation.js`, `libraries/libskill/matching.js`.

**Change:** Extract the `disciplines × levels × tracks` iteration into a private
helper in `derivation.js`:

```js
// returns an array of { discipline, level, track } triples that pass validation
function* iterateValidJobCombinations({
  disciplines, levels, tracks, skills, behaviours, validationRules,
}) { ... }
```

Have `generateAllJobs` call this generator and `deriveJob` on each triple. Have
`findMatchingJobs` call `generateAllJobs` and score each returned job.

**Decision:** use `generateAllJobs` as the entry point, not the generator
directly, because `findMatchingJobs` wants fully-derived jobs to score, not just
triples — and `generateAllJobs` already does the derivation. The generator is
for internal use only; do not export it.

**Watch out:** the spec notes that `findMatchingJobs` currently uses a different
inner-loop order (trackless-first, then tracked). If that order affects pre-sort
output, the refactor will change result ordering even when scoring is stable.
Verify snapshot tests at `tests/model-matching-*.test.js`; if order changes,
sort results explicitly inside `findMatchingJobs` to preserve the public output.

**Verification:** Same match scores, same sort order.
`tests/model-matching-core.test.js` and `tests/model-matching-realistic.test.js`
must be unchanged.

**Ship Phase 2 as one PR: `refactor(libskill): remove duplication (330)`.**

## Phase 3 — Remove module-level cache (C4)

This is the most invasive phase and warrants its own PR.

### Step 3.1 — Audit current `job-cache` consumers

**Grep targets:**

- `getOrCreateJob` → expect hits in
  `products/pathway/src/formatters/{progress,interview}/shared.js` and possibly
  more.
- `clearCache` → expect hits in libskill's own tests.
- `invalidateCachedJob`, `getCachedJobCount`, `buildJobKey` → note each site.

Record the complete call graph in the PR description so reviewers can see the
blast radius.

### Step 3.2 — Introduce `createJobCache()` factory

**File:** `libraries/libskill/job-cache.js`.

**Change:** Replace the module-level `Map` with a factory that returns an
instance:

```js
export function createJobCache() {
  const cache = new Map();
  return {
    getOrCreate(params) { ... },
    invalidate(params) { ... },
    clear() { ... },
    size() { return cache.size; },
  };
}
```

Keep the bare `buildJobKey` as a pure function export — it has no state.

Delete `getOrCreateJob`, `clearCache`, `invalidateCachedJob`,
`getCachedJobCount` from the module's exports. They are replaced by methods on
the cache instance.

**Decision:** export the factory, not a singleton. A singleton just relocates
the problem. The pathway product will create exactly one cache at its
composition root (`products/pathway/src/bin/fit-pathway.js` or equivalent) and
thread it through the command setup.

### Step 3.3 — Wire the factory through pathway

**Files:** `products/pathway/src/formatters/progress/shared.js`,
`products/pathway/src/formatters/interview/shared.js`, and whichever pathway
composition root creates the formatters.

**Change:** Each formatter currently calls `getOrCreateJob` as a free-standing
import. After this step it takes a `jobCache` parameter (or, for browser pages
served via import map, creates a module-level instance at the entry point —
browser contexts have no composition root in the same sense, and the isolation
guarantee applies per page load).

Concretely:

1. In the Node command path (`products/pathway/src/commands/*.js`), create one
   `jobCache` per command run and pass it into the formatter factories.
2. In the browser path (`products/pathway/src/pages/*.js`), create one
   `jobCache` at the top of each page module. This matches the lifecycle of a
   single page load and preserves current behaviour.
3. Update the `@forwardimpact/libskill/job-cache` subpath export to the new
   factory shape.

**Risk:** This is the step where tests may fail if any test was implicitly
relying on cache persistence between cases. The fix is to give each test its own
cache instance in a `beforeEach`. Any test that gets flakier from this change
was masking a bug.

### Step 3.4 — Update JSDoc and CLAUDE.md reference

**File:** `CLAUDE.md` (check the libskill exemption wording).

Libskill's pure-function exemption is now actually true. No change required if
the wording already reads "pure-function design" — it is no longer
counterfactual. Just confirm and move on.

**Ship Phase 3 as one PR:
`refactor(libskill): inject job cache instead of module state (330)`.** Tag the
PR description with a highlighted "blast radius" section so reviewers see which
consumers changed.

## Phase 4 — API shape alignment

### Step 4.1 — Unify parameter convention (M1)

**Rule:** destructured object for ≥2 arguments; positional only for unary
functions.

**Functions to migrate to destructured form:**

- `generateJobTitle(discipline, level, track)` →
  `generateJobTitle({ discipline, level, track })`
- `getNextLevel(level, levels)` → `getNextLevel({ level, levels })`
- `getPreviousLevel(level, levels)` → `getPreviousLevel({ level, levels })`
- `getSkillsByCapability(skills, capability)` →
  `getSkillsByCapability({ skills, capability })`
- Any other multi-arg positional function discovered during grep.

**Decision: no legacy-signature shims.** Per CLAUDE.md ("don't use feature flags
or backwards-compatibility shims when you can just change the code"), migrate
all call sites in the same PR. External consumers exist only through npm; they
pin versions and will see a clean minor version bump.

**Process:** For each function:

1. Rewrite the signature and body.
2. Grep the monorepo for call sites.
3. Migrate each call site.
4. Update JSDoc and tests.

**Verification:** `bun run check` and `bun run test` after each function. Commit
per function to keep the history bisectable.

### Step 4.2 — One way to pass level context to `isValidJobCombination` (M2)

**Files:** `libraries/libskill/derivation-validation.js`,
`libraries/libskill/derivation.js:334`, `libraries/libskill/matching.js:328`,
`libraries/libskill/progression.js:315`,
`products/pathway/src/formatters/progress/shared.js:37`.

**Change:** The function currently accepts `levels` at the top level and
`validationRules.levels` as a fallback. Canonicalize to the top-level `levels`
argument and remove the fallback.

Update all three internal call sites to stop passing `levels` inside
`validationRules`. Delete the pathway formatter's pass-through helper
(`isValidCombination`) — callers should use `isValidJobCombination` directly now
that its signature is honest.

**Verification:** Grep the repo for `validationRules?.levels` and
`validationRules.levels` — expect zero hits after the change. `bun run test`
still passes; the pathway formatter's progression output is unchanged.

### Step 4.3 — Wire `buildSkillTypeMap` into the hot path (or delete it) (M5)

**Files:** `libraries/libskill/derivation.js`.

**Change:** At `derivation.js:180`, `deriveSkillMatrix` calls
`getSkillTypeForDiscipline` in its inner loop, which does three `.includes()`
scans per call. `buildSkillTypeMap` exists specifically to eliminate these scans
but is never called here.

Decision: **wire it in.** Measuring a hot-path optimization only to delete it
would discard the reasoning that went into writing `buildSkillTypeMap` in the
first place, and the function has tests.

Concretely:

1. At the top of `deriveSkillMatrix`, build the type map once:
   `const typeMap = buildSkillTypeMap(discipline);`
2. Inside the loop, replace `getSkillTypeForDiscipline(discipline, skill.id)`
   with `typeMap.get(skill.id) ?? null`.
3. Remove `buildSkillTypeMap` from the root `index.js` (it becomes internal).
   Mark the function `@internal` in JSDoc.
4. Keep the existing test for `buildSkillTypeMap` but mark it as an internal
   helper test.
5. Verify with a spot check that `bun run test` is not measurably slower — the
   optimization should be neutral-to-better.

### Step 4.4 — Rework `applyFilters` (M6)

**Files:** `libraries/libskill/policies/filters.js`,
`libraries/libskill/policies/composed.js` (any caller), and the policy tests.

**Change:** Replace the probe-based detection at `filters.js:88` with a
tagged-operation design.

Introduce two small tags:

```js
const MATRIX_FILTER = Symbol("matrix-filter");
export function matrixFilter(fn) {
  fn[MATRIX_FILTER] = true;
  return fn;
}
```

In `applyFilters`, check `op[MATRIX_FILTER]` instead of probing:

```js
export function applyFilters(matrix, ...operations) {
  return operations.reduce((acc, op) => {
    if (op[MATRIX_FILTER]) return op(acc);
    return acc.filter(op);
  }, matrix);
}
```

Wrap the existing matrix filters (`filterHighestLevel`, `filterAboveAwareness`,
and any others defined in `filters.js`) with `matrixFilter(...)` at their
definition site. Predicates (`isPrimary`, `isSecondary`, `hasMinLevel`, etc.)
need no change — absence of the tag is the default.

**Why the tag approach over splitting the API:** callers today compose
predicates and matrix filters in a single list (see uses of `applyFilters` in
`policies/composed.js`). Splitting into `applyPredicates` + `applyMatrixFilters`
would force callers to pre-partition their operations, which is more churn than
the defect warrants.

**Verification:** Policy unit tests (existing coverage under
`libraries/libskill/test/policies/*.test.js`) pass without modification if the
matrix filters are correctly tagged.

**Ship Phase 4 as one PR: `refactor(libskill): consistent API shape (330)`.**

## Phase 5 — Surface reduction (housekeeping)

### Step 5.1 — Audit the root index (H1)

**Files:** `libraries/libskill/index.js`.

**Process:**

1. For each export in `index.js`, grep across `products/`, `services/`, and
   `tests/` (excluding `libraries/libskill/test/`) for external consumers.
2. Build a table: export → list of external call sites.
3. Mark as "internal" anything with zero external consumers.
4. For each internal export:
   - Remove it from `index.js`.
   - Keep the symbol in its source file (still used inside libskill).
   - Mark it `@internal` in JSDoc.

**Expected removals** (from the spec, to verify against grep):
`findMaxBaseSkillProficiency`, `getLevelRank`, `isSeniorLevel`,
`calculateDriverCoverage`, `prepareBaseProfile`, `prepareAgentProfile`,
`deriveShortInterview`, `deriveBehaviourQuestions`, `deriveFocusedInterview`,
`GAP_SCORES` (alias kept, original `SCORE_GAP` stays), `MatchTier`,
`CONFIG_MATCH_TIER`, most individual `WEIGHT_*` / `LIMIT_*` constants,
`isPrimary`, `isSecondary`, `hasMinLevel`, `allOf`, `anyOf`, `not`.

**Risk:** Any export I remove that turns out to have an external consumer breaks
that consumer. Mitigation: grep is authoritative for this monorepo, and external
(published-npm) consumers we know about live in the `basecamp/pathway-starter`
and any downstream installations. Before shipping, `git grep` across the
monorepo AND check the published downstream installations the user has locally.
If in doubt, keep the export.

### Step 5.2 — Remove the policy re-exports from the root index (H2)

**Files:** `libraries/libskill/index.js`.

**Change:** Delete lines `140-211` of `index.js` (the entire policies re-export
block). Consumers that need policy items import them from
`@forwardimpact/libskill/policies` — which is already the documented path.

**Verification:** Grep for consumers that import policy items from the root,
e.g. `import { WEIGHT_SKILL_TYPE } from "@forwardimpact/libskill"`. Migrate each
one to the subpath. This is mechanical.

### Step 5.3 — Unify pathway's libskill import convention (H3)

**Files:** Pathway source files under `products/pathway/src/`.

**Decision: prefer the subpath form** (`@forwardimpact/libskill/derivation`,
`/matching`, etc.) wherever the imported symbol has a subpath home. The root
index is for "I want several things across submodules" — subpaths are for "I
want things from one submodule." Align all pathway imports to this rule.

This is style, not correctness. One commit, one PR.

**Ship Phase 5 as one PR: `refactor(libskill): shrink public surface (330)`.**

## Risks and open questions

- **C1 hash stability.** Hashing `JSON.stringify(validationRules)` assumes
  stable key ordering. In practice `validationRules` objects come from YAML and
  have deterministic shape, but if a consumer ever constructs one in code with
  non-deterministic key order, the cache key would drift. Mitigation: sort keys
  when stringifying, or accept that cache keys may hash-miss occasionally (miss
  is safe; hit with wrong shape is not).
- **Phase 3 browser page behaviour.** If any browser page currently relies on
  the module-level cache persisting across navigations within a single session
  (SPA-style), creating a new cache per page module would be a subtle
  regression. Verify with the pathway dev server that the cache lifetime is in
  fact per-page-load today (import maps re-execute module graphs on navigation)
  before shipping Phase 3.
- **Phase 4 M1 scope creep.** The "destructured for ≥2 args" rule might reveal
  more functions than the spec lists. If the count exceeds ~10 extra functions,
  consider splitting M1 into its own PR separate from M2/M5/M6.
- **Phase 5 H1 downstream breakage.** Removing exports is the only place in this
  plan that can break a downstream installation silently (the monorepo test
  suite won't see it). Before cutting the release that contains Phase 5, check
  any local basecamp installation or skill-pack build that consumes libskill.
  Listed in the PR description as a release-gate item.

## Exit criteria

- All 15 findings from the spec addressed.
- `bun run check` and `bun run test` pass on main after each phase PR lands.
- `bunx fit-pathway` commands produce byte-identical output for the non-buggy
  call paths (diff command outputs against a pre-change baseline once at the
  start and once at the end).
- Root `index.js` export count reduced roughly 40% (per H1 spec estimate).
- No JSDoc `@param` references resolve to `any` in an editor hover on any
  libskill public function.
- CLAUDE.md's libskill pure-function exemption is truthful (no module-level
  mutable state remains).
