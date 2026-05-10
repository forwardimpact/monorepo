# Plan 870-a — fit-benchmark Coding Agent Task Families

## Approach

Build the harness inside `@forwardimpact/libeval` as eleven new modules
under `src/benchmark/` plus a `bin/fit-benchmark.js` entry, in dependency
order: pure-data layers first (`task-family`, `result`, `permissions`,
`apm-installer`), then per-task lifecycle (`workdir`, `scorer`, `judge`),
then the orchestrator (`runner`), then the report path (`report`) and CLI
(`commands/benchmark-{run,score,report}.js` + the bin). The
agent-under-test session uses a bare libeval `AgentRunner` directly (the
design's live supervisor is deferred — see decision P6); the judge phase
composes a libeval `Supervisor` over an `AgentRunner` per design Decision 7.
Family-shipped path/scoring inputs reach the LLM via prompt templating
(`{{SCORING}}`, `{{AGENT_TRACE_PATH}}`), not process env. The runner owns
the JSONL durable write; subcommand handlers stream to stdout for
visibility only. `apm.lock.yaml` is treated as the unit-of-measurement
fingerprint over LF-normalised bytes; the family ships a pre-staged
`.claude/` that ApmInstaller copies once. Tests use the existing
`node:test` + `libharness` pattern; `createMockRunner` is consumed from
`libraries/libeval/test/mock-runner.js` (already in tree).

Libraries used: `@forwardimpact/libeval` (`createAgentRunner`,
`createSupervisor`, `createTraceCollector`, `composeProfilePrompt`,
`AGENT_SYSTEM_PROMPT`), `@forwardimpact/libcli` (`createCli`),
`@forwardimpact/libtelemetry` (`createLogger`), `zod` (schema validator).

## Plan-level decisions (design left open)

| # | Decision | Rejected | Why |
|---|---|---|---|
| P1 | Per-task permissions live in `task.yaml` (`permissions: ["full_internet"]`). | `permissions.txt`. | YAML matches `apm.yaml`/`apm.lock.yaml` family-root convention and lets future per-task knobs (timeouts, max turns) co-locate. |
| P2 | ApmInstaller v1 copies a pre-staged `<family>/.claude/` and hashes `apm.lock.yaml` bytes; the lockfile is not interpreted. | Re-fetch packs from lockfile `dependencies[]` via libpack. | Keeps v1 small. Lockfile-driven re-install is a follow-up spec; current families author `.claude/` once via libpack and check it in. |
| P3 | `submission` is the agent-under-test's last `assistant.text` block on its own raw NDJSON trace file (no envelope, no source filter — bare AgentRunner writes one stream). | "Last text block before any orchestration tool call." | The agent has no orchestration tools in v1 (P6); the rejected rule has no signal. |
| P4 | Judge `verdict`/`summary` recovered by parsing `workdir.judgeTracePath` for the last `tool_use` block where `name === "Conclude"`; map `success`→`pass`, `failure`→`fail`. | Extend `Supervisor.run()` return type. | Keeps libeval's existing surface unchanged; the judge trace already exists per design Decision 13. |
| P5 | `--max-turns` flows directly to the agent-under-test's `AgentRunner` constructor (decision P6 makes this unambiguous). | One knob driving both judge and agent. | Judges run on libeval's default supervisor budget (20); the agent's budget is the experiment variable. |
| P6 | v1 defers the live help-loop supervisor depicted as `SV1` in the design's component graph; the agent-under-test runs as a bare `AgentRunner`. The family format keeps `supervisor.task.md` for forward-compatibility but the harness does not consume it in v1. | Wire `createSupervisor` over the agent (design's mermaid). | `createSupervisor` (`libraries/libeval/src/supervisor.js:486–567`) hardcodes the agent's `maxTurns: 50` and accepts no agent-side `disallowedTools`; threading these through requires a libeval API change outside this spec's scope. Design Decision 7 only mandates `Supervisor` for the **judge** phase, not the live session — deferring SV1 is consistent with Decision 7 and pulls libeval-surface changes out of v1. |

## Step 1 — Bin + CLI definition

Create the executable and wire its definition. **Created:**
`libraries/libeval/bin/fit-benchmark.js`. **Modified:**
`libraries/libeval/package.json` (add `"fit-benchmark": "./bin/fit-benchmark.js"`
to `bin`; add `"./bin/fit-benchmark.js": "./bin/fit-benchmark.js"` to
`exports`). Mirror `bin/fit-eval.js`. Subcommands and options:

| Subcommand | Required | Optional |
|---|---|---|
| `run` | `--family`, `--output` | `--runs` (integer ≥ 1, default 1), `--model`, `--agent-profile`, `--judge-profile`, `--max-turns` (agent budget) |
| `score` | `--family`, `--task` (METR id `tf/name`), `--workdir` (post-run agent CWD) | `--output` (file path; defaults to stdout — writes one validated JSONL record line) |
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
`async loadTaskFamily(rootPathOrGitUrl): Promise<TaskFamily>`. For git
URLs, shallow-clone into a temp dir; `familyRevision = "git:" + sha`
(HEAD at clone time). For local paths, compute via the algorithm in
design § Family revision algorithm (sorted relpaths + per-file sha256 +
concatenation + final sha256, NFC-normalised paths, LF separators,
exclude `.git/` and `node_modules/`). Walk
`tasks/<task_family_name>/<task_name>/`; produce `Task` objects with
absolute paths to `instructions.md`, `supervisor.task.md` (preserved for
forward-compat per P6, not read), `judge.task.md`, `specs/`, `workdir/`,
`scoring/`, plus `permissions: string[]` read from `<task>/task.yaml`
key `permissions` (default `[]`). Read `<root>/apm.lock.yaml` bytes; LF-
normalise; store as `apmLockBytes`. Verify: unit test loads a fixture
family and asserts `familyRevision` is byte-identical across two
consecutive loads and flips on a one-byte mutation under
`tasks/tf/pass/workdir/`.

## Step 3 — ApmInstaller

**Created:** `libraries/libeval/src/benchmark/apm-installer.js`. Export
`async installApm(family, outputDir): Promise<{ stagingDir, skillSetHash }>`.
Resolve `<family.rootPath>/apm.lock.yaml`. **Throw** if the file is
missing or named `.yml` — error message points at design Decision 4 and
libpack `stager.js:126`. Compute
`skillSetHash = "sha256:" + sha256(apmLockBytes)` (already LF-normalised
in Step 2). Copy `<family.rootPath>/.claude/` recursively into
`<outputDir>/.apm-staging/.claude/` via `fs.cp({ recursive: true })`.
Throw if `.claude/` is absent — the family is malformed (P2: v1 trusts
pre-staged content). Idempotent: rm-rf staging dir first. Verify: unit
test asserts hash stability under CRLF flip on the source file and
asserts a one-byte mutation flips the hash.

## Step 4 — WorkdirManager + Workdir

**Created:** `libraries/libeval/src/benchmark/workdir.js`. Exports
`Workdir` type and `WorkdirManager` class:

```js
class WorkdirManager {
  constructor({ stagingDir, runOutputDir });
  async start(task, runIndex): Promise<Workdir>;
  async teardown(workdir): Promise<{ portFree: boolean, descendants: number }>;
}
// Workdir = { cwd, port, pgid, agentTracePath, judgeTracePath, preflightError? }
```

`start` (1) creates `<runOutputDir>/runs/<task_family>__<task_name>/<runIndex>/cwd/`,
(2) `cp -r task.paths.workdir/* → cwd/` and `cp -r task.paths.specs/* → cwd/specs/`
(skip `cwd/scripts/` from copy if `workdir/scripts/` exists — preflight
runs from the template, not the agent CWD; design § Pre-flight contract),
(3) copies `<stagingDir>/.claude/` → `<cwd>/.claude/`,
(4) allocates a free TCP port via `net.createServer().listen(0)` →
`server.address().port` → `server.close()`,
(5) sets `agentTracePath = <runDir>/agent.ndjson` and
`judgeTracePath = <runDir>/judge.ndjson` (siblings of `cwd`),
(6) spawns `task.paths.workdir/scripts/preflight.sh` with env
`WORKDIR=cwd`, `PORT=port`, `detached: true` so a fresh process group
forms; captures `pgid = child.pid`; exit-zero confirms scaffold; non-zero
populates `preflightError = { phase: "preflight", message, exitCode }`
and returns the handle without throwing.

`teardown` SIGTERMs the captured `pgid` (`process.kill(-pgid, "SIGTERM")`),
waits 5 s, SIGKILLs survivors, then verifies (a) the port is free
(`net.connect` rejects with `ECONNREFUSED`), (b) no descendant remains
in `pgid` — enumerated by `ps -o pid= -g <pgid>`; treats absence of `ps`
as best-effort. Returns `{ portFree, descendants }` so the runner can
record teardown health on the result record. Never copies
`task.paths.scoring`. Verify: unit test with a fixture task that boots an
HTTP listener on `$PORT` asserts `scoring/` is absent under `cwd`
(sentinel-filename probe), `descendants === 0` and `portFree === true`
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
fails closed. `baseAllowedTools` is supplied by the runner so the
network-policy assertion stays stable when libeval's defaults
(`agent-runner.js:9`, the `DEFAULT_ALLOWED_TOOLS` constant) change.
Verify: unit test for both permission states and the unknown-token
rejection.

## Step 6 — Scorer

**Created:** `libraries/libeval/src/benchmark/scorer.js`. Export
`async runScoring(task, workdir): Promise<{ verdict, details, exitCode }>`.
Spawn `<task.paths.scoring>/run.sh` (the **template** path, never copied
to `workdir.cwd`) with `child_process.spawn` and
`stdio: ["inherit", "pipe", "pipe", "pipe"]`. Set env: `WORKDIR =
workdir.cwd`, `PORT = workdir.port`, `RESULTS_FD = "3"`. Drain fd 3 line
by line, JSON-parse each into `{ test, pass, message? }`, accumulate
into `details[]`; lines that fail to parse become
`{ raw, parseError: true }` rows (diagnostic-only, do not fail scoring).
Capture stderr to `<runDir>/scoring.stderr.log`. Wait for exit; `verdict
= exitCode === 0 ? "pass" : "fail"`. Exit code is authoritative — fd-3
NDJSON cannot override (design Decision 12). Verify: unit test with a
stub `run.sh` exercises both verdicts and asserts `details` rows survive
a malformed line.

## Step 7 — Judge

**Created:** `libraries/libeval/src/benchmark/judge.js`. Export
`async runJudge(task, workdir, scoring, deps): Promise<{ verdict, summary }>`
where `deps = { query, model, judgeProfile }`. The judge composes a
libeval `Supervisor` per design Decision 7. Family-shipped paths and
scoring data reach the LLM via **prompt templating**, not env (env vars
do not propagate through the SDK to the model):

1. `template = await readFile(task.paths.judge, "utf8")`.
2. `taskText = template
   .replaceAll("{{SCORING}}", JSON.stringify(scoring, null, 2))
   .replaceAll("{{AGENT_TRACE_PATH}}", workdir.agentTracePath)`.
3. Build the judge supervisor via `createSupervisor({ supervisorCwd:
   workdir.cwd, agentCwd: workdir.cwd, query: deps.query, output:
   judgeTeeStream, model: deps.model, supervisorProfile: deps.judgeProfile,
   agentProfile: undefined })`. The judge typically calls `Conclude` in
   its first turn (`Supervisor.run` line 113–122 short-circuits on
   conclude); a non-conclude first turn falls into the relay loop with
   the placeholder agent participant — acceptable.
4. `judgeTeeStream` is built by the runner: a passthrough that JSON-parses
   each NDJSON line and writes only the lines to `workdir.judgeTracePath`
   (it is the supervisor's tagged `output` stream — judge trace contains
   both supervisor and placeholder-agent envelopes; that is fine for
   parsing the `Conclude` block).
5. `await supervisor.run(taskText)`.
6. Parse `workdir.judgeTracePath` line by line; find the last
   envelope-wrapped event where `source === "supervisor"` and the
   underlying assistant message contains a `tool_use` block with `name
   === "Conclude"`; extract `input.verdict` and `input.summary`. Map:
   `"success"` → `"pass"`, `"failure"` → `"fail"`. If no `Conclude` is
   found, return `{ verdict: "fail", summary: "judge did not conclude" }`.

Family-author contract for `judge.task.md`: must include `{{SCORING}}`
and `{{AGENT_TRACE_PATH}}` placeholders where the judge needs the
substituted values; the runner does not inject them outside the
template. Document this in the Step 15 guide.

`@forwardimpact/libeval` exports referenced: `createSupervisor`. The
`Conclude` tool registration is at `orchestration-toolkit.js:224`
(supervisor server); handler factory at `orchestration-toolkit.js:42`
(`createConcludeHandler`).

Verify: unit test composes a `Supervisor` over two `createMockRunner`
instances (the existing pattern in
`libraries/libeval/test/facilitator-redirect.test.js`); the supervisor
mock emits a `Conclude("success", "ok")` `tool_use`. Assert verdict
mapping; add a no-conclude case; add a "earlier conclude then later
text" defensive case (last `Conclude` wins).

## Step 8 — ResultRecord schema + validator

**Created:** `libraries/libeval/src/benchmark/result.js`. Define a `zod`
schema matching design § Result-record schema verbatim — every field,
every type, every enum. Express the `preflightError?` branch via a
discriminated union: `scoring`, `judgeVerdict`, `submission`,
`agentTracePath`, `judgeTracePath` are required on the happy branch and
absent on the preflight-failure branch. Export
`validateResultRecord(record): void` (throws on schema mismatch) and
`RESULT_RECORD_SCHEMA`. Verify: unit test feeds a minimal happy-path
record, a minimal preflight-failure record, and a malformed record;
first two pass, third throws (spec criterion 12 — write-time validation
is asserted indirectly when Step 9 wraps every append in the validator).

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
    profiles,          // { agent, judge } — names (P6: no `supervisor`)
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
   (`fs.access(path, fs.constants.X_OK)`); if any fails, throw before
   any agent session — no records written. The *runtime* preflight
   execution happens inside `wm.start` per task (Step 4 step 6); both
   layers are required.
4. Open `<opts.output>/results.jsonl` in append mode (the runner — not
   the handler — owns the durable file write; handlers mirror records
   to stdout for visibility only).
5. For each `(task, runIndex)` in serial:
   a. `workdir = await wm.start(task, runIndex)`.
   b. If `workdir.preflightError`: build the preflight-failure
      `ResultRecord` (`costUsd: 0`, no submission, no scoring, no
      judgeVerdict); validate; append; `yield`; teardown; `continue`.
   c. `BASE_TOOLS = ["Bash","Read","Glob","Grep","Write","Edit"]`
      (constant in this module); `{ allowedTools, disallowedTools } =
      brokerPermissions(task.permissions, BASE_TOOLS)`.
   d. **Agent-under-test session** — bare `AgentRunner` (P6, no live
      supervisor in v1):

      ```js
      const agentTraceStream = createWriteStream(workdir.agentTracePath);
      const runner = createAgentRunner({
        cwd: workdir.cwd,
        query, output: agentTraceStream, model,
        maxTurns: opts.maxTurns ?? 50,
        allowedTools, disallowedTools,
        settingSources: ["project"],
        systemPrompt: profiles.agent
          ? composeProfilePrompt(profiles.agent, {
              profilesDir: resolve(workdir.cwd, ".claude/agents"),
              trailer: AGENT_SYSTEM_PROMPT,
            })
          : undefined,
      });
      const instructions = await readFile(task.paths.instructions, "utf8");
      const result = await runner.run(instructions);
      await new Promise((r) => agentTraceStream.end(r));
      ```

      `costUsd`, `turns`, `submission` are then read from the agent
      trace by ingesting the file into a fresh `TraceCollector`:

      ```js
      const collector = createTraceCollector();
      for await (const line of readFileLines(workdir.agentTracePath)) {
        collector.addLine(line);
      }
      const json = collector.toJSON();
      const costUsd = json.summary.totalCostUsd;     // bare runner — single result event
      const turns = json.summary.numTurns;
      const submission = lastAssistantText(json);    // P3: last assistant.text block
      ```

      `lastAssistantText(json)` walks `json.turns` in order, returns the
      last `text` from any `assistant` block; defined locally in
      `runner.js`.
   e. `scoring = await runScoring(task, workdir)`.
   f. `judgeVerdict = await runJudge(task, workdir, scoring, { query,
      model, judgeProfile: profiles.judge })`.
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
appears on the report under `skipped`). Group by `taskId`. For each
task, compute pass@k = `1 - C(n-c, k) / C(n, k)` using BigInt-based
binomial; emit `{ k, value: null, error: "k > n" }` when `k > n`. Output
shape: `{ tasks: [{ taskId, n, c, passAtK: { 1: 0.4, 3: 0.9 } }],
totals: { tasks, runs, skipped } }`. `--format=text` renders a markdown
table with columns `taskId | n | c | pass@1 | pass@3 | pass@5`. Verify:
unit test on the spec's fixture (n=5, verdicts
`pass/fail/fail/pass/fail`) produces `pass@1 === 0.4` and `pass@3 === 0.9`.

## Step 11 — Subcommand handlers

**Created:** `libraries/libeval/src/commands/benchmark-run.js`,
`benchmark-score.js`, `benchmark-report.js`. Each follows the
`commands/run.js` shape: parse options, `resolve()` paths, build the
runtime helper, invoke, write output, exit `0`/`1`. The runner owns the
JSONL append (Step 9.4); `benchmark-run` mirrors each yielded record to
stdout as one JSON line for live visibility — no duplicate write.
`benchmark-score` calls `runScoring` on a single `(task, workdir)` pair,
validates the partial record, writes one JSONL line to `--output` (or
stdout). `benchmark-report` delegates to `aggregate()`. Verify: covered
by Step 14.

## Step 12 — Wire bin into package metadata

**Modified:** `libraries/libeval/package.json` — add `bin` and `exports`
entries (Step 1). Run `bun run context:fix` from the repo root; the
catalog row in `libraries/README.md` may pick up the new `fit-benchmark`
bin entry (the catalog generators inspect `bin`); commit any diff. The
package's `description`/`keywords`/`jobs` are unchanged. Verify locally:
`bunx fit-benchmark --version` from the repo root; commit the regen diff
with the rest of the implementation.

## Step 13 — Unit tests

**Created** under `libraries/libeval/test/`:
`benchmark-task-family.test.js`, `benchmark-apm-installer.test.js`,
`benchmark-workdir.test.js`, `benchmark-permissions.test.js`,
`benchmark-scorer.test.js`, `benchmark-judge.test.js`,
`benchmark-result.test.js`, `benchmark-report.test.js`. Use `node:test`
+ `@forwardimpact/libharness` helpers (`createMockAgentQuery`,
`createToolUseMsg`, `createTextBlockMsg`, `collectLines`, `stripAnsi`).
The judge test consumes the existing libeval-local helper at
`libraries/libeval/test/mock-runner.js` (already in tree — not a Created
file) — instantiate two `createMockRunner` results and pass them to a
real `Supervisor` instance per `facilitator-redirect.test.js`. **Created**
fixture family at `libraries/libeval/test/fixtures/benchmark-family/`
with three tasks: `tf/pass`, `tf/fail`, `tf/preflight-broken`; each
carries `task.yaml`, `workdir/scripts/preflight.sh`, `scoring/run.sh`,
`instructions.md`, `judge.task.md` (with `{{SCORING}}` and
`{{AGENT_TRACE_PATH}}` placeholders). Family root carries `apm.lock.yaml`
and a pre-staged `.claude/` (one no-op skill). Verify: `bun test
test/benchmark-*.test.js` from `libraries/libeval/` exits 0.

## Step 14 — E2E fixture test

**Created:** `libraries/libeval/test/benchmark-e2e.test.js`. Drives the
runner end-to-end against the fixture family with `runs=2`, mocking the
agent-under-test and judge sessions via `createMockRunner` so no API
calls fire. The table maps every spec success criterion to its
verification location.

| Spec criterion | Verified by |
|---|---|
| 1. Records per `(taskId, runIndex)`; failures included | E2E: 4 records on `tf/{pass,fail}` × 2; distinct keys |
| 2. `scoring/` never on agent CWD; sentinel never in trace | E2E: sentinel file under `tf/pass/scoring/`; trace scan |
| 3. Running-service grading | E2E: `tf/pass`'s `scoring/run.sh` HTTP-probes a mock app on `$PORT` |
| 4. Repository-state grading | E2E: a second variant task asserts file SHA-256 |
| 5. Process-exit grading | Step 13 `benchmark-scorer.test.js`: stub `run.sh` with explicit exit codes |
| 6. Judge consumes scoring + agent trace; emits verdict | Step 13 `benchmark-judge.test.js`: mock supervisor reads `{{SCORING}}` and `{{AGENT_TRACE_PATH}}` from its prompt and calls `Conclude` |
| 7. Network policy via `WebFetch` | E2E: `allowedTools`/`disallowedTools` snapshot under `full_internet` vs default; tool list assertion (no real network) |
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
  Big Hire / Little Hire framing, walkthrough mirroring
  `run-eval/index.md`, authoring a task family (including the
  `{{SCORING}}` / `{{AGENT_TRACE_PATH}}` placeholder convention from
  Step 7 and the fd-3 NDJSON scoring channel from Step 6 — note non-bash
  `run.sh` interpreters must open fd 3 explicitly with worked Python and
  Node examples), reading the report. Cite `libraries/CLAUDE.md` § Linking
  rule for the parity convention.

**Created:** `libraries/libeval/test/benchmark-parity.test.js` — parses
both the skill's `## Documentation` markdown list and the CLI
definition's `documentation` array (import the bin's exported
definition); asserts `title`, `url`, and `description` tuples are equal
and in the same order. Replaces a `grep` check with structural equality
(spec criterion 14). Verify: `bun test test/benchmark-parity.test.js`
exits 0.

## Step 16 — Quality gates

Run from repo root: `bun run check`, `bun run format:fix`, `bun run
test`, `bun run context:fix`. Verify locally before push: all four exit
0, then commit any `bun run context:fix` diff (Step 12). CI repeats
`bun run check` and `bun run test`; `bun run context:fix` is a local-only
gate confirmed by zero-diff in CI verification.

## Risks

The risks below are items the implementer cannot see from the plan steps.

1. **Process-group teardown on macOS vs Linux.** `process.kill(-pgid,
   sig)` needs the spawned shell to have called `setsid`/`setpgid`.
   `spawn({ detached: true })` triggers this on POSIX, but mixing
   `inherit` (stdin) with `pipe` (stdout/stderr/fd-3) interacts subtly
   with `detached` — on macOS the inherited stdin can pin the child to
   the parent's tty group. Mitigation: integration test on both runner
   OSes in CI; consider `stdio: ["ignore", ...]` if flakiness appears.
2. **`net.createServer().listen(0)` race.** The free-port probe closes
   the socket before the agent binds, so another process can claim the
   port between probe and agent start. v1 accepts this — the runtime
   preflight will catch the conflict — but flakiness will surface on
   busy CI.
3. **Lockfile-as-fingerprint loophole.** Decision P2 hashes
   `apm.lock.yaml` bytes, not the actual `.claude/` content. A family
   author who edits `.claude/skills/...` without re-running libpack
   stage gets a stale `skillSetHash` that no longer reflects what's
   installed. Mitigation: the Step 15 guide must instruct authors to
   regenerate `apm.lock.yaml` after any `.claude/` edit; a content-hash
   variant is the obvious follow-up if drift bites in practice.

## Execution recommendation

Single executor, sequential. Steps 1–12 must run in dependency order;
Step 13 unit tests interleave with each numbered step (TDD: write the
unit test for Step N before moving to Step N+1). Step 14 follows Step 12.
Step 15's skill + guide can start as soon as Step 1's CLI surface is
locked — route to `technical-writer` for the guide prose if available;
the engineering agent owns the parity assertion and the rest. Step 16
closes out. No part is large enough to justify decomposition; one
engineering sub-agent owns the full plan from a single execution session.

— Staff Engineer 🛠️
