# Plan 0440 — Part 2: Supervisor Migration + Unified Trace Envelope

Prerequisite: Part 1 (OrchestrationToolkit, SequenceCounter, AgentRunner
`mcpServers`).

All file paths relative to `libraries/libeval/`.

## Step 1: Enhance mock-runner with tool dispatch

**Modify:** `test/mock-runner.js`

The mock runner bypasses the SDK — no MCP server is invoked. Orchestration tool
calls in scripted messages need manual dispatch to handlers so context flags get
set as they would in production.

Add an optional `toolDispatcher` parameter to `createMockRunner`:

```js
export function createMockRunner(responses, messages, { toolDispatcher } = {}) {
```

In the `consume` function, after recording each message, check for `tool_use`
blocks in assistant messages and dispatch them:

```js
if (toolDispatcher && m.type === "assistant") {
  const content = m.message?.content ?? m.content ?? [];
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type === "tool_use" && toolDispatcher[block.name]) {
        await toolDispatcher[block.name](block.input);
      }
    }
  }
}
```

This runs after `onLine` fires but before `maybeFlushBatch`, mirroring the SDK's
sequencing: the iterator yields the assistant message, then the SDK executes
tools.

**Why this approach:** The alternative — having tests manually set context flags
— obscures the causal chain. With dispatch, tests verify the full path: model
calls tool → handler sets flag → orchestrator reads flag.

## Step 2: Update TraceCollector envelope unwrapping

**Modify:** `src/trace-collector.js`

The existing unwrap logic (line 44) checks for
`event.event && !event.type && typeof event.source === "string"`. This already
works for both `{ source, turn, event }` and `{ source, seq, event }` — the
field being renamed (`turn` → `seq`) is not checked. **No source code change
needed.**

**Modify:** `test/trace-collector.test.js`

Update any test fixtures that use `{ source, turn, event }` to use
`{ source, seq, event }`. The collector should accept both (it doesn't check the
field name), but tests should reflect the new canonical format.

## Step 3: Rewrite Supervisor

**Modify:** `src/supervisor.js`

This is the largest change in the plan. The file is rewritten from signaling
mechanism through trace emission, but the relay loop structure (turn 0 →
agent/supervisor alternation → mid-turn review → end-of-turn review) is
preserved.

### 3a. Remove text-token detection

Delete entirely:

- `isComplete(text)` function and its export (lines 22–24)
- `isIntervention(text)` function and its export (lines 33–35)
- `completeSignalSeen` property and all reads/writes
- `interventionSignalSeen` property and all reads/writes
- `lastSupervisorResult` property and all reads/writes
- All `isComplete(...)` / `isIntervention(...)` calls
- Text scanning in `emitLine` (lines 378–387)

### 3b. Add orchestration context and MCP servers

Import from Part 1:

```js
import { SequenceCounter } from "./sequence-counter.js";
import {
  createOrchestrationContext,
  createSupervisorToolServer,
  createSupervisedAgentToolServer,
} from "./orchestration-toolkit.js";
```

New constructor signature — accepts an optional `ctx` so the factory can inject
a pre-built context (needed because the factory wires `onAsk` callbacks that
close over `ctx` before the Supervisor exists). Tests that construct Supervisor
directly can omit `ctx` to get a fresh default:

```js
constructor({ agentRunner, supervisorRunner, output, maxTurns, ctx }) {
  // ... existing validation ...
  this.counter = new SequenceCounter();
  this.ctx = ctx ?? createOrchestrationContext();
}
```

### 3c. Wire MCP servers in `createSupervisor` factory

The factory creates MCP servers and passes them to runners via the new
`mcpServers` option:

```js
export function createSupervisor({ ...deps }) {
  // Forward-references: onAsk closure captures supervisor and supervisorRunner
  // before they are assigned. Safe because the closure is only called during
  // run(), after all variables are initialized. Both MUST be `let`-declared.
  let supervisor;
  let supervisorRunner;

  const ctx = createOrchestrationContext();

  const supervisorServer = createSupervisorToolServer(ctx);
  const agentServer = createSupervisedAgentToolServer(ctx, {
    onAsk: async (question) => {
      // Run supervisor with the question inline
      supervisor.currentSource = "supervisor";
      supervisor.emitOrchestratorEvent({ type: "ask_received" });
      const result = await supervisorRunner.resume(
        `The agent asks: "${question}"\n\nAnswer the question directly.`
      );
      supervisor.currentSource = "agent";
      supervisor.emitOrchestratorEvent({ type: "ask_answered" });
      return supervisor.extractLastText(supervisorRunner, result.text);
    },
  });

  // Use devNull Writable (same as run.js step 4) instead of PassThrough to
  // avoid unbounded memory growth — real output goes through onLine → emitLine.
  const agentRunner = createAgentRunner({
    ...,
    output: devNull,
    mcpServers: { orchestration: agentServer },
  });

  supervisorRunner = createAgentRunner({
    ...,
    output: devNull,
    mcpServers: { orchestration: supervisorServer },
  });

  supervisor = new Supervisor({ agentRunner, supervisorRunner, output, maxTurns, ctx });
  return supervisor;
}
```

The `Supervisor` constructor accepts the pre-built `ctx` from the factory (or
creates a fresh one if not provided, for backward-compatible construction in
tests).

### 3d. Update system prompts

Replace the current prompts that instruct text-token conventions:

```js
export const SUPERVISOR_SYSTEM_PROMPT =
  "You relay messages to one persistent agent session — your only output " +
  "channel. Spawning sub-agents or restarting the agent is blocked. Do not " +
  "do the work yourself. Reply briefly to let the agent continue. Use your " +
  "Redirect tool to interrupt and correct the agent. Use your Conclude tool " +
  "with a summary when the task is fully done. Only your final message each " +
  "turn is relayed.";

export const AGENT_SYSTEM_PROMPT =
  "A supervisor watches your work and may interrupt with new instructions " +
  "mid-task. Treat any new prompt as authoritative and adjust course. " +
  "When uncertain, use your Ask tool to ask the supervisor a clarifying " +
  "question — you will receive a direct answer.";
```

### 3e. Rewrite relay loop to use context flags

**`run()` method** — Replace `completeSignalSeen || isComplete(...)` checks with
`this.ctx.concluded`:

```js
// After turn 0:
if (this.ctx.concluded) {
  this.emitSummary({ success: true, turns: 0, summary: this.ctx.summary });
  return { success: true, turns: 0 };
}
```

**`#runAgentTurn()` method** — Replace `interventionSignalSeen` with
`this.ctx.redirect`:

```js
// After agent run/resume returns:
if (this.ctx.concluded) {
  this.emitSummary({ success: true, turns: turn, summary: this.ctx.summary });
  return { exit: { success: true, turns: turn } };
}

if (agentResult.aborted && this.ctx.redirect) {
  interventions++;
  const redirect = this.ctx.redirect;
  this.ctx.redirect = null; // consume
  if (interventions >= MAX_INTERVENTIONS_PER_TURN) {
    this.emitOrchestratorEvent({ type: "intervention_limit", turn });
    return { exit: null };
  }
  relay = redirect.message;
  this.emitOrchestratorEvent({ type: "intervention_relayed", turn });
  continue;
}
```

**`#midTurnReview()` method** — Replace the text-instruction prompt and
flag-based detection:

```js
async #midTurnReview(turn, batchLines, { abort }) {
  const batchTranscript = this.renderBatch(batchLines);
  this.emitOrchestratorEvent({ type: "mid_turn_review", turn });

  this.currentSource = "supervisor";
  this.ctx.redirect = null; // clear before supervisor turn

  await this.supervisorRunner.resume(
    `The agent is mid-turn. Latest batch:\n\n${batchTranscript}\n\n` +
    `Review and use your tools if action is needed.`
  );
  this.currentSource = "agent";

  if (this.ctx.redirect) {
    this.emitOrchestratorEvent({ type: "intervention_requested", turn });
    abort();
    return;
  }
  if (this.ctx.concluded) {
    this.emitOrchestratorEvent({ type: "complete_requested", turn });
    abort();
  }
}
```

**`#endOfTurnReview()` method** — Same context-flag pattern. If the supervisor
calls `Redirect` during end-of-turn review, the redirect message is returned as
a direct `relay` — the agent is NOT aborted (it already finished its turn
naturally). The `relay` field bypasses `extractLastText` in the `run()` loop,
which would otherwise pick up the supervisor's pre-redirect text from the
buffer:

```js
async #endOfTurnReview(turn) {
  const agentTranscript = this.extractTranscript(this.agentRunner);
  this.currentSource = "supervisor";
  this.currentTurn = turn;
  this.ctx.redirect = null;

  const supervisorResult = await this.supervisorRunner.resume(
    `The agent reported:\n\n${agentTranscript}\n\nReview the agent's work and decide how to proceed.`
  );

  if (supervisorResult.error) {
    this.emitSummary({ success: false, turns: turn });
    return { exit: { success: false, turns: turn } };
  }

  if (this.ctx.concluded) {
    this.emitSummary({ success: true, turns: turn, summary: this.ctx.summary });
    return { exit: { success: true, turns: turn } };
  }

  // If supervisor called Redirect during end-of-turn review, return the
  // redirect message as a direct relay. This bypasses extractLastText
  // in the run() loop — without this, the supervisor's pre-redirect text
  // in the buffer would be used instead of the redirect message.
  if (this.ctx.redirect) {
    const redirect = this.ctx.redirect;
    this.ctx.redirect = null;
    return { exit: null, supervisorResult, relay: redirect.message };
  }

  return { exit: null, supervisorResult };
}
```

**Corresponding `run()` loop change** — add a `pendingRelay` variable that takes
precedence over `extractLastText` when set by an end-of-turn redirect:

```js
let pendingRelay = null;
const turnLimit = this.maxTurns === 0 ? Infinity : this.maxTurns;
for (let turn = 1; turn <= turnLimit; turn++) {
  const relay = pendingRelay ?? this.extractLastText(
    this.supervisorRunner, supervisorResult.text,
  );
  pendingRelay = null;

  const turnOutcome = await this.#runAgentTurn(turn, relay);
  if (turnOutcome.exit) return turnOutcome.exit;

  const reviewOutcome = await this.#endOfTurnReview(turn);
  if (reviewOutcome.exit) return reviewOutcome.exit;
  supervisorResult = reviewOutcome.supervisorResult;
  pendingRelay = reviewOutcome.relay ?? null;
}
```

### 3f. Rewrite trace emission to use SequenceCounter

**`emitLine(line)`** — Remove text scanning, use `seq`:

```js
emitLine(line) {
  const event = JSON.parse(line);
  const tagged = {
    source: this.currentSource,
    seq: this.counter.next(),
    event,
  };
  this.output.write(JSON.stringify(tagged) + "\n");
}
```

**`emitOrchestratorEvent(event)`** — Use `seq`:

```js
emitOrchestratorEvent(event) {
  this.output.write(
    JSON.stringify({
      source: "orchestrator",
      seq: this.counter.next(),
      event,
    }) + "\n"
  );
}
```

**`emitSummary(result)`** — Add optional `summary` field:

```js
emitSummary(result) {
  this.output.write(
    JSON.stringify({
      source: "orchestrator",
      type: "summary",
      success: result.success,
      turns: result.turns,
      ...(result.summary && { summary: result.summary }),
    }) + "\n"
  );
}
```

## Step 4: Update run command for unified envelope

**Modify:** `src/commands/run.js`

Wrap agent events with the universal envelope. Follow the existing pattern from
`createSupervisor` — route output through a PassThrough, use `onLine` for
wrapping:

```js
import { Writable } from "node:stream";
import { SequenceCounter } from "../sequence-counter.js";

// Inside runRunCommand, before creating the runner:
const counter = new SequenceCounter();
const devNull = new Writable({ write(_chunk, _enc, cb) { cb(); } });
const onLine = (line) => {
  const event = JSON.parse(line);
  output.write(
    JSON.stringify({ source: "agent", seq: counter.next(), event }) + "\n"
  );
};

const runner = createAgentRunner({
  cwd, query,
  output: devNull,  // raw events discarded (no buffering)
  onLine,           // wrapped events go to real output
  ...
});
```

The runner's output is a no-op Writable that discards data without buffering.
The real output receives wrapped events via `onLine`. This mirrors the
Supervisor's existing pattern where runner output goes to a PassThrough and
`onLine → emitLine` handles the real output — but uses a discarding Writable
instead of PassThrough to avoid unbounded memory growth on long traces.

## Step 5: Update TeeWriter

**Modify:** `src/tee-writer.js`

After this change, ALL modes emit `{ source, seq, event }` envelopes. The
TeeWriter no longer needs a mode-dependent envelope format — the distinction
simplifies to display behavior (source labels for multi-participant traces).

**Replace `processLine`:**

```js
processLine(line) {
  let parsed;
  try { parsed = JSON.parse(line); } catch { return; }

  // Orchestrator summary (not wrapped in envelope)
  if (parsed.source === "orchestrator" && parsed.type === "summary") {
    const status = parsed.success ? "completed" : "incomplete";
    this.textStream.write(
      `\n--- Evaluation ${status} after ${parsed.turns} turns ---\n`
    );
    return;
  }

  // Universal envelope: { source, seq, event }
  if (parsed.event) {
    if (parsed.source && parsed.source !== this.lastSource) {
      this.lastSource = parsed.source;
    }
    this.collector.addLine(JSON.stringify(parsed.event));
    this.flushTurns();
    return;
  }

  // Bare event (shouldn't happen after migration, but defensive)
  this.collector.addLine(line);
  this.flushTurns();
}
```

Remove `processSupervisedLine` — its logic is merged into the unified
`processLine`. The `mode` constructor parameter can remain for source-label
display formatting but no longer affects envelope parsing.

Update `_final`: the result footer logic remains unchanged (still checks
`this.collector.result`).

## Step 6: Update index exports

**Modify:** `src/index.js`

Remove:

```js
isComplete,
isIntervention,
```

Add (these exports serve Part 3 but the index update is Part 2's responsibility
since it's removing exports from the same file):

```js
export { SequenceCounter, createSequenceCounter } from "./sequence-counter.js";
export {
  createOrchestrationContext,
  createSupervisorToolServer,
  createSupervisedAgentToolServer,
  createFacilitatorToolServer,
  createFacilitatedAgentToolServer,
} from "./orchestration-toolkit.js";
export { MessageBus, createMessageBus } from "./message-bus.js";
```

## Step 7: Update tests

### supervisor-run.test.js

Rewrite signal detection tests. Current tests verify `EVALUATION_COMPLETE` in
text triggers completion. New tests verify the `Conclude` tool call triggers
completion.

- **Turn 0 completion:** Supervisor mock yields a message with `tool_use` for
  `Conclude({ summary: "Done" })`. The `toolDispatcher` calls the real handler.
  Assert `run()` returns `{ success: true, turns: 0 }`.
- **Multi-turn completion:** Supervisor calls `Conclude` after reviewing agent
  work. Assert correct turn count.
- **`isComplete` / `isIntervention` function tests:** Delete entirely — the
  functions no longer exist.

### supervisor-intervention.test.js

Rewrite intervention tests. Current tests verify `EVALUATION_INTERVENTION` in
text triggers abort. New tests verify the `Redirect` tool call triggers abort.

- **Mid-turn redirect:** Supervisor mock calls `Redirect({ message: "..." })`.
  Assert agent is aborted and resumed with the redirect message.
- **End-of-turn redirect:** Supervisor calls `Redirect` during end-of-turn
  review. Assert relay.
- **Intervention limit:** Multiple `Redirect` calls exhaust budget. Assert
  `intervention_limit` orchestrator event.

### supervisor-batching.test.js

Update to use context flags instead of text tokens. Mid-turn review now checks
`ctx.redirect` / `ctx.concluded` instead of scanning text.

### supervisor-output.test.js

Update envelope expectations: `turn` → `seq`. Assert `seq` values are
monotonically increasing across all events.

### tee-writer.test.js

Update test fixtures to use `{ source, seq, event }` format. Both "raw" and
"supervised" mode tests should use the unified envelope. Verify source labels
appear in multi-participant traces but not in single-participant traces.

### trace-collector.test.js

Update any fixtures using `{ source, turn, event }` to use `seq`. Verify the
collector unwraps both formats (backward compatibility is free — the unwrap
logic doesn't check the field name).

## Ordering

Steps 1–7 are broadly sequential:

1. Mock-runner first (other test changes depend on it)
2. TraceCollector (mechanical, unblocks envelope work)
3. Supervisor rewrite (the core change)
4. Run command envelope (depends on SequenceCounter from Part 1)
5. TeeWriter (depends on envelope format being settled)
6. Index exports (depends on supervisor changes)
7. Tests (depends on all code changes)

In practice, step 3 (supervisor) is the critical path. Steps 4–6 can follow in
any order after step 3.

## Verification

`bun run --filter=@forwardimpact/libeval test` passes. Every existing test
scenario has a tool-based equivalent. No text-token detection code remains —
grep for `EVALUATION_COMPLETE`, `EVALUATION_INTERVENTION`, `isComplete`,
`isIntervention` should return zero hits in `src/`.
