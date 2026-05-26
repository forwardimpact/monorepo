# Plan A · Part 02 — Evidence-based views + starter markers

Parent plan: [plan-a.md](./plan-a.md). Spec: [spec.md](./spec.md). Depends on
[Part 01](./plan-a-01.md) being merged.

This part adds marker definitions to the starter capabilities so the
evidence-based views have criteria to evaluate against, then ships the Landmark
commands that read from Map's existing `evidence` query module: `evidence`,
`readiness`, `timeline`, `coverage`, `practiced`.

## Scope

**In scope**

- Author `markers:` sections on `task_completion`, `planning`, and at least one
  skill inside `reliability.yaml`.
- Add a shared `evidenceHelpers.js` module in Landmark's `src/lib/` for join
  logic reused by multiple commands.
- Implement commands: `evidence`, `readiness`, `timeline`, `coverage`,
  `practiced`.
- Wire `readiness` to `libskill`'s `getNextLevel` and `deriveSkillMatrix` to
  resolve required skills at a target level for a given discipline+track.
- Empty-state handling for every command per spec § Empty States.
- Tests for each command using `node:test`.
- Update Part 01's `marker` command test to confirm it now produces real output
  for seeded skills (the test that previously asserted the empty path now
  asserts real output — both paths are kept, exercised via different fixtures).

**Out of scope**

- Health view (Part 03).
- Voice/initiative commands (Parts 04/05).
- Changes to `drivers.yaml` (Part 03 owns that).
- Marker authoring beyond the two starter capabilities (installations extend on
  their own).

## Files

### Created

```
products/landmark/src/lib/
  evidence-helpers.js

products/landmark/src/commands/
  evidence.js
  readiness.js
  timeline.js
  coverage.js
  practiced.js

products/landmark/src/formatters/
  evidence.js
  readiness.js
  timeline.js
  coverage.js
  practiced.js

products/landmark/test/
  evidence.test.js
  readiness.test.js
  timeline.test.js
  coverage.test.js
  practiced.test.js
  evidence-helpers.test.js
```

### Modified

- `products/map/starter/capabilities/delivery.yaml` — add `markers` to
  `task_completion` and `planning`.
- `products/map/starter/capabilities/reliability.yaml` — add `markers` to at
  least one skill (pick `incident_response` if defined, otherwise the first
  skill).
- `products/landmark/bin/fit-landmark.js` — replace "not yet implemented" stubs
  for `evidence`, `readiness`, `timeline`, `coverage`, `practiced` with the real
  handler imports and dispatch entries in `COMMANDS`.
- `products/landmark/src/formatters/index.js` — register the new formatters.
- `products/map/test/` — extend any test that loads starter capabilities to
  accept the new `markers` field, or confirm existing tests still pass without
  change (Map's loader test just snapshot-compares the loaded shape; update the
  snapshot if necessary).

## Implementation details

### Starter marker authoring

Authoring rule (from spec § Markers): each marker entry is a proficiency key
(`awareness` | `foundational` | `working` | `practitioner` | `expert`) with an
object containing `human:` and/or `agent:` string arrays. Validated by
`products/map/src/validation/skill.js#validateSkillMarkers`.

**Proficiency coverage rule.** Starter levels map to libskill-derived
proficiencies via each level's `baseSkillProficiencies` (see
`products/map/starter/levels.yaml`):

- `J040`: primary=`foundational`, secondary=`awareness`, broad=`awareness`
- `J060`: primary=`working`, secondary=`foundational`, broad=`awareness`

For an engineer at `J040` targeting `J060`, the readiness checklist needs
markers at **every proficiency `J060` requires** for the skills in their matrix:
`working` (primary), `foundational` (secondary), `awareness` (broad). Therefore
this part authors markers at **`awareness`, `foundational`, and `working`** —
all three tiers the starter levels can request. Practitioner and expert are out
of scope (no starter level requires them).

Authoring fewer than all three proficiencies leaves the happy-path readiness
test firing the `NO_MARKERS_AT_TARGET` empty state for broad/secondary skills,
which defeats the point of Part 02.

Example authored content for `task_completion` in `delivery.yaml`:

```yaml
- id: task_completion
  name: Task Completion
  # ... existing content ...
  markers:
    awareness:
      human:
        - Closed an assigned task by following a documented runbook
      agent:
        - Completed a task by applying an existing pattern from the codebase
    foundational:
      human:
        - Delivered a small feature end-to-end with minimal rework
        - Estimated and completed a defined task within the committed timeframe
      agent:
        - Completed a single-file change that passes CI on the first attempt
    working:
      human:
        - Delivered a feature end-to-end with no revision to the initial design
        - Independently resolved a production issue within SLA
      agent:
        - Completed a multi-file change that passes CI without human rework
        - Resolved an ambiguous bug report with evidence from logs and tests
```

Mirror for `planning` and for one skill in `reliability.yaml`. Keep language
consistent with the existing `proficiencyDescriptions` on each skill.

Run `bunx fit-map validate` after editing to confirm the new content passes
schema validation. This is the single canonical validation entry point.

### `evidence-helpers.js`

Shared logic reused across commands. Export:

```js
// Groups raw evidence rows by skillId → { matched, unmatched, markers[] }.
export function groupEvidenceBySkill(evidenceRows) { ... }

// Groups evidence rows by ISO quarter (YYYY-Q{1..4}) derived from created_at.
export function groupEvidenceByQuarter(evidenceRows) { ... }

// Picks the highest matched level per (quarter, skill) using
// SKILL_PROFICIENCY_ORDER from @forwardimpact/map/levels.
export function highestLevelPerSkillPerQuarter(evidenceRows) { ... }

// Given markers at a target level and evidence rows, returns a checklist
// array: [{ marker, evidenced: boolean, artifactId?, rationale? }, ...].
export function buildMarkerChecklist(markers, evidenceRows) { ... }

// Computes coverage ratio: (artifacts with ≥1 evidence row) / (total artifacts).
export function computeCoverageRatio(artifacts, evidenceRows) { ... }
```

All functions are pure; each has its own unit test in
`evidence-helpers.test.js`.

### Command: `evidence`

Signature: `fit-landmark evidence [--skill <id>] [--email <email>]`.

Handler calls `getEvidence(supabase, { skillId, email })` from
`@forwardimpact/map/activity/queries/evidence`. Groups results by skill via
`groupEvidenceBySkill`. Always includes a coverage line: uses
`getUnscoredArtifacts` + `getArtifacts` counts to render
`Evidence covers X/Y artifacts` (spec § Evidence coverage metrics). Empty →
`NO_EVIDENCE`.

### Command: `readiness`

Signature: `fit-landmark readiness --email <email> [--target <level>]`.

Steps:

1. `getPerson(supabase, options.email)`. If null → `PERSON_NOT_FOUND`.
2. Resolve `currentLevel` as the level object (not id) by looking up
   `person.level` in `mapData.levels` where `level.id === person.level`.
3. Resolve `targetLevel` as a level object. If `options.target` is set, look it
   up the same way; else call
   `getNextLevel({ level: currentLevel, levels: mapData.levels })` (libskill's
   real signature — destructured, not positional). If null →
   `NO_HIGHER_LEVEL(currentLevel.id)`.
4. Resolve the person's `discipline` and `track` objects from `mapData` (same
   id-lookup pattern as the level).
5. Derive the expected skill matrix at the target level using libskill's real
   signature:
   `deriveSkillMatrix({ discipline, level: targetLevel, track, skills: mapData.skills })`.
   The return is an array of `{ skillId, skillName, proficiency, ... }` entries
   where `proficiency` is the libskill-resolved required proficiency for each
   skill at the target level (one of
   `awareness|foundational|working|practitioner|expert`).
6. For each matrix entry, load the skill from `mapData.skills`, find its
   `markers[entry.proficiency]`, and collect the list of required markers.
   Skills without markers at their required proficiency are **skipped with a
   per-skill note** (`{ skillId, skipped: "no markers at <proficiency>" }`) —
   not a command-wide failure.
7. If **every** matrix skill is skipped (no markers defined anywhere at the
   required proficiencies) → `NO_MARKERS_AT_TARGET`. Otherwise continue with the
   non-skipped set.
8. Load evidence rows for the person: `getEvidence(supabase, { email })`,
   filtered to `matched: true`.
9. Build the checklist via `buildMarkerChecklist`. Summary line:
   `"<evidenced>/<total> markers evidenced. Missing: ..."`. Include a separate
   footer line listing any skipped skills so the user can act.

The `readiness` formatter renders `[x]` / `[ ]` checkboxes with artifact ids in
text/markdown; JSON returns the raw checklist array plus the skipped-skill list.

Starter-limitation tests (three cases):

1. Person at `J060` (highest starter level) — handler returns `NO_HIGHER_LEVEL`
   empty state.
2. Person at `J040` targeting `J060` with fully-authored markers at `awareness`,
   `foundational`, and `working` — handler returns a real checklist with zero
   skipped skills.
3. Fixture where one skill's required proficiency has no markers — handler
   returns a real checklist for the remaining skills and lists the skipped skill
   in the footer. No `NO_MARKERS_AT_TARGET` empty state in this case.

### Command: `timeline`

Signature: `fit-landmark timeline --email <email> [--skill <id>]`.

Calls `getEvidence(supabase, { email, skillId })`. Passes the result through
`highestLevelPerSkillPerQuarter`. Output rows are
`(quarter, skillId, highestLevel)`. No markers needed — this view is purely
temporal aggregation.

Empty → `NO_EVIDENCE`.

### Command: `coverage`

Signature: `fit-landmark coverage --email <email>`.

Calls `getPerson`, then `getArtifacts(supabase, { email })` and
`getUnscoredArtifacts(supabase, { email })`. Computes the coverage ratio via
`computeCoverageRatio`. The view groups uncovered artifacts by `artifact_type`
so the user sees which artifact categories have been interpreted and which have
not.

Empty (no artifacts at all) → `"No artifacts found for ${email}."` (a new
empty-state constant `NO_ARTIFACTS_FOR_PERSON` added to
`src/lib/empty-state.js`).

### Command: `practiced`

Signature: `fit-landmark practiced --manager <email>`.

Shows evidenced depth alongside derived depth for a manager's team. Steps:

1. `getTeam(supabase, options.manager)`. If empty → `MANAGER_NOT_FOUND`.
2. For each team member, derive their expected skill matrix via
   `deriveSkillMatrix(mapData, { discipline, level, track })`. Aggregate the
   derived depths across the team per skill (using the highest required
   proficiency wins, matching Summit's convention).
3. Fetch evidenced depth via `getPracticePatterns(supabase, { managerEmail })`
   which returns `[{ skill_id, matched, unmatched, total }, ...]`.
4. For each skill, render `derived_depth` alongside `evidenced_depth`.
   Divergence highlight rule: if `derived_depth` is non-null and
   `evidenced_depth` is zero, flag as "on paper only". If `evidenced_depth` is
   non-zero for a skill not in the derived matrix, flag as "evidenced beyond
   role".

Empty (no evidence rows for any team member) → `NO_EVIDENCE`.

### Bin dispatch update

In `bin/fit-landmark.js`:

```js
import { runEvidenceCommand } from "../src/commands/evidence.js";
import { runReadinessCommand } from "../src/commands/readiness.js";
import { runTimelineCommand } from "../src/commands/timeline.js";
import { runCoverageCommand } from "../src/commands/coverage.js";
import { runPracticedCommand } from "../src/commands/practiced.js";

const COMMANDS = {
  org: runOrgCommand,
  snapshot: runSnapshotCommand,
  marker: runMarkerCommand,
  evidence: runEvidenceCommand,
  readiness: runReadinessCommand,
  timeline: runTimelineCommand,
  coverage: runCoverageCommand,
  practiced: runPracticedCommand,
};
```

`health`, `voice`, and `initiative` entries remain routed to the stub handler
from Part 01 — Parts 03/04/05 replace them.

## Tests

- `evidence.test.js` — fixtures: one person with 3 evidence rows across 2
  skills, one person with none. Covers `--skill` filter, `--email` filter, and
  the empty-state path. Also asserts the coverage line is always present.
- `readiness.test.js` — four cases:
  1. J040 person with partial evidence — checklist with mix of `[x]` / `[ ]`,
     zero skipped, verifies `getNextLevel` is called with the destructured
     object signature.
  2. J060 person — `NO_HIGHER_LEVEL` empty state.
  3. Mixed-marker fixture where one required skill has no markers at its
     required proficiency — checklist for the remaining skills, skipped skill
     listed in footer, no empty state.
  4. Fully-unmarked fixture (no skills have any markers at required
     proficiencies) — `NO_MARKERS_AT_TARGET` empty state.
- `timeline.test.js` — fixture with evidence across 3 quarters, two skills.
  Verifies highest-level-per-(quarter, skill) aggregation and the `--skill`
  filter.
- `coverage.test.js` — person with mix of scored and unscored artifacts.
  Verifies ratio and category grouping.
- `practiced.test.js` — team of 3 with differing job profiles. Verifies
  derived-depth aggregation and the "on paper only" / "evidenced beyond role"
  divergence flags.
- `evidence-helpers.test.js` — pure unit tests for every exported function.
- Update `marker.test.js` from Part 01: add a new case using a synthetic
  `mapData` fixture where `task_completion` has authored markers, asserting the
  formatted output matches spec § Marker reference view. Part 01's original "no
  markers defined" test case stays — it uses a different synthetic fixture with
  an empty `markers` field. The two cases coexist because neither depends on
  real starter data; they share the command handler but inject distinct
  in-memory fixtures.

## Verification

1. `bunx fit-map validate` with the updated starter data — confirms the new
   `markers` fields pass schema validation.
2. `bun test products/landmark/test` — all command tests green, including the
   updated `marker.test.js`.
3. `bun test products/map/test` — Map's loader and validation tests still green
   with the expanded starter content.
4. `bun run layout && bun run check:exports && bun run check` — layout, exports,
   lint/format all green.
5. Smoke test against `fit-map activity seed`:
   - `bunx fit-landmark readiness --email engineer-1@example.com` produces a
     checklist.
   - `bunx fit-landmark coverage --email engineer-1@example.com` produces a
     ratio.
   - `bunx fit-landmark practiced --manager manager-1@example.com` produces a
     derived-vs-evidenced table.

## Deliverable

A merged PR that enables every evidence-based view declared in spec § Product
Behavior (except `health`). Starter data now demonstrates markers.
`fit-map validate` stays green.
