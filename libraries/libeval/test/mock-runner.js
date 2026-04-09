/**
 * Test-only mock factory for AgentRunner. Yields pre-scripted responses,
 * and (when an `onBatch` callback is set) fires it at the same boundaries
 * the real AgentRunner would: every `runner.batchSize` assistant messages
 * with a text block, and the terminal `result` message. Tool-only
 * assistant messages accumulate into the pending batch without counting
 * toward the threshold. If the callback calls `abort()`, the mock stops
 * iterating that response's messages and reports `aborted: true` — any
 * lines that never made it through a flush boundary then ship in a
 * terminal batch, mirroring the real runner's finally-flush.
 *
 * Intentionally a regular module (not a test file) so describe/test blocks
 * here would not run. Lives under test/ to make its scope explicit.
 */

import { PassThrough } from "node:stream";
import { AgentRunner } from "@forwardimpact/libeval";
import { hasTextBlock } from "../src/agent-runner.js";

/**
 * Create a mock AgentRunner that yields pre-scripted responses. Each call
 * to `run()` or `resume()` pops the next response from the array.
 * @param {object[]} responses - Array of {text, success} objects
 * @param {object[]} [messages] - Messages to buffer per response
 * @returns {AgentRunner}
 */
export function createMockRunner(responses, messages) {
  const output = new PassThrough();
  let callIndex = 0;

  const runner = new AgentRunner({
    cwd: "/tmp",
    query: async function* () {},
    output,
  });

  const consume = async (msgs) => {
    let aborted = false;
    const pendingBatch = [];
    let assistantTextCount = 0;
    for (const m of msgs) {
      const line = JSON.stringify(m);
      runner.buffer.push(line);
      if (runner.onLine) runner.onLine(line);
      if (runner.onBatch) pendingBatch.push(line);

      if (hasTextBlock(m)) {
        assistantTextCount++;
      }

      const shouldFlush =
        runner.onBatch &&
        (m.type === "result" || assistantTextCount >= runner.batchSize);
      if (shouldFlush) {
        assistantTextCount = 0;
        const batchLines = pendingBatch.splice(0);
        await runner.onBatch(batchLines, {
          abort: () => {
            aborted = true;
          },
        });
        if (aborted) break;
      }
    }
    // Terminal flush: mirror the real AgentRunner's abnormal-end path —
    // an aborted scripted run delivers any pending tail so the supervisor
    // sees the partial state. Natural-end without a `result` marker is
    // treated as a simplified stub (no phantom flush), matching the real
    // runner's rule that terminal flush only fires on error/abort.
    if (aborted && runner.onBatch && pendingBatch.length > 0) {
      const batchLines = pendingBatch.splice(0);
      await runner.onBatch(batchLines, {
        abort: () => {
          aborted = true;
        },
      });
    }
    return aborted;
  };

  runner.run = async (_task) => {
    const resp = responses[callIndex++];
    const msgs = messages?.[callIndex - 1] ?? [
      { type: "assistant", content: resp.text },
    ];
    const aborted = await consume(msgs);
    runner.sessionId = "mock-session";
    return {
      success: resp.success ?? true,
      text: resp.text,
      sessionId: "mock-session",
      aborted,
      error: null,
    };
  };

  runner.resume = async (_prompt) => {
    const resp = responses[callIndex++];
    const msgs = messages?.[callIndex - 1] ?? [
      { type: "assistant", content: resp.text },
    ];
    const aborted = await consume(msgs);
    return {
      success: resp.success ?? true,
      text: resp.text,
      sessionId: runner.sessionId,
      aborted,
      error: null,
    };
  };

  return runner;
}
