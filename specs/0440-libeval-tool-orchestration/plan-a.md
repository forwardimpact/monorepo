# 440 — Plan: Tool-Based Orchestration and Facilitated Group Work

## Approach

Three-part implementation following the dependency graph: shared infrastructure
first, then supervisor migration and facilitator in parallel.

The design specifies three new components (OrchestrationToolkit,
SequenceCounter, MessageBus), one major rewrite (Supervisor), one new class
(Facilitator), and mechanical changes to TraceCollector, TeeWriter, and the CLI.
The implementation sequences these to maximize parallelism after the foundation
lands.

**Part 1 first** because everything else depends on it — the toolkit, counter,
bus, and AgentRunner `mcpServers` support are shared infrastructure.

**Parts 2 and 3 in parallel** because they're structurally independent:
Supervisor changes touch the relay loop and text-token detection (existing
code), while Facilitator is entirely new code. Both consume Part 1's
infrastructure but don't interact with each other.

**In-process MCP servers via SDK's `createSdkMcpServer`** — the Claude Agent SDK
provides an in-process MCP server that runs tool handlers without stdio
transport. The SDK's `tool()` helper defines tools with Zod schemas. Each
participant gets its own MCP server exposing role-appropriate tools.

**Context object over EventEmitter** (design decision) — handlers set
flags/state on a shared context object. The orchestrator reads context at
natural checkpoints (after supervisor `resume()`, after `onBatch`). No event
subscription needed.

## Parts

| Part               | Scope                                                                                                        | Agent          |
| ------------------ | ------------------------------------------------------------------------------------------------------------ | -------------- |
| [01](plan-a-01.md) | Infrastructure: SequenceCounter, OrchestrationToolkit, MessageBus, AgentRunner `mcpServers`                  | staff-engineer |
| [02](plan-a-02.md) | Supervisor migration: tool-based signaling, unified trace envelope, TeeWriter, run command envelope, exports | staff-engineer |
| [03](plan-a-03.md) | Facilitator class, facilitate CLI command, exports                                                           | staff-engineer |

## Dependencies

```
Part 1 ─┬─→ Part 2 (supervisor uses toolkit + counter)
        └─→ Part 3 (facilitator uses toolkit + counter + bus)
```

Parts 2 and 3 are independent after Part 1 merges.

## Blast Radius

### Created

| File                                 | Part |
| ------------------------------------ | ---- |
| `src/sequence-counter.js`            | 1    |
| `src/orchestration-toolkit.js`       | 1    |
| `src/message-bus.js`                 | 1    |
| `test/sequence-counter.test.js`      | 1    |
| `test/orchestration-toolkit.test.js` | 1    |
| `test/message-bus.test.js`           | 1    |
| `src/facilitator.js`                 | 3    |
| `src/commands/facilitate.js`         | 3    |
| `test/facilitator.test.js`           | 3    |
| `test/facilitator-messaging.test.js` | 3    |

All paths relative to `libraries/libeval/`.

### Modified

| File                                   | Part | Nature                                                         |
| -------------------------------------- | ---- | -------------------------------------------------------------- |
| `package.json`                         | 1    | Add `zod` dependency                                           |
| `src/agent-runner.js`                  | 1    | Add `mcpServers` constructor param                             |
| `src/supervisor.js`                    | 2    | Major rewrite — remove text tokens, wire tools, `turn` → `seq` |
| `src/trace-collector.js`               | 2    | Mechanical — unwrap `seq` (rename only, logic unchanged)       |
| `src/tee-writer.js`                    | 2    | Unify envelope handling across modes                           |
| `src/commands/run.js`                  | 2    | Wrap events with `{ source, seq, event }` envelope             |
| `src/index.js`                         | 2+3  | Remove old exports, add new exports                            |
| `bin/fit-eval.js`                      | 3    | Register `facilitate` command                                  |
| `test/mock-runner.js`                  | 2    | Add tool dispatcher for orchestration tool calls               |
| `test/supervisor-run.test.js`          | 2    | Rewrite for tool-based completion                              |
| `test/supervisor-intervention.test.js` | 2    | Rewrite for tool-based redirect                                |
| `test/supervisor-batching.test.js`     | 2    | Update mid-turn review expectations                            |
| `test/supervisor-output.test.js`       | 2    | Update envelope format (`seq`, not `turn`)                     |
| `test/tee-writer.test.js`              | 2    | Update for unified envelope                                    |
| `test/trace-collector.test.js`         | 2    | Update fixture expectations                                    |
| `test/agent-runner.test.js`            | 1    | Test `mcpServers` passthrough                                  |

### Deleted

No files deleted. Code removed from existing files (see Part 2 for specifics).

## Libraries Used

| Package                          | Exports Used                                                         |
| -------------------------------- | -------------------------------------------------------------------- |
| `@anthropic-ai/claude-agent-sdk` | `createSdkMcpServer`, `tool`, `query` (existing)                     |
| `@forwardimpact/libcli`          | `createCli` (existing, no new usage)                                 |
| `@forwardimpact/libtelemetry`    | `createLogger` (existing, no new usage)                              |
| `zod`                            | `z` (new dependency — tool input schemas for MCP server definitions) |

No new `@forwardimpact/lib*` packages are introduced. `zod` is added as a direct
dependency of libeval; it is already in the lockfile via
`@modelcontextprotocol/sdk`.

## Risks

1. **Ask tool blocks the agent iterator.** When the agent calls `Ask`, the SDK
   blocks waiting for the MCP handler to return. The handler runs the supervisor
   inline (calling `supervisorRunner.resume()`). During this time, no agent
   events flow. This is correct by design — the agent waits for its answer — but
   the handler must catch supervisor errors and return a structured error
   message rather than throwing, or the agent's tool_result will be an opaque
   SDK error.

2. **Mock runner enhancement for tests.** Tests bypass the SDK, so orchestration
   `tool_use` blocks in mocked responses need manual dispatch to handlers. The
   mock-runner must be enhanced with a tool dispatcher callback. Ask flow
   testing is more complex because the handler itself calls the supervisor mock
   — requiring coordinated scripted responses across both runners.

3. **TeeWriter unified envelope.** After migration, TeeWriter always receives
   enveloped events `{ source, seq, event }`. The run command wraps events
   before they reach the TeeWriter. The `mode` parameter distinction simplifies
   to display formatting (source labels for multi-participant traces) rather
   than envelope format.

4. **Facilitator Ask serialization.** Multiple concurrent agents may call `Ask`
   simultaneously. The facilitator processes these FIFO — each Ask blocks its
   calling agent until answered. The queue must handle the case where the
   facilitator calls `Conclude` while Ask requests are pending (reject remaining
   requests with a structured message).

## Execution

Part 1 runs first as a single `staff-engineer` agent. After Part 1 merges, Parts
2 and 3 launch as concurrent `staff-engineer` sub-agents. All three parts are
code and infrastructure — no documentation changes required, so
`technical-writer` is not needed.
