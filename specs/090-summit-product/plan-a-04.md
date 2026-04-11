# Plan A — Part 04: What-if simulation & `what-if` command

## Goal

Ship `fit-summit what-if <team> [options]` — the most powerful command in
the spec. It simulates a roster change, recomputes coverage and risks,
and renders a diff explaining what changed and what didn't.

Four mutation types from spec.md:316–407:

1. `--add "<job>"` — add a hypothetical person.
2. `--remove <name>` — remove an existing member.
3. `--move <name> --to <team>` — move someone between teams.
4. `--promote <name>` — bump to the next level.

Plus three modifier flags:

- `--focus <capability>` — filter the diff to one capability.
- `--allocation <pct>` — override allocation for an added member.
- `--to <team>` — move target.

## Inputs

- Spec 090: "What-If Scenarios" (spec.md:316–407), CLI options
  (spec.md:776–784).
- Part 02 `computeCoverage` / `resolveTeam`.
- Part 03 `detectRisks`.

## Approach

What-if is "clone, mutate, re-aggregate, diff". The core is a
`Scenario` type plus two pure functions:

- `applyScenario(roster, scenario): Roster` — returns a new Roster
  object without mutating the input.
- `diffCoverage(before, after): CoverageDiff` — computes per-skill
  changes.
- `diffRisks(before, after): RiskDiff` — what new/resolved risks
  appeared.

The command handler orchestrates: load, compute before, apply, compute
after, diff, render.

## Files Created

### `products/summit/src/aggregation/what-if.js`

Exports:

#### `applyScenario(roster, data, scenario): Roster`

Deep-clones `roster` (via `structuredClone`) and mutates the clone
according to `scenario.type`:

- `"add"` — push a new `RosterPerson` into `teams[teamId]` (or
  `projects[projectId]`). Requires `scenario.job`; `allocation`
  defaults to `1.0` unless `scenario.allocation` is provided.
  Generates a synthetic email like `__what_if_1@summit.local` so
  the person is unique in the team.
- `"remove"` — filters the team's member list by `scenario.name`.
  Throws `ScenarioError` with message "No team member named {name}
  found in {team}" (spec.md:719) if no match.
- `"move"` — removes from source team and adds to destination team.
  Same unknown-name error as `"remove"`. Rejects moves between
  reporting and project teams in the same scenario — that's a
  different workflow.
- `"promote"` — locates the named member in the team, resolves their
  current level object by id against `data.levels`, then looks up the
  next level via `libskill.getNextLevel({ level: currentLevel, levels:
  data.levels })` (destructured params — see
  `libraries/libskill/src/progression.js:374`). Note `getNextLevel`
  takes the level *object*, not the level id, so the handler must
  resolve the object first via
  `data.levels.find(l => l.id === member.job.level)`. If no next
  level exists (already at top), throws `ScenarioError`. Otherwise
  mutates `job.level` to the next level's id.

Pure: the input roster is never modified.

#### `diffCoverage(before, after): CoverageDiff`

```ts
type CoverageDiff = {
  capabilityChanges: Array<{
    skillId: string,
    capabilityId: string,
    before: { headcountDepth: number, effectiveDepth: number, maxProficiency: string | null },
    after:  { headcountDepth: number, effectiveDepth: number, maxProficiency: string | null },
    direction: "up" | "down" | "same",
  }>,
};
```

Emits one row per skill in `data.skills`. `direction` is based on
`headcountDepth` first, then `effectiveDepth` as a tiebreaker.

#### `diffRisks(beforeRisks, afterRisks): RiskDiff`

```ts
type RiskDiff = {
  added: { singlePoints: [], criticalGaps: [], concentrationRisks: [] },
  removed: { singlePoints: [], criticalGaps: [], concentrationRisks: [] },
  unchanged: { singlePoints: [], criticalGaps: [], concentrationRisks: [] },
};
```

Compares by skillId/capabilityId+level. Severity changes within an
unchanged SPOF are reported as `unchanged` but with a
`severityChanged: true` flag.

### `products/summit/src/aggregation/scenarios.js`

Scenario parsing and validation, split out from `what-if.js` for
testability:

```js
export const ScenarioType = {
  ADD: "add", REMOVE: "remove", MOVE: "move", PROMOTE: "promote",
};

export function parseScenario(options): Scenario { ... }
```

Parses CLI options (`options.add`, `options.remove`, `options.move`,
`options.to`, `options.promote`, `options.allocation`, `options.focus`)
into a normalised `Scenario`. Enforces mutually-exclusive mutation
flags — `--add` and `--remove` in the same invocation is a usage error.

#### `parseJobExpression(input: string): JobSpec`

Parses the `--add` argument. Spec examples use YAML-ish inline syntax:
`"{ discipline: software_engineering, level: J080 }"` (spec.md:323).
The simplest correct implementation is to feed the string to the `yaml`
package's `parse()` which handles flow syntax natively. Validate fields
post-parse:

- `discipline` required and must be in `data.disciplines`.
- `level` required and must be in `data.levels`.
- `track` optional and must be in `data.tracks` when present.

Any validation failure throws `ScenarioError` with an actionable
message ("Invalid job profile: {field} is not defined in Map data" —
spec.md:720).

### `products/summit/src/commands/what-if.js`

Handler flow:

1. Parse `teamId` / `--project`.
2. Parse scenario via `parseScenario(options)`.
3. Load roster, data.
4. `before = { team: resolveTeam(roster, data, {teamId}),
     coverage: computeCoverage(team, data),
     risks: detectRisks({ resolvedTeam: team, coverage, data }) }`.
5. `mutated = applyScenario(roster, data, scenario)`.
6. `after = { ... }` computed over `mutated`.
7. For `move` scenarios, also compute before/after for the destination
   team so the output can show both sides (spec.md:377–392).
8. `diff = { coverage: diffCoverage(before.coverage, after.coverage),
   risks: diffRisks(before.risks, after.risks) }`.
9. If `options.focus`, filter `diff.coverage.capabilityChanges` to rows
   whose skill belongs to `options.focus`.
10. Dispatch format (text / json / markdown).

### `products/summit/src/formatters/what-if/text.js`

Renders the scenario header (`Adding a Level III Software Engineer to
Platform team:` — spec.md:325), then the capability changes section with
`+`/`-`/`=` markers, then the risk changes section with `+`/`-`.

When the scenario is a `move`, render two side-by-side sections
matching spec.md:378–392.

Closes with a narrative summary line when obvious (e.g. "This hire
strengthens existing delivery coverage but doesn't address the team's
structural gaps" — spec.md:334). The narrative is templated from the
diff shape: if there are unresolved critical gaps after the scenario,
append "but doesn't address …". Keep the narrative deterministic — no
freeform prose.

### `products/summit/src/formatters/what-if/json.js`

Emits:

```json
{
  "scenario": { "type": "add", "job": {...}, "allocation": 0.5 },
  "teamId": "platform",
  "diff": {
    "capabilityChanges": [...],
    "riskChanges": { "added": [...], "removed": [...], "unchanged": [...] }
  }
}
```

### `products/summit/src/formatters/what-if/markdown.js`

Kept minimal.

### `products/summit/test/what-if.test.js`

Coverage:

- `applyScenario` for each of `add`, `remove`, `move`, `promote`:
  - Returns a new Roster; input is unchanged.
  - Increases/decreases team member count as expected.
  - Promotion without a next level throws with the right message.
- `parseJobExpression`:
  - Valid flow YAML → `JobSpec`.
  - Unknown discipline/level/track → `ScenarioError`.
  - Missing required field → `ScenarioError`.
- `diffCoverage` — before-after fixture diff matches a hand-computed
  expected shape.
- `diffRisks` — a scenario that adds a SPOF shows it in `added`; a
  scenario that removes a critical gap shows it in `removed`.
- `--focus` filtering — when set, only that capability's skills appear
  in the rendered text.
- `--allocation` on an `add` — effective depth increases by the
  requested fraction.

## Files Modified

### `products/summit/bin/fit-summit.js`

Add `what-if` command. Add options:

- `add` (string)
- `remove` (string)
- `move` (string)
- `to` (string)
- `promote` (string)
- `focus` (string)
- `allocation` (string — parsed to float in the handler)

The add/remove/move/promote options are mutually exclusive; document in
the command help line.

### `products/summit/src/index.js`

Append:

```js
export { applyScenario, diffCoverage, diffRisks } from "./aggregation/what-if.js";
export { parseScenario, parseJobExpression, ScenarioType } from "./aggregation/scenarios.js";
```

### `products/summit/test/cli.test.js`

Smoke test: `bin/fit-summit.js what-if platform --add '{ discipline:
software_engineering, level: J060 }' --roster test/fixtures/roster.yaml
--data test/fixtures/map-data` produces output containing "Capability
changes".

## Verification

1. `bun run check` passes.
2. `bun run test` passes with the new what-if tests.
3. Each scenario type runs against the fixture and produces the
   expected text output.
4. `--format json` validates as JSON and includes `diff.capabilityChanges`.
5. Error path: `fit-summit what-if platform --remove
   NonexistentPerson …` exits 1 with the spec.md:719 message.

## Commit

```
feat(summit): add what-if scenario simulation and what-if command
```

## Risks

- **Deep clone semantics.** `structuredClone` works for JSON-ish
  objects and also handles `Map` / `Set` natively, so the
  `Roster`'s `Map<string, RosterTeam>` fields are safe. It does
  throw on functions and non-plain class instances — the `Roster`
  object must contain only plain data, no class instances. Enforce
  via test: "a cloned roster is deep-equal to the original and any
  class instance inside throws a clear error at clone time."
- **Scenario combinatorics.** Multiple mutation flags in one
  invocation should be rejected rather than silently combined.
  Enforce in `parseScenario`.
- **`--promote` next-level lookup.** `libskill.getNextLevel` is
  `({ level, levels })` — it takes the full level *object* (not the
  id) plus the full `levels` array. The handler resolves the level
  object by id before calling. Keep the resolution in one helper so
  tests can exercise "no such level id" and "no next level" paths
  independently.
- **Move scenarios + project teams.** The spec's move examples are
  reporting-team-to-reporting-team only. A move into a project team
  would have ambiguous allocation semantics. Reject cross-type moves
  with a clear message and document.
- **`--focus` and growth impact.** The spec's `--focus` example
  (spec.md:342) shows the track also kicks in (`"platform track
  modifies incident_response proficiency upward"`). That's a
  rendering concern — surface the track's skillModifier in the
  capabilityChanges row for the affected skill when the added member
  has a non-null track. Implement as a `trackNote` field on
  `CoverageDiff` rows.

## Notes for the implementer

- Keep `applyScenario` and the diff functions fully pure and unaware
  of formatters. The handler is the only place that knows about CLI
  options.
- The narrative summary in the text formatter is deterministic —
  don't let it slip into LLM/prose territory. Template strings
  matching exact spec.md phrasing.
- `parseJobExpression` is reused by Part 05 growth (`--add` in a
  growth "hypothetical candidate" flow if that's added later). Keep
  the signature pure-data-in, pure-data-out.
