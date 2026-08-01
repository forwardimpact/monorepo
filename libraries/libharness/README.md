# libharness

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

Autonomous agent team harness — coordinate a lead and participant agents in one
async session, with eval, benchmark, and trace tooling to prove the changes
worked.

<!-- END:description -->

`libharness` provides the runtime and tool surface for multi-LLM coordination.
An agent talks to a supervisor. A facilitator chairs a meeting. A lead drives
an asynchronous discussion. `libharness` also provides a CLI suite. The suite
runs evals, queries the traces they produce, and edits skill files under
controlled conditions.

## CLIs

| CLI             | Purpose                                                                |
| --------------- | ---------------------------------------------------------------------- |
| `gemba-harness`      | Run agents in `run`/`supervise`/`facilitate`/`discuss` subcommands.    |
| `gemba-trace`     | Download, query, and analyze the NDJSON traces `gemba-harness` produces.     |
| `gemba-benchmark` | Run task families for N runs each and aggregate pass@k.                |
| `gemba-selfedit`  | Write stdin to `.claude/**` paths behind settings.json and branch gates.    |

`gemba-harness`'s subcommands share one orchestration loop and one async tool
surface, below. The `judge` role is a profile you pass to `supervise`.

## Modes

| Mode         | Lead          | Participants  | Terminal tool          |
| ------------ | ------------- | ------------- | ---------------------- |
| `run`        | (none)        | one agent     | task completion        |
| `supervise`  | `supervisor`  | one `agent`   | `Conclude`             |
| `facilitate` | `facilitator` | N named       | `Conclude`             |
| `discuss`    | `lead`        | N named       | `Adjourn` or `Recess`  |
| `judge`      | `judge`       | (none)        | `Conclude`             |

`run` and `judge` are one-shot. The other three share `OrchestrationLoop`
plus an async Ask/Answer/Announce/RollCall tool surface. The loop fans
messages out over an in-memory bus. It emits a `{source, seq, event}`
NDJSON envelope for every line.

## Async Ask / Answer / Announce

```text
Ask({ question, to? })       →  { askIds: [N, …] }
Answer({ message, askId? })  →  routed to the asker
Announce({ message })        →  broadcast, no reply expected
```

Every Ask returns immediately. It registers a pending entry under an
`askId`. The reply arrives later on the asker's inbox as `[answer#N]
<participant>: <text>`. Broadcast: omit `to` on a multi-participant
lead. Answer's `askId` is optional. The handler is forgiving:

- **Provided + matches an ask owed by the caller** → routes to that asker.
- **Provided but unknown or wrong addressee** → `isError` with a pointed
  message.
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
while participants work in parallel. Nothing blocks the LLM thread.

### Discuss-mode replies

In discussion mode, Answer calls routed to the lead stream to the
discussion thread as the agents produce them. Each agent's Answer becomes
a separate reply. The thread receives it immediately. The session does not
batch the replies until it ends. The lead and agents can also call
`Acknowledge` to post brief messages directly to the thread (status
updates, human follow-up responses). The message bus intercepts answers
and appends them to `ctx.replies[]`.

`RequestForComment` is a separate coordination tool available on agent
roles (facilitated agents and discuss agents). It queues an intent to
open a new Discussion thread for long-horizon coordination on open
questions. These intents accumulate in `ctx.rfcs[]`. They stay separate
from the thread replies in `ctx.replies[]`.

## Orchestration loop

Each participant drains the bus, or waits. It then runs or resumes the LLM
with the drained messages as tagged lines. On an unanswered owed Ask, the
participant injects one synthetic reminder. It then emits
`protocol_violation`. It unblocks the asker with a synthetic null answer.

Termination uses two flags. `ctx.concluded` is explicit
`Conclude`/`Adjourn`/`Recess`. It also cancels in-flight Asks, so askers
see why nobody will answer their question. `stopped` is broader: lead
error, agent crash, abort path. Loops watch `stopped`. `ctx.concluded`
only feeds the summary's `success`/`verdict`.

## Tool surface, by role

| Role         | Ask | Answer | Announce | RollCall | Conclude | Other                          |
| ------------ | --- | ------ | -------- | -------- | -------- | ------------------------------ |
| Facilitator  | ✓   | ✓      | ✓        | ✓        | ✓        |                                |
| Fac. agent   | ✓   | ✓      | ✓        | ✓        |          | `RequestForComment`            |
| Supervisor   | ✓   | ✓      | ✓        | ✓        | ✓        |                                |
| Sup. agent   | ✓   | ✓      | ✓        | ✓        |          |                                |
| Discuss lead | ✓   | ✓      | ✓        | ✓        |          | `Recess`, `Adjourn`, `Acknowledge` |
| Discuss agt  | ✓   | ✓      | ✓        | ✓        |          | `RequestForComment`, `Acknowledge` |
| Judge        |     |        |          |          | ✓        |                                |

Ask's `to` accepts a participant name on multi-participant roles
(facilitator, discuss lead, all participants). The supervise pair has
only one possible target, so it rejects `to`.

## Minimal example: two-participant facilitator

```js
import { createFacilitator, createRedactor } from "@forwardimpact/libharness";
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

The facilitator gets `Ask`/`Answer`/`Announce`/`RollCall`/`Conclude`.
Each agent gets the same minus `Conclude`. Every tool call, bus
message, and orchestrator event becomes one trace line.

## Trace format and redaction

Each line is `{ "source": "<participant|orchestrator>", "seq": N, "event":
{…} }`. `seq` is monotonic across the whole trace. `orchestrator` emits
`session_start`, `agent_start`, `protocol_violation`, `lead_turn_limit`,
and `summary`. `event` is the SDK event verbatim or the orchestrator
payload. `gemba-trace` consumes this format.

Redaction is on by default for `gemba-harness run`/`supervise`/`facilitate`
and composes two layers:

- **Env-var allowlist** — `ANTHROPIC_API_KEY`, `GH_TOKEN`, `GITHUB_TOKEN`
  by default. Override the list with
  `LIBHARNESS_REDACTION_ENV_VARS=NAME1,…`. The variable replaces the
  default list. It does not extend the list. Runtime values become
  `[REDACTED:env:NAME]` everywhere they appear.
- **Credential-shape patterns** — `sk-ant-`, `ghp_`, `ghs_`, `gho_`,
  `github_pat_`. Hits become `[REDACTED:pattern:KIND]`.

Set `LIBHARNESS_REDACTION_DISABLED=1` to disable it (one stderr warning
per run). Never disable it on CI for a public repo. Workflow artifacts
stay downloadable through retention.

## Module map

| Module                                                      | Purpose                                                              |
| ----------------------------------------------------------- | -------------------------------------------------------------------- |
| `agent-runner.js`                                           | One Claude Agent SDK session. Emits NDJSON through the redactor.         |
| `message-bus.js`                                            | Per-participant queues + `waitForMessages` Promise wakeup.           |
| `orchestration-toolkit.js`                                  | Shared Ask/Answer/Announce/Conclude/RollCall/RequestForComment handlers + builders. |
| `orchestration-loop.js`                                     | Unified lead+participant loop. Handles reminders and violations.          |
| `facilitator.js` / `supervisor.js` / `discusser.js` / `judge.js` | Per-mode class + factory + system prompt.                       |
| `discuss-tools.js`                                          | Discuss-only `Recess`/`Adjourn`/`Acknowledge`.                       |
| `reply-emitter.js`                                          | Fire-and-forget POST of reply/ack events to the callback URL.        |
| `inbox-poller.js`                                           | Long-poll the bridge inbox for injected human messages.              |
| `trace-collector.js` / `trace-query.js` / `trace-github.js` | Trace ingestion / query / GitHub-attachment helpers.              |
| `redaction.js`                                              | Env-var allowlist + credential-shape pattern redaction.              |

## gemba-selfedit

A narrow, audited bypass for sessions that block `Edit`/`Write` (and bash
writes) against paths the project's own allowlist permits. It reads stdin.
It writes the target. It exits 0, 2 (safeguard violation), or 1 (I/O
error).

```sh
echo "<content>" | bunx gemba-selfedit <path>
```

The CLI checks two safeguards in order:

1. **Settings-allow.** Walk upward from the target with
   [`Finder.findUpward`](../libutil/src/finder.js) to find the nearest
   `.claude/settings.json`. The target relative to its grandparent
   directory must match at least one `Edit(<glob>)` rule in
   `permissions.allow[]`. The CLI matches with
   [`minimatch`](https://github.com/isaacs/minimatch) and `dot: true`.
   Settings.json is the single source of truth. Widen the project
   allowlist and the CLI follows. The CLI also rejects traversal like
   `.claude/../README.md` as a side effect. `path.resolve` collapses
   `..` first. The resolved path then tests against the rules.

2. **Branch scope.** `git rev-parse --abbrev-ref HEAD` must not be
   `HEAD` (detached) or `main`. Edits ride a feature branch through
   whatever merge gates the project configured.

Failure messages name the safeguard that rejected the write. Safeguard 1
also lists the `Edit()` rules it tried.

## Documentation

- [Coordinate an Agent Team](https://www.forwardimpact.team/docs/libraries/coordinate-team/index.md)
  — run a lead and N participant agents in one async session (supervise /
  facilitate / discuss) with Ask/Answer/Announce and a single NDJSON trace.
- [Run an Eval](https://www.forwardimpact.team/docs/libraries/prove-changes/run-eval/index.md)
  — author a judge profile, run an eval locally, wire it into CI, and inspect
  the trace it produces.
- [Prove Agent Changes](https://www.forwardimpact.team/docs/libraries/prove-changes/index.md)
  — the end-to-end workflow from dataset generation through evaluation to
  trace analysis, with multi-agent collaboration sessions.
- [Analyze Traces](https://www.forwardimpact.team/docs/libraries/prove-changes/trace-analysis/index.md)
  — read the NDJSON traces produced by `gemba-harness` with `gemba-trace`.
- [Agent Teams](https://www.forwardimpact.team/docs/products/agent-teams/index.md)
  — author the profiles consumed by `--agent-profile`, `--lead-profile`, and
  `--agent-profiles`.
