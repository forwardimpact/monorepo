# Plan 0440 — Part 1: Infrastructure

Prerequisite: none. Creates the shared components that Parts 2 and 3 consume.

All file paths relative to `libraries/libeval/`.

## Step 1: Add `zod` dependency

**Modify:** `package.json`

Add `zod` to `dependencies`:

```json
"zod": "^3.23.0"
```

Run `bun install` to update the lockfile.

**Why:** The SDK's `tool()` helper and `createSdkMcpServer` accept Zod schemas
for tool input validation. `zod` is already in the lockfile (transitive via
`@modelcontextprotocol/sdk`) but must be a direct dependency for import
reliability.

## Step 2: SequenceCounter

**Create:** `src/sequence-counter.js`

Trivial class — a global monotonic counter shared across all participants in a
session. Single-threaded JS means no synchronization needed.

```js
export class SequenceCounter {
  constructor() { this.value = 0; }
  next() { return this.value++; }
}

export function createSequenceCounter() {
  return new SequenceCounter();
}
```

**Create:** `test/sequence-counter.test.js`

- Starts at 0, increments monotonically
- Multiple counters are independent
- Factory returns instance

## Step 3: OrchestrationToolkit

**Create:** `src/orchestration-toolkit.js`

Three concerns in one module: context factory, handler factories, and per-role
MCP server factories.

### 3a. Context factory

```js
export function createOrchestrationContext() {
  return {
    concluded: false,     // set by Conclude handler, permanent
    summary: null,        // set with concluded
    redirect: null,       // { message, to } — consumed and cleared by orchestrator
    participants: [],     // [{ name, role }] — set at session start (facilitate)
    messageBus: null,     // set externally for facilitate mode
  };
}
```

The context is the sole communication channel between MCP handlers and the
orchestrator. Handlers write; the orchestrator reads at natural checkpoints
(after `resume()` returns, after `onBatch`). The orchestrator clears `redirect`
after processing; `concluded` is permanent.

### 3b. Handler factories

Each handler factory returns an async function matching the
`SdkMcpToolDefinition` handler signature
`(args, extra) → Promise<CallToolResult>`.

**`createConcludeHandler(ctx)`** — Sets `ctx.concluded = true` and
`ctx.summary = args.summary`. Returns ack.

**`createRedirectHandler(ctx)`** — Sets `ctx.redirect = { message, to }`.
Returns ack. The `to` field is `null` in supervise mode (omitted by caller), a
participant name or `"all"` in facilitate mode.

**`createAskHandler(ctx, { onAsk })`** — Calls the injected `onAsk(question)`
callback and returns its result as tool content. The callback is provided by the
orchestrator and is responsible for running the supervisor/facilitator with the
question and returning the answer string. The handler wraps the answer:
`{ content: [{ type: "text", text: answer }] }`. If `onAsk` throws, the handler
catches and returns `{ content: [...], isError: true }`.

**`createRollCallHandler(ctx)`** — Returns `ctx.participants` as JSON text.

**`createShareHandler(ctx, { from })`** — Calls
`ctx.messageBus.share(from, args.message)`. Returns ack.

**`createTellHandler(ctx, { from })`** — Calls
`ctx.messageBus.tell(from, args.to, args.message)`. Returns ack.

### 3c. Per-role MCP server factories

Each factory uses `createSdkMcpServer` from the Agent SDK and the `tool()`
helper to define tools with Zod schemas, then wires the appropriate handlers.

```js
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
```

**`createSupervisorToolServer(ctx)`** — Returns MCP server config with:

- `Conclude({ summary: z.string() })`
- `Redirect({ message: z.string(), to: z.string().optional() })`

**`createSupervisedAgentToolServer(ctx, { onAsk })`** — Returns MCP server
config with:

- `Ask({ question: z.string() })`

**`createFacilitatorToolServer(ctx)`** — Returns MCP server config with:

- `Conclude`, `Redirect`, `RollCall`, `Share`, `Tell`

**Conscious override of design:** The design (line 42) says "Facilitator gets
all six." This plan gives the facilitator 5 tools — no `Ask`. The spec's
per-tool availability table is authoritative: `Ask` is "Available to: agent
(both supervise and facilitate modes)." The facilitator is the entity that
_answers_ Ask calls; giving it the Ask tool would create a self-referential loop
with no recipient. The design's "all six" appears to be an accounting error.

**`createFacilitatedAgentToolServer(ctx, { from, onAsk })`** — Returns MCP
server config with:

- `Ask`, `RollCall`, `Share`, `Tell`

### 3d. Exports

The module exports:

- `createOrchestrationContext`
- All four server factories
- Individual handler factories (for direct testing)

### 3e. Test

**Create:** `test/orchestration-toolkit.test.js`

Test each handler in isolation:

- **Conclude:** sets `ctx.concluded` and `ctx.summary`, returns ack
- **Redirect:** sets `ctx.redirect`, returns ack
- **Ask:** calls `onAsk`, returns answer; on `onAsk` throw, returns `isError`
- **RollCall:** returns participants as JSON
- **Share:** calls `messageBus.share`, returns ack
- **Tell:** calls `messageBus.tell`, returns ack

Test server factories:

- Each factory returns an object with `type: "sdk"` and a `name` property
- Correct number of tools per role

Mock `messageBus` with simple spy objects. Mock `onAsk` as an async function
returning a scripted answer.

## Step 4: MessageBus

**Create:** `src/message-bus.js`

In-memory per-participant message queues for facilitate mode.

```js
export class MessageBus {
  constructor({ participants }) {
    // participants: string[] (names)
    // Initialize per-participant queues and waiters
  }

  share(from, message) { /* copy to every OTHER participant's queue */ }
  tell(from, to, message) { /* copy to one participant's queue */ }
  drain(participant) { /* return and clear pending messages */ }
  waitForMessages(participant) { /* resolve when at least one message arrives */ }
}

export function createMessageBus({ participants }) {
  return new MessageBus({ participants });
}
```

**Message shape:** `{ from: string, text: string, direct: boolean }`

- `share()` enqueues `{ from, text: message, direct: false }` to every
  participant except `from`. The facilitator sees shared messages (it is a
  participant).
- `tell()` enqueues `{ from, text: message, direct: true }` to the named
  recipient only. The facilitator does NOT see agent-to-agent direct messages
  unless it is a party.
- `drain(participant)` returns the participant's queue contents and clears it.
  Returns `[]` if empty.
- `waitForMessages(participant)` returns a Promise that resolves when at least
  one message is in the participant's queue. If messages are already pending,
  resolves immediately. Uses a stored resolver per participant; `share`/`tell`
  call the resolver when they enqueue.

**Create:** `test/message-bus.test.js`

- `share` delivers to all others, not sender
- `tell` delivers to named recipient only
- `drain` returns and clears messages
- `drain` on empty queue returns `[]`
- `waitForMessages` resolves when message arrives
- `waitForMessages` resolves immediately if messages pending
- Message shape includes `from`, `text`, `direct`
- Unknown participant name throws

## Step 5: AgentRunner `mcpServers` support

**Modify:** `src/agent-runner.js`

Add `mcpServers` to the constructor:

```js
// After line 66 (this.disallowedTools)
this.mcpServers = mcpServers ?? null;
```

Pass through in `run()` only (not `resume()` — the session retains its MCP
server configuration across resumes):

```js
// In run(), inside the options object (after disallowedTools spread)
...(this.mcpServers && { mcpServers: this.mcpServers }),
```

**SDK version note:** `createSdkMcpServer` and `tool` are confirmed exports in
the installed SDK `^0.2.98`. The `mcpServers` option on `query()` is documented
in the SDK's `.d.ts` (line 1226). Verify during implementation that `resume()`
inherits the session's MCP server configuration — if it does not, `mcpServers`
must also be passed on `resume()` calls. A failing test (Ask tool not found on
second turn) would surface this immediately.

**Modify:** `test/agent-runner.test.js`

Add a test that verifies `mcpServers` is passed to `query()` options when
provided, and omitted when not provided. Use the existing mock-query pattern
that captures the options object.

## Ordering

Steps 1–5 are sequential: step 1 enables imports for step 3, step 2 is a
prerequisite for nothing but is trivially small, steps 3–4 are independent but
reference the same patterns, step 5 is independent.

In practice, steps 2–5 can be implemented in any order after step 1.

## Verification

After all steps: `bun run --filter=@forwardimpact/libeval test` passes. New
tests cover all new code. No existing tests break (Part 1 is purely additive —
no existing behavior changes).
