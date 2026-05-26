# Plan 0440 — Part 3: Facilitator + CLI

Prerequisite: Part 1 (OrchestrationToolkit, SequenceCounter, MessageBus,
AgentRunner `mcpServers`).

All file paths relative to `libraries/libeval/`.

## Step 1: Facilitator class

**Create:** `src/facilitator.js`

New class for multi-agent concurrent orchestration. Manages N agent sessions and
one facilitator LLM session, communicating through the OrchestrationToolkit's
tool-based primitives and the MessageBus.

### 1a. Constructor

```js
import { SequenceCounter } from "./sequence-counter.js";
import { TraceCollector } from "./trace-collector.js";
import {
  createOrchestrationContext,
  createFacilitatorToolServer,
  createFacilitatedAgentToolServer,
} from "./orchestration-toolkit.js";

export class Facilitator {
  constructor({ facilitatorRunner, agents, messageBus, output, maxTurns }) {
    // facilitatorRunner: AgentRunner for the facilitator
    // agents: [{ name, role, runner: AgentRunner }]
    // messageBus: MessageBus instance
    // output: Writable stream for trace NDJSON
    // maxTurns: max facilitator LLM turns (budget)
  }
}
```

The constructor stores injected dependencies and creates a `concludePromise`
(via `Promise.withResolvers()`) that resolves when `Conclude` is called — agent
loops race against this to exit promptly. The factory's `Conclude` handler must
resolve this promise when setting `ctx.concluded`.

The constructor does NOT create MCP servers — that is the factory's job (servers
need runner references that form circular dependencies resolved in the factory).

### 1b. Agent outer loop

Each agent runs a concurrent loop managed by the Facilitator:

```js
async #runAgent(agent) {
  // 1. Wait for first message (lazy start) — race with conclude
  await Promise.race([
    this.messageBus.waitForMessages(agent.name),
    this.concludePromise,
  ]);
  if (this.ctx.concluded) return;

  // 2. Start agent with initial messages
  let messages = this.messageBus.drain(agent.name);
  if (messages.length === 0) return;
  await agent.runner.run(this.#formatMessages(messages));
  if (this.ctx.concluded) return;

  // 3. Loop: check for new messages, resume if any
  while (!this.ctx.concluded) {
    messages = this.messageBus.drain(agent.name);
    if (messages.length === 0) {
      await Promise.race([
        this.messageBus.waitForMessages(agent.name),
        this.concludePromise,
      ]);
      if (this.ctx.concluded) break;
      messages = this.messageBus.drain(agent.name);
      if (messages.length === 0) break;
    }
    await agent.runner.resume(this.#formatMessages(messages));
  }
}
```

Each agent checks `ctx.concluded` after every blocking point (`waitForMessages`,
`run`, `resume`) to exit promptly when the facilitator concludes.

`#formatMessages(messages)` renders `[{ from, text, direct }]` into a
human-readable prompt for the agent:

```
[shared] facilitator: Explore the documentation site...
[direct] agent-2: I found the install guide at...
```

### 1c. Facilitator event loop

The facilitator is event-driven — it only gets an LLM turn when there's input.
Events arrive via an async queue:

```js
async #facilitatorLoop() {
  while (!this.ctx.concluded) {
    const event = await this.eventQueue.dequeue();
    if (this.ctx.concluded) break;
    await this.#handleEvent(event);
  }
}
```

Event types:

- **`ask`** — `{ type: "ask", from, question, resolve }` — an agent called
  `Ask`. The facilitator answers, and the handler resolves the agent's blocked
  Promise.
- **`messages`** — `{ type: "messages" }` — shared messages accumulated. The
  facilitator reviews them on its next turn.
- **`lifecycle`** — `{ type: "lifecycle", agent, status }` — agent started or
  finished.

**Turn budget:** The facilitator loop tracks `facilitatorTurns` and checks
against `maxTurns` before each LLM call. When the budget is exhausted, the loop
emits a summary and terminates — same pattern as Supervisor's outer `for` loop.
Agent SDK sessions have their own `maxTurns` per agent (default 50), independent
of the facilitator budget.

**Ask serialization:** Multiple concurrent `Ask` calls queue in the event queue.
The facilitator handles them FIFO — one at a time. Each `Ask` blocks its calling
agent until answered.

```js
async #handleEvent(event) {
  switch (event.type) {
    case "ask": {
      const result = await this.facilitatorRunner.resume(
        `Agent "${event.from}" asks: "${event.question}"\nAnswer the question.`
      );
      const answer = this.extractLastText(this.facilitatorRunner, result.text);
      event.resolve(answer);
      // Check if facilitator concluded while answering
      break;
    }
    case "messages": {
      const msgs = this.messageBus.drain("facilitator");
      if (msgs.length === 0) break;
      await this.facilitatorRunner.resume(this.#formatMessages(msgs));
      break;
    }
  }
}
```

Note: no `currentSource` assignments here — `emitLine(source, line)` takes the
source explicitly. The facilitator runner's `onLine` is bound to `"facilitator"`
at creation time in the factory (step 1g).

### 1d. The `run(task)` method

Orchestrates the full session:

```js
async run(task) {
  // 1. Run facilitator with the task (turn 0)
  await this.facilitatorRunner.run(task);
  // Facilitator's first action should be Tell() to assign work to agents

  if (this.ctx.concluded) {
    return { success: true, turns: 0 };
  }

  // 2. Abort all agents promptly when Conclude is called. Without this,
  // agents mid-turn would continue working until their SDK session ends
  // naturally — potentially minutes of wasted work.
  this.concludePromise.then(() => {
    for (const agent of this.agents) {
      agent.runner.currentAbortController?.abort();
    }
  });

  // 3. Launch all agent loops + facilitator event loop concurrently
  const agentPromises = this.agents.map(a => this.#runAgent(a));
  const facilitatorPromise = this.#facilitatorLoop();

  // 4. Wait with fail-fast
  try {
    await Promise.all([...agentPromises, facilitatorPromise]);
  } catch (err) {
    // Fail-fast: abort all sessions
    for (const agent of this.agents) {
      agent.runner.currentAbortController?.abort();
    }
    this.facilitatorRunner.currentAbortController?.abort();
    throw err;
  }

  return {
    success: this.ctx.concluded,
    turns: this.facilitatorTurns,
  };
}
```

**Fail-fast:** If any agent Promise rejects, the catch block aborts all
remaining sessions. `Promise.all` rejects on the first failure.

### 1e. Trace emission

Unlike Supervisor (which is single-threaded with one agent), the Facilitator
runs multiple agent loops concurrently. Shared mutable `currentSource` state
would be a race condition — two runners can resume from I/O in the same event
loop tick. Instead, `emitLine` accepts `source` as an explicit parameter:

```js
emitLine(source, line) {
  const event = JSON.parse(line);
  this.output.write(JSON.stringify({
    source,
    seq: this.counter.next(),
    event,
  }) + "\n");
}
```

Each runner's `onLine` callback is bound to its participant name at creation
time in the factory:

```js
onLine: (line) => facilitator.emitLine(agent.name, line),
// and for the facilitator runner:
onLine: (line) => facilitator.emitLine("facilitator", line),
```

The `SequenceCounter.next()` call is atomic within JS's single-threaded
execution model — no two `emitLine` calls interleave.

### 1f. Redirect handling

When the facilitator calls `Redirect({ to: "all", message })`, the handler sets
`ctx.redirect`. The facilitator event loop checks `ctx.redirect` after each
facilitator turn and broadcasts the redirect:

- `to: "all"` — abort all agent sessions, deliver redirect message via
  `messageBus.share("facilitator", message)`, resume agents
- `to: name` — abort the named agent, deliver via
  `messageBus.tell("facilitator", name, message)`, resume agent

### 1g. Factory function

```js
import { Writable } from "node:stream";
const devNull = new Writable({ write(_chunk, _enc, cb) { cb(); } });

export function createFacilitator({
  facilitatorCwd, agentConfigs, query, output, model, maxTurns,
  facilitatorProfile,
}) {
  const ctx = createOrchestrationContext();
  const messageBus = createMessageBus({
    participants: ["facilitator", ...agentConfigs.map(a => a.name)],
  });
  ctx.messageBus = messageBus;
  ctx.participants = [
    { name: "facilitator", role: "facilitator" },
    ...agentConfigs.map(a => ({ name: a.name, role: a.role })),
  ];

  let facilitator; // forward-reference

  const eventQueue = createAsyncQueue();

  // Create facilitator MCP server
  const facilitatorServer = createFacilitatorToolServer(ctx);

  // Create agent MCP servers + runners
  const agents = agentConfigs.map(config => {
    const agentServer = createFacilitatedAgentToolServer(ctx, {
      from: config.name,
      onAsk: async (question) => {
        const { promise, resolve } = Promise.withResolvers();
        eventQueue.enqueue({ type: "ask", from: config.name, question, resolve });
        return promise;
      },
    });

    const runner = createAgentRunner({
      cwd: config.cwd,
      query,
      output: devNull,
      model,
      maxTurns: config.maxTurns ?? 50,
      allowedTools: config.allowedTools,
      onLine: (line) => facilitator.emitLine(config.name, line),
      mcpServers: { orchestration: agentServer },
      settingSources: ["project"],
      agentProfile: config.agentProfile,
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append: FACILITATED_AGENT_SYSTEM_PROMPT,
      },
    });

    return { name: config.name, role: config.role, runner };
  });

  const facilitatorRunner = createAgentRunner({
    cwd: facilitatorCwd,
    query,
    output: devNull,
    model,
    maxTurns: maxTurns ?? 20,
    onLine: (line) => facilitator.emitLine("facilitator", line),
    mcpServers: { orchestration: facilitatorServer },
    settingSources: ["project"],
    agentProfile: facilitatorProfile,
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append: FACILITATOR_SYSTEM_PROMPT,
    },
  });

  facilitator = new Facilitator({
    facilitatorRunner, agents, messageBus, output, maxTurns, ctx, eventQueue,
  });
  return facilitator;
}
```

### 1h. System prompts

```js
export const FACILITATOR_SYSTEM_PROMPT =
  "You coordinate multiple agents working on a shared task. Use Tell to " +
  "assign work to individual agents. Use Share to broadcast to all. Use " +
  "Redirect to interrupt and correct agents. Use RollCall to see who is " +
  "available. Use Conclude with a summary when the task is done. Agents " +
  "communicate with you via Share and may Ask you questions directly.";

export const FACILITATED_AGENT_SYSTEM_PROMPT =
  "You are one of several agents working on a shared task under a " +
  "facilitator's coordination. Use Share to broadcast findings. Use Tell " +
  "to message a specific participant. Use Ask to ask the facilitator a " +
  "question (you will block until answered). Use RollCall to see who " +
  "else is working. The facilitator may Redirect you with new instructions " +
  "— treat redirections as authoritative.";
```

### 1i. AsyncQueue utility

A simple async FIFO queue used by the facilitator event loop. Implement inline
in `facilitator.js` (not worth a separate module for one consumer):

```js
function createAsyncQueue() {
  const items = [];
  let waiter = null;
  let closed = false;
  return {
    enqueue(item) {
      items.push(item);
      if (waiter) { waiter(); waiter = null; }
    },
    async dequeue() {
      if (items.length > 0) return items.shift();
      if (closed) return null;
      await new Promise(resolve => { waiter = resolve; });
      return items.length > 0 ? items.shift() : null;
    },
    close() {
      closed = true;
      if (waiter) { waiter(); waiter = null; }
    },
  };
}
```

`close()` is called by the `Conclude` handler (via the context). When the
facilitator calls `Conclude`, the handler sets `ctx.concluded` and calls
`eventQueue.close()`. The facilitator event loop's `dequeue()` returns `null`,
the loop checks `ctx.concluded` and exits. Any pending `Ask` requests that have
not yet been dequeued should be rejected with a structured "session concluded"
message before the queue closes.

## Step 2: Facilitate CLI command

**Create:** `src/commands/facilitate.js`

Parse CLI options and wire the facilitator:

```js
export async function runFacilitateCommand(values, _args) {
  // Parse task (same pattern as run/supervise)
  // Parse agent configs from --agents flag:
  //   --agents "explorer:cwd=/tmp/a,tester:cwd=/tmp/b"
  // Parse facilitator options
  // Create output (TeeWriter or stdout)
  // Wire createFacilitator
  // Run and exit
}
```

**CLI options:**

| Flag                    | Type   | Description                             |
| ----------------------- | ------ | --------------------------------------- |
| `--task-file`           | string | Path to task file                       |
| `--task-text`           | string | Inline task text                        |
| `--task-amend`          | string | Additional text appended to task        |
| `--model`               | string | Claude model (default: opus)            |
| `--max-turns`           | string | Max facilitator LLM turns (default: 20) |
| `--output`              | string | Write NDJSON trace to file              |
| `--facilitator-cwd`     | string | Facilitator working directory           |
| `--facilitator-profile` | string | Facilitator agent profile name          |
| `--agents`              | string | Agent configs (see format below)        |

**Agent config format:** Comma-separated `name:key=value` pairs. Each agent gets
a name and optional overrides:

```
--agents "explorer:cwd=/tmp/a:role=explorer,tester:cwd=/tmp/b:role=tester"
```

Defaults: `cwd` = temp directory, `role` = agent name, `maxTurns` = 50,
`allowedTools` = standard set.

**Modify:** `bin/fit-eval.js`

Register the `facilitate` command in the `definition.commands` array and the
`COMMANDS` map:

```js
import { runFacilitateCommand } from "../src/commands/facilitate.js";

// In definition.commands:
{
  name: "facilitate",
  args: "",
  description: "Run a facilitated multi-agent session",
  options: { /* as above */ },
}

// In COMMANDS:
facilitate: runFacilitateCommand,
```

## Step 3: Update index exports

**Modify:** `src/index.js`

Add facilitator exports (Part 2 already added infrastructure exports):

```js
export {
  Facilitator,
  createFacilitator,
  FACILITATOR_SYSTEM_PROMPT,
  FACILITATED_AGENT_SYSTEM_PROMPT,
} from "./facilitator.js";
```

## Step 4: Tests

**Create:** `test/facilitator.test.js`

Core orchestration tests using mock runners:

- **Lazy start:** Agents don't start until they receive their first message.
  Facilitator calls `Tell` → agent starts.
- **Conclude:** Facilitator calls `Conclude({ summary })` → all sessions
  terminate → `run()` returns `{ success: true }`.
- **Fail-fast:** One agent errors → all others are aborted → `run()` throws.
- **Turn 0 conclude:** Facilitator concludes immediately → no agents start.
- **Trace envelope:** All events wrapped in `{ source, seq, event }`. Filtering
  by source extracts coherent single-participant trace. Seq is globally
  monotonic.

**Create:** `test/facilitator-messaging.test.js`

MessageBus integration tests within the Facilitator context:

- **Share delivery:** Agent A calls `Share` → agent B sees it on next turn.
  Facilitator sees shared messages.
- **Tell delivery:** Agent A calls `Tell(to: "agent-b")` → only agent-b receives
  it. Facilitator does not see agent-to-agent directs.
- **RollCall:** Agent calls `RollCall` → receives participant list.
- **Redirect all:** Facilitator calls `Redirect({ to: "all" })` → all agents
  interrupted and resumed.
- **Redirect one:** Facilitator calls `Redirect({ to: "agent-1" })` → only
  agent-1 interrupted.
- **Ask:** Agent calls `Ask` → facilitator receives question → answers → agent's
  tool_result contains answer.
- **Concurrent Ask:** Two agents call `Ask` simultaneously → facilitator handles
  FIFO → both get answers.

## Ordering

1. Facilitator class (step 1) — the core implementation
2. CLI command (step 2) — wiring only, depends on step 1
3. Index exports (step 3) — mechanical
4. Tests (step 4) — depends on all code

## Verification

`bun run --filter=@forwardimpact/libeval test` passes. The facilitate command is
callable: `bunx fit-eval facilitate --help` prints usage. New tests cover lazy
start, conclude, fail-fast, messaging, ask serialization, and trace envelope.
