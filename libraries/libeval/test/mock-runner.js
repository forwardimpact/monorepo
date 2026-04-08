/**
 * Test-only mock factory for AgentRunner. Yields pre-scripted responses,
 * and (when an `onBatch` callback is set) fires it at the same boundaries
 * the real AgentRunner would: assistant messages with at least one text
 * block, and the terminal `result` message. If the callback calls
 * `abort()`, the mock stops iterating that response's messages and
 * reports `aborted: true`.
 *
 * Intentionally a regular module (not a test file) so describe/test blocks
 * here would not run. Lives under test/ to make its scope explicit.
 */

import { PassThrough } from "node:stream";
import { AgentRunner } from "@forwardimpact/libeval";

/**
 * Whether a scripted message should trigger an onBatch flush. Mirrors the
 * real AgentRunner: assistant-with-text-block or terminal `result` message.
 * Tool-only or string-content messages accumulate without flushing.
 * @param {object} message
 * @returns {boolean}
 */
export function shouldFlush(message) {
  if (message.type === "result") return true;
  if (message.type !== "assistant") return false;
  const content = message.message?.content ?? message.content;
  if (!Array.isArray(content)) return false;
  for (const block of content) {
    if (block.type === "text" && block.text) return true;
  }
  return false;
}

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
    for (const m of msgs) {
      const line = JSON.stringify(m);
      runner.buffer.push(line);
      if (runner.onLine) runner.onLine(line);
      if (runner.onBatch && shouldFlush(m)) {
        await runner.onBatch([line], {
          abort: () => {
            aborted = true;
          },
        });
        if (aborted) break;
      }
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
