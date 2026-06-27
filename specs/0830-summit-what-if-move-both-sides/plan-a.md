# Plan 0830-A — `fit-summit what-if --move` two-sided rendering

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

Libraries used: `@forwardimpact/libmock` (`spy` — Test 6 only).

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
| Text — move section labels                                              | `Source team \`<src>\`:` and `  Destination team \`<dst>\`:`, each above its own `Capability changes:` + `Risk changes:` blocks.                                                    |
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
- **Created:** `products/summit/test/fixtures/what-if/rows.mjs` — exports
  `ROWS` only, no top-level side effects. Imported by both `regenerate.mjs`
  and Step 7 Test 4 so the per-row scenario table is the single source of
  truth.
- **Created:** `products/summit/test/fixtures/what-if/regenerate.mjs` — the
  regeneration script (body in the code block below). The script's body
  is guarded so the side-effecting `writeFileSync` loop only runs when
  the file is invoked directly (`node regenerate.mjs`) — never on import.
  Step 6 migrates this script to the post-refactor parameter shape so a
  future regeneration produces byte-identical output to the Step 1 commit.
- **Created:** `products/summit/test/fixtures/what-if/README.md` — documents the
  regeneration command
  (`node products/summit/test/fixtures/what-if/regenerate.mjs`), the fixture
  roster used (`FIXTURE_ROSTER`), the per-row scenario table, the rule that
  fixtures are regenerated only when the upstream contract intentionally changes
  (never silently after a refactor), and the byte-identity invariant that any
  post-Step-6 regeneration must produce the exact same bytes as the Step 1
  commit.

The five scenario-ids and their literal `target` / `cliOpts` values against
`FIXTURE_ROSTER` (`products/summit/test/fixtures.js`). Each row's `cliOpts`
is the exact object passed to `parseScenario(cliOpts, target)` — note the
`add` rows pass the YAML expression as a single string (the same form the
real CLI receives via `--add '{ ... }'`):

| scenario-id      | `target`                          | `cliOpts`                                                                                          |
| ---------------- | --------------------------------- | -------------------------------------------------------------------------------------------------- |
| `add-reporting`  | `{ teamId: "platform" }`          | `{ add: "{ discipline: software_engineering, level: J060 }" }`                                     |
| `add-project`    | `{ projectId: "migration-q2" }`   | `{ add: "{ discipline: software_engineering, level: J060 }", allocation: "0.5" }`                  |
| `remove`         | `{ teamId: "platform" }`          | `{ remove: "Bob" }`                                                                                |
| `promote`        | `{ teamId: "platform" }`          | `{ promote: "Carol" }`                                                                             |
| `promote-focus`  | `{ teamId: "platform" }`          | `{ promote: "Carol", focus: "delivery" }`                                                          |

Regeneration script — write a single regeneration helper at
`products/summit/test/fixtures/what-if/regenerate.mjs` that loops over the
five rows × three formats, writes each fixture file, and is invoked once
(`node products/summit/test/fixtures/what-if/regenerate.mjs`) to produce all
15 files at once. Per-format trailing-newline handling matches what
`runWhatIfCommand` writes to stdout today: text output already ends in `\n`
(the `lines.join("\n")` body ends with a pushed empty string); JSON output
appends `+ "\n"` after `JSON.stringify(..., null, 2)`; markdown ends in `\n`
already (`lines.join("\n") + "\n"`). The post-Step-6 test (Step 7 Test 4)
must replay the same trailing-newline rules.

```js
// products/summit/test/fixtures/what-if/rows.mjs
export const ROWS = [
  { id: "add-reporting", target: { teamId: "platform" },        cliOpts: { add: "{ discipline: software_engineering, level: J060 }" } },
  { id: "add-project",   target: { projectId: "migration-q2" }, cliOpts: { add: "{ discipline: software_engineering, level: J060 }", allocation: "0.5" } },
  { id: "remove",        target: { teamId: "platform" },        cliOpts: { remove: "Bob" } },
  { id: "promote",       target: { teamId: "platform" },        cliOpts: { promote: "Carol" } },
  { id: "promote-focus", target: { teamId: "platform" },        cliOpts: { promote: "Carol", focus: "delivery" } },
];
```

```js
// products/summit/test/fixtures/what-if/regenerate.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { parseRosterYaml } from "../../../src/roster/yaml.js";
import { applyScenario, diffCoverage, diffRisks } from "../../../src/aggregation/what-if.js";
import { computeCoverage, resolveTeam } from "../../../src/aggregation/coverage.js";
import { detectRisks } from "../../../src/aggregation/risks.js";
import { parseScenario } from "../../../src/aggregation/scenarios.js";
import { whatIfToText } from "../../../src/formatters/what-if/text.js";
import { whatIfToJson } from "../../../src/formatters/what-if/json.js";
import { whatIfToMarkdown } from "../../../src/formatters/what-if/markdown.js";
import { FIXTURE_ROSTER, loadStarterData } from "../../fixtures.js";
import { ROWS } from "./rows.mjs";

async function main() {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const { data } = await loadStarterData();
  function snap(r, t) {
    const resolved = resolveTeam(r, data, t);
    const coverage = computeCoverage(resolved, data);
    const risks = detectRisks({ resolvedTeam: resolved, coverage, data });
    return { coverage, risks };
  }
  for (const { id, target, cliOpts } of ROWS) {
    const roster = parseRosterYaml(FIXTURE_ROSTER);
    const scenario = parseScenario(cliOpts, target);
    const before = snap(roster, target);
    const mutated = applyScenario(roster, data, scenario);
    const after = snap(mutated, target);
    const coverageDiff = diffCoverage(before.coverage, after.coverage);
    const riskDiff = diffRisks(before.risks, after.risks);
    writeFileSync(join(HERE, `${id}.txt`), whatIfToText({ scenario, coverageDiff, riskDiff, data }));
    writeFileSync(join(HERE, `${id}.json`), JSON.stringify(whatIfToJson({ scenario, coverageDiff, riskDiff }), null, 2) + "\n");
    writeFileSync(join(HERE, `${id}.md`),  whatIfToMarkdown({ scenario, coverageDiff, riskDiff }));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
```

The `import.meta.url === \`file://${process.argv[1]}\`` guard ensures the
script only runs its side-effecting body when invoked directly — importing
from a test file (e.g. `import { ROWS } from "./fixtures/what-if/rows.mjs"`)
or from `regenerate.mjs` itself does not trigger fixture writes. The
script runs under `node` (not `bun`) to match the production handler's
serialization exactly.

- **Verify:** Each of the 15 fixture files is non-empty; each `.json` parses
  with `JSON.parse(fs.readFileSync(...))`; each file ends with a trailing
  `\n` byte. `node products/summit/test/fixtures/what-if/regenerate.mjs`
  re-runs cleanly and produces no diff against the committed fixtures
  (idempotency check). Commit `rows.mjs` + `regenerate.mjs` + the 15
  fixtures + `README.md` together with no source-code changes — this
  commit must land before Step 2 so the fixtures capture pre-refactor
  bytes.

## Step 2 — Add `WhatIfReport` typedefs and `buildWhatIfReport`

- **Modified:** `products/summit/src/aggregation/what-if.js`

Add JSDoc typedefs and a pure assembly helper at the top of the module
(below the existing `Scenario`/`Roster` typedefs):

```js
/**
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

- **Verify:**
  `grep -n 'buildWhatIfReport\|WhatIfReport\|TeamDiff' products/summit/src/aggregation/what-if.js`
  shows the new typedefs and helper. `bun run check` passes (the function is not
  yet wired up but the file still parses).

## Step 3 — Refactor `runWhatIfCommand` to compute destination snapshot and call `buildWhatIfReport`

- **Modified:** `products/summit/src/commands/what-if.js`

Replace the current single-team computation block (today's lines 43–56) with:
resolve the source `before`/`after`, then for `--move` resolve the destination
`before`/`after` against the same unmutated/`mutated` rosters, then assemble a
`WhatIfReport` and pass it to all three formatters under one parameter shape.

Replace the existing import line
`import { applyScenario, diffCoverage, diffRisks } from "../aggregation/what-if.js";`
with
`import { applyScenario, buildWhatIfReport } from "../aggregation/what-if.js";`
— the handler no longer calls `diffCoverage` or `diffRisks` directly (they move
inside `buildWhatIfReport`). All other imports are unchanged.

```js
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

- **Verify:**
  `grep -nE '\b(coverageDiff|riskDiff)\b' products/summit/src/commands/what-if.js`
  returns zero matches.
  `grep -c 'computeSnapshot(' products/summit/src/commands/what-if.js` reports
  `5` (one `function computeSnapshot(` declaration plus four call sites: source
  before/after on every scenario plus destination before/after inside the
  `if (scenario.type === "move")` block). `whatIfToText` still receives
  `{ report, data }` (`data` feeds `filterFocus`).

## Step 4 — Refactor text formatter to consume `WhatIfReport`

- **Modified:** `products/summit/src/formatters/what-if/text.js`

Drop the `{ scenario, coverageDiff, riskDiff, data }` parameter shape; accept
`{ report, data }` instead. Iterate `report.teamDiffs`. For length 1 (the
non-move path), emit the existing layout exactly — no `[teamId]` heading
prefix, identical leading-whitespace and blank-line structure. For length 2
(move), emit two labelled sections; each section opens with `Source team
\`<id>\`:` or ` Destination team \`<id>\`:` followed by the existing
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
  fixtures.
  `grep -nE '\b(coverageDiff|riskDiff)\b' products/summit/src/formatters/what-if/text.js`
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

## Step 6 — Refactor markdown formatter and migrate `regenerate.mjs`

- **Modified:** `products/summit/src/formatters/what-if/markdown.js`
- **Modified:** `products/summit/test/fixtures/what-if/regenerate.mjs` — inside
  the `main()` body, replace the per-row `coverageDiff`/`riskDiff` pair plus the
  three legacy-shape formatter calls with one
  `buildWhatIfReport({ scenario, teams: [{ teamId: target.teamId ?? target.projectId, role: "target", before, after }] })`
  call followed by `whatIfToText({ report, data })`,
  `JSON.stringify(whatIfToJson({ report }), null, 2) + "\n"`, and
  `whatIfToMarkdown({ report })`. Drop the `diffCoverage`/`diffRisks` imports
  and add `buildWhatIfReport`. `rows.mjs` is unchanged. The post-Step-6 script
  must produce byte-identical output to the Step 1 commit when re-run on a clean
  checkout — this is the regression invariant Step 7 Test 4 enforces.

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
    teamDiffs.forEach((td, i) => {
      if (i > 0) lines.push("");
      const label = td.role === "source"
        ? `Source team \`${td.teamId}\``
        : `Destination team \`${td.teamId}\``;
      lines.push(`## ${label}`);
      lines.push("");
      appendCapabilityTable(lines, td);
    });
  }
  return lines.join("\n") + "\n";
}

// `appendCapabilityTable(lines, teamDiff)` writes today's
// `| Skill | Before | After | Direction |` table from
// `teamDiff.coverageDiff.capabilityChanges`. Section separator (blank
// line between sections) is emitted before each section after the first;
// no trailing empty line after the last section so the output ends with
// a single `\n`.
```

The markdown formatter does not render risk changes today, and this plan
does not add risk rendering to it.

- **Verify:** Step 7 Test 3 confirms move output has two `## … team` headings;
  Test 4 confirms non-move output is byte-identical to the captured fixtures.

## Step 7 — Tests aligned to spec success criteria

- **Modified:** `products/summit/test/what-if.test.js`
- **Created:** `products/summit/test/what-if-formatters.test.js`

### Move-test fixture

Tests 1, 2, 3, 5, and 6 require two reporting teams. `FIXTURE_ROSTER` has
only one. Both `what-if-formatters.test.js` and `what-if.test.js` (Test 5)
need this constant, so place it at module scope of each file (5 lines of
YAML duplicated is cheaper than threading a shared module through the
fixture imports — match the pattern `what-if.test.js:122–138` already uses
for the existing move test):

```js
const MOVE_FIXTURE_YAML = `
teams:
  a:
    - name: Alice
      email: alice@example.com
      job: { discipline: software_engineering, level: J060 }
    - name: Carol
      email: carol@example.com
      job: { discipline: software_engineering, level: J060 }
  b:
    - name: Bob
      email: bob@example.com
      job: { discipline: software_engineering, level: J060 }
`;
```

Working-depth holder count for `task_completion` on the starter standard:

- `a` before move: 2 (Alice + Carol). After move: 1 (Carol).
  → SPOF appears on `a` (`riskDiff.added.singlePoints` includes
  `task_completion`).
- `b` before move: 1 (Bob alone) — `task_completion` is a SPOF on `b`.
  After move: 2 (Bob + Alice). → SPOF resolved on `b`
  (`riskDiff.removed.singlePoints` includes `task_completion`).
- Capability direction: `a` shows `down` for `task_completion` (depth
  2 → 1); `b` shows `up` (depth 1 → 2).

The fixture-behaviour above was verified empirically against `main` HEAD
during plan authoring (per the "plan-script empirical verification"
recurring pattern). The implementer should re-verify on the implementation
branch before committing the tests — a one-liner that runs
`detectRisks`/`diffRisks` against the fixture and prints the SPOF
added/removed lists is sufficient.

### Test catalogue

| #   | Test                                                                                                                                                                                                                                          | File                              | Spec criterion |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | -------------- |
| 1 | "text formatter renders both team sections for --move" — build a `WhatIfReport` for `--move Alice` from `a` to `b` against `MOVE_FIXTURE_YAML`; render via `whatIfToText`; split the output into the source section (between the `Source team \`a\`:` line and the `Destination team \`b\`:` line) and the destination section (after the `Destination team \`b\`:` line); assert `output.indexOf("Source team \`a\`:") < output.indexOf("Destination team \`b\`:")`; assert the source section contains the literal capability line `- task_completion  depth: 2 → 1` (note two spaces; matches text formatter line 38) and the literal risk line `+ task_completion became single point of failure`; assert the destination section contains `+ task_completion  depth: 1 → 2` and `- task_completion no longer single point of failure`; assert the destination section does **not** contain `- task_completion  depth:` (the direction-`down` capability line — distinguished from the `- task_completion no longer …` risk line by the `  depth:` substring) and does **not** contain `+ task_completion became single point of failure` (the source-side risk line). Covers criterion #1 (per-team labelling) and criterion #6 (destination-only risk-resolution rendering). | `what-if-formatters.test.js` | #1, #6 |  |
| 2   | "json formatter emits teams[] for --move" — same report; `whatIfToJson({ report })` returns `diff.teams` with `length === 2`; entry `[0]` has `teamId === "a"` and `role === "source"`; entry `[1]` has `teamId === "b"` and `role === "destination"`; both entries carry `capabilityChanges: Array` and `riskChanges: object`. | `what-if-formatters.test.js`      | #2             |
| 3 | "markdown formatter renders both team headings for --move" — same report; `whatIfToMarkdown({ report })` contains both `## Source team \`a\`` and `## Destination team \`b\`` literal substrings; each is followed within the next four lines by a `\| Skill \|` table header. | `what-if-formatters.test.js` | #3 |  |
| 4   | "non-move scenarios match captured fixtures byte-for-byte" — `import { ROWS } from "./fixtures/what-if/rows.mjs"` (the test file lives at `products/summit/test/what-if-formatters.test.js`, so the relative path is `./fixtures/what-if/rows.mjs`); replicate `regenerate.mjs`'s local `snap(roster, target)` helper inline at module scope (six lines: `resolveTeam` + `computeCoverage` + `detectRisks`); for each row, parse `FIXTURE_ROSTER`, run `parseScenario(cliOpts, target)` → `applyScenario` → before/after `snap()` → `buildWhatIfReport({ scenario, teams: [{ teamId: target.teamId ?? target.projectId, role: "target", before, after }] })`, then call each formatter with the new `{ report }` shape, mirroring the production handler's serialization (text raw write; JSON `JSON.stringify(..., null, 2) + "\n"`; markdown raw write). Assert `assert.equal(output, fs.readFileSync(<fixture>, "utf8"))` per (row, format) — 15 assertions in one parameterised test using a `for (const { id, target, cliOpts } of ROWS)` loop. | `what-if-formatters.test.js`      | #4             |
| 5   | "what-if move: source loses skill, destination gains it on the same mutation" — `MOVE_FIXTURE_YAML`; build the report; assert source-side `coverageDiff.capabilityChanges` finds `task_completion` with `direction === "down"` and destination-side finds `direction === "up"`. | `what-if.test.js` (new test case) | #7             |
| 6   | "runWhatIfCommand emits diff.teams[] for --move via JSON output" — write `MOVE_FIXTURE_YAML` to a tmp file via `mkdtempSync` + `writeFileSync`; load `data` via `await loadStarterData()`; install the stdout spy via the save-replace-restore pattern below; call `runWhatIfCommand({ data, args: ["a"], options: { roster: tmpFile, move: "Alice", to: "b", format: "json" } })`; restore stdout in `finally`; remove the tmp dir via `rmSync(tmpDir, { recursive: true })` in the same `finally`; parse the captured JSON; assert `parsed.diff.teams.length === 2`, `parsed.diff.teams[0].role === "source"`, `parsed.diff.teams[1].role === "destination"`, and `parsed.diff.teams.map(t => t.teamId)` equals `["a", "b"]`. The tmp-file path is the only viable channel — ESM module bindings cannot be monkey-patched from the test. Exercises the command-level wiring of the destination snapshot (design Risk #4). | `what-if-formatters.test.js`      | command wiring |
| 7   | "CLI help strings name source/destination roles" (criterion #5) — read `products/summit/bin/fit-summit.js` source via `fs.readFileSync`; lower-case the matched substrings; assert the `what-if` block's subcommand `description` contains `source for --move`; the `options.move.description` contains both `source` and `--to`; the `options.to.description` contains both `destination` and `move`. Static inspection — does not boot the CLI. | `what-if-formatters.test.js`      | #5             |

Test 6 imports `spy` from `@forwardimpact/libmock` directly (the
package is a workspace dependency of `products/summit`; other summit tests
import named exports from it via `fixtures.js`). The stdout spy install
pattern is:

```js
const tmpDir = mkdtempSync(join(tmpdir(), "summit-whatif-"));
const tmpFile = join(tmpDir, "roster.yaml");
writeFileSync(tmpFile, MOVE_FIXTURE_YAML);
const original = process.stdout.write.bind(process.stdout);
const captured = [];
const writer = spy((chunk) => { captured.push(String(chunk)); return true; });
process.stdout.write = writer;
try {
  await runWhatIfCommand({ data, args: ["a"], options: { roster: tmpFile, move: "Alice", to: "b", format: "json" } });
} finally {
  process.stdout.write = original;
  rmSync(tmpDir, { recursive: true });
}
const parsed = JSON.parse(captured.join(""));
```

The `try/finally` block guarantees stdout is restored and the tmp dir is removed
even when assertions fail mid-run (otherwise leaked stdout replacement would
corrupt subsequent tests' output and `/tmp` would fill up over repeated runs).
All other tests call formatter functions directly and inspect returned
strings/objects. `MOVE_FIXTURE_YAML` is duplicated at module scope in both test
files (Test 5 lives in `what-if.test.js`; Tests 1/2/3/6 live in
`what-if-formatters.test.js`). `ROWS` is imported from
`./fixtures/what-if/rows.mjs` into `what-if-formatters.test.js` only.

- **Verify:** `bun test products/summit/test/what-if-formatters.test.js` passes
  (6 cases — Tests 1, 2, 3, 4, 6, 7).
  `bun test products/summit/test/what-if.test.js` passes (existing 11 + Test 5 =
  12 cases). `bun run test` passes from monorepo root.

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
"fit-summit what-if platform --move 'Alice' --to billing",
```

(Team ids are illustrative; help examples do not have to resolve against
any concrete fixture roster.)

No other CLI changes — the positional `<team>` syntax stays, the option list
stays, and global options are untouched.

- **Verify:** `node products/summit/bin/fit-summit.js what-if --help` prints
  help text containing the literal substrings `source for --move`,
  `out of <team>`, and `receives the member`.
  `grep -nE 'whatIfToText|whatIfToJson|whatIfToMarkdown' websites/ libraries/ services/`
  returns zero matches (no external references to update).

## Cross-step sequencing

Steps 3, 4, 5, and 6 are a **single required commit boundary**: after Step 3
the handler passes `{ report }` (and `{ report, data }` for text), but until
all three formatters update they will receive an unrecognised parameter
shape. Either land all four steps in one commit, or land them as four
sequential commits and skip CI on the intermediate three (run CI only at the
end of Step 6). Step 1 (fixtures + helper) must be a separate prior commit on
the branch before Step 2 — the captured bytes are the pre-refactor contract
Step 4–6 preserves. Step 2 lands in a standalone commit (adds an unused
helper; check stays green). Step 7 (tests) lands after Step 6. Step 8 (help
strings) is independent and may land in any order after Step 1.

Required commit boundaries on the implementation branch:

1. Step 1 (fixtures + `regenerate.mjs` + README) — separate commit.
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
  sites outside `runWhatIfCommand`.**
  `grep -nE 'whatIfToText|whatIfToJson|whatIfToMarkdown' products/summit/`:
  today all three formatters are imported only by `src/commands/what-if.js`
  (single call site each) plus their respective test files. Steps 4–6 update the
  single production call site; Step 7 rewrites the test calls. No other callers
  exist.

## Execution

Single-agent sequential execution by `staff-engineer` (or any engineering
agent) via `kata-implement`. Steps 1–8 are sequenced because Step 2's helper
is consumed in Step 3, Steps 4–6 depend on Step 3's handler shape, and
Step 7's fixture-equality assertions depend on Step 1's captured bytes.
Total expected diff: ~300 lines added (helper + `regenerate.mjs` + new tests

- 15 fixture files), ~80 lines removed/replaced (formatter rewrites). No
parallel decomposition warranted — the parameter-shape migration is a
single concern.

Pair this plan with the `kata-implement` skill — implementation runs
`bun run check` + `bun run test` after each commit boundary and opens one
implementation PR.

— Staff Engineer 🛠️
