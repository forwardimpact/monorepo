# Plan A — Part 06: `compare` and `trajectory` commands

## Goal

Round out the deterministic analytical surface with the final two
commands from spec.md:739–744:

1. `fit-summit compare <team1> <team2>` — diff two teams' coverage and
   risks.
2. `fit-summit trajectory <team>` — quarterly evolution of a team's
   coverage, driven by git history of `summit.yaml`.

This part introduces one piece of novel infrastructure: a thin wrapper
around `git log` / `git show` that parses prior versions of the roster
file. It's the first git-history parsing in the monorepo, so the
wrapper is isolated and testable via DI.

## Inputs

- Spec 090: "Team Trajectory" (spec.md:477–539), "CLI" (spec.md:726–754
  — specifically `fit-summit compare`, `fit-summit trajectory
  --quarters <n>`), "JSON Output" (spec.md:813–834).
- Part 02 `TeamCoverage`.
- Part 03 `TeamRisks`.
- Part 04 `diffCoverage` / `diffRisks` — the compare command can reuse
  these.

## Approach

### `compare`

Compare is a thin transform over Part 02/03/04:

1. Resolve both teams.
2. Compute coverage + risks for both.
3. Call `diffCoverage(a.coverage, b.coverage)` and `diffRisks(a.risks,
   b.risks)` from Part 04.
4. Render a two-column view.

Compare never mutates a roster; it's a snapshot-vs-snapshot diff. No
new aggregation primitives are needed.

### `trajectory`

Trajectory is harder because it requires historical roster data. The
spec allows two sources (spec.md:507–520):

1. Map historical snapshots — **not yet supported**. Spec 090 Part 06
   does not implement this branch; surface a "not yet supported"
   message when `--roster` is omitted.
2. Git history of `summit.yaml` — **this part implements this**.

The git branch:

1. Shell out to `git log --follow --format='%H %cI' -- <path>` to get
   all commits touching the roster file, with ISO-8601 commit times.
2. Bucket commits by calendar quarter (`2025-Q1`, `2025-Q2`, …).
3. For each quarter's latest commit, shell out to `git show
   <sha>:<path>` to retrieve that revision's roster.
4. Parse via `parseRosterYaml` (Part 01), resolve the target team,
   compute coverage via Part 02.
5. Build a `TeamTrajectory` that shows coverage and roster changes per
   quarter.

Only run the last N quarters per `--quarters` flag (default 4, per
spec.md:753).

## Files Created

### `products/summit/src/commands/compare.js`

Handler flow:

1. Parse the two positional team ids (`--project` may also be used for
   one or both sides).
2. Load roster and data.
3. Resolve both teams, compute coverage + risks for both.
4. `coverageDiff = diffCoverage(leftCoverage, rightCoverage)`.
5. `riskDiff = diffRisks(leftRisks, rightRisks)`.
6. Render `compareToText` / `compareToJson` / `compareToMarkdown`.

Edge case: comparing a team to itself prints a friendly message and
exits 0 — no diff to show.

### `products/summit/src/formatters/compare/text.js`

Two-column layout side-by-side when the terminal is wide enough;
stacked otherwise. Shows:

- Each team's member count and effective FTE.
- Per-skill depth for each side, with a `→` between them when they
  differ.
- Risk deltas (A has SPOF X, B does not).

### `products/summit/src/formatters/compare/json.js`

```json
{
  "left":  { "team": "platform", "members": 5, "effectiveFte": 5.0 },
  "right": { "team": "payments", "members": 3, "effectiveFte": 3.0 },
  "coverage": { ... diffCoverage output ... },
  "risks":    { ... diffRisks output ... }
}
```

### `products/summit/src/git/history.js`

Isolates all git interaction behind one module so the rest of Summit
stays deterministic and testable:

```js
import { promisify } from "node:util";
import { execFile as _execFile } from "node:child_process";
const execFile = promisify(_execFile);

/**
 * Commit record returned by listCommits.
 * @typedef {Object} CommitRecord
 * @property {string} sha    full commit sha
 * @property {Date} date     author date
 */

/**
 * List commits that modified the given file, newest first.
 * @param {string} filePath
 * @param {object} [options]
 * @param {string} [options.cwd]  working directory (defaults to process.cwd())
 * @param {typeof execFile} [options.exec]  injected execFile for tests
 * @returns {Promise<CommitRecord[]>}
 */
export async function listCommits(filePath, { cwd, exec = execFile } = {}) { ... }

/**
 * Read the contents of a file at a specific commit.
 * @param {string} sha
 * @param {string} filePath
 * @param {object} [options]
 * @returns {Promise<string>}
 */
export async function showFileAt(sha, filePath, { cwd, exec = execFile } = {}) { ... }
```

The `exec` parameter is injected so tests can pass a fake that returns
canned stdout without actually running git. Production code passes
nothing and gets the real binding.

Errors from missing git binary or a file not in version control get
wrapped into a `GitUnavailableError` with a clear message ("Git
history not available. Install git or track summit.yaml in version
control.").

### `products/summit/src/aggregation/trajectory.js`

Pure — given a pre-assembled list of historical snapshots, computes
the trajectory:

```js
export function computeTrajectory({
  historicalRosters, // Array<{ quarter: string, roster: Roster, changes: RosterChangeSet }>
  teamId,
  data,
}): TeamTrajectory { ... }
```

Returns:

```ts
type TeamTrajectory = {
  teamId: string,
  quarters: Array<{
    quarter: string,
    memberCount: number,
    rosterChanges: RosterChange[],
    coverage: TeamCoverage, // trimmed to depth-only for output
  }>,
  persistentGaps: string[],
  trends: Record<string, "improving" | "declining" | "stable" | "persistent_gap">,
};
```

`persistentGaps` is the set of skills with `depth === 0` for all
quarters in the window.

`trends` uses a simple heuristic: compare last quarter to first
quarter; "improving" if final > initial, "declining" if final <
initial, "stable" if equal and nonzero, "persistent_gap" if both
zero.

### `products/summit/src/commands/trajectory.js`

Handler flow:

1. Parse `teamId` and `--quarters` (default 4).
2. Require `--roster` — the Map historical source is deferred. Print
   the spec.md:522–524 message and exit 0 when `--roster` is omitted.
3. Determine the current working directory of the roster file.
4. `commits = await listCommits(rosterPath, { cwd: dirname(rosterPath) })`.
5. If empty, print "Historical roster data not available. Showing
   current-state only." and compute just the current coverage.
6. Bucket commits by quarter. For each of the last N quarters, read
   the file at its latest commit via `showFileAt`.
7. Parse and resolve the team in each snapshot via Part 01's
   `parseRosterYaml` + Part 02's `resolveTeam`.
8. Compute coverage per snapshot.
9. Diff consecutive snapshots' rosters to derive `rosterChanges`
   (join/leave/promotion events — compare member lists and levels).
10. `trajectory = computeTrajectory({ historicalRosters, teamId, data })`.
11. Apply audience filter (director audience drops member names from
    rosterChanges; shows "one member joined" etc).
12. Render.

### `products/summit/src/formatters/trajectory/text.js`

Matches spec.md:484–505:

```
  Platform team — capability trajectory

  Roster changes:
    2025-Q1: 4 engineers (Dan joined)
    ...

  Coverage evolution:
                          Q1    Q2    Q3    Q4    Trend
    task_completion        2     3     3     2     ↓ declining
    ...

  Summary:
    Coverage improved Q1→Q2. ...
    Persistent gap: incident_response has been uncovered for 4 quarters.
```

The summary prose is templated from `trajectory.trends` and
`trajectory.persistentGaps` — no LLM, no freeform.

### `products/summit/src/formatters/trajectory/json.js`

Matches spec.md:813–834.

### `products/summit/test/compare.test.js`

- Comparing two fixture teams: diff has expected shape.
- Comparing a team to itself: output explicitly notes "identical" and
  all diff arrays are empty.
- `--format json` round-trips.

### `products/summit/test/trajectory.test.js`

- `listCommits` with an injected fake `exec` returns parsed commits.
- `showFileAt` with an injected fake `exec` returns the stubbed YAML.
- Bucketing: commits in `2025-03-15`, `2025-04-01`, `2025-08-20` go to
  `2025-Q1`, `2025-Q2`, `2025-Q3` respectively.
- `computeTrajectory` on a four-quarter fixture produces the expected
  trend classifications.
- A skill at `depth: 0` across all quarters is flagged as
  `persistent_gap`.
- Director audience drops named changes from `rosterChanges`.
- Git unavailable: the command prints the "not available" message and
  exits 0 without crashing.
- `--quarters 2` limits the window to 2 quarters of history.

## Files Modified

### `products/summit/bin/fit-summit.js`

Add `compare` and `trajectory` commands. Add `--quarters` option.

### `products/summit/src/aggregation/index.js`

Export `computeTrajectory`.

### `products/summit/src/index.js`

Export `computeTrajectory` and `listCommits`, `showFileAt` from
`./git/history.js` (the git helpers are public only because
consumers may want to build their own historical pipelines; keep the
surface minimal).

### `products/summit/test/cli.test.js`

Smoke tests for both new commands.

## Verification

1. `bun run check` passes.
2. `bun run test` passes with new compare + trajectory tests.
3. Manual smoke:
   - `bunx fit-summit compare platform payments --roster … --data …`
     produces a two-column diff.
   - `bunx fit-summit trajectory platform --roster … --data …` either
     prints trajectory (if the fixture is git-tracked) or the
     "Historical roster data not available" fallback message.
4. `--format json` for both commands validates.

## Commit

```
feat(summit): add compare and trajectory commands with git history parsing
```

## Risks

- **Git dependency.** Trajectory shells out to a `git` binary that may
  not exist in all environments. Handle `ENOENT` from `execFile` as
  `GitUnavailableError` and degrade the command.
- **File path resolution.** `git log` must be run from inside the
  worktree containing the roster. Use `dirname(rosterPath)` as `cwd`
  and absolutise the path before shelling out.
- **Yaml evolution.** Older commits may use an older `summit.yaml`
  schema. When `parseRosterYaml` throws on an old commit, log a
  warning and skip that quarter rather than failing the whole
  command.
- **Roster diffing is ambiguous.** "Promotion" means the same member
  (matched by email) has a different `level` in two consecutive
  snapshots. "Join" means an email appears only in the later
  snapshot. "Leave" means vice versa. Implement explicitly; add a
  fixture test.
- **Quarter boundaries.** ISO quarters are `Q1 = Jan-Mar`, `Q2 =
  Apr-Jun`, etc. Use the commit's ISO week-year for year boundaries
  (spec says "quarterly" but doesn't specify which calendar system —
  Gregorian-ISO is the sensible default).
- **Compare with different formats in left vs. right.** When one team
  has allocation-based effective depths and the other doesn't, the
  diff compares headcount-only. Document in the formatter.

## Notes for the implementer

- Trajectory is the single-most-likely-to-break command because git
  I/O is slippery. Invest in `test/fixtures/git-history/` and a
  purely-synthetic test double that drives the git helpers.
- Do not add a Map historical-snapshot code path — that's a future
  spec. The "Not yet supported" message is the correct behaviour for
  now.
- Keep `computeTrajectory` pure. All git I/O happens in the command
  handler; the aggregation layer takes pre-assembled historical data
  as input.
