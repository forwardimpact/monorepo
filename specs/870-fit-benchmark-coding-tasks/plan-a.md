# Plan 870-a — fit-benchmark Coding Agent Task Families

## Approach

Build the harness inside `@forwardimpact/libeval` as eleven new modules under
`src/benchmark/` plus a `bin/fit-benchmark.js` entry, in dependency order:
pure-data layers first (`task-family`, `result`, `permissions`,
`apm-installer`), then per-task lifecycle (`workdir`, `scorer`, `judge`),
then the orchestrator (`runner`), then the report path (`report`) and CLI
(`commands/benchmark-{run,score,report}.js` + the bin). Compose libeval's
existing `Supervisor`, `AgentRunner`, and `TraceCollector` — do not fork.
The runner owns the JSONL durable write; subcommand handlers stream to
stdout for visibility only. `apm.lock.yaml` is treated as the
unit-of-measurement fingerprint (hashed over LF-normalised bytes) — v1
expects the family to ship a pre-staged `.claude/` alongside the lockfile;
ApmInstaller copies that staged tree once per family. Tests follow the
existing `node:test` + `libharness` pattern; `createMockRunner` is local
to libeval (`test/mock-runner.js`). Plan-level on-disk decisions are
called out below where the design left them open.

Libraries used: `@forwardimpact/libeval` (`Supervisor`, `AgentRunner`,
`TraceCollector`, `createTeeWriter`, `SequenceCounter`,
`composeProfilePrompt`), `@forwardimpact/libcli` (`createCli`),
`@forwardimpact/libtelemetry` (`createLogger`), `zod` (schema validator).

## Plan-level decisions (design left open)

| # | Decision | Rejected | Why |
|---|---|---|---|
| P1 | Per-task permissions live in `task.yaml` (`permissions: ["full_internet"]`). | `permissions.txt` (one token per line) | Keeps METR-aligned vocabulary in YAML alongside future per-task knobs; matches `apm.yaml`/`apm.lock.yaml` family-root convention. |
| P2 | ApmInstaller v1 copies a pre-staged `<family>/.claude/` and hashes `apm.lock.yaml` bytes; the lockfile is not interpreted. | Re-fetch packs from the lockfile's `dependencies[]` via libpack. | Keeps v1 small and matches how families are authored today (libpack stages, family checks the result in). Lockfile-driven re-install is a follow-up spec. |
| P3 | `submission` is the agent-under-test's last assistant text block on the agent trace, ignoring tool-use blocks. | "Last block before any orchestration tool call." | Aligns with METR's `submission` as the agent's final answer; the alternative loses the answer when agents emit `Conclude`-shaped tool calls last. Pinned in Step 9(d). |
| P4 | Judge `verdict`/`summary` is recovered by parsing the judge trace (`agent.tool_use` block where `name === "Conclude"`) — not by extending `Supervisor.run()`'s return type. | Add `verdict, summary` to `Supervisor.run()`'s return. | Keeps libeval's existing `Supervisor` surface unchanged; the judge trace already exists per design Decision 13. |
| P5 | `--max-turns` on `fit-benchmark run` flows to the agent-under-test's `AgentRunner`; the judge's max-turns is fixed at the libeval default (20). | One knob driving both. | Judges should be bounded; the agent's budget is the experiment variable. |

## Step 1 — Bin + CLI definition

Create the executable and wire its definition. **Created:**
`libraries/libeval/bin/fit-benchmark.js`. **Modified:**
`libraries/libeval/package.json` (add `"fit-benchmark": "./bin/fit-benchmark.js"`
to `bin`; add `"./bin/fit-benchmark.js": "./bin/fit-benchmark.js"` to `exports`).
Mirror `bin/fit-eval.js`. Subcommands and options:

| Subcommand | Required | Optional |
|---|---|---|
| `run` | `--family`, `--output` | `--runs` (default 1, integer ≥ 1), `--model`, `--agent-profile`, `--supervisor-profile` (the live help-loop supervisor; required when `--agent-profile` is set), `--judge-profile`, `--max-turns` (agent-under-test only) |
| `score` | `--family`, `--task` (METR id `tf/name`), `--workdir` (post-run agent CWD) | `--output` (path; defaults to stdout — writes one validated JSONL record line) |
| `report` | `--input` (run-output dir containing `results.jsonl`) | `--k` (comma-separated integers, default `1,3,5`), `--format` (`json` \| `text`, default `json`) |

`documentation` array carries exactly one entry, identical to the skill's
`## Documentation` list (Step 15):

```js
[{ title: "Run a Benchmark",
   url: "https://www.forwardimpact.team/docs/libraries/prove-changes/run-benchmark/index.md",
   description: "Author a coding-task family, run a benchmark across multiple runs, and read the pass@k report." }]
```

Verify: `bunx fit-benchmark --help` exits 0 and lists three subcommands.

## Step 2 — TaskFamily + Task loader

**Created:** `libraries/libeval/src/benchmark/task-family.js`. Export
`async loadTaskFamily(rootPathOrGitUrl): Promise<TaskFamily>`. For git URLs,
shallow-clone into a temp dir; `familyRevision = "git:" + sha` (HEAD at
clone time). For local paths, compute via the algorithm in design § Family
revision algorithm (sorted relpath + per-file sha256 + concatenation +
final sha256, NFC-normalised paths, LF separators, exclude `.git/` and
`node_modules/`). Walk `tasks/<task_family_name>/<task_name>/`; produce
`Task` objects with absolute paths to `instructions.md`, `supervisor.task.md`,
`judge.task.md`, `specs/`, `workdir/`, `scoring/`, and `permissions: string[]`
read from `<task>/task.yaml` key `permissions` (decision P1; default empty
array if the file is absent). Read `<root>/apm.lock.yaml` bytes and store as
`apmLockBytes` (LF-normalised). Verify: unit test loads a fixture family
and asserts `familyRevision` is byte-identical across two consecutive loads
and flips on a one-byte mutation.

## Step 3 — ApmInstaller

**Created:** `libraries/libeval/src/benchmark/apm-installer.js`. Export
`async installApm(family, outputDir): Promise<{ stagingDir, skillSetHash }>`.
Resolve `<family.rootPath>/apm.lock.yaml`. **Throw** if the file is missing
or named `.yml` — error message points at design Decision 4 and libpack
`stager.js:126`. Compute
`skillSetHash = "sha256:" + sha256(normaliseLF(apmLockBytes))`. Copy
`<family.rootPath>/.claude/` recursively into
`<outputDir>/.apm-staging/.claude/` via `fs.cp({ recursive: true })`.
Throw if `.claude/` is absent — the family is malformed (decision P2:
v1 trusts pre-staged content). Idempotent: safe to call twice on the same
`outputDir` (rm-rf staging dir first). Verify: unit test asserts hash
stability under CRLF flip and asserts a one-byte mutation flips the hash.

## Step 4 — WorkdirManager + Workdir

**Created:** `libraries/libeval/src/benchmark/workdir.js`. Exports `Workdir`
type and `WorkdirManager` class with:

```js
class WorkdirManager {
  constructor({ stagingDir, runOutputDir });
  async start(task, runIndex): Promise<Workdir>;
  async teardown(workdir): Promise<{ portFree: boolean, descendants: number }>;
}
// Workdir = { cwd, port, pgid, scaffold, agentTracePath, judgeTracePath, preflightError? }
```

`start` (1) creates `<runOutputDir>/runs/<task_family>__<task_name>/<runIndex>/cwd/`,
(2) `cp -r task.paths.workdir/* → cwd/` and `cp -r task.paths.specs/* → cwd/specs/`,
(3) copies `<stagingDir>/.claude/` → `<cwd>/.claude/`,
(4) allocates a free TCP port via `net.createServer().listen(0)` →
`server.address().port` → `server.close()`,
(5) sets `agentTracePath` and `judgeTracePath` siblings of `cwd`,
(6) spawns `task.paths.workdir/scripts/preflight.sh` with env
`WORKDIR=cwd`, `PORT=port`, `detached: true` so a fresh process group
forms; captures `pgid = child.pid`; exit-zero confirms scaffold; non-zero
populates `preflightError = { phase: "preflight", message, exitCode }` and
returns the handle without throwing (runner short-circuits, see Step 9).

`teardown` SIGTERMs the captured `pgid` (`process.kill(-pgid, "SIGTERM")`),
waits 5 s, SIGKILLs survivors, then verifies (a) the port is free
(`net.connect` probe rejects with `ECONNREFUSED`), (b) no descendant
remains in `pgid` — enumerated by `ps -o pid= -g <pgid>`; treats absence
of `ps` (Windows) as best-effort. Returns `{ portFree, descendants }` so
the runner can record teardown health on the result record. Never copies
`task.paths.scoring`. Verify: unit test with a fixture task that boots an
HTTP listener asserts `scoring/` is absent under `cwd` after `start`
(sentinel-filename probe), and `descendants === 0` and `portFree === true`
after `teardown` (spec criterion 10).

## Step 5 — PermissionsBroker

**Created:** `libraries/libeval/src/benchmark/permissions.js`. Export
`brokerPermissions(permissions, baseAllowedTools): { allowedTools, disallowedTools }`.
v1 closed set:

| Token | Effect |
|---|---|
| `full_internet` (present) | `allowedTools` = `baseAllowedTools ∪ {"WebFetch"}` |
| `full_internet` (absent) | `disallowedTools` includes `"WebFetch"` |

Reject any unknown token with `Error("unknown permission: <token>")` —
fails closed. `baseAllowedTools` is supplied by the runner (decoupled
from libeval's internal default at `agent-runner.js:53`) so the
network-policy assertion stays stable when libeval's defaults change.
Verify: unit test for both permission states and the unknown-token
rejection.

## Step 6 — Scorer

**Created:** `libraries/libeval/src/benchmark/scorer.js`. Export
`async runScoring(task, workdir): Promise<{ verdict, details, exitCode }>`.
Spawn `<task.paths.scoring>/run.sh` (the **template** path, never copied
to `workdir.cwd`) with `child_process.spawn` and
`stdio: ["inherit", "pipe", "pipe", "pipe"]`. Set env: `WORKDIR =
workdir.cwd`, `PORT = workdir.port`, `RESULTS_FD = "3"`. Drain fd 3 line
by line, JSON-parse each into `{ test, pass, message? }`, accumulate into
`details[]`; lines that fail to parse become
`{ raw, parseError: true }` rows (diagnostic-only, do not fail scoring).
Capture stderr to `<workdir.cwd>/../scoring.stderr.log`. Wait for exit;
`verdict = exitCode === 0 ? "pass" : "fail"`. Exit code is authoritative —
fd-3 NDJSON cannot override it (design Decision 12). Verify: unit test
with a stub `run.sh` exercises both verdicts and asserts `details` rows
survive a malformed line.

## Step 7 — Judge

**Created:** `libraries/libeval/src/benchmark/judge.js`. Export
`async runJudge(task, workdir, scoring, deps): Promise<{ verdict, summary }>`
where `deps = { query, output, model, judgeProfile }`. Build a libeval
`Supervisor` via `createSupervisor({ supervisorCwd: workdir.cwd, agentCwd:
workdir.cwd, query: deps.query, output: deps.output, model: deps.model,
supervisorProfile: deps.judgeProfile, agentProfile: undefined, … })`.
Supervisor task = `await readFile(task.paths.judge, "utf8")`; agent task =
a templated string with absolute-path env: `SCORING_PATH` (a JSON file the
runner writes containing `scoring`), `AGENT_TRACE_PATH = workdir.agentTracePath`.
Pipe NDJSON through a fresh `TraceCollector` teed to `workdir.judgeTracePath`.

After `await supervisor.run(task)` resolves, recover the verdict per
decision P4: read `workdir.judgeTracePath` line by line, find the last
`tool_use` block where `name === "Conclude"` and `source === "supervisor"`;
extract `input.verdict` and `input.summary`. Map: `"success"` → `"pass"`,
`"failure"` → `"fail"`. If no `Conclude` is found, return `{ verdict:
"fail", summary: "judge did not conclude" }` (plan-level fallback —
decision row P4-extension). Verify: unit test with a `createMockRunner`
supervisor that emits `Conclude("success", "ok")` asserts verdict
mapping; second test for the no-conclude path; third asserts the trace
is parsed for the *last* Conclude (defensive against earlier non-final
calls).

`@forwardimpact/libeval` exports referenced here: `createSupervisor`,
`composeProfilePrompt`. Tool-server `Conclude` registration is at
`orchestration-toolkit.js:224` (supervisor server) — handler factory at
`orchestration-toolkit.js:41`.

## Step 8 — ResultRecord schema + validator

**Created:** `libraries/libeval/src/benchmark/result.js`. Define a `zod`
schema matching design § Result-record schema verbatim — every field,
every type, every enum. Express the `preflightError?` branch via a
discriminated union so `scoring`, `judgeVerdict`, `submission`,
`agentTracePath`, `judgeTracePath` are required on the happy branch and
optional/absent on the preflight-failure branch. Export
`validateResultRecord(record): void` (throws on schema mismatch) and
`RESULT_RECORD_SCHEMA` for testing. Verify: unit test feeds a minimal
happy-path record, a minimal preflight-failure record, and a malformed
record; first two pass, third throws (spec criterion 12 — schema validated
at write time, asserted indirectly by Step 9 calling the validator before
each append).

## Step 9 — BenchmarkRunner

**Created:** `libraries/libeval/src/benchmark/runner.js`. Export
`BenchmarkRunner`:

```js
class BenchmarkRunner {
  constructor({
    family,            // path | git url | TaskFamily
    runs,              // integer ≥ 1
    output,            // run-output directory
    model,             // string, e.g. "claude-opus-4-7"
    profiles,          // { agent, supervisor, judge } — names
    query,             // SDK query function (injected for testability)
    maxTurns,          // optional, agent-under-test budget
  });
  async *run(): AsyncIterable<ResultRecord>;
}
```

`run()` flow:

1. `family = await loadTaskFamily(opts.family)`.
2. `{ stagingDir, skillSetHash } = await installApm(family, opts.output)`.
3. **Pre-flight install gate** (existence + executable bit, per design
   "fails the family at install"): for every task, assert
   `task.paths.workdir/scripts/preflight.sh` exists and is executable
   (`fs.access(path, fs.constants.X_OK)`); if any fails, throw before any
   agent session — no records written. The *runtime* preflight execution
   happens later inside `wm.start` per task (Step 4 step 6); the install
   gate catches missing/non-executable scripts, the runtime gate catches
   broken scaffolds. Both layers are required.
4. Open `<opts.output>/results.jsonl` in append mode (the runner — not
   the handler — owns the durable file write; handlers mirror records
   to stdout for visibility only).
5. For each `(task, runIndex)` in serial:
   a. `workdir = await wm.start(task, runIndex)`.
   b. If `workdir.preflightError`, build a minimal `ResultRecord`
      (preflight-failure branch from Step 8: `costUsd: 0`, no submission,
      no scoring, no judgeVerdict); validate; append; `yield`; teardown;
      `continue`.
   c. `{ allowedTools, disallowedTools } = brokerPermissions(task.permissions, BASE_TOOLS)`
      where `BASE_TOOLS = ["Bash","Read","Glob","Grep","Write","Edit"]` (constant
      defined in this module, decoupled from libeval defaults).
   d. **Agent-under-test session** — uses a *live* help-loop supervisor
      distinct from the judge (design Decision 7 separates judge from
      live supervisor). Build via
      `createSupervisor({ supervisorCwd: workdir.cwd, agentCwd: workdir.cwd,
      query, output: teeStream, model, supervisorProfile: profiles.supervisor,
      agentProfile: profiles.agent, allowedTools, agentMcpServers: [],
      maxTurns: opts.maxTurns })`. The supervisor task is
      `readFile(task.paths.supervisor)`; the agent's task is delivered as
      the supervisor's initial prompt — the live supervisor reads
      `task.paths.instructions` (passed via env `INSTRUCTIONS_PATH` on the
      supervisor's CWD) and relays it via its first turn. Tee NDJSON to
      `workdir.agentTracePath`. After `await supervisor.run(supervisorTask)`,
      open the trace via `createTraceCollector()` + `addLine` per line:
      `costUsd = collector.toJSON().summary.totalCostUsd` summed across
      `source === "agent"` turns only; `turns` similarly. `submission =`
      last `assistant.text` block on the agent stream (decision P3).
   e. `scoring = await runScoring(task, workdir)`.
   f. `judgeVerdict = await runJudge(task, workdir, scoring, { query,
      output: judgeTeeStream, model, judgeProfile: profiles.judge })`.
   g. Compose `ResultRecord` (`familyRevision`, `skillSetHash`,
      `permissions`, `model`, `profiles`, `durationMs`, `verdict =
      scoring.verdict === "pass" && judgeVerdict.verdict === "pass" ? "pass" : "fail"`,
      plus all fields from design § Result-record schema);
      `validateResultRecord(record)`; append one JSONL line; `yield record`.
   h. `await wm.teardown(workdir)`.
6. Close the JSONL file.

Verify: covered by Step 14 E2E.

## Step 10 — ReportAggregator

**Created:** `libraries/libeval/src/benchmark/report.js`. Export
`async aggregate({ inputDir, kValues }): Promise<Report>`. Read
`<inputDir>/results.jsonl` line by line; `validateResultRecord` each;
malformed lines are skipped with a structured warning to stderr (count
appears on the report under `skipped`). Group by `taskId`. For each task,
compute pass@k = `1 - C(n-c, k) / C(n, k)` using BigInt-based binomial
(`bigBinom(n, k)`) to avoid float drift on large `n`; emit `{ k, value:
null, error: "k > n" }` when `k > n`. Output shape: `{ tasks: [{ taskId,
n, c, passAtK: { 1: 0.4, 3: 0.9 } }], totals: { tasks, runs, skipped } }`.
`--format=text` renders a markdown table with columns
`taskId | n | c | pass@1 | pass@3 | pass@5`. Verify: unit test on the
spec's fixture (n=5, verdicts `pass/fail/fail/pass/fail`) produces
`pass@1 === 0.4` and `pass@3 === 0.9`.

## Step 11 — Subcommand handlers

**Created:** `libraries/libeval/src/commands/benchmark-run.js`,
`benchmark-score.js`, `benchmark-report.js`. Each follows the
`commands/run.js` shape: parse options, `resolve()` paths, build the
runtime helper, invoke, write output, exit `0`/`1` per the spec. The
runner owns the JSONL append (Step 9.4); `benchmark-run` mirrors each
yielded record to stdout as one JSON line for live visibility — it does
not duplicate the durable write. `benchmark-score` calls `runScoring`
on a single `(task, workdir)` pair, validates the partial record, and
writes one JSONL line to `--output` (or stdout). `benchmark-report`
delegates to `aggregate()`. Verify: covered by Step 14.

## Step 12 — Wire bin into package metadata

**Modified:** `libraries/libeval/package.json` — add `bin` and `exports`
entries (Step 1). The catalog row in `libraries/README.md` is regenerated
by `bun run context:fix`; for this PR the row is unchanged because the
package's `description`/`keywords`/`jobs` are not modified — the
regeneration is run anyway to rule out drift. Verify (local, not CI):
`bunx fit-benchmark --version` from the repo root; `bun run context:fix`
produces no diff.

## Step 13 — Unit tests

**Created** under `libraries/libeval/test/`:
`benchmark-task-family.test.js`, `benchmark-apm-installer.test.js`,
`benchmark-workdir.test.js`, `benchmark-permissions.test.js`,
`benchmark-scorer.test.js`, `benchmark-judge.test.js`,
`benchmark-result.test.js`, `benchmark-report.test.js`. Use `node:test`
+ `@forwardimpact/libharness` helpers (`createMockAgentQuery`,
`createToolUseMsg`, `createTextBlockMsg`, `collectLines`, `stripAnsi`)
plus libeval-local `createMockRunner` from
`libraries/libeval/test/mock-runner.js` (this helper lives in the test
tree, not in libharness). Fixture family at
`libraries/libeval/test/fixtures/benchmark-family/` with three tasks:
`tf/pass`, `tf/fail`, `tf/preflight-broken`; each carries `task.yaml`,
`workdir/scripts/preflight.sh`, `scoring/run.sh`. Family root carries
`apm.lock.yaml` and a pre-staged `.claude/` (one no-op skill).
Verify: `bun test test/benchmark-*.test.js` from `libraries/libeval/`
exits 0.

## Step 14 — E2E fixture test

**Created:** `libraries/libeval/test/benchmark-e2e.test.js`. Drives the
runner end-to-end against the fixture family with `runs=2`, mocking the
agent-under-test and judge sessions via `createMockRunner` so no API
calls fire. The table below maps every spec success criterion to the
verification location — Step 13 unit tests carry per-component criteria,
this E2E carries integration criteria.

| Spec criterion | Verified by |
|---|---|
| 1. Records per `(taskId, runIndex)`; failures included | E2E: 4 records on `tf/{pass,fail}` × 2; distinct keys |
| 2. `scoring/` never on agent CWD; sentinel never in trace | E2E: sentinel file under `tf/pass/scoring/`; trace scan |
| 3. Running-service grading | E2E: `tf/pass` `scoring/run.sh` HTTP-probes mock app on `$PORT` |
| 4. Repository-state grading | E2E: second variant task asserts file SHA-256 |
| 5. Process-exit grading | Step 13 `benchmark-scorer.test.js`: stub `run.sh` with explicit exit codes |
| 6. Judge consumes scoring + agent trace; emits verdict | Step 13 `benchmark-judge.test.js`: mock supervisor calls `Conclude` reading `SCORING_PATH` |
| 7. Network policy via `WebFetch` | E2E: `--allowedTools` snapshot under `full_internet` vs default; tool list assertion (no real network) |
| 8. Skill-set reproducibility | Step 13 `benchmark-apm-installer.test.js`: hash stability + 1-byte mutation |
| 9. Pre-flight catches broken templates; cost zero | E2E: `tf/preflight-broken` produces a record with `preflightError` and `costUsd === 0` |
| 10. Teardown leaves no descendant; port free | Step 13 `benchmark-workdir.test.js`: HTTP-listener fixture; `descendants === 0` |
| 11. Pass@k via HumanEval estimator | Step 13 `benchmark-report.test.js`: fixture `pass/fail/fail/pass/fail` |
| 12. Records validated at write time | Step 13 `benchmark-result.test.js` + E2E asserts every line in `results.jsonl` validates |
| 13. Traces consumable by `fit-trace overview` | E2E: invoke `TraceQuery.overview()` (`src/trace-query.js:24`) on agent and judge traces; assert no throw and `turnCount > 0` |
| 14. Skill–CLI parity | Step 15 explicit assertion |

Verify: `bun test test/benchmark-e2e.test.js` exits 0 locally.

## Step 15 — Skill + guide + parity assertion

**Created:**

- `.claude/skills/fit-benchmark/SKILL.md` — modelled on
  `.claude/skills/fit-eval/SKILL.md`. `## Documentation` lists exactly
  one entry: `[Run a Benchmark](https://www.forwardimpact.team/docs/libraries/prove-changes/run-benchmark/index.md)`
  with the description string from Step 1.
- `.claude/skills/fit-benchmark/references/cli.md` — full flag surface.
- `websites/fit/docs/libraries/prove-changes/run-benchmark/index.md` —
  Big Hire / Little Hire framing, walkthrough mirroring `run-eval/index.md`,
  authoring a task family, reading the report, the fd-3 NDJSON
  scoring-channel convention (note non-bash `run.sh` interpreters must
  open fd 3 explicitly).

**Created:** `libraries/libeval/test/benchmark-parity.test.js` — parses
both the skill's `## Documentation` markdown list and the CLI definition's
`documentation` array (import the bin's exported definition); asserts
`title`, `url`, and `description` tuples are equal in order. This
replaces a `grep` check with structural equality (spec criterion 14).
Verify: `bun test test/benchmark-parity.test.js` exits 0.

## Step 16 — Quality gates

Run from repo root: `bun run check`, `bun run format:fix`, `bun run test`,
`bun run context:fix` (no diff expected per Step 12). Verify locally
before push: all four commands exit 0. CI repeats them; this step is
"green CI on the plan PR's follow-up implementation PR" only as the
external confirmation.

## Risks

The risks below are items the implementer cannot see from the plan steps.

1. **Process-group teardown on macOS vs Linux.** `process.kill(-pgid, sig)`
   needs the spawned shell to have called `setsid`/`setpgid`. `spawn({
   detached: true })` triggers this on POSIX, but mixing `inherit` (stdin)
   with `pipe` (stdout/stderr/fd-3) interacts subtly with `detached` —
   on macOS the inherited stdin can pin the child to the parent's tty
   group. Mitigation: integration test on both runner OSes in CI; consider
   `stdio: ["ignore", ...]` if flakiness appears.
2. **`scoring/run.sh` fd 3 portability.** Bash, dash, and zsh all support
   `>&3`. Python and Node `run.sh` shebangs need explicit fd-3 open.
   Documented in the guide (Step 15) but the implementer should add a
   guide-level example for each interpreter.
3. **`net.createServer().listen(0)` race.** The free-port probe closes
   the socket before the agent binds, so another process can claim the
   port between probe and agent start. v1 accepts this — the runtime
   preflight will catch the conflict — but flakiness will surface on
   busy CI; pin `net.allowHalfOpen` and SO_REUSEADDR if the rate exceeds
   1%.

## Execution recommendation

Single executor, sequential. Steps 1–12 must run in dependency order;
Step 13 unit tests can interleave with each numbered step (write the
unit test for Step N before moving to Step N+1, TDD-style). Step 14
follows Step 12. Step 15's skill + guide can start as soon as Step 1's
CLI surface is locked — route to `technical-writer` for the guide prose
if available; engineering agent owns the parity assertion and the rest.
Step 16 closes out. No part is large enough to justify decomposition;
one engineering sub-agent owns the full plan from a single execution
session.

— Staff Engineer 🛠️
