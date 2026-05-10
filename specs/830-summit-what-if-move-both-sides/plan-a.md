# Plan 830-A — `fit-summit what-if --move` two-sided rendering

[spec.md](spec.md) · [design-a.md](design-a.md)

## Approach

Introduce `WhatIfReport` (an array of per-team `TeamDiff` records) as the
internal contract between the command handler and the formatters. The handler
computes one `before`/`after` snapshot pair for the source team on every
scenario; for `--move` it computes a second pair against the destination team
(`{ teamId: scenario.toTeamId }`) on the same `mutated` roster. A new
`buildWhatIfReport` helper in `src/aggregation/what-if.js` assembles the per-
team list. All three formatters iterate `teamDiffs`: N=1 keeps the existing
single-section layout byte-for-byte (snapshot-fixture-gated for the five named
non-move scenarios); N=2 emits two labelled sections. The JSON formatter
branches on `scenario.type === "move"` to choose between the legacy flat shape
and the new `{ teams: [...] }` envelope. CLI help strings on the `what-if`
positional and the `--move` / `--to` options name the source and destination
roles. Pre-change formatter outputs are captured into committed fixtures
**before** the refactor lands so post-change byte-identity is verifiable.

Libraries used: none.

## File-shape decisions (cross-cutting)

| Decision                                                                | Choice                                                                                                                                                                                |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where `buildWhatIfReport` lives                                         | `products/summit/src/aggregation/what-if.js`, alongside `applyScenario`/`diffCoverage`/`diffRisks`. Single home for what-if domain types.                                             |
| `TeamDiff.role` values                                                  | `"source"` for the move source, `"destination"` for the move destination, `"target"` for `--add`/`--remove`/`--promote`. Open string — no enum validation.                            |
| `teamDiffs` ordering                                                    | `[source, destination]` for `move`; `[target]` for everything else.                                                                                                                   |
| Internal field names                                                    | `teamId`, `role`, `coverageDiff`, `riskDiff`. JSON formatter projects `coverageDiff.capabilityChanges` → `capabilityChanges` and `riskDiff` → `riskChanges` to match wire names.       |
| JSON shape — non-move                                                   | `{ scenario, diff: { capabilityChanges, riskChanges } }` (today's shape, byte-identical).                                                                                             |
| JSON shape — move                                                       | `{ scenario, diff: { teams: [ { teamId, role, capabilityChanges, riskChanges }, { teamId, role, capabilityChanges, riskChanges } ] } }`.                                              |
| Text/markdown — non-move                                                | Single section, no `[teamId]` heading prefix, identical whitespace to today. Snapshot-fixture-gated.                                                                                  |
| Text — move section labels                                              | `  Source team \`<src>\`:` and `  Destination team \`<dst>\`:`, each above its own `Capability changes:` + `Risk changes:` blocks.                                                    |
| Markdown — move section labels                                          | `## Source team \`<src>\`` and `## Destination team \`<dst>\``, each above its own capability table.                                                                                  |
| Help string — `<team>` positional                                       | Subcommand `description` reads `Simulate roster changes (the team is the source for --move, otherwise the target team for the diff)`.                                                  |
| Help strings — `--move` / `--to`                                        | `--move`: `Move a member out of <team> (the source) to --to (the destination)`. `--to`: `Destination team for --move (receives the member); the diff covers both teams`.              |
| Snapshot fixture format                                                 | One file per (scenario, format) under `products/summit/test/fixtures/what-if/<scenario-id>.<ext>` containing the literal output bytes. Five `<scenario-id>` values, three extensions. |
| Fixture roster                                                          | The existing `FIXTURE_ROSTER` in `products/summit/test/fixtures.js` (already loaded by the suite). No new fixture roster file.                                                        |

## Step 1 — Capture pre-change snapshot fixtures (criterion #4)

Capture today's text/JSON/markdown output for the five non-move scenarios
**before** any code changes. Commit the captured files in this step's commit;
post-refactor steps assert byte-identity against them.

- **Created:** `products/summit/test/fixtures/what-if/add-reporting.txt`
- **Created:** `products/summit/test/fixtures/what-if/add-reporting.json`
- **Created:** `products/summit/test/fixtures/what-if/add-reporting.md`
- **Created:** `products/summit/test/fixtures/what-if/add-project.txt`
- **Created:** `products/summit/test/fixtures/what-if/add-project.json`
- **Created:** `products/summit/test/fixtures/what-if/add-project.md`
- **Created:** `products/summit/test/fixtures/what-if/remove.txt`
- **Created:** `products/summit/test/fixtures/what-if/remove.json`
- **Created:** `products/summit/test/fixtures/what-if/remove.md`
- **Created:** `products/summit/test/fixtures/what-if/promote.txt`
- **Created:** `products/summit/test/fixtures/what-if/promote.json`
- **Created:** `products/summit/test/fixtures/what-if/promote.md`
- **Created:** `products/summit/test/fixtures/what-if/promote-focus.txt`
- **Created:** `products/summit/test/fixtures/what-if/promote-focus.json`
- **Created:** `products/summit/test/fixtures/what-if/promote-focus.md`
- **Created:** `products/summit/test/fixtures/what-if/README.md` — documents
  the regeneration command, the fixture roster used (`FIXTURE_ROSTER`), and the
  rule that fixtures are regenerated only when the upstream contract changes
  (never silently after a refactor).

The five scenario-ids and their inputs against `FIXTURE_ROSTER`
(`products/summit/test/fixtures.js`):

| scenario-id      | Inputs                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `add-reporting`  | `{ teamId: "platform" }`, `{ add: "{ discipline: software_engineering, level: J060 }" }`                                              |
| `add-project`    | `{ projectId: "migration-q2" }`, `{ add: "{ discipline: software_engineering, level: J060 }", project: "migration-q2", allocation: "0.5" }` |
| `remove`         | `{ teamId: "platform" }`, `{ remove: "Bob" }`                                                                                          |
| `promote`        | `{ teamId: "platform" }`, `{ promote: "Carol" }`                                                                                       |
| `promote-focus`  | `{ teamId: "platform" }`, `{ promote: "Carol", focus: "delivery" }`                                                                    |

Regeneration script (run on `main` HEAD before Step 2 lands; one shell
invocation per (scenario, format) tuple, redirecting stdout to the fixture
file):

```bash
node --input-type=module -e "
  import { parseRosterYaml } from './products/summit/src/roster/yaml.js';
  import { applyScenario, diffCoverage, diffRisks } from './products/summit/src/aggregation/what-if.js';
  import { computeCoverage, resolveTeam } from './products/summit/src/aggregation/coverage.js';
  import { detectRisks } from './products/summit/src/aggregation/risks.js';
  import { parseScenario } from './products/summit/src/aggregation/scenarios.js';
  import { whatIfToText } from './products/summit/src/formatters/what-if/text.js';
  import { whatIfToJson } from './products/summit/src/formatters/what-if/json.js';
  import { whatIfToMarkdown } from './products/summit/src/formatters/what-if/markdown.js';
  import { FIXTURE_ROSTER, loadStarterData } from './products/summit/test/fixtures.js';
  const { data } = await loadStarterData();
  const roster = parseRosterYaml(FIXTURE_ROSTER);
  const target = { teamId: 'platform' };           // adjust per scenario row
  const cliOpts = { promote: 'Carol' };            // adjust per scenario row
  const scenario = parseScenario(cliOpts, target);
  const before = snapshot(roster, data, target);
  const mutated = applyScenario(roster, data, scenario);
  const after = snapshot(mutated, data, target);
  const coverageDiff = diffCoverage(before.coverage, after.coverage);
  const riskDiff = diffRisks(before.risks, after.risks);
  process.stdout.write(whatIfToText({ scenario, coverageDiff, riskDiff, data }));
  function snapshot(r, d, t) {
    const resolved = resolveTeam(r, d, t);
    const coverage = computeCoverage(resolved, d);
    const risks = detectRisks({ resolvedTeam: resolved, coverage, data: d });
    return { coverage, risks };
  }
"
```

For JSON: replace the final `process.stdout.write` with
`process.stdout.write(JSON.stringify(whatIfToJson({ scenario, coverageDiff, riskDiff }), null, 2) + '\n')`.
For markdown: with `process.stdout.write(whatIfToMarkdown({ scenario, coverageDiff, riskDiff }))`.
The README documents the regeneration command and a per-scenario `(target,
cliOpts)` table.

- **Verify:** Each of the 15 fixture files is non-empty; the JSON files parse
  with `node -e "JSON.parse(require('fs').readFileSync('<path>','utf8'))"`.
  Hand-eyeball the text fixtures for the expected `Capability changes:` /
  `Risk changes:` headings and the markdown fixtures for the expected
  `# <type> scenario` heading + capability table. Commit alone — no source
  changes in this step's commit.

## Step 2 — Add `WhatIfReport` typedefs and `buildWhatIfReport`

- **Modified:** `products/summit/src/aggregation/what-if.js`

Add JSDoc typedefs and a pure assembly helper at the top of the module
(below the existing `Scenario`/`Roster` typedefs):

```js
/**
 * @typedef {object} TeamSnapshotPair
 * @property {object} before    // result of computeCoverage + detectRisks pre-mutation
 * @property {object} after     // same, post-mutation
 *
 * @typedef {object} TeamDiff
 * @property {string} teamId
 * @property {"source" | "destination" | "target"} role
 * @property {{ capabilityChanges: Array<object> }} coverageDiff
 * @property {object} riskDiff
 *
 * @typedef {object} WhatIfReport
 * @property {Scenario} scenario
 * @property {TeamDiff[]} teamDiffs
 */

/**
 * Assemble a WhatIfReport from per-team snapshot pairs.
 * Length 1 (target) for add/remove/promote; length 2 (source, destination)
 * for move.
 *
 * @param {object} params
 * @param {Scenario} params.scenario
 * @param {Array<{ teamId: string, role: "source" | "destination" | "target", before: object, after: object }>} params.teams
 * @returns {WhatIfReport}
 */
export function buildWhatIfReport({ scenario, teams }) {
  return {
    scenario,
    teamDiffs: teams.map(({ teamId, role, before, after }) => ({
      teamId,
      role,
      coverageDiff: diffCoverage(before.coverage, after.coverage),
      riskDiff: diffRisks(before.risks, after.risks),
    })),
  };
}
```

The helper is a single-pass `map` over the input pairs; it does not introduce
any new diff logic — it calls the existing `diffCoverage` and `diffRisks` per
team. No other functions in `what-if.js` change.

- **Verify:** `grep -n 'buildWhatIfReport\|WhatIfReport\|TeamDiff' products/summit/src/aggregation/what-if.js`
  shows the new typedefs and helper. `bun run check` passes (the function is
  not yet wired up but the file still parses).

## Step 3 — Refactor `runWhatIfCommand` to compute destination snapshot and call `buildWhatIfReport`

- **Modified:** `products/summit/src/commands/what-if.js`

Replace the current single-team computation block (today's lines 43–56) with:
resolve the source `before`/`after`, then for `--move` resolve the destination
`before`/`after` against the same unmutated/`mutated` rosters, then assemble a
`WhatIfReport` and pass it to all three formatters under one parameter shape.

```js
import {
  applyScenario,
  buildWhatIfReport,
  diffCoverage,
  diffRisks,
} from "../aggregation/what-if.js";
// ...

const before = computeSnapshot(roster, data, target);
let mutated;
try {
  mutated = applyScenario(roster, data, scenario);
} catch (e) {
  if (e instanceof ScenarioError) {
    throw new Error(e.message, { cause: e });
  }
  throw e;
}
const after = computeSnapshot(mutated, data, target);

const teams = [
  {
    teamId: target.teamId ?? target.projectId,
    role: scenario.type === "move" ? "source" : "target",
    before,
    after,
  },
];
if (scenario.type === "move") {
  const destTarget = { teamId: scenario.toTeamId };
  teams.push({
    teamId: scenario.toTeamId,
    role: "destination",
    before: computeSnapshot(roster, data, destTarget),
    after: computeSnapshot(mutated, data, destTarget),
  });
}

const report = buildWhatIfReport({ scenario, teams });

if (format === Format.JSON) {
  process.stdout.write(JSON.stringify(whatIfToJson({ report }), null, 2) + "\n");
  return;
}
if (format === Format.MARKDOWN) {
  process.stdout.write(whatIfToMarkdown({ report }));
  return;
}
process.stdout.write(whatIfToText({ report, data }));
```

The `diffCoverage` / `diffRisks` imports remain (they are still re-exported by
`what-if.js`); `buildWhatIfReport` is now imported alongside them. `target`'s
`teamId ?? projectId` projection covers the `--project` case (the project id
is the wire `teamId` for the single-team report); no formatter needs to know
that distinction.

- **Verify:** `grep -n 'coverageDiff\b\|riskDiff\b' products/summit/src/commands/what-if.js`
  returns zero matches (the handler now passes only `report`). `grep -n
  'computeSnapshot' products/summit/src/commands/what-if.js` shows the helper
  called twice for non-move (1 source pair) and four times for move (2 source
  + 2 destination snapshots). The handler still passes `data` to
  `whatIfToText` (text formatter needs `data` for `--focus` filtering — design
  decision held).

## Step 4 — Refactor text formatter to consume `WhatIfReport`

- **Modified:** `products/summit/src/formatters/what-if/text.js`

Drop the `{ scenario, coverageDiff, riskDiff, data }` parameter shape; accept
`{ report, data }` instead. Iterate `report.teamDiffs`. For length 1 (the
non-move path), emit the existing layout exactly — no `[teamId]` heading
prefix, identical leading-whitespace and blank-line structure. For length 2
(move), emit two labelled sections; each section opens with `  Source team
\`<id>\`:` or `  Destination team \`<id>\`:` followed by the existing
`Capability changes:` / `Risk changes:` block.

The `headline()` helper stays — it prints the existing single line at the top
(`Adding …:`, `Removing …:`, `Moving … from … to …:`, `Promoting …:`). The
per-team labels appear below it for the move path.

```js
export function whatIfToText({ report, data }) {
  const { scenario, teamDiffs } = report;
  const lines = [];
  lines.push(`  ${headline(scenario)}`);
  lines.push("");
  if (teamDiffs.length === 1) {
    appendDiffLines(lines, teamDiffs[0], scenario, data);
  } else {
    for (const td of teamDiffs) {
      const label = td.role === "source"
        ? `Source team \`${td.teamId}\`:`
        : `Destination team \`${td.teamId}\`:`;
      lines.push(`  ${label}`);
      lines.push("");
      appendDiffLines(lines, td, scenario, data);
    }
  }
  return lines.join("\n");
}

// `appendDiffLines` is the existing inline body of whatIfToText (capability +
// risk renderer), pulled out to a function taking (lines, teamDiff, scenario,
// data). No other rendering changes — same `+`/`-`/`=` symbols, same
// "(no skill-level changes)" / "(no risk changes)" empty-state lines, same
// trailing blank line.
```

`filterFocus(changes, focus, data)` and `renderRiskDiff(riskDiff)` stay
verbatim and are called from `appendDiffLines`. `headline()` stays verbatim.

- **Verify:** Step 7 Test 1 confirms move output has both labelled sections;
  Step 7 Test 4 confirms non-move output is byte-identical to the captured
  fixtures. `grep -nE '\b(coverageDiff|riskDiff)\b' products/summit/src/formatters/what-if/text.js`
  returns zero matches (the formatter now receives `report.teamDiffs` only).

## Step 5 — Refactor JSON formatter to consume `WhatIfReport` (with `move` branch)

- **Modified:** `products/summit/src/formatters/what-if/json.js`

Accept `{ report }`. Branch on `scenario.type === "move"`. For non-move, emit
the existing flat shape from `teamDiffs[0]`. For move, emit the new envelope
listing both teams.

```js
export function whatIfToJson({ report }) {
  const { scenario, teamDiffs } = report;
  if (scenario.type === "move") {
    return {
      scenario,
      diff: {
        teams: teamDiffs.map((td) => ({
          teamId: td.teamId,
          role: td.role,
          capabilityChanges: td.coverageDiff.capabilityChanges,
          riskChanges: td.riskDiff,
        })),
      },
    };
  }
  const td = teamDiffs[0];
  return {
    scenario,
    diff: {
      capabilityChanges: td.coverageDiff.capabilityChanges,
      riskChanges: td.riskDiff,
    },
  };
}
```

The non-move path produces the same `{ scenario, diff: { capabilityChanges,
riskChanges } }` object as today (criterion #4 held).

- **Verify:** Step 7 Test 2 confirms move output has `diff.teams.length === 2`
  with `teamId` + `role` per entry; Test 4 confirms non-move output JSON-
  equals the captured fixtures.

## Step 6 — Refactor markdown formatter to consume `WhatIfReport`

- **Modified:** `products/summit/src/formatters/what-if/markdown.js`

Accept `{ report }`. For length 1, emit today's `# <type> scenario` heading +
single capability table. For length 2 (move), emit `# move scenario` followed
by two labelled `## Source team \`<src>\`` / `## Destination team \`<dst>\``
sections, each above its own table.

```js
export function whatIfToMarkdown({ report }) {
  const { scenario, teamDiffs } = report;
  const lines = [];
  lines.push(`# ${scenario.type} scenario`);
  lines.push("");
  if (teamDiffs.length === 1) {
    appendCapabilityTable(lines, teamDiffs[0]);
  } else {
    for (const td of teamDiffs) {
      const label = td.role === "source"
        ? `Source team \`${td.teamId}\``
        : `Destination team \`${td.teamId}\``;
      lines.push(`## ${label}`);
      lines.push("");
      appendCapabilityTable(lines, td);
      lines.push("");
    }
  }
  return lines.join("\n") + "\n";
}

// `appendCapabilityTable(lines, teamDiff)` writes today's
// `| Skill | Before | After | Direction |` table from
// `teamDiff.coverageDiff.capabilityChanges`.
```

Risk-changes rendering is not currently in the markdown formatter (today's
`whatIfToMarkdown` only emits capability changes — verified at lines 12–24 of
the file). This plan does **not** add risk rendering to the markdown
formatter — out of scope for this spec, which only requires that the move
path render two labelled sections, each with its own capability-changes
table (criterion #3).

- **Verify:** Step 7 Test 3 confirms move output has two `## … team` headings;
  Test 4 confirms non-move output is byte-identical to the captured fixtures.

## Step 7 — Tests aligned to spec success criteria

- **Modified:** `products/summit/test/what-if.test.js`
- **Created:** `products/summit/test/what-if-formatters.test.js`

| #   | Test                                                                                                                                                                                                                                          | File                              | Spec criterion |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | -------------- |
| 1   | "text formatter renders both team sections for --move" — build a `WhatIfReport` for `--move Alice from a to b` against a fixture where Alice's transit changes capability depth on `b`; assert output contains both `Source team \`a\`:` and `Destination team \`b\`:` literal substrings, and that the SPOF-removal line for the destination team appears below the destination label rather than the source label (criterion #6 covered here as well). | `what-if-formatters.test.js`      | #1, #6         |
| 2   | "json formatter emits teams[] for --move" — same report; `whatIfToJson({ report })` returns `diff.teams` with `length === 2`; entry `[0]` has `teamId === "a"` and `role === "source"`, entry `[1]` has `teamId === "b"` and `role === "destination"`; both entries carry `capabilityChanges: Array` and `riskChanges: object`. | `what-if-formatters.test.js`      | #2             |
| 3   | "markdown formatter renders both team headings for --move" — same report; `whatIfToMarkdown({ report })` contains both `## Source team \`a\`` and `## Destination team \`b\`` literal substrings; each is followed within the next four lines by a `\| Skill \|` table header. | `what-if-formatters.test.js`      | #3             |
| 4   | "non-move scenarios match captured fixtures byte-for-byte" — for each of the five (scenario-id, format) tuples in the Step 1 table, drive the same handler path used by the regeneration script and `assert.equal(output, fs.readFileSync(<fixture>, "utf8"))`. Three formats × five scenarios = 15 assertions in one test, named per tuple. | `what-if-formatters.test.js`      | #4             |
| 5   | "applyScenario move: source after-snapshot loses skill, destination after-snapshot gains it" — fixture where the moved member is the only carrier of `task_completion` on either team; build the report; assert source `coverageDiff.capabilityChanges` shows `task_completion` direction `down`, destination shows direction `up`, against the same `mutated` roster. | `what-if.test.js` (new test case) | #7             |
| 6   | "runWhatIfCommand assembles a WhatIfReport with two teamDiffs for move" — call `runWhatIfCommand` (or its testable core via `whatIfToJson` capture) for a `--move` scenario; assert `report.teamDiffs.length === 2` and roles `["source", "destination"]` in order. | `what-if-formatters.test.js`      | command wiring |
| 7   | "CLI help string names source/destination roles" (criterion #5) — read `products/summit/bin/fit-summit.js` source via `fs.readFileSync`; assert the `what-if` block's `--move` description contains both `source` and `to`/`destination`, and the `--to` description contains both `destination` and `move`. Static inspection — does not boot the CLI. | `what-if-formatters.test.js`      | #5             |

The seven tests use `parseRosterYaml(FIXTURE_ROSTER)` and `loadStarterData()`
from `products/summit/test/fixtures.js` (already imported by `what-if.test.js`)
and `spy()` from `@forwardimpact/libharness` only if Test 6 needs to capture
stdout (otherwise the test calls `whatIfToJson({ report })` directly and
inspects the returned object).

For Test 1 the destination-side risk fixture: extend the move fixture so
`b` has Bob alone carrying a skill that `task_completion` SPOF detection
fires on; Alice's arrival removes the SPOF. The `risks.test.js` fixtures
already demonstrate the SPOF-construction recipe — reuse the pattern.

- **Verify:** `bun test products/summit/test/what-if-formatters.test.js`
  passes (7 cases). `bun test products/summit/test/what-if.test.js` passes
  (existing 11 + 1 new = 12 cases). `bun run test` passes from monorepo root.

## Step 8 — Update CLI help strings (criterion #5)

- **Modified:** `products/summit/bin/fit-summit.js`

In the `what-if` command block (today's lines 105–136), update three strings:

| Field                            | Current text                                          | New text                                                                                                  |
| -------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `description` (subcommand)       | `Simulate roster changes`                             | `Simulate roster changes (the team is the source for --move, otherwise the target team for the diff)`     |
| `options.move.description`       | `Move a member between teams`                         | `Move a member out of <team> (the source) to --to (the destination)`                                       |
| `options.to.description`         | `Destination team for --move`                         | `Destination team for --move (receives the member); the diff covers both teams`                            |

Add one example to the `examples` array (after the existing three):

```js
"fit-summit what-if platform --move 'Alice' --to 'payments'",
```

No other CLI changes — the positional `<team>` syntax stays, the option list
stays, and global options are untouched.

- **Verify:** `node products/summit/bin/fit-summit.js what-if --help`
  prints help text containing the literal substrings `source for --move`,
  `out of <team>`, and `receives the member` (Test 7 covers this via static
  inspection too).

## Step 9 — Update READMEs / JSDoc only where references break

- **Modified:** `products/summit/src/commands/what-if.js` JSDoc top comment —
  the existing one-line comment still describes the command correctly; no
  edit. The `runWhatIfCommand` JSDoc params block stays valid.

No other documentation references the formatter parameter shapes:
`grep -nE 'whatIfToText|whatIfToJson|whatIfToMarkdown' websites/ libraries/ services/`
returns zero matches outside this product.

- **Verify:** `bun run check` passes.

## Cross-step sequencing

Steps 3, 4, 5, and 6 form one atomic parameter-shape migration: after Step 3
the handler passes `{ report }` (and `{ report, data }` for text), but until
all three formatters update they will receive an unrecognised parameter shape.
Treat Steps 3–6 as one commit (or four sequential commits with a single CI
gate at the end of Step 6). Step 1 (snapshot fixtures) **must** be a
**separate prior commit** on the branch before Step 2 — the captured bytes
are the contract Step 4–6 must preserve. Step 2 can land in a standalone
commit (it adds an unused helper; check stays green). Step 7 (tests) lands
after Step 6; Step 8 (help text) is independent and may land in any order
after Step 1.

Suggested commit boundaries on the implementation branch:
1. Step 1 (fixtures + README) — separate commit.
2. Step 2 (helper + typedefs) — separate commit.
3. Steps 3–6 (handler + three formatters) — single commit.
4. Step 7 (tests) — separate commit.
5. Step 8 (help text) — separate commit.

## Risks (implementer-blind)

- **Snapshot fixture brittleness under `FIXTURE_ROSTER` drift.** If a future
  spec edits `FIXTURE_ROSTER` in `products/summit/test/fixtures.js`, all 15
  fixture files become stale silently (the test still passes against the new
  bytes after a regeneration but the reviewer cannot tell whether the regen
  was deliberate or a covered-up regression). The Step 1 README documents
  that the fixtures are regenerated only when the upstream contract or
  fixture roster intentionally changes; keep the fixtures alphabetically
  ordered so a unified diff highlights any shape drift.
- **Project-team `target.projectId` projection in Step 3.** The handler today
  passes `target` (`{ teamId }` or `{ projectId }`) into `computeSnapshot` and
  `parseScenario`. The new `teams[0].teamId` projection picks `target.teamId
  ?? target.projectId` so the wire id is always populated. Verify against
  the `add-project` fixture: the scenario's wire `teamId` reads
  `"migration-q2"` (the project id), not `undefined`. The helper does not
  introduce a new `projectId`-vs-`teamId` distinction — the formatter writes
  whatever string it receives.
- **`buildWhatIfReport` and the `--move` cross-type guard.** `doMove` already
  throws `ScenarioError` when source or destination is a project team
  (`what-if.js:201–204`); the `runWhatIfCommand` `applyScenario` call sits
  inside a try/catch that converts `ScenarioError` to a user-facing
  `Error.message`. The destination-snapshot block in Step 3 runs **after**
  `applyScenario` returns successfully, so it never executes for an invalid
  cross-type move. No new guard needed.
- **Risk-section duplication on the source side for symmetric moves.**
  When the moved member's transit causes a risk change on the source team
  (e.g. losing the only J060 turns an existing skill into a new SPOF), the
  source-side `riskDiff.added` carries that change. When the same change
  resolves a risk on the destination team, the destination-side
  `riskDiff.removed` carries it. Both should appear, each under its own
  team's heading. Test 1 covers the destination-side case explicitly (per
  criterion #6); add an assertion that the source-side risk lines do **not**
  contain the destination-team's skill id, to guard against accidental
  cross-team rendering during the formatter rewrite.
- **`headline()` accuracy for projects under `--move`.** `--move` is
  reporting-team-only (guarded by `doMove`); `headline()`'s `Moving … from
  <target> to <toTeamId>` line works because both ids are reporting-team
  ids by construction. No project-id branch is needed here.
- **Existing `whatIfToText({ scenario, coverageDiff, riskDiff, data })` call
  sites outside `runWhatIfCommand`.** `grep -nE 'whatIfToText|whatIfToJson|whatIfToMarkdown'
  products/summit/`: today all three formatters are imported only by
  `src/commands/what-if.js` (single call site each) plus their respective
  test files. Steps 4–6 update the single production call site; Step 7
  rewrites the test calls. No other callers exist.

## Execution

Single-agent sequential execution by `staff-engineer` (or any engineering
agent) via `kata-implement`. Steps 1–9 are sequenced because Step 2's helper
is consumed in Step 3, Steps 4–6 depend on Step 3's handler shape, and
Step 7's fixture-equality assertions depend on Step 1's captured bytes.
Total expected diff: ~250 lines added (helper + new tests + 15 fixture
files), ~80 lines removed/replaced (formatter rewrites). No parallel
decomposition warranted — the parameter-shape migration is a single concern.

Pair this plan with the `kata-implement` skill — implementation runs
`bun run check` + `bun run test` after each commit boundary and opens one
implementation PR.

— Staff Engineer 🛠️
