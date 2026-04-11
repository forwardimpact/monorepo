# Plan A — Part 02: Core aggregation & `coverage` command

## Goal

Introduce the core aggregation layer — the `TeamCoverage` primitive that
every subsequent command reads from — and ship the first analytical
command: `fit-summit coverage <team>`. After this part, a user can point
Summit at a team and see which skills are well-covered, thin, or absent.

This is the most important part in the plan. Every later part reduces to
"call `computeCoverage`, then transform/diff/rank the result." The design
must be robust enough that Parts 03–07 import it unchanged.

## Inputs

- Spec 090: "Capability Coverage" (spec.md:174–227), "What/Why" framing,
  "CLI" (spec.md:726–754), "JSON Output" (spec.md:786–847), Empty States
  (spec.md:704–725), Privacy / Audience model (spec.md:74–87).
- `libskill.deriveSkillMatrix({ discipline, level, track, skills })` —
  the only derivation primitive Summit needs here.
- `SkillProficiency`, `SKILL_PROFICIENCY_ORDER`, and
  `skillProficiencyMeetsRequirement` from `@forwardimpact/map/levels`.

## Approach

Coverage lives in two layers:

1. **Pure aggregation** (`src/aggregation/coverage.js`): deterministic
   functions that take a `Roster`, a resolved team id, and Map data; and
   return a `TeamCoverage`. No I/O, no formatting.
2. **Command handler** (`src/commands/coverage.js`): wires options, loads
   data, calls aggregation, selects a formatter, prints the result.

This split is how every later part plugs in without re-loading data.

## Files Created

### `products/summit/src/aggregation/index.js`

Public barrel for the aggregation surface. In this part it exports:

```js
export { computeCoverage, resolveTeam, derivePersonMatrix } from "./coverage.js";
export { meetsWorking, computeEffectiveDepth } from "./depth.js";
```

### `products/summit/src/aggregation/coverage.js`

Core functions (all pure, named exports only):

#### `derivePersonMatrix(person, data): PersonMatrix`

- Resolves `discipline`, `level`, `track` from Map data.
- Calls `deriveSkillMatrix({ discipline, level, track, skills: data.skills })`.
- Returns `{ email, name, job, allocation, matrix }`. Allocation is
  `person.allocation ?? 1.0`.

#### `resolveTeam(roster, data, { teamId?, projectId? }): ResolvedTeam`

- Looks up the target team in either `roster.teams` or `roster.projects`.
- Derives each member's `PersonMatrix`.
- For project teams referenced by email only, merges in the full person
  record from the reporting teams.
- Returns:
  ```ts
  type ResolvedTeam = {
    id: string,
    type: "reporting" | "project",
    members: PersonMatrix[],
    effectiveFte: number,
    managerEmail?: string, // populated for Map-sourced reporting teams;
                           // null for YAML-defined and project teams
  };
  ```
- `managerEmail` is copied from the reporting team's root manager
  when the team was loaded via `loadRosterFromMap`; it's `null` for
  YAML teams and for project teams regardless of source. Part 07's
  evidence loader uses this to scope `getPracticePatterns` to the
  right manager hierarchy.
- Throws `TeamNotFoundError` when the id doesn't resolve; the handler
  catches this and prints the spec.md:721 message.

#### `computeCoverage(resolvedTeam, data): TeamCoverage`

Deterministic pure aggregation. Algorithm:

1. Initialise a `Map<skillId, SkillCoverage>` seeded with every skill in
   `data.skills`, with `headcountDepth = 0`, `effectiveDepth = 0`,
   `maxProficiency = null`, `distribution = {}`, `holders = []`.
2. For each `member` in `resolvedTeam.members`:
   - For each entry in `member.matrix`:
     - Look up the seed row for `entry.skillId`.
     - Append `{ email, proficiency: entry.proficiency, allocation:
       member.allocation }` to `holders`.
     - Increment `distribution[entry.proficiency]` by 1.
     - If `meetsWorking(entry.proficiency)`:
       - `headcountDepth += 1`
       - `effectiveDepth += member.allocation`
     - Update `maxProficiency` to the higher of current and
       `entry.proficiency` using `getSkillProficiencyIndex`.
3. Build `capabilities: Map<capabilityId, CapabilityCoverage>` by
   grouping skills by `capabilityId`. Capability-level depth is the
   count of skills in the capability that have `headcountDepth ≥ 1` —
   the spec treats capability coverage as "at least one skill at
   working+".
4. Return the `TeamCoverage` object shaped exactly per plan-a.md
   "Data Model".

All counts are integers, effective depths are rounded to 2 decimal places
in output but stored as full floats in the `TeamCoverage` object.

### `products/summit/src/aggregation/depth.js`

Two small utilities that are exported publicly because Parts 03, 04, 05,
and 07 all need them:

```js
import { skillProficiencyMeetsRequirement, SkillProficiency }
  from "@forwardimpact/map/levels";

export function meetsWorking(proficiency) {
  return skillProficiencyMeetsRequirement(proficiency, SkillProficiency.WORKING);
}

export function computeEffectiveDepth(holders) {
  return holders
    .filter((h) => meetsWorking(h.proficiency))
    .reduce((sum, h) => sum + h.allocation, 0);
}
```

This encapsulates the "working+" decision so future refactors only
touch one place. The function is named `computeEffectiveDepth` (not
`effectiveDepth`) to avoid clashing with the `SkillCoverage.effectiveDepth`
field — grep for either name should give an unambiguous result.

### `products/summit/src/lib/audience.js`

Privacy filter layer. Three audience modes: `engineer`, `manager`,
`director`. Exports:

```js
export const Audience = { ENGINEER: "engineer", MANAGER: "manager", DIRECTOR: "director" };

export function resolveAudience(options) {
  const value = options.audience ?? Audience.MANAGER;
  if (!Object.values(Audience).includes(value)) {
    throw new Error(`Invalid --audience: ${value}. Expected one of engineer, manager, director.`);
  }
  return value;
}

export function withAudienceFilter(coverage, audience) {
  // Returns a shallow-modified copy where `holders` is stripped of
  // `email` and `name` fields for the director audience, and kept as-is
  // for manager and engineer (engineer audience only sees their own team
  // in the growth command — coverage is unrestricted for their own team).
  ...
}
```

Part 02 is the correct home for `audience.js` because `coverage` is the
first command that produces a privacy-sensitive view. Later parts import
`withAudienceFilter` and apply it in their own formatters.

### `products/summit/src/aggregation/errors.js`

```js
export class TeamNotFoundError extends Error {
  constructor(teamId) {
    super(`Team "${teamId}" not found. Run \`fit-summit roster\` to list teams.`);
    this.code = "SUMMIT_TEAM_NOT_FOUND";
  }
}

export class EmptyTeamError extends Error { ... }
```

Stable error codes let CLI handlers branch without string matching.

### `products/summit/src/commands/coverage.js`

Handler signature matches Pathway convention:

```js
export async function runCoverageCommand({ data, args, options }) { ... }
```

Flow:

1. Parse `teamId` (first positional) or `--project <name>`.
2. Load roster via `loadRoster()` (reuse Part 01's loader).
3. `resolved = resolveTeam(roster, data, { teamId, projectId })`.
4. If `resolved.members.length === 0`, print the empty-team message
   (spec.md:721) and exit 0.
5. `coverage = computeCoverage(resolved, data)`.
6. `audience = resolveAudience(options)`.
7. `filtered = withAudienceFilter(coverage, audience)`.
8. Dispatch by format:
   - `text` → `coverageToText(filtered)`
   - `json` → `console.log(JSON.stringify(coverageToJson(filtered), null, 2))`
   - `markdown` → `coverageToMarkdown(filtered)` (simple table-based rendering)

### `products/summit/src/formatters/shared.js`

Terminal rendering helpers that every command's text formatter will
reuse:

- `renderBar(depth, maxDepth, width = 10)` — draws `███░░░` style bars.
  Width scales to the max `headcountDepth` across skills in the view.
- `renderHeader(title)` — section header with a rule line below.
- `renderTable(rows, columns)` — thin wrapper over libcli `formatTable`
  when that exists, else a manual left-aligned padder.
- `formatFte(value)` — rounds floats to 1 decimal place for display.
- `colorByCoverage(depth, width)` — green / yellow / red ANSI based on
  ratio (uses libcli `colors` exports — degrade when `supportsColor` is
  false).

All functions must be pure and take explicit parameters, no global state.

### `products/summit/src/formatters/coverage/text.js`

Exports `coverageToText(coverage): string`. Output shape mirrors
spec.md:179–189 for reporting teams and spec.md:211–221 for project
teams with allocation. Group by capability, sort skills by id within
capability, render one bar line per skill.

### `products/summit/src/formatters/coverage/json.js`

Exports `coverageToJson(coverage): object`. Output shape mirrors
spec.md:836–847 for project teams. For reporting teams, drop the
`effectiveFte` field and emit `depth` instead of `derivedDepth`/
`effectiveDepth`. Use `camelCase` keys per spec.md examples.

### `products/summit/src/formatters/coverage/markdown.js`

Minimal markdown rendering for `--format markdown`. Single-table layout
with one row per skill. Kept very thin — the primary consumer of JSON is
dashboards; markdown is a convenience for docs snippets.

### `products/summit/test/coverage.test.js`

Test coverage (aim for high confidence in the aggregation correctness):

- `derivePersonMatrix` returns a non-empty matrix when `discipline`,
  `level`, and `skills` are provided.
- `resolveTeam` finds teams by id, returns `TeamNotFoundError` for
  unknown ids, merges project members by email, correctly preserves
  allocation.
- `computeCoverage` with a fixture team where:
  - 3 engineers are at working+ for skill A → `headcountDepth = 3`.
  - 0 engineers are at working+ for skill B → `headcountDepth = 0`.
  - Max proficiency is the highest in the team.
- Allocation arithmetic:
  - Project member at 0.6 → `effectiveDepth` contribution of 0.6 when
    they are at working+.
  - Member below working does not contribute to `effectiveDepth` even
    at allocation 1.0.
- `withAudienceFilter` strips `email` and `name` fields from holders
  when `audience === director`, leaves them alone for `manager`, and
  same-as-manager behaviour for `engineer` (parity spec.md:80).
- `coverageToJson` output round-trips through `JSON.stringify` without
  losing precision.

### `products/summit/test/fixtures/roster.yaml`

Two reporting teams and one project team. Uses the starter discipline,
both starter tracks, and both starter levels. Exists so other parts can
reuse the same fixture.

### `products/summit/test/fixtures/map-data/`

A tiny copy of `products/map/starter/` — sufficient to exercise
aggregation without pulling the full installation. This is the reference
Map data every test loads via `createDataLoader().loadAllData(fixture
Path)`.

## Files Modified

### `products/summit/src/index.js`

Append coverage exports:

```js
export {
  computeCoverage,
  resolveTeam,
  derivePersonMatrix,
  meetsWorking,
  computeEffectiveDepth,
} from "./aggregation/index.js";
export { Audience, resolveAudience, withAudienceFilter } from "./lib/audience.js";
```

### `products/summit/bin/fit-summit.js`

Add `coverage` to the commands table:

```js
const COMMANDS = {
  roster: runRosterCommand,
  validate: runValidateCommand,
  coverage: runCoverageCommand,
};
```

Add the `coverage` entry to the `commands` array and add the `--project`
and `--audience` options to the `options` map. Update `examples` with
`fit-summit coverage platform` and `fit-summit coverage --project
migration-q2`.

### `products/summit/test/cli.test.js`

Add a smoke test: shell out to `bin/fit-summit.js coverage platform
--roster test/fixtures/roster.yaml --data test/fixtures/map-data` and
assert stdout contains the fixture team's capability section header.

## Verification

1. `bun run check` passes (format + lint + layout + exports).
2. `bun run test` passes with the new aggregation and coverage tests.
3. Manual smoke: `bunx fit-summit coverage platform --roster
   products/summit/starter/summit.example.yaml --data
   products/map/starter` produces output where platform engineers show
   depth for `task_completion`/`planning` based on the starter data.
4. `bunx fit-summit coverage platform --format json --roster … --data …`
   emits valid JSON that parses with `JSON.parse`.
5. `bunx fit-summit coverage platform --audience director --roster …
   --data …` omits per-holder emails from the output.

## Commit

Single commit titled:

```
feat(summit): add coverage aggregation, coverage command, audience filter
```

## Risks

- **Aggregation shape locks in early.** Every later part imports
  `TeamCoverage`. If the shape is wrong here, every downstream part is
  impacted. Mitigation: write the coverage tests first, then implement;
  confirm the shape is sufficient to answer the risks questions in
  Part 03 before freezing.
- **Empty-team rendering.** A team with zero members at working+ must
  still render cleanly (not crash in the bar renderer). Guard against
  `headcountDepth = 0` explicitly in `renderBar`.
- **Map data missing a capability.** If a skill references a
  `capabilityId` that isn't in `data.capabilities`, group it under an
  "unassigned" bucket rather than throwing — that's a data problem the
  `validate` command is supposed to surface, not a coverage problem.
- **Allocation totals > 1.0.** A person with `allocation = 1.5` in a
  project team is almost certainly a typo. Warn (stderr) during
  aggregation but proceed; Part 05's risk detection may surface it.

## Notes for the implementer

- Keep `src/aggregation/coverage.js` dependency-free except for
  `@forwardimpact/libskill` and `@forwardimpact/map/levels`. It must be
  importable from any test without touching the filesystem.
- Do not put any logging inside aggregation — use return values. Logging
  belongs in the command handler.
- Test fixtures in `test/fixtures/map-data/` may need updates when Map's
  starter schema changes. Keep the fixture minimal to reduce the blast
  radius of those upstream changes.
