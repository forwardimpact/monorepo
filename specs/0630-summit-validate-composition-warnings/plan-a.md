# Plan 0630-A — Summit Validate Composition Warnings

See [`spec.md`](./spec.md) for WHAT/WHY and [`design-a.md`](./design-a.md) for
WHICH/WHERE. This document captures HOW to implement and WHEN to sequence the
changes.

## Approach

Land the change in three concentric rings: detectors first (pure, easiest to
test), then orchestrator wiring inside `validateRosterAgainstStandard`, then the
text formatter suffix block in `runValidateCommand`. Tests grow alongside each
ring — unit tests on the detectors in `roster.test.js`, plus a new
`validate.test.js` that captures `process.stdout` to lock in the spec's
success-criteria output. The all-three-warnings fixture lives in
`test/fixtures.js` so the unit tests and command tests share one definition.

## Libraries used

`Libraries used: none.` Detectors are plain JavaScript; the formatter uses
`process.stdout.write` already imported in `commands/validate.js`.

## Step 1 — Add warning detectors and entry-level helper

**Intent:** Implement the three pure detector functions and the one-call
entry-level resolver used by the orchestrator.

**Files:**

- modified: `products/summit/src/roster/schema.js`

**Change:** Append the helpers below to `roster/schema.js`. All five functions
are private (no `export`).

```js
// Lowest ordinalRank in data.levels; null when levels are empty/missing.
function resolveEntryLevelId(data) {
  const levels = data.levels ?? [];
  if (levels.length === 0) return null;
  let entry = levels[0];
  for (const level of levels) {
    if ((level.ordinalRank ?? Infinity) < (entry.ordinalRank ?? Infinity)) {
      entry = level;
    }
  }
  return entry.id;
}

function detectNoSeniorMember(team, entryLevelId) {
  if (!entryLevelId || team.members.length === 0) return [];
  const allEntry = team.members.every((m) => m.job.level === entryLevelId);
  if (!allEntry) return [];
  return [
    {
      code: "NO_SENIOR_MEMBER",
      message: `teams.${team.id}: every member is at entry level "${entryLevelId}". Consider adding a more senior member to mentor and review.`,
      context: { team: team.id, level: entryLevelId },
    },
  ];
}

function detectTracklessAtEntryLevel(team, entryLevelId) {
  if (!entryLevelId) return [];
  const issues = [];
  for (const member of team.members) {
    if (member.job.level !== entryLevelId) continue;
    if (member.job.track) continue;
    issues.push({
      code: "TRACKLESS_AT_ENTRY_LEVEL",
      message: `teams.${team.id}[${member.email}]: entry-level member has no track set. Confirm whether the omission is intentional.`,
      context: { team: team.id, member: member.email, level: entryLevelId },
    });
  }
  return issues;
}

function detectLowAllocationProject(project) {
  if (project.members.length === 0) return [];
  const threshold = 0.5;
  // `parseRosterYaml` already substitutes 1.0 for omitted allocation, so
  // every member has a numeric `allocation`.
  const belowThresholdCount = project.members.filter(
    (m) => m.allocation < threshold,
  ).length;
  if (belowThresholdCount !== project.members.length) return [];
  return [
    {
      code: "LOW_ALLOCATION_PROJECT",
      message: `projects.${project.id}: every member is below ${threshold} allocation. No one is primarily focused on the project.`,
      context: { project: project.id, threshold, belowThresholdCount },
    },
  ];
}

function runWarningDetectors(roster, data) {
  const entryLevelId = resolveEntryLevelId(data);
  const warnings = [];
  for (const team of roster.teams.values()) {
    warnings.push(...detectNoSeniorMember(team, entryLevelId));
    warnings.push(...detectTracklessAtEntryLevel(team, entryLevelId));
  }
  for (const project of roster.projects.values()) {
    warnings.push(...detectLowAllocationProject(project));
  }
  return warnings;
}
```

**Verification:** `bun test products/summit/test/roster.test.js` still passes
(no behaviour wired in yet — the helpers are dead code at this step).

## Step 2 — Wire detectors into `validateRosterAgainstStandard`

**Intent:** Call `runWarningDetectors` from the orchestrator and return its
output as `warnings`.

**Files:**

- modified: `products/summit/src/roster/schema.js`

**Change:** In `validateRosterAgainstStandard`, replace the empty `warnings`
initialization with the detector call, and drop the now-unused local
declaration.

Before (lines 31–53):

```js
export function validateRosterAgainstStandard(roster, data) {
  const errors = [];
  const warnings = [];

  const disciplines = new Set((data.disciplines ?? []).map((d) => d.id));
  // … existing error pass …

  return { errors, warnings };
}
```

After:

```js
export function validateRosterAgainstStandard(roster, data) {
  const errors = [];

  const disciplines = new Set((data.disciplines ?? []).map((d) => d.id));
  // … existing error pass — unchanged …

  const warnings = runWarningDetectors(roster, data);

  return { errors, warnings };
}
```

**Verification:** `bun test products/summit/test/roster.test.js` — the existing
"valid roster" test still passes (`warnings.length === 0` because the starter
fixture's team has a J060 member, so no detector fires).

## Step 3 — Extend the all-three-warnings fixture

**Intent:** Add a roster fixture exercising all three warning codes plus the
no-warnings baseline so tests in steps 4 and 5 can share it.

**Files:**

- modified: `products/summit/test/fixtures.js`

**Change:** Append a `WARNINGS_ROSTER` export, mirroring the existing
`FIXTURE_ROSTER` shape (template-string assignment, exported). The fixture has a
reporting team where every member is J040 (triggers `NO_SENIOR_MEMBER`), one of
those members has no track (triggers `TRACKLESS_AT_ENTRY_LEVEL`), and a project
where both members allocate below 0.5 (triggers `LOW_ALLOCATION_PROJECT`).

```js
export const WARNINGS_ROSTER = `
teams:
  juniors:
    - name: Dee
      email: dee@example.com
      job: { discipline: software_engineering, level: J040, track: platform }
    - name: Eve
      email: eve@example.com
      job: { discipline: software_engineering, level: J040 }
projects:
  spike:
    - email: dee@example.com
      allocation: 0.4
    - email: eve@example.com
      allocation: 0.3
`;
```

**Verification:** `bun test products/summit/test/roster.test.js` — fixture
parses (covered by tests added in step 4).

## Step 4 — Unit tests for warning detection

**Intent:** Lock detector behaviour, including the empty-`data.levels` no-op
path called out in design decision 3.

**Files:**

- modified: `products/summit/test/roster.test.js`

**Change:** Add five tests below the existing `validateRosterAgainstStandard`
cases. Each loads `WARNINGS_ROSTER` (or a single-pattern minimal YAML) and
asserts the warning codes/contexts.

| Test name                                                                                 | Assertion                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validateRosterAgainstStandard emits NO_SENIOR_MEMBER for all-entry-level team`           | warnings include one `NO_SENIOR_MEMBER` with `context.team === "juniors"` and `context.level === "J040"`.                                                                                                                                                                                                                          |
| `validateRosterAgainstStandard emits TRACKLESS_AT_ENTRY_LEVEL per trackless member`       | warnings include one `TRACKLESS_AT_ENTRY_LEVEL` with `context.member === "eve@example.com"`.                                                                                                                                                                                                                                       |
| `validateRosterAgainstStandard emits LOW_ALLOCATION_PROJECT once per project`             | exactly one `LOW_ALLOCATION_PROJECT` for `spike` with `context.threshold === 0.5`.                                                                                                                                                                                                                                                 |
| `validateRosterAgainstStandard emits no warnings on the starter fixture roster`           | `FIXTURE_ROSTER` against starter `data` produces `warnings.length === 0`.                                                                                                                                                                                                                                                          |
| `validateRosterAgainstStandard suppresses level-aware warnings when data.levels is empty` | with `data = { ...starterData, levels: [] }`, the returned `warnings` contains exactly one entry — `LOW_ALLOCATION_PROJECT` for `spike`. (Errors are not asserted on; the empty levels set will produce `UNKNOWN_LEVEL` errors via the existing error pass, which is independent of the warning suppression behaviour under test.) |

Tests use the loaded starter `data` from `loadStarterData()` for the level
catalog, so `entryLevelId` resolves to `J040` (ordinalRank 1) per
`products/map/starter/levels.yaml`. The empty-levels test overrides only the
`levels` array on a shallow copy of the starter data so disciplines/tracks
remain populated.

**Verification:** `bun test products/summit/test/roster.test.js` — all five new
tests pass; existing tests untouched.

## Step 5 — Text-formatter suffix block in `runValidateCommand`

**Intent:** Emit the "Composition warnings:" suffix block whenever
`warnings.length > 0`, on both the success and failure paths. JSON path
unchanged (warnings already round-trip).

**Files:**

- modified: `products/summit/src/commands/validate.js`

**Change:** Replace the early `return` on the success path with a fall-through,
and add a single warnings-emit block before the function exits.

Before (lines 27–40):

```js
if (result.errors.length === 0) {
  process.stdout.write(
    `  Roster is valid. ${countMembers(roster)} members across ${roster.teams.size} teams.\n`,
  );
  return;
}

process.stdout.write("  Roster validation failed:\n\n");
for (const issue of result.errors) {
  process.stdout.write(`    [${issue.code}] ${issue.message}\n`);
}
process.stdout.write("\n");
process.exitCode = 1;
```

After:

```js
if (result.errors.length === 0) {
  process.stdout.write(
    `  Roster is valid. ${countMembers(roster)} members across ${roster.teams.size} teams.\n`,
  );
} else {
  process.stdout.write("  Roster validation failed:\n\n");
  for (const issue of result.errors) {
    process.stdout.write(`    [${issue.code}] ${issue.message}\n`);
  }
  process.stdout.write("\n");
  process.exitCode = 1;
}

if (result.warnings.length > 0) {
  process.stdout.write("  Composition warnings:\n\n");
  for (const issue of result.warnings) {
    process.stdout.write(`    [${issue.code}] ${issue.message}\n`);
  }
  process.stdout.write("\n");
}
```

**Verification:** Manual smoke — write `WARNINGS_ROSTER` to a temp file and run
`bunx fit-summit validate --roster <tempPath>`; expect the "Roster is valid…"
line followed by the `Composition warnings:` block listing all three codes; exit
code is 0. Captured-stdout assertions follow in step 6.

## Step 6 — Command-level tests for warning display

**Intent:** Cover spec success criteria 1, 3, and 4 (text and JSON output).

**Files:**

- created: `products/summit/test/validate.test.js`

**Change:** New test file invoking `runValidateCommand` directly. Use
`node:test` `beforeEach`/`afterEach` hooks to (a) stub `process.stdout.write`
into a captured chunk array, (b) save and reset `process.exitCode = 0`, and (c)
`mkdtempSync`/`rmSync` a per-test temp directory under `os.tmpdir()`. The test
cases call
`runValidateCommand({ data, options: { roster: <tempPath>, format } })` directly
— no CLI harness needed.

Four cases:

| Test name                                                                  | Setup                                                                  | Assertion                                                                                                                                                        |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `runValidateCommand prints all three warnings after the success message`   | `WARNINGS_ROSTER` + starter data, `format=text`                        | stdout matches `/Roster is valid/` then includes `[NO_SENIOR_MEMBER]`, `[TRACKLESS_AT_ENTRY_LEVEL]`, `[LOW_ALLOCATION_PROJECT]`. `process.exitCode` remains `0`. |
| `runValidateCommand prints warnings after the error block when both exist` | `ERRORS_AND_WARNINGS_ROSTER` (see below) + starter data, `format=text` | stdout contains `Roster validation failed:` and `[UNKNOWN_LEVEL]` before the `Composition warnings:` header; `process.exitCode === 1`.                           |
| `runValidateCommand emits unchanged output when no warnings fire`          | `FIXTURE_ROSTER` + starter data, `format=text`                         | stdout exactly equals the existing "Roster is valid…" line — no `Composition warnings:` header.                                                                  |
| `runValidateCommand JSON mode includes populated warnings array`           | `WARNINGS_ROSTER` + starter data, `format=json`                        | parsed JSON output's `warnings` array has the three expected codes; `errors` is `[]`; `process.exitCode` remains `0`.                                            |

`ERRORS_AND_WARNINGS_ROSTER` is exported from `test/fixtures.js` alongside
`WARNINGS_ROSTER`. It is `WARNINGS_ROSTER` with Eve's `level: J040` swapped for
`level: J999` so the existing error pass emits `UNKNOWN_LEVEL` while
`NO_SENIOR_MEMBER` (Dee remains J040, Eve's unknown level breaks the all-entry
test) and `TRACKLESS_AT_ENTRY_LEVEL` (no longer applies to Eve because she is no
longer at entry level) are deliberately not relied on — only the
`Composition warnings:` header presence is asserted, which fires because
`LOW_ALLOCATION_PROJECT` always emits for `spike`.

The roster is loaded by writing the fixture string to the per-test temp
directory (`writeFileSync(join(tempDir, "roster.yaml"), fixture)`) and passing
the resulting path through `options.roster`. `loadStarterData()` is called in a
top-level `before(...)` so all tests share one parsed copy.

**Verification:** `bun test products/summit/test/validate.test.js` — all four
tests pass. `bun test` in `products/summit` overall still green.

## Risks

| Risk                                                                                                                                                                                                                                   | Mitigation                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `process.exitCode` is global state — without explicit reset, the failure-path test in step 6 can leave `exitCode = 1` set, leaking into later tests in the same `node:test` worker.                                                    | Step 6 prescribes `beforeEach` reset of `process.exitCode = 0` (and `afterEach` stdout restore + tempdir cleanup). All four tests rely on this hook contract.                                |
| `WARNINGS_ROSTER`'s J040 members rely on `J040` being the lowest ordinalRank in the starter data. If a future starter dataset adds a lower level, `NO_SENIOR_MEMBER` and `TRACKLESS_AT_ENTRY_LEVEL` would stop firing on this fixture. | Tests resolve `entryLevelId` via `loadStarterData()`; if the starter changes, the failure points at the fixture and the fix is local. Adding a `levels.yaml` invariant test is out of scope. |
| `loadRoster` resolves `--roster <path>` by reading from disk; tests under temp dirs may leave stale files if a test throws before cleanup.                                                                                             | Step 6's `afterEach` uses `rmSync(tempDir, { recursive: true, force: true })` so cleanup runs even when assertions throw.                                                                    |

## Execution

Single sequential pass — every step builds on the previous one and there is no
parallelism to extract. Route to `staff-engineer` (full code path; no doc-only
work). Two source files modified (`roster/schema.js`, `commands/validate.js`),
one test file modified (`test/fixtures.js` + `test/roster.test.js`), one created
(`test/validate.test.js`).

— Staff Engineer 🛠️
