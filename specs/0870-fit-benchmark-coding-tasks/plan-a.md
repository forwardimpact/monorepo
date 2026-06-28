# Plan 0870-a — fit-benchmark Coding Agent Task Families

## Approach

Build the harness inside `@forwardimpact/libeval` as ten new modules under
`src/benchmark/` plus a `bin/fit-benchmark.js` entry, in dependency order:
pure-data layers (`task-family`, `result`, `apm-installer`), then per-task
lifecycle (`workdir`, `invariants`, `judge`), then the orchestrator (`runner`),
then `report` and the three subcommand handlers under `commands/`. The
agent-under-test runs as a bare `AgentRunner` with a fixed `BASE_TOOLS`
allow-list per design Decision 9; the judge composes `Supervisor`+`AgentRunner`
per Decision 7; family-shipped paths reach the LLM via prompt templating
(`{{INVARIANTS_RESULT}}`, `{{AGENT_TRACE_PATH}}`); the runner owns the JSONL
append, handlers mirror to stdout; `apm.lock.yaml` is the LF-normalised
fingerprint over a pre-staged `.claude/`; tests use `node:test` + `libmock`'s
`createMockAgentQuery` for the agent SDK and the `Supervisor`-with-mock-runners
pattern (`test/supervisor-run.test.js`) for the judge.

Libraries used: `@forwardimpact/libeval` (`createAgentRunner`,
`createSupervisor`, `createTraceCollector`, `composeProfilePrompt`,
`AGENT_SYSTEM_PROMPT`), `@forwardimpact/libcli` (`createCli`),
`@forwardimpact/libtelemetry` (`createLogger`), `zod`.

## Plan-level decisions (design left open)

| # | Decision | Rejected | Why |
|---|---|---|---|
| P1 | ApmInstaller v1 copies a pre-staged `<family>/.claude/` and hashes `apm.lock.yaml` bytes; the lockfile is not interpreted. | Re-fetch packs from lockfile `dependencies[]` via libpack. | Keeps v1 small. Lockfile-driven re-install is a follow-up spec; current families author `.claude/` once via libpack and check it in. |
| P2 | `submission` is the agent-under-test's last `assistant.text` block on its own raw NDJSON trace file (no envelope, no source filter — bare AgentRunner writes one stream). | "Last text block before any orchestration tool call." | The agent has no orchestration tools in v1 (design Decision 14); the rejected rule has no signal. |
| P3 | Judge `verdict`/`summary` recovered by parsing `workdir.judgeTracePath` for the last `tool_use` block where `name === "Conclude"`; map `success`→`pass`, `failure`→`fail`. | Extend `Supervisor.run()` return type. | Keeps libeval's existing surface unchanged; the judge trace already exists per design Decision 13. |
| P4 | `--max-turns` flows directly to the agent-under-test's `AgentRunner` constructor (design Decision 14 makes this unambiguous). | One knob driving both judge and agent. | Judges run on libeval's default supervisor budget (20); the agent's budget is the experiment variable. |
| P5 | `profiles` on the `ResultRecord` is `{ agent: string\|null, supervisor: null, judge: string\|null }`. The `supervisor` slot is unconditionally `null` in v1 (design Decision 14). The `agent` and `judge` slots are `null` when their CLI flags are not supplied — a permitted widening of design § Result-record schema's "profile name string" since both flags are optional in Step 1's CLI surface and a missing profile cannot be represented as a string. | Require both flags; drop `supervisor` entirely. | Optional CLI flags need a sentinel value; preserving the schema's `supervisor` slot keeps records cross-version comparable. |
| P6 | `runInvariants` and `WorkdirManager.start` decouple from each other: `runInvariants(task, ctx)` takes only `{ cwd, port, runDir }`, where `runDir` is the parent of `cwd`. `Invariants` writes `<runDir>/invariants.stderr.log`. The `Workdir` handle is therefore convertible to a `runInvariants` ctx via destructure. | Pass the full `Workdir` handle. | Lets `benchmark-invariants` synthesize a ctx from `--workdir` (a post-run dir) without inventing pgid/agentTracePath/etc. fields it cannot supply. |
| P7 | `benchmark-invariants` writes a `InvariantsRecord` (a separate, narrower zod schema in `result.js` exporting both `RESULT_RECORD_SCHEMA` and `INVARIANTS_RECORD_SCHEMA`), not a `ResultRecord`. Its shape: `{ taskId, invariants, exitCode }`. | Force the full `ResultRecord` discriminated union to accept a third "invariants-only" branch. | Keeps `ResultRecord` semantically a benchmark-run output. The invariants subcommand is an ad-hoc grading path; its output validates against its own schema. |

## Step 1 — Bin + CLI definition

Create the executable and wire its definition. **Created:**
`libraries/libeval/bin/fit-benchmark.js`. **Modified:**
`libraries/libeval/package.json` (add
`"fit-benchmark": "./bin/fit-benchmark.js"` to `bin`; add
`"./bin/fit-benchmark.js": "./bin/fit-benchmark.js"` to `exports`). Mirror
`bin/fit-eval.js`. Subcommands and options:

| Subcommand | Required | Optional |
|---|---|---|
| `run` | `--family`, `--output` | `--runs` (integer ≥ 1, default 1), `--model`, `--agent-profile`, `--judge-profile`, `--max-turns` (agent budget) |
| `invariants` | `--family`, `--task` (METR id `tf/name`), `--workdir` (post-run dir whose layout matches `WorkdirManager.start` output — `<workdir>/cwd/` is the agent CWD; the handler synthesises a `{ cwd, port, runDir }` ctx per P6) | `--output` (file path; defaults to stdout — writes one `InvariantsRecord` JSONL line per P7) |
| `report` | `--input` (run-output dir containing `results.jsonl`) | `--k` (comma-separated integers, default `1,3,5`), `--format` (`json` \| `text`, default `json`) |

`documentation` array carries exactly one entry, identical to the skill's
`## Documentation` list (Step 14):

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
forward-compat per design Decision 14, not read), `judge.task.md`,
`specs/`, `workdir/`, `invariants/`. v1 does not read `task.yaml` (no
per-task knobs yet — see design Decision 9); the path stays reserved
for the v2 permissions amendment. Read `<root>/apm.lock.yaml` bytes;
LF-normalise; store as `apmLockBytes`.

Also export `async assertJudgeProfileStaged(family, stagingDir,
judgeProfile): Promise<void>` — when `--judge-profile` is supplied, the
`BenchmarkRunner` install gate (Step 8.3) calls this to assert
`<stagingDir>/.claude/agents/<judgeProfile>.md` exists; missing throws
before any agent session. (`createSupervisor` resolves
`profilesDir = <supervisorCwd>/.claude/agents` at `supervisor.js:502–
503` — and the staging tree is what gets copied into the supervisor's
`cwd`, so the file must be present in the family's pre-staged
`.claude/agents/`.)

Verify: unit test loads a fixture family and asserts (a) `familyRevision`
is byte-identical across two consecutive loads, (b) flips on a one-byte
mutation under `tasks/tf/pass/workdir/`, (c) `assertJudgeProfileStaged`
throws when the named profile is absent and resolves when present.

## Step 3 — ApmInstaller

**Created:** `libraries/libeval/src/benchmark/apm-installer.js`. Export
`async installApm(family, outputDir): Promise<{ stagingDir, skillSetHash }>`.
Resolve `<family.rootPath>/apm.lock.yaml`. **Throw** if the file is
missing or named `.yml` — error message points at design Decision 4 and
libpack `stager.js:126`. Compute
`skillSetHash = "sha256:" + sha256(apmLockBytes)` (already LF-normalised
in Step 2). Copy `<family.rootPath>/.claude/` recursively into
`<outputDir>/.apm-staging/.claude/` via `fs.cp({ recursive: true })`.
Throw if `.claude/` is absent — the family is malformed (P1: v1 trusts
pre-staged content). Idempotent: rm-rf staging dir first. Verify: unit
test writes two fixture lockfiles directly (LF and CRLF variants of the
same logical content), invokes `loadTaskFamily` on each, and asserts
both produce the same `skillSetHash` — this exercises the LF
normalisation in Step 2's reader. A second test mutates one byte under
`tasks/tf/pass/workdir/` and asserts the hash changes.

## Step 4 — WorkdirManager + Workdir

**Created:** `libraries/libeval/src/benchmark/workdir.js`. Exports
`Workdir` type and `WorkdirManager` class:

```js
class WorkdirManager {
  constructor({ stagingDir, runOutputDir });
  async start(task, runIndex): Promise<Workdir>;
  async teardown(workdir): Promise<{ portFree: boolean, descendants: number }>;
}
// Workdir = { cwd, port, pgid, scaffold, agentTracePath, judgeTracePath, preflightError? }
// `scaffold` is preserved per design § Components row 13. v1 sets it to
// `null` (no consumer in the lifecycle yet); a future consumer can fill
// the field without a schema change.
```

`start` (1) creates
`<runOutputDir>/runs/<task_family>__<task_name>/<runIndex>/cwd/` (the path
encoding replaces the `/` in `taskId` with `__`); the parent of `cwd/`
(henceforth `runDir`) holds the trace and log files, (2) copies via
`fs.cp(task.paths.workdir, cwd, { recursive: true, filter: (src) => !src.endsWith(path.join("workdir","scripts")) })`
and `fs.cp(task.paths.specs, path.join(cwd, "specs"), { recursive: true })`
(scripts/ is excluded from the agent CWD because preflight runs from the
template path, not the agent CWD; design § Pre-flight contract), (3) copies
`<stagingDir>/.claude/` → `<cwd>/.claude/`, (4) allocates a free TCP port via
`net.createServer().listen(0)` → `server.address().port` → `server.close()`, (5)
sets `agentTracePath = <runDir>/agent.ndjson` and
`judgeTracePath = <runDir>/judge.ndjson` (siblings of `cwd`), (6) spawns
`task.paths.workdir/scripts/preflight.sh` with env `WORKDIR=cwd`, `PORT=port`,
`detached: true` so a fresh process group forms; captures `pgid = child.pid`;
exit-zero confirms scaffold; non-zero populates
`preflightError = { phase: "preflight", message, exitCode }` and returns the
handle without throwing.

`teardown` SIGTERMs the captured `pgid` (`process.kill(-pgid, "SIGTERM")`),
waits 5 s, SIGKILLs survivors, then verifies (a) the port is free
(`net.connect` rejects with `ECONNREFUSED`), (b) no descendant remains
in `pgid` — enumerated by `ps -o pid= -g <pgid>`; treats absence of `ps`
as best-effort. Returns `{ portFree, descendants }` so the runner can
record teardown health on the result record. Never copies
`task.paths.invariants`. Verify: unit test with a fixture task that boots an
HTTP listener on `$PORT` asserts `invariants/` is absent under `cwd`
(sentinel-filename probe), `descendants === 0` and `portFree === true`
after `teardown` (spec criterion 10).

## Step 5 — Invariants

**Created:** `libraries/libeval/src/benchmark/invariants.js`. Export
`async runInvariants(task, ctx): Promise<{ verdict, details, exitCode }>`
where `ctx = { cwd, port, runDir }` per P6. Spawn
`<task.paths.invariants>/run.sh` (the **template** path, never copied to
`ctx.cwd`) with `child_process.spawn` and `stdio: ["inherit", "pipe",
"pipe", "pipe"]`. Set env: `WORKDIR = ctx.cwd`, `PORT = ctx.port`,
`RESULTS_FD = "3"`. Drain fd 3 line by line, JSON-parse each into
`{ test, pass, message? }`, accumulate into `details[]`; lines that
fail to parse become `{ raw, parseError: true }` rows (diagnostic-only,
do not fail invariants). Capture stderr to
`path.join(ctx.runDir, "invariants.stderr.log")`. Wait for exit; `verdict
= exitCode === 0 ? "pass" : "fail"`. Exit code is authoritative — fd-3
NDJSON cannot override (design Decision 12). Verify: unit test with a
stub `run.sh` exercises both verdicts and asserts `details` rows
survive a malformed line.

## Step 6 — Judge

**Created:** `libraries/libeval/src/benchmark/judge.js`. Exports
`async runJudge(task, workdir, invariants, deps): Promise<{ verdict, summary }>`
where `deps = { query, model, judgeProfile }`, plus
`async parseConcludeFromTrace(tracePath): Promise<{ verdict, summary } | null>`
(extracted helper, unit-testable in isolation). The judge composes a
libeval `Supervisor` per design Decision 7. Family-shipped paths and
invariants data reach the LLM via **prompt templating**, not env (env vars
do not propagate through the SDK to the model):

1. `template = await readFile(task.paths.judge, "utf8")`.
2. `taskText = template
   .replaceAll("{{INVARIANTS_RESULT}}", JSON.stringify(invariants, null, 2))
   .replaceAll("{{AGENT_TRACE_PATH}}", workdir.agentTracePath)`.
3. Build the judge supervisor via `createSupervisor({ supervisorCwd:
   workdir.cwd, agentCwd: workdir.cwd, query: deps.query, output:
   createWriteStream(workdir.judgeTracePath), model: deps.model,
   supervisorProfile: deps.judgeProfile, agentProfile: undefined,
   maxTurns: 1 })`. The supervisor's `output` stream is the judge trace
   directly — the supervisor already emits tagged-envelope NDJSON
   (`supervisor.js:402` `emitLine`), so no parse-and-rewrite tee is
   needed. `maxTurns: 1` caps the relay loop so a non-conclude first
   turn cannot run a placeholder-agent loop indefinitely; the judge's
   prompt contract (Step 14 guide) requires it to call `Conclude` in
   its first turn.
4. `await supervisor.run(taskText)`.
5. `parseConcludeFromTrace(workdir.judgeTracePath)` reads the file via
   `readline.createInterface` over `createReadStream(...)`, finds the
   last envelope event where `source === "supervisor"` and the
   underlying assistant message contains a `tool_use` block with `name
   === "Conclude"`, returns `{ verdict, summary }` mapped:
   `"success"` → `"pass"`, `"failure"` → `"fail"`. Returns `null` if no
   `Conclude` is found; the caller surfaces
   `{ verdict: "fail", summary: "judge did not conclude" }`.

Family-author contract for `judge.task.md`: must include `{{INVARIANTS_RESULT}}`
and `{{AGENT_TRACE_PATH}}` placeholders where the judge needs the
substituted values; the runner does not inject them outside the
template. Document in the Step 14 guide.

`@forwardimpact/libeval` exports referenced: `createSupervisor`. The
`Conclude` tool registration is at `orchestration-toolkit.js:224`
(supervisor server); handler factory at `orchestration-toolkit.js:42`
(`createConcludeHandler`).

Verify: unit test feeds three pre-baked NDJSON fixture files to
`parseConcludeFromTrace`: a supervisor-conclude(`success`) trace,
a no-conclude trace, and a "two `Conclude` calls, last one wins" trace.
End-to-end coverage of the `createSupervisor` composition lives in
Step 13 (the canonical `Supervisor`-with-mock-runners pattern is
demonstrated by `libraries/libeval/test/supervisor-run.test.js`).

## Step 7 — ResultRecord schema + validator

**Created:** `libraries/libeval/src/benchmark/result.js`. Define a `zod`
schema matching design § Result-record schema verbatim — every field,
every type, every enum. Express the `preflightError?` branch via a
discriminated union: `invariants`, `judgeVerdict`, `submission`,
`agentTracePath`, `judgeTracePath` are required on the happy branch and
absent on the preflight-failure branch. Per P5, `profiles` is
`{ agent: string|null, supervisor: null, judge: string|null }`. Export
`validateResultRecord(record): void`, `RESULT_RECORD_SCHEMA`, plus a
narrower `INVARIANTS_RECORD_SCHEMA` (P7): `{ taskId: string, invariants:
{ verdict, details, exitCode }, exitCode: number }` and
`validateInvariantsRecord(record): void`. Verify: unit test feeds (a) a
minimal happy-path `ResultRecord`, (b) a minimal preflight-failure
`ResultRecord`, (c) an agent-execution-failure `ResultRecord`
(invariants/judgeVerdict both `fail`, submission empty string), (d) a
malformed record, (e) a valid `InvariantsRecord`; (a)(b)(c)(e) pass,
(d) throws (spec criterion 12 — write-time validation asserted
indirectly when Step 8 wraps every append in the validator).

## Step 8 — BenchmarkRunner

**Created:** `libraries/libeval/src/benchmark/runner.js`. Export
`BenchmarkRunner`:

```js
class BenchmarkRunner {
  constructor({
    family,            // path | git url | TaskFamily
    runs,              // integer ≥ 1
    output,            // run-output directory
    model,             // string, e.g. "claude-opus-4-7"
    profiles,          // { agent, judge } — names (design Decision 14: no `supervisor`)
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
   layers are required. When `opts.profiles.judge` is set, also call
   `assertJudgeProfileStaged(family, stagingDir, opts.profiles.judge)`
   (Step 2) so a missing judge profile fails at install, not mid-run.

   `BASE_TOOLS = ["Bash","Read","Glob","Grep","Write","Edit"]` is a
   module-private constant (design Decision 9: one default tool set
   for v1; no permissions broker). Used as `allowedTools` on every
   agent-under-test session below — no per-task variation.
4. Open `<opts.output>/results.jsonl` in append mode (the runner — not
   the handler — owns the durable file write; handlers mirror records
   to stdout for visibility only).
5. For each `(task, runIndex)` in serial: a.
   `workdir = await wm.start(task, runIndex)`. b. If `workdir.preflightError`:
   build the preflight-failure `ResultRecord` (`costUsd: 0`, no submission, no
   invariants, no judgeVerdict); validate; append; `yield`; teardown;
   `continue`. c. **Agent-under-test session** — bare `AgentRunner` (design
   Decision 14, no live supervisor in v1). Wrapped in `try/catch`: a thrown
   error (network outage, SDK abort, etc.) does **not** abort the lifecycle —
   invariants and judging still run against the partial workdir (spec criterion
   1 demands a record on agent failure):

      ```js
      const agentTraceStream = createWriteStream(workdir.agentTracePath);
      const runner = createAgentRunner({
        cwd: workdir.cwd,
        query, output: agentTraceStream, model,
        maxTurns: opts.maxTurns ?? 50,
        allowedTools: BASE_TOOLS,
        settingSources: ["project"],
        systemPrompt: profiles.agent
          ? composeProfilePrompt(profiles.agent, {
              profilesDir: resolve(workdir.cwd, ".claude/agents"),
              trailer: AGENT_SYSTEM_PROMPT,
            })
          : undefined,
      });
      const instructions = await readFile(task.paths.instructions, "utf8");
      let agentError = null;
      try {
        const result = await runner.run(instructions);
        // AgentRunner.run() catches SDK iteration errors internally
        // and returns them on the resolved value (agent-runner.js:182–
        // 194); inspect the resolved shape, not just thrown errors.
        if (!result.success) {
          agentError = {
            message: result.error?.message
              ?? (result.aborted ? "aborted" : "agent did not succeed"),
            aborted: result.aborted ?? false,
          };
        }
      } catch (e) {
        agentError = { message: e.message, aborted: false };
      }
      await new Promise((r) => agentTraceStream.end(r));
      ```

   `costUsd`, `turns`, `submission` are then read from the agent trace by
   ingesting the file into a fresh `TraceCollector` using `node:readline`:

      ```js
      import { createReadStream } from "node:fs";
      import { createInterface } from "node:readline";
      const collector = createTraceCollector();
      const rl = createInterface({
        input: createReadStream(workdir.agentTracePath),
        crlfDelay: Infinity,
      });
      for await (const line of rl) collector.addLine(line);
      const json = collector.toJSON();
      const costUsd = json.summary.totalCostUsd;     // bare runner — single result event
      const turns = json.summary.numTurns;
      const submission = lastAssistantText(json);    // P2: last assistant.text block
      ```

   `lastAssistantText(json)` walks `json.turns` in order, returns the last
   `text` from any `assistant` block, or `""` if none; defined locally in
   `runner.js`. On the `agentError !== null` branch, `costUsd` and `turns` come
   from the partial trace via `TraceCollector.toJSON().summary`; if no `result`
   event ever reached the trace, the collector's defaults yield `0`/`0` —
   acceptable, and consistent with `preflightError`'s `costUsd: 0` floor. e.
   `invariants = await runInvariants(task, { cwd: workdir.cwd, port: workdir.port, runDir: dirname(workdir.cwd) })`.
   f.
   `judgeVerdict = await runJudge(task, workdir, invariants, { query, model, judgeProfile: profiles.judge })`.
   f. Compose `ResultRecord` with
   `profiles: { agent: profiles.agent ?? null, supervisor: null, judge: profiles.judge ?? null }`
   (P5); other fields per design § Result-record schema — `familyRevision`,
   `skillSetHash`, `model`, `durationMs`,
   `verdict = invariants.verdict === "pass" && judgeVerdict.verdict === "pass" ? "pass" : "fail"`.
   If `agentError` is non-null, attach `submission: ""`, `costUsd`/ `turns` as
   parsed from whatever made it to the trace (often 0), and let invariants/judge
   produce their own verdicts as usual. `validateResultRecord(record)`; append
   one JSONL line; `yield record`. `durationMs` is `Date.now() - t0` where
   `t0 = Date.now()` is captured at the top of step 5.a (before `wm.start`). If
   `validateResultRecord` throws (a real bug in the runner — the runner
   constructed the record), the runner catches the `ZodError`, writes a single
   fallback line `{taskId, runIndex, verdict: "fail", schemaError: <message>}`
   to `results.jsonl` (skipped by `aggregate()` per Step 9's malformed-line rule
   with a stderr warning), `yield`s the partial record so the iterator stays
   consumable, then proceeds to teardown — the agent budget is already spent and
   silently dropping the run is worse than a noisy fail. g.
   `await wm.teardown(workdir)`.
6. Close the JSONL file.

Verify: covered by Step 13 E2E.

## Step 9 — ReportAggregator

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

## Step 10 — Subcommand handlers

**Created:** `libraries/libeval/src/commands/benchmark-run.js`,
`benchmark-invariants.js`, `benchmark-report.js`. Each follows the
`commands/run.js` shape: parse options, `resolve()` paths, build the
runtime helper, invoke, write output, exit `0`/`1`. The runner owns the
JSONL append (Step 8.4); `benchmark-run` mirrors each yielded record to
stdout as one JSON line for live visibility — no duplicate write.

`benchmark-invariants` (per P6/P7): loads `family` via `loadTaskFamily`,
resolves the `Task` matching `--task`, synthesises
`ctx = { cwd: path.join(opts.workdir, "cwd"), port: <freshly
allocated>, runDir: opts.workdir }`, calls `runInvariants(task, ctx)`,
constructs a `InvariantsRecord`, runs `validateInvariantsRecord(record)`,
writes one JSONL line to `--output` (or stdout). Exit `0` on
`invariants.verdict === "pass"`, `1` otherwise.

`benchmark-report` parses `--k` (comma-separated) into an integer array
via `s.split(",").map((t) => { const n = Number.parseInt(t, 10); if
(!Number.isFinite(n) || n < 1) throw new Error("--k must be a comma-
separated list of positive integers"); return n; })`, then delegates to
`aggregate({ inputDir: opts.input, kValues })`. Verify: covered by
Step 13.

## Step 11 — Wire bin into package metadata

**Modified:** `libraries/libeval/package.json` — add `bin` and `exports`
entries (Step 1). No new runtime dependencies: v1 does not parse
`task.yaml` or `apm.lock.yaml` (P1 — the lockfile is hashed verbatim;
Step 2 — `task.yaml` is reserved but unread until the v2 permissions
amendment), so the existing `zod` dep covers schema validation and no
YAML parser is required. Catalog regen (`bun run context:fix`) is
consolidated into Step 15. Verify locally: `bunx fit-benchmark
--version` resolves.

## Step 12 — Unit tests

**Created** under `libraries/libeval/test/`:
`benchmark-task-family.test.js`, `benchmark-apm-installer.test.js`,
`benchmark-workdir.test.js`, `benchmark-invariants.test.js`,
`benchmark-judge.test.js`, `benchmark-result.test.js`,
`benchmark-report.test.js`. Use `node:test` +
`@forwardimpact/libmock` helpers (`createMockAgentQuery`,
`createToolUseMsg`, `createTextBlockMsg`, `collectLines`, `stripAnsi`).
The judge unit test feeds pre-baked NDJSON fixture files to
`parseConcludeFromTrace` (Step 6); the `Supervisor`-with-mock-runners
end-to-end pattern, when needed, follows
`libraries/libeval/test/supervisor-run.test.js` (the canonical
reference; the libeval-local helper at
`libraries/libeval/test/mock-runner.js` is consumed, not Created).
**Created** fixture family at
`libraries/libeval/test/fixtures/benchmark-family/` with four tasks:

| Task | Carries | Used by |
|---|---|---|
| `tf/pass` | service probe `invariants/run.sh` (HTTP-probes a mock app on `$PORT`) | E2E criteria 1, 2, 3, 11, 12 |
| `tf/fail` | failing invariants | E2E criteria 1, 11 |
| `tf/repo-state` | `invariants/run.sh` asserting SHA-256 of a file under `cwd/` | E2E criterion 4 |
| `tf/preflight-broken` | `preflight.sh` exiting non-zero | E2E criterion 8 |

Each task carries `workdir/scripts/preflight.sh`, `invariants/run.sh`,
`instructions.md`, `judge.task.md` (with `{{INVARIANTS_RESULT}}` and
`{{AGENT_TRACE_PATH}}` placeholders). Family root carries
`apm.lock.yaml` and a pre-staged `.claude/` (one no-op skill). Verify:
`bun test test/benchmark-*.test.js` from `libraries/libeval/` exits 0.

## Step 13 — E2E fixture test

**Created:** `libraries/libeval/test/benchmark-e2e.test.js`. Drives the
runner end-to-end against the fixture family with `runs=2`. The
agent-under-test SDK is mocked via `createMockAgentQuery`
(`libraries/libmock/src/fixture/eval.js:133`) — the SDK-shaped query
function `BenchmarkRunner` accepts as its `query` parameter. The judge
phase is exercised through `createSupervisor` with the same query
mock; the canonical pattern is
`libraries/libeval/test/supervisor-run.test.js`. The table maps every
spec success criterion to its verification location.

| Spec criterion | Verified by |
|---|---|
| 1. Records per `(taskId, runIndex)`; failures included | E2E: 6 records on `tf/{pass,fail,repo-state}` × 2 (excluding `tf/preflight-broken` which is exercised via a separate `runs=1` invocation for criterion 8); distinct keys; one task in the matrix has its agent session forced to throw via the mock SDK to exercise the agent-failure branch |
| 2. `invariants/` never on agent CWD; sentinel never in trace | E2E: sentinel file under `tf/pass/invariants/`; trace scan |
| 3. Running-service grading | E2E: `tf/pass`'s `invariants/run.sh` HTTP-probes a mock app on `$PORT` |
| 4. Repository-state grading | E2E: `tf/repo-state` asserts SHA-256 of a file under `cwd/` |
| 5. Process-exit grading | Step 12 `benchmark-invariants.test.js`: stub `run.sh` with explicit exit codes |
| 6. Judge consumes invariants + agent trace; emits verdict | Step 12 `benchmark-judge.test.js`: pre-baked traces feed `parseConcludeFromTrace`; E2E exercises the full `runJudge` path with `{{INVARIANTS_RESULT}}` substituted into the judge prompt |
| 7. Skill-set reproducibility | Step 12 `benchmark-apm-installer.test.js`: hash stability + 1-byte mutation |
| 8. Pre-flight catches broken templates; cost zero | E2E: `tf/preflight-broken` (separate invocation) produces a record with `preflightError` and `costUsd === 0` |
| 9. Pass@k via HumanEval estimator | Step 12 `benchmark-report.test.js`: fixture `pass/fail/fail/pass/fail` |
| 10. Teardown leaves no descendant; port free | Step 12 `benchmark-workdir.test.js`: HTTP-listener fixture; `descendants === 0` |
| 11. Records validated at write time | Step 12 `benchmark-result.test.js` + E2E asserts every line in `results.jsonl` validates |
| 12. Traces consumable by `fit-trace overview` | E2E: invoke `TraceQuery.overview()` (`src/trace-query.js:24`) on agent and judge traces — `TraceQuery` is the in-memory backend `fit-trace overview` uses (call site: `src/commands/trace.js:62` `runOverviewCommand` → `loadTrace(args[0]).overview()`); a successful `overview` call with `turnCount > 0` proves the same code path the CLI surfaces |
| 13. Skill–CLI parity | Step 14 explicit assertion |

The criterion numbers in this table track the post-revision spec
ordering (criterion 7, "network policy", was removed when
PermissionsBroker was dropped per design Decision 9; subsequent rows
shifted down by one).

Verify: `bun test test/benchmark-e2e.test.js` exits 0 locally.

## Step 14 — Skill + guide + parity assertion

**Created:**

- `.claude/skills/fit-benchmark/SKILL.md` — modelled on
  `.claude/skills/fit-eval/SKILL.md`. `## Documentation` lists exactly one
  entry:
  `[Run a Benchmark](https://www.forwardimpact.team/docs/libraries/prove-changes/run-benchmark/index.md)`
  with the description string from Step 1.
- `.claude/skills/fit-benchmark/references/cli.md` — full flag surface.
- `websites/fit/docs/libraries/prove-changes/run-benchmark/index.md` —
  Big Hire / Little Hire framing, walkthrough mirroring
  `run-eval/index.md`, authoring a task family (including the
  `{{INVARIANTS_RESULT}}` / `{{AGENT_TRACE_PATH}}` placeholder convention from
  Step 6 and the fd-3 NDJSON invariants channel from Step 5 — note non-bash
  `run.sh` interpreters must open fd 3 explicitly with worked Python and
  Node examples), reading the report. Cite `libraries/CLAUDE.md` § Linking
  rule for the parity convention.

**Created:** `libraries/libeval/test/benchmark-parity.test.js` — parses
both the skill's `## Documentation` markdown list and the CLI
definition's `documentation` array (import the bin's exported
definition); asserts `title`, `url`, and `description` tuples are equal
and in the same order. Replaces a `grep` check with structural equality
(spec criterion 13). Verify: `bun test test/benchmark-parity.test.js`
exits 0.

## Step 15 — Quality gates

Run from repo root: `bun run check`, `bun run format:fix`, `bun run
test`, `bun run context:fix`. Commit any diff produced by
`context:fix` (catalog rows in `libraries/README.md` may surface the
new `fit-benchmark` bin entry). Verify locally before push: all four
exit 0; CI repeats `bun run check` and `bun run test`.

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
3. **Lockfile-as-fingerprint loophole.** Decision P1 hashes
   `apm.lock.yaml` bytes, not the actual `.claude/` content. A family
   author who edits `.claude/skills/...` without re-running libpack
   stage gets a stale `skillSetHash` that no longer reflects what's
   installed. Mitigation: the Step 14 guide must instruct authors to
   regenerate `apm.lock.yaml` after any `.claude/` edit; a content-hash
   variant is the obvious follow-up if drift bites in practice.
4. **Supervisor-level observability deferred with SV1.** Design
   Decision 14 defers the live supervisor for the agent-under-test;
   the agent's tool-use stream is therefore observable only post-hoc
   via `agentTracePath` and live-gated only by the SDK's own
   `allowedTools` enforcement against the harness's fixed `BASE_TOOLS`
   list (design Decision 9). When SV1 lands in v2, the supervisor
   reintroduces a live observation point, and the "intervene during a
   run" surface returns. v1 accepts that the only gate on the
   agent-under-test is the SDK's tool-allow contract.

## Execution recommendation

Single executor, sequential. Steps 1–11 must run in dependency order;
Step 12 unit tests interleave with each numbered step (TDD: write the
unit test for Step N before moving to Step N+1). Step 13 follows Step 11.
Step 14's skill + guide can start as soon as Step 1's CLI surface is
locked — route to `technical-writer` for the guide prose if available;
the engineering agent owns the parity assertion and the rest. Step 15
closes out. No part is large enough to justify decomposition; one
engineering sub-agent owns the full plan from a single execution session.

— Staff Engineer 🛠️
