# 440 — Tool-Based Orchestration and Facilitated Group Work

## Problem

### 1. Text-token signaling is fragile

`fit-eval supervise` manages the evaluation lifecycle by instructing the
supervisor to print magic strings — `EVALUATION_COMPLETE` and
`EVALUATION_INTERVENTION` — inside its assistant text. The orchestrator scans
every supervisor message with regex (`isComplete`, `isIntervention` in
`supervisor.js`) to detect these tokens, tolerating markdown formatting
variations (`**EVALUATION_COMPLETE**`, `` `EVALUATION_INTERVENTION` ``, etc.).

This works but is fragile in several ways:

- **Prompt-dependent.** The entire mechanism hinges on the supervisor following
  natural-language instructions in `SUPERVISOR_SYSTEM_PROMPT`. If the model
  paraphrases ("The evaluation is now complete"), wraps the token in unexpected
  formatting, or emits it inside a code block, the regex misses it. The dual
  detection paths (real-time in `emitLine` and post-turn in `run`) exist
  precisely because the first path alone was unreliable.

- **No structured data.** The tokens carry no payload. `EVALUATION_COMPLETE`
  cannot include a summary or verdict; `EVALUATION_INTERVENTION` cannot specify
  which part of the agent's work triggered the intervention. The orchestrator
  must infer context from surrounding text.

- **One-directional.** The agent has no way to reach the supervisor. If the
  agent gets stuck, confused, or needs clarification, its only option is to
  embed a question in its text output and hope the supervisor notices it in the
  next batch review. There is no explicit upward channel.

- **Invisible to tooling.** Text tokens don't appear in the trace as structured
  events. The improvement coach and trace parsers must regex-scan assistant text
  the same way the orchestrator does, duplicating the fragile detection logic.

Tool calls are the right replacement primitive. They are structurally validated
by the SDK (the model cannot paraphrase a tool name), carry typed payloads,
appear as first-class `tool_use`/`tool_result` events in the NDJSON trace, and
cannot be confused with ordinary assistant text.

### 2. No upward communication channel

In supervised evaluation, the agent operates blind. When it encounters ambiguity
— "should I follow the npm docs or the getting-started guide?", "this command
failed, should I retry or try a different approach?" — it can only express the
question in its text output. The supervisor sees this (if at all) at the next
batch review boundary, which may be several assistant turns away.

The result is wasted agent turns. The agent guesses, often guesses wrong, the
supervisor eventually intervenes with the correction, and the trace fills with
recoverable dead ends that a single synchronous question-and-answer would have
prevented.

### 3. Only two execution modes

libeval supports two modes: `run` (single agent, autonomous) and `supervise`
(one supervisor watching one agent, relay loop). Real evaluation scenarios
require a third pattern: multiple agents working on a shared task with light
coordination.

The `product-evaluation` skill already strains against the two-mode limit. A
single supervised session requires one agent to play all roles — discover
documentation, install the product, run commands, write an assessment. When the
evaluation touches multiple independent workflows (e.g. leadership setup vs.
engineer setup vs. agent configuration), the agent context grows monotonically
and the supervisor must track interleaved threads of work. With multiple agents,
a facilitator could assign independent aspects to specialized agents, let them
work concurrently, and synthesize their findings — shorter wall-clock time,
smaller per-agent contexts, and cleaner traces.

Other concrete use cases: red-team/blue-team security evaluations (attacker and
defender agents with a facilitator judging outcomes), multi-persona user testing
(agents simulating different user types simultaneously), and parallel
exploration of alternative approaches to the same problem.

The supervised relay loop cannot support this. It is fundamentally a two-party,
single-threaded protocol.

## Solution

Add three capabilities to libeval:

1. **Tool-based signaling for supervise mode.** Replace `EVALUATION_COMPLETE`
   and `EVALUATION_INTERVENTION` text tokens with orchestration tools that the
   supervisor and agent call explicitly. The orchestrator handles these tools
   and signals the orchestration loop directly.

2. **Bidirectional supervision.** Give the agent an `Ask` tool that
   synchronously asks the supervisor a question and blocks until answered.

3. **Facilitate mode.** A new `fit-eval facilitate` command that runs a
   facilitator plus N agents as concurrent sessions, communicating through
   structured tool-based primitives (share, tell, redirect).

### Execution Modes After This Spec

| Mode         | Participants             | Communication                       | Use case                               |
| ------------ | ------------------------ | ----------------------------------- | -------------------------------------- |
| `run`        | 1 agent                  | None (autonomous)                   | CI tasks, single-agent evaluation      |
| `supervise`  | 1 supervisor + 1 agent   | Tool-based relay (synchronous)      | Guided evaluation, product testing     |
| `facilitate` | 1 facilitator + N agents | Tool-based messaging (asynchronous) | Group evaluation, parallel exploration |

### Orchestration Tools

Six tools total. Each mode injects only the tools relevant to its participants.

#### `Conclude({ summary })`

**Available to:** supervisor, facilitator

Signals that the evaluation or task is done. The `summary` field carries a
structured verdict — replacing the bare `EVALUATION_COMPLETE` token that could
carry no payload. The orchestrator terminates all running sessions and records
the summary in the trace.

#### `Redirect({ message, to? })`

**Available to:** supervisor, facilitator

Interrupts the target with a corrective message. In supervise mode, `to` is
omitted (there is only one agent). In facilitate mode, `to` is a participant
name or `"all"`.

From the caller's perspective: "stop what you're doing, read this, then
continue." The target receives the message and resumes working with the
redirection as new context.

#### `Ask({ question })`

**Available to:** agent (both supervise and facilitate modes)

Synchronous upward channel. The agent calls the tool with a question and blocks
until the supervisor or facilitator answers. The tool result carries the answer.
From the agent's perspective it is an ordinary tool call that happens to take
longer. From the supervisor/facilitator's perspective it is a prioritized review
where the agent is explicitly asking something.

In facilitate mode, the question is always directed at the facilitator —
agent-to-agent questions use `Tell`.

#### `RollCall()`

**Available to:** facilitator, agents (facilitate mode only)

Returns `[{ name, role }]` for all participants in the session. Allows agents to
discover who else is working on the task and address messages to specific
participants.

#### `Share({ message })`

**Available to:** facilitator, agents (facilitate mode only)

Posts a message to the shared channel. All participants receive a copy. The tool
returns immediately — the sender does not wait for delivery or acknowledgement.

Messages accumulate and are delivered to each participant between turns. This
provides **eventual visibility** — every participant sees everything that has
been shared, but not necessarily in real time.

#### `Tell({ message, to })`

**Available to:** facilitator, agents (facilitate mode only)

Sends a direct message to one participant. Only the named recipient sees it.
Returns immediately (fire-and-forget). The facilitator sees shared traffic (it
is a participant) but not direct messages between agents unless it is a party to
them.

### Facilitate Mode Behaviour

**Concurrent work, asynchronous communication.** All agent sessions run
concurrently and independently. Agents communicate via `Share` and `Tell`.
Messages are delivered between turns, not mid-turn. The facilitator coordinates
work, receives broadcast traffic passively, and intervenes when needed.

**Lazy agent start.** Agents are declared at invocation time but do not start
working until they receive their first message. This avoids idle sessions — the
facilitator distributes initial assignments, and agents activate as messages
arrive.

**Facilitator serialization.** Only one thing talks to the facilitator at a
time. If multiple agents call `Ask` concurrently, the requests queue and the
facilitator handles them one at a time. This avoids interleaving multiple
conversations in the facilitator's context.

**Event-driven facilitator.** The facilitator only gets an LLM turn when there
is input to process — an `Ask` call, an incoming message, or a session lifecycle
event. There is no idle loop and no polling. The orchestrator delivers events
and invokes the facilitator on demand.

**Fail-fast on agent failure.** If any agent session errors out, the
orchestrator terminates all remaining sessions and reports the failure. There is
no partial-completion mode and no facilitator notification — the entire session
fails as a unit.

**Facilitator observation.** The facilitator does not watch agent output
streams. It relies on agents to surface relevant information via broadcasts and
direct messages. This is the "less active than supervision" quality — the
facilitator trusts agents to communicate, and only intervenes when things go
wrong. (Stream-level visibility over an agent is supervision, not facilitation —
and is explicitly out of scope.)

### Trace Format

All three modes — `run`, `supervise`, and `facilitate` — emit traces with the
same envelope structure. A single set of tools and scripts can parse, filter,
and analyse any trace regardless of which mode produced it.

#### Universal envelope

Every trace event is wrapped in `{ source, seq, event }`:

- **`source`** — participant name. In `run` mode this is the agent name. In
  `supervise` mode this is the supervisor or agent name. In `facilitate` mode
  each participant has a distinct name.
- **`seq`** — global monotonic sequence number. A single counter increments
  across all participants and all event types within a session. No two events
  share a sequence number. This provides a total ordering of events regardless
  of mode.
- **`event`** — the trace event payload (assistant message, `tool_use`,
  `tool_result`, orchestrator lifecycle event, etc.).

Filtering by `source` extracts a coherent single-participant trace. Sorting by
`seq` reconstructs the full session timeline. Both operations work identically
across modes.

In `run` mode the sequence number is trivially monotonic (single participant),
but the envelope shape is identical — no special-casing for single-agent traces.

#### Additional requirements

- Orchestration tool calls (`Conclude`, `Redirect`, `Ask`, `RollCall`, `Share`,
  `Tell`) appear as standard `tool_use`/`tool_result` events within the
  participant's stream — visible to `TraceCollector` and downstream parsers
  without special-case handling.
- The orchestrator emits lifecycle events (session start/stop, message delivery,
  completion) so the coordination sequence is visible in the trace.

### Migration Strategy: Clean Break, No Backward Compatibility

This is a clean-break migration. There is no backward compatibility layer, no
deprecation path, no feature flags, and no transitional shims.

**What is removed:**

- All regex-based text-token detection (`EVALUATION_COMPLETE`,
  `EVALUATION_INTERVENTION`) — the functions, the constants, and the dual
  detection paths in `emitLine` and `run`.
- All prompt text that instructs the supervisor to print magic strings.
- Any helper or utility that exists solely to support text-token signaling.

**What replaces it:**

- Orchestration tools (`Conclude`, `Redirect`, `Ask`) as the sole signaling
  mechanism.
- Updated system prompts that describe available tools, not text conventions.

**Why a clean break:**

- The consumer base is internal and small — carrying dead code or compatibility
  shims adds maintenance cost with no benefit.
- Dual code paths (old + new) invite bugs where one path is tested and the other
  rots. A single path is simpler to reason about, test, and maintain.
- Text tokens in supervisor output after migration are ignored silently — they
  have no effect. There is no fallback that "helpfully" detects them.

**Implementation constraint:** The implementation must not retain any remnant of
the text-token mechanism — no commented-out code, no `// removed:` markers, no
unused imports, no backward-compatible re-exports. If it existed only to support
text-token signaling, it is deleted.

## Scope

### In scope

- **Orchestration tools for supervise mode.** `Conclude`, `Redirect`, `Ask` —
  replace text-token detection as the primary signaling mechanism.
- **Updated system prompts.** `SUPERVISOR_SYSTEM_PROMPT` and
  `AGENT_SYSTEM_PROMPT` updated to describe the available tools instead of text
  tokens.
- **`fit-eval facilitate` command.** New CLI subcommand for multi-agent
  facilitated sessions.
- **Facilitate-mode tools.** `RollCall`, `Share`, `Tell` plus `Conclude`,
  `Redirect`, `Ask` adapted for multi-party semantics.
- **Unified trace format.** All modes emit the same `{ source, seq, event }`
  envelope. Replaces the per-participant `turn` counter in supervise mode with a
  global monotonic `seq` across all modes.
- **Remove text-token detection.** All regex-based `EVALUATION_COMPLETE` and
  `EVALUATION_INTERVENTION` scanning code is deleted — no fallback, no
  deprecation shim.
- **Public API.** New exports for the facilitator alongside existing
  `Supervisor` exports.

### Out of scope

- **Dynamic agent creation.** Agents are declared at invocation time (CLI
  flags), not spawned dynamically by the facilitator during a session.
- **Agent-to-agent stream watching.** No `Watch` tool. If a participant needs
  stream-level visibility over another participant, that is supervision, not
  facilitation.
- **Persistent message history.** Messages live in memory for the session
  duration only.
- **Changes to `fit-eval run` behaviour.** The single-agent execution model is
  unaffected. Its trace output adopts the unified envelope (see Trace Format)
  but the command itself gains no new flags or options.
- **`TraceCollector` parsing redesign.** The envelope field rename from `turn`
  to `seq` is a mechanical change covered by the unified trace format (in
  scope). What is out of scope is any broader rearchitecture of the collector's
  parsing pipeline.

## Success Criteria

### Run mode — unified trace envelope

- A `fit-eval run` trace wraps every event in `{ source, seq, event }` with the
  agent name as `source`. Sequence numbers are monotonically increasing.

### Supervise mode — tool-based signaling

- The trace uses the universal `{ source, seq, event }` envelope. Sequence
  numbers are globally monotonic across supervisor and agent events.
- A `fit-eval supervise` run completes via the supervisor calling `Conclude`
  rather than printing `EVALUATION_COMPLETE`. The trace contains a `tool_use`
  event for `Conclude` with a summary payload.
- A supervisor redirection occurs via the `Redirect` tool rather than the
  `EVALUATION_INTERVENTION` text token. The trace shows `tool_use` for
  `Redirect`, the agent's session interrupted, and the agent resumed with the
  redirection message.
- An agent calls `Ask` with a question, the supervisor receives and answers it,
  and the agent's `tool_result` contains the answer. The agent continues working
  with the guidance in context.
- Legacy text tokens (`EVALUATION_COMPLETE`, `EVALUATION_INTERVENTION`) in
  supervisor output are ignored — they have no effect and no fallback detection
  exists.

### Facilitate mode — multi-agent group work

- `fit-eval facilitate` accepts a task, a facilitator configuration, and two or
  more agent configurations. All participants appear in the trace with distinct
  source names.
- The facilitator calls `Tell` to assign work to individual agents. Agents start
  working only after receiving their first message.
- Agents call `Share` and `Tell` to communicate. Messages are delivered between
  turns. A message shared by agent A appears in agent B's context on its next
  turn.
- The facilitator calls `Redirect({ to: "all", message })` and all running
  agents are interrupted and resumed with the redirection message.
- An agent calls `Ask` and blocks until the facilitator answers. Multiple
  concurrent `Ask` calls are handled sequentially.
- The facilitator calls `Conclude` and all sessions terminate.
- If any agent session errors out, the orchestrator terminates all remaining
  sessions and the overall run fails.
- The trace uses the universal `{ source, seq, event }` envelope — filtering by
  a single participant's source name extracts a coherent single-agent trace.
  Sequence numbers are globally monotonic across all participants.

### General

- All three modes emit traces with the same `{ source, seq, event }` envelope. A
  trace parser written for one mode works on any mode without branching.
- `bun run check` passes. New behaviour has unit coverage analogous to existing
  `supervisor-run`, `supervisor-intervention`, and `supervisor-batching` tests.
- The six orchestration tools are schema-validated — invalid tool calls produce
  structured errors, not silent failures.
