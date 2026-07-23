# Plan 2270-a — Part 02: Benchmark runtime pipeline

The benchmark runner adopts the shared modules from part 01: convention
paths, preserved raw traces, one-pass summary, relative record paths, and
the private splitter's deletion. Design refs: [design-a.md](design-a.md)
§§ Components, Key Decisions 1 and 6–7, Contracts § File naming and
§ Records and judge template.

Depends on part 01 (imports `trace-identity.js` and `trace-split.js`).

## Step 1 — Workdir: convention paths, lane materialization

Files: modified `libraries/libharness/src/benchmark/workdir.js`.

In `WorkdirManager.start(task, runIndex)`:

- Delete the `task.id.replace("/", "__")` slug mapping (dead — task ids
  are single directory names); `runDir = join(this.runOutputDir, "runs",
  task.id, String(runIndex))`.
- `const caseId = buildCaseId(task.id, runIndex)` (import from
  `../trace-identity.js`).
- Allocate convention paths in `runDir`:
  `rawTracePath = join(runDir, rawTraceFilename(caseId))`,
  `agentTracePath = join(runDir, laneFilename(caseId, "agent", "agent"))`,
  `supervisorTracePath = join(runDir, laneFilename(caseId, "supervisor",
  "supervisor"))`,
  `judgeTracePath = join(runDir, laneFilename(caseId, "judge", "judge"))`.
  (The workdir names its fixed lanes; source-to-role *classification*
  stays solely in the split module — these are different rules, not a
  duplicate.)
- Materialize the raw and agent/supervisor lane files empty at allocation
  (`await fs.writeFile(p, "")` for raw, agent, supervisor — not judge), so
  every path that reaches the judge, including a pre-session agent
  failure, finds them on disk (decision 7).
- Return `caseId` and `rawTracePath` on the handle; extend the `Workdir`
  typedef with both. Paths on the handle stay absolute (runtime
  consumers).

Deleted: bare `agent.ndjson`/`supervisor.ndjson`/`judge.ndjson`
allocation lines and the slug mapping.

Verification: `bun test
libraries/libharness/test/benchmark-workdir-start.integration.test.js
libraries/libharness/test/benchmark-workdir.integration.test.js`
(updated in step 8).

## Step 2 — Task-family: validate ids at load

Files: modified `libraries/libharness/src/benchmark/task-family.js`.

In `loadTask` (or `discoverTasks` before pushing), reject invalid ids:

```js
if (!isValidTaskId(id)) {
  throw new Error(
    `invalid task id '${id}': task directory names must not contain "--" or start/end with "-"`,
  );
}
```

The rule itself lives in the identity module; this file only invokes the
predicate.

Verification: loader-level rejection test added in step 8
(`benchmark-task-family.integration.test.js`).

## Step 3 — Raw-trace summary module

One post-session read of the preserved raw file replaces
split-and-summarize coupling (decision 6).

Files: created `libraries/libharness/src/benchmark/raw-summary.js`.

```js
/**
 * One read of the preserved raw combined trace:
 *   cost      — sumTraceCost over the lines (the one cost path),
 *   turns     — last orchestrator-source `summary` event's `turns`,
 *   submission— last agent-source assistant text block.
 * @returns {Promise<{costUsd: number,
 *   costBreakdown: {agent: number, supervisor: number},
 *   turns: number, submission: string}>}
 */
export async function summarizeRawTrace(runtime, rawTracePath)
```

Implementation: `runtime.fs.readFile` once, split lines, `sumTraceCost`
for `{totalCostUsd, bySource}`, then one walk of the parsed lines for
turns/submission. The `extractText` last-text-block helper moves here from
the private splitter. An empty (materialized-stub) raw file yields zeros
and an empty submission.

Verification: `bun test
libraries/libharness/test/benchmark-raw-summary.test.js` (step 8).

## Step 4 — Runner: preserve the raw trace, shared pipeline

Split and summary run on the runner's shared path so the test seam
exercises the real pipeline.

Files: modified `libraries/libharness/src/benchmark/runner.js`.

- `#runAgent` (default path): stream the supervisor session to
  `workdir.rawTracePath` (replaces the `.combined.ndjson` temp path) and
  return only `{agentError}`. Delete the whole-file `readFile` +
  `sumTraceCost` block, the `fs.unlink`, and the `splitAndSummarize`
  import; drop the now-unused direct `sumTraceCost` import.
- `#runAgentSafe`: after either the hook or the default path settles
  (including the catch branch), run the shared pipeline once:
  `await splitTrace(this.runtime, workdir.rawTracePath, { caseId:
  workdir.caseId, outputDir: workdir.runDir })` (import from
  `../trace-split.js`), then `const summary = await
  summarizeRawTrace(this.runtime, workdir.rawTracePath)`; return
  `{...summary, agentError}`. Cost, turns, and submission are always
  derived from the raw file — the fabricated-return shape disappears.
- **Seam contract change**: `opts.runAgent` narrows to "run the session,
  stream `{source, seq, event}` envelopes to `workdir.rawTracePath`,
  return `{agentError?}`". Update the constructor JSDoc
  (`runner.js:79-83`), which still documents "write a valid NDJSON trace
  to `workdir.agentTracePath`".
- Record assembly (`#executeCell`): trace-path fields become
  run-output-relative and presence-gated (decision 7): for each of
  `rawTracePath`, `agentTracePath`, `supervisorTracePath`,
  `judgeTracePath`, include `relative(this.output, absPath)` only when
  the file exists (`fs.access` check via a small helper). Raw and
  agent/supervisor lanes are materialized at allocation, so they are
  present on every executed cell; the judge lane appears only on judged
  cells.
- `#buildPreflightFailureRecord`: delete the three trace-path fields,
  with a comment stating that preflight-failure records carry no trace
  paths even though the materialized stubs exist on disk (decision 7 —
  the record references only traces a session produced).
- Update the `#runAgent` docblock (no more `agent.ndjson` /
  `supervisor.ndjson` wording).

Verification: `bun test
libraries/libharness/test/benchmark-e2e.integration.test.js` (updated in
step 8).

## Step 5 — Result schema: relative, presence-gated paths

Files: modified `libraries/libharness/src/benchmark/result.js`.

- `HAPPY_RECORD`: add `rawTracePath: z.string()`; keep `agentTracePath`
  and `supervisorTracePath` required strings; `judgeTracePath` becomes
  `z.string().optional()`. Comment states paths are relative to the run
  output directory.
- `PREFLIGHT_RECORD`: replace the three required trace-path fields with
  `z.undefined().optional()` for all four path fields (records carry
  none); replace the "populated even on preflight failure" comment with
  the decision-7 rationale.

Verification: `bun test libraries/libharness/test/benchmark-result.test.js`.

## Step 6 — Judge adapter and template docs

Files: modified `libraries/libharness/src/benchmark/judge.js`.

- No behavioural change: the judge already writes to
  `workdir.judgeTracePath` and templates `{{AGENT_TRACE_PATH}}` from
  `workdir.agentTracePath` — both now convention-named absolute paths,
  materialized before any session runs.
- Update the module docblock's `agent.ndjson` / `judge.ndjson` mentions to
  the convention names.

Verification: `bun test libraries/libharness/test/benchmark-judge.test.js`.

## Step 7 — Delete the private splitter

Files: deleted `libraries/libharness/src/benchmark/trace-split.js`.

`splitAndSummarize` and its interface go with it; step 4 removed the last
import.

Verification: `rg -n "splitAndSummarize|benchmark/trace-split" libraries
products` returns nothing.

## Step 8 — Benchmark tests and fixtures

Files: modified
`libraries/libharness/test/benchmark-workdir-start.integration.test.js`,
`libraries/libharness/test/benchmark-workdir.integration.test.js`,
`libraries/libharness/test/benchmark-task-family.integration.test.js`,
`libraries/libharness/test/benchmark-e2e.integration.test.js`,
`libraries/libharness/test/benchmark-runner-concurrency.test.js`,
`libraries/libharness/test/benchmark-runner-score.test.js`,
`libraries/libharness/test/benchmark-shard.test.js`,
`libraries/libharness/test/benchmark-result.test.js`,
`libraries/libharness/test/benchmark-report.test.js`,
`libraries/libharness/test/benchmark-report-score.test.js`,
`libraries/libharness/test/benchmark-judge.test.js`,
`libraries/libharness/test/redaction-pipeline-producer.test.js`,
`libraries/libharness/test/report-helpers.js`; created
`libraries/libharness/test/benchmark-raw-summary.test.js`,
`libraries/libharness/test/benchmark-trace-helpers.js`.

- Workdir tests: paths follow the convention under
  `runs/<taskId>/<idx>/`; raw + agent/supervisor lanes exist empty after
  `start()`; judge lane path allocated but not materialized; handle
  carries `caseId`/`rawTracePath`; no `__` slug directory for any id.
- Task-family test: a `tasks/bad--id/` directory makes `loadTaskFamily`
  throw the invalid-task-id error (loader invokes the predicate).
- `benchmark-raw-summary.test.js`: cost (multi-source result events),
  turns (orchestrator summary), submission (last agent assistant text),
  zeros on an empty file, tolerance of malformed/blank lines.
- **Seam rework**: every `runAgent` hook — `mockRunAgent` in the e2e and
  the hooks in the `concurrency`/`score`/`shard` runner tests — switches
  to the new contract: write `{source, seq, event}` envelopes to
  `workdir.rawTracePath` (agent assistant + result events with
  `total_cost_usd`, orchestrator summary event with turns) and return
  `{agentError?}`; the real split/summary derives cost, turns, and
  submission. The shared envelope-writing helper lives in the new
  `benchmark-trace-helpers.js` (`mock-runner.js` is an AgentRunner mock
  for orchestration tests — out of scope for benchmark fixtures).
- E2E: per-cell tree keeps `trace--<case>.raw.ndjson` plus both lanes
  after the run — no deletion, lanes non-empty (spec criterion 1);
  criterion 3 asserts CLI parity as the spec's verification column
  states: invoke the `cost` verb handler (`runCostCommand`, in-process
  with a captured-stdout runtime) over the preserved raw file and assert
  its `bySource.agent`/`bySource.supervisor` equal the record's
  `costBreakdown` and their sum its `totalCostUsd` (record `costUsd`
  additionally folds in judge cost, so it is *not* compared to the raw
  file); records' trace paths are run-output-relative and every
  referenced file exists under the output dir (spec criterion 8).
  Existing assertions that treat record paths as absolute — `dirname` on
  `agentTracePath` and direct `readFile` of it — must join the path
  against the output dir first, and the shared `before` hook must keep
  the output dir in scope. The existing "consumable by gemba-trace
  overview" test reads the new lane path.
- Runner unit tests (`concurrency`/`score`/`shard`): hooks adopt the new
  seam contract (envelope fixtures where cost/turns matter); preflight
  expectations drop trace paths.
- `benchmark-result.test.js`, `report-helpers.js`,
  `benchmark-report.test.js`, `benchmark-report-score.test.js`:
  convention-named, run-output-relative fixture paths (e.g.
  `runs/x/0/trace--x-r0--agent.agent.ndjson`), `rawTracePath` added to
  happy records; preflight fixtures drop trace-path fields (the report
  suites fabricate records inline and would otherwise be schema-skipped).
- `benchmark-judge.test.js`: assert the judge lane file at the convention
  path contains only redacted content — drive `runJudge` with a fake query
  emitting a sentinel env value and assert the written file carries the
  redaction placeholder (spec criterion 9, judge lane).
- `redaction-pipeline-producer.test.js` (spec criterion 9, kept raw
  trace): extend with a file-content assertion at a convention-named
  `trace--<case>.raw.ndjson` path — the persisted file is the same
  redacted `fileStream` the existing criterion-1 test observes.

Verification: `bun test libraries/libharness` green, plus the criterion-11
sweep from [plan-a.md](plan-a.md) § Verification.
