# libeval

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

Agent evaluation framework — prove whether agent changes improved outcomes with
reproducible evidence.

<!-- END:description -->

`libeval` provides the runtime and tool surface for multi-LLM
coordination: an agent talks to a supervisor, a facilitator chairs a
team meeting, or a lead drives an asynchronous discussion across a
human channel. Every conversation produces a structured NDJSON trace
for analysis.

## Modes

| Mode          | Lead          | Participants  | Terminal tool          |
| ------------- | ------------- | ------------- | ---------------------- |
| `run`         | (none)        | one agent     | task completion        |
| `supervise`   | `supervisor`  | one `agent`   | `Conclude`             |
| `facilitate` | `facilitator` | N named       | `Conclude`             |
| `discuss`     | `lead`        | N named       | `Adjourn` or `Recess`  |
| `judge`       | `judge`       | (none)        | `Conclude`             |

Every mode except `run` and `judge` shares one orchestration loop
(`OrchestrationLoop`) and one tool surface (`Ask` / `Answer` /
`Announce` / `RollCall`, plus a mode-specific terminal tool). The
loop fires the lead's LLM, fans messages out to participants over an
in-memory bus, wakes them when something lands, and emits the
universal `{source, seq, event}` NDJSON envelope for every line.

## The Ask / Answer protocol

Coordination uses one async request/reply pattern with one piece of
state per question — the `askId`. Every Ask returns immediately; the
reply arrives later on the asker's inbox.

### Ask

```text
Ask({ question, to? })  →  { askIds: [N, …] }
```

The handler registers a pending entry per addressee, posts the
question on the bus, and returns immediately. Each pending entry is
keyed by a numeric `askId`. Two Asks to the same addressee each get
their own id, so they coexist without overwriting.

Broadcast: omit `to` on a multi-participant lead's Ask to fan out to
every other participant — the result `askIds` array has one entry
per addressee.

### Answer

```text
Answer({ message, askId? })  →  routed to the asker
```

The reply lands in the asker's bus inbox as
`[answer#N] <participant>: <text>` on a later turn. `askId` is
optional and the handler is forgiving:

- **Provided + matches an ask owed by the caller** → routes the reply
  to that specific asker.
- **Provided but unknown or wrong addressee** → `isError` with a
  pointed message. The caller tried to specify; we tell them why.
- **Omitted + exactly one ask is owed to the caller** → auto-picks
  that ask. (Forcing an Announce when the only owed ask is obvious
  would be pedantic.)
- **Omitted + 0 or many asks owed** → broadcasts as Announce so the
  message still reaches every participant.

### Announce

```text
Announce({ message })  →  broadcast, no reply expected
```

Lands on every other participant's queue as `[shared] <from>: <text>`.

### Inbox format

Every line a participant reads on a resume is one bus message rendered
with its tag:

```text
[ask#42]     facilitator: What is your current condition?
[answer#41]  agent-1:     We're at 7 out of 10.
[shared]     agent-2:     FYI I'm switching to Bun 1.2.
[system]     @orchestrator: You have an unanswered ask from facilitator (askId=42)…
```

The `[ask#N]` tag is what the participant quotes back in Answer's
`askId` field.

### Why async

The lead can issue Asks, end its turn, and use the gap between turns
for planning, reflection, or follow-up Asks while participants work
in parallel. Nothing blocks the LLM thread waiting on a reply. The
orchestrator wakes the lead whenever the inbox has new content.

## The orchestration loop

`OrchestrationLoop` runs one outer pattern for both the lead and each
participant:

1. Drain the bus queue, or wait for the first message.
2. Run (first turn) or resume (every subsequent turn) the LLM with the
   drained messages formatted as tagged lines.
3. If the participant ended a turn with an unanswered Ask owed to it,
   inject one synthetic reminder and resume once more. If still
   unanswered, emit a `protocol_violation` event and cancel the
   pending entry with a synthetic null answer so the asker unblocks.

The lead's first turn starts with the task as its initial prompt;
participants' first runs are triggered by their first inbound message.

Termination flips two flags:

- `ctx.concluded` — explicit `Conclude` / `Adjourn` / `Recess`. The
  handler also cancels any in-flight Asks with a synthetic null so
  askers see why their question won't be answered.
- `stopped` — broader: also true on a lead error, an agent crash, or
  any abort path. Loops watch `stopped`; `ctx.concluded` is only used
  for the summary's `success` / `verdict`.

## Tool surface, by role

| Role         | Ask | Answer | Announce | RollCall | Conclude | Other                                |
| ------------ | --- | ------ | -------- | -------- | -------- | ------------------------------------ |
| Facilitator  | ✓   | ✓      | ✓        | ✓        | ✓        |                                      |
| Fac. agent   | ✓   | ✓      | ✓        | ✓        |          |                                      |
| Supervisor   | ✓   | ✓      | ✓        | ✓        | ✓        |                                      |
| Sup. agent   | ✓   | ✓      | ✓        | ✓        |          |                                      |
| Discuss lead | ✓   | ✓      | ✓        | ✓        |          | `RequestForComment`, `Recess`, `Adjourn` |
| Discuss agt  | ✓   | ✓      | ✓        | ✓        |          |                                      |
| Judge        |     |        |          |          | ✓        |                                      |

Ask's `to` accepts a participant name on multi-participant roles
(facilitator, discuss lead, all participants); supervise's
`supervisor` / `agent` pair don't accept `to` because there's only
one possible target.

## Minimal example: a two-participant facilitator

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

The facilitator's LLM, started with that task, has access to `Ask`,
`Answer`, `Announce`, `RollCall`, and `Conclude`. Alice and Bob each
get `Ask`, `Answer`, `Announce`, `RollCall`. Every tool call, every
message routed through the bus, and every orchestrator event becomes a
line in the trace.

## Trace format

Every line is one JSON object with three fields:

```json
{ "source": "facilitator", "seq": 42, "event": { … } }
```

- `source` — the participant whose LLM produced the line, or
  `orchestrator` for loop-level events (`session_start`, `agent_start`,
  `protocol_violation`, `lead_turn_limit`, `summary`).
- `seq` — monotonically increasing across the whole trace; useful for
  reconstructing the wall-clock order across concurrent participants.
- `event` — the SDK event verbatim, or the orchestrator event payload.

`fit-trace` consumes this format. See the trace analysis guide for the
full schema.

## Trace redaction

`fit-eval run`, `fit-eval supervise`, and `fit-eval facilitate` redact
secrets in trace artifacts before they reach disk. Two layers compose:

- **Env-var allowlist**, defaulting to `ANTHROPIC_API_KEY`, `GH_TOKEN`,
  `GITHUB_TOKEN`. The runtime values of these vars are replaced with
  `[REDACTED:env:NAME]` wherever they appear in tool inputs, tool
  outputs, assistant text, or orchestrator summaries. Override the
  list with `LIBEVAL_REDACTION_ENV_VARS=NAME1,NAME2,…` (replaces, not
  extends).
- **Credential-shape patterns**, covering Anthropic API keys
  (`sk-ant-`), GitHub PATs (`ghp_`), installation tokens (`ghs_`),
  OAuth tokens (`gho_`), and fine-grained PATs (`github_pat_`).
  Pattern hits become `[REDACTED:pattern:KIND]`.

Redaction is on by default. To disable, set
`LIBEVAL_REDACTION_DISABLED=1` — a stderr warning fires once per run.
Never set this in CI on a public repository: workflow artifacts there
are downloadable through the retention window.

## Module map

| Module                       | Purpose                                                                 |
| ---------------------------- | ----------------------------------------------------------------------- |
| `agent-runner.js`            | One Claude Agent SDK session; emits NDJSON via the redactor.            |
| `message-bus.js`             | In-memory per-participant queues + `waitForMessages` Promise wakeup.    |
| `orchestration-toolkit.js`   | Shared Ask / Answer / Announce / Conclude / RollCall handlers + builders. |
| `orchestration-loop.js`      | Unified lead+participant loop; reminder/violation handling.             |
| `facilitator.js`             | `Facilitator` class + factory + system prompts.                         |
| `supervisor.js`              | `Supervisor` class + factory + system prompts.                          |
| `discuss-tools.js`           | Discuss-only RequestForComment / Recess / Adjourn handlers + tool servers. |
| `discusser.js`               | `Discusser` class + factory + system prompt + resume hydration.         |
| `judge.js`                   | One-shot post-hoc verdict via `Conclude`.                               |
| `trace-collector.js` / `trace-query.js` / `trace-github.js` | Trace ingestion / querying / GitHub-attachment helpers. |
| `redaction.js`               | Env-var allowlist + credential-shape pattern redaction.                 |

## Documentation

- [Agent Evaluations Guide](https://www.forwardimpact.team/docs/libraries/agent-evaluations/index.md) — how to run an eval and read its trace.
- [Agent Collaboration Guide](https://www.forwardimpact.team/docs/libraries/agent-collaboration/index.md) — supervise / facilitate / discuss in depth.
- [Trace Analysis Guide](https://www.forwardimpact.team/docs/libraries/trace-analysis/index.md) — analysing NDJSON traces with `fit-trace`.
