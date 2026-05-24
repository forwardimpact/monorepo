# libeval

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

Agent evaluation framework — prove whether agent changes improved outcomes with
reproducible evidence.

<!-- END:description -->

`libeval` provides the runtime and tool surface for multi-LLM coordination —
an agent talks to a supervisor, a facilitator chairs a meeting, a lead drives
an asynchronous discussion — plus a CLI suite that runs evals, queries the
traces they produce, and edits skill files under controlled conditions.

## CLIs

| CLI             | Purpose                                                                |
| --------------- | ---------------------------------------------------------------------- |
| `fit-eval`      | Run agents in `run`/`supervise`/`facilitate`/`discuss` subcommands.    |
| `fit-trace`     | Download, query, and analyze NDJSON traces produced by `fit-eval`.     |
| `fit-benchmark` | Run task families for N runs each and aggregate pass@k.                |
| `fit-selfedit`  | Write stdin to `.claude/**` paths, gated by settings.json + branch.    |

`fit-eval`'s subcommands share one orchestration loop and one async tool
surface, below. The `judge` role is a profile passed to `supervise`.

## Modes

| Mode         | Lead          | Participants  | Terminal tool          |
| ------------ | ------------- | ------------- | ---------------------- |
| `run`        | (none)        | one agent     | task completion        |
| `supervise`  | `supervisor`  | one `agent`   | `Conclude`             |
| `facilitate` | `facilitator` | N named       | `Conclude`             |
| `discuss`    | `lead`        | N named       | `Adjourn` or `Recess`  |
| `judge`      | `judge`       | (none)        | `Conclude`             |

`run` and `judge` are one-shot. The other three share `OrchestrationLoop`
plus an async Ask/Answer/Announce/RollCall tool surface; the loop fans
messages out over an in-memory bus and emits a `{source, seq, event}`
NDJSON envelope for every line.

## Async Ask / Answer / Announce

```text
Ask({ question, to? })       →  { askIds: [N, …] }
Answer({ message, askId? })  →  routed to the asker
Announce({ message })        →  broadcast, no reply expected
```

Every Ask returns immediately and registers a pending entry keyed by an
`askId`. The reply arrives later on the asker's inbox as `[answer#N]
<participant>: <text>`. Broadcast: omit `to` on a multi-participant
lead. Answer's `askId` is optional — the handler is forgiving:

- **Provided + matches an ask owed by the caller** → routes to that asker.
- **Provided but unknown or wrong addressee** → `isError` with a pointed message.
- **Omitted + exactly one ask owed to the caller** → auto-picks it.
- **Omitted + 0 or many asks owed** → broadcasts as Announce.

Inbox lines on resume:

```text
[ask#42]     facilitator: What is your current condition?
[answer#41]  agent-1:     We're at 7 out of 10.
[shared]     agent-2:     FYI I'm switching to Bun 1.2.
[system]     @orchestrator: You have an unanswered ask from facilitator (askId=42)…
```

Async means the lead can issue Asks, end its turn, and plan in the gap
while participants work in parallel — nothing blocks the LLM thread.

## Orchestration loop

Each participant drains the bus (or waits), runs/resumes the LLM with
drained messages as tagged lines, and on an unanswered owed Ask injects
one synthetic reminder before emitting `protocol_violation` and
unblocking the asker with a synthetic null answer.

Termination uses two flags. `ctx.concluded` is explicit
`Conclude`/`Adjourn`/`Recess` — also cancels in-flight Asks so askers
see why their question won't be answered. `stopped` is broader: lead
error, agent crash, abort path. Loops watch `stopped`; `ctx.concluded`
only feeds the summary's `success`/`verdict`.

## Tool surface, by role

| Role         | Ask | Answer | Announce | RollCall | Conclude | Other                                    |
| ------------ | --- | ------ | -------- | -------- | -------- | ---------------------------------------- |
| Facilitator  | ✓   | ✓      | ✓        | ✓        | ✓        |                                          |
| Fac. agent   | ✓   | ✓      | ✓        | ✓        |          |                                          |
| Supervisor   | ✓   | ✓      | ✓        | ✓        | ✓        |                                          |
| Sup. agent   | ✓   | ✓      | ✓        | ✓        |          |                                          |
| Discuss lead | ✓   | ✓      | ✓        | ✓        |          | `RequestForComment`, `Recess`, `Adjourn` |
| Discuss agt  | ✓   | ✓      | ✓        | ✓        |          |                                          |
| Judge        |     |        |          |          | ✓        |                                          |

Ask's `to` accepts a participant name on multi-participant roles
(facilitator, discuss lead, all participants). The supervise pair has
only one possible target so `to` is rejected there.

## Minimal example: two-participant facilitator

```js
import { createFacilitator, createRedactor } from "@forwardimpact/libeval";
import { query } from "@anthropic-ai/claude-agent-sdk";

const facilitator = createFacilitator({
  facilitatorCwd: process.cwd(),
  agentConfigs: [
    { name: "alice", role: "explorer", agentProfile: "alice" },
    { name: "bob",   role: "tester",   agentProfile: "bob" },
  ],
  query,
  output: process.stdout,
  redactor: createRedactor(),
  facilitatorProfile: "improvement-coach",
});

const result = await facilitator.run("Run a kata storyboard meeting.");
// result.success / result.turns / NDJSON trace on process.stdout
```

The facilitator gets `Ask`/`Answer`/`Announce`/`RollCall`/`Conclude`;
each agent gets the same minus `Conclude`. Every tool call, bus
message, and orchestrator event becomes one trace line.

## Trace format and redaction

Each line is `{ "source": "<participant|orchestrator>", "seq": N, "event":
{…} }`. `seq` is monotonic across the whole trace; `orchestrator` emits
`session_start`, `agent_start`, `protocol_violation`, `lead_turn_limit`,
and `summary`. `event` is the SDK event verbatim or the orchestrator
payload. `fit-trace` consumes this format.

Redaction is on by default for `fit-eval run`/`supervise`/`facilitate`
and composes two layers:

- **Env-var allowlist** — `ANTHROPIC_API_KEY`, `GH_TOKEN`, `GITHUB_TOKEN`
  by default; override with `LIBEVAL_REDACTION_ENV_VARS=NAME1,…`
  (replaces, not extends). Runtime values become `[REDACTED:env:NAME]`
  everywhere they appear.
- **Credential-shape patterns** — `sk-ant-`, `ghp_`, `ghs_`, `gho_`,
  `github_pat_`. Hits become `[REDACTED:pattern:KIND]`.

Set `LIBEVAL_REDACTION_DISABLED=1` to disable (one stderr warning per
run). Never on CI for a public repo — workflow artifacts are
downloadable through retention.

## Module map

| Module                                                      | Purpose                                                              |
| ----------------------------------------------------------- | -------------------------------------------------------------------- |
| `agent-runner.js`                                           | One Claude Agent SDK session; emits NDJSON via the redactor.         |
| `message-bus.js`                                            | Per-participant queues + `waitForMessages` Promise wakeup.           |
| `orchestration-toolkit.js`                                  | Shared Ask/Answer/Announce/Conclude/RollCall handlers + builders.    |
| `orchestration-loop.js`                                     | Unified lead+participant loop; reminder/violation handling.          |
| `facilitator.js` / `supervisor.js` / `discusser.js` / `judge.js` | Per-mode class + factory + system prompt.                       |
| `discuss-tools.js`                                          | Discuss-only `RequestForComment`/`Recess`/`Adjourn`.                 |
| `trace-collector.js` / `trace-query.js` / `trace-github.js` | Trace ingestion / querying / GitHub-attachment helpers.              |
| `redaction.js`                                              | Env-var allowlist + credential-shape pattern redaction.              |

## fit-selfedit

A narrow, audited bypass for sessions where `Edit`/`Write` (and bash
writes) are blocked against paths the project's own allowlist permits —
see [#1162](https://github.com/forwardimpact/monorepo/issues/1162) and
[#441](https://github.com/forwardimpact/monorepo/issues/441) for the
original episodes. Reads stdin, writes the target, exits 0 / 2
(safeguard violation) / 1 (I/O error).

```sh
echo "<content>" | bunx fit-selfedit <path>
```

Two safeguards, checked in order:

1. **Settings-allow.** Walk upward from the target with
   [`Finder.findUpward`](../libutil/src/finder.js) to find the nearest
   `.claude/settings.json`. The target relative to its grandparent
   directory must match at least one `Edit(<glob>)` rule in
   `permissions.allow[]` (matched with
   [`minimatch`](https://github.com/isaacs/minimatch), `dot: true`).
   Settings.json is the single source of truth — widen the project
   allowlist and the CLI follows. Traversal like `.claude/../README.md`
   is rejected as a side effect: `path.resolve` collapses `..` first,
   then the resolved path tests against the rules.

2. **Branch scope.** `git rev-parse --abbrev-ref HEAD` must not be
   `HEAD` (detached) or `main`. Edits ride a feature branch through
   whatever merge gates the project has configured.

Failure messages name the safeguard that rejected; safeguard 1 also
lists the `Edit()` rules that were tried.

## Documentation

- [Agent Evaluations Guide](https://www.forwardimpact.team/docs/libraries/agent-evaluations/index.md) — how to run an eval and read its trace.
- [Agent Collaboration Guide](https://www.forwardimpact.team/docs/libraries/agent-collaboration/index.md) — supervise / facilitate / discuss in depth.
- [Trace Analysis Guide](https://www.forwardimpact.team/docs/libraries/trace-analysis/index.md) — analysing NDJSON traces with `fit-trace`.
