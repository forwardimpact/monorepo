/**
 * Test-only mock factory for AgentRunner. It yields pre-scripted
 * responses. It dispatches any embedded `tool_use` blocks through
 * `toolDispatcher`. Orchestration tests can then exercise the Ask /
 * Answer / Announce flow without a real SDK.
 *
 * This file is deliberately a regular module and not a `.test.js` file.
 * So describe and test blocks here do not run. It lives under test/ to
 * make its scope explicit.
 */

import { PassThrough } from "node:stream";
import { AgentRunner } from "@forwardimpact/libharness";
import { createNoopRedactor } from "../src/redaction.js";

async function dispatchTools(toolDispatcher, message) {
  if (!toolDispatcher || message.type !== "assistant") return;
  const content = message.message?.content ?? message.content ?? [];
  if (!Array.isArray(content)) return;
  for (const block of content) {
    if (block.type === "tool_use" && toolDispatcher[block.name]) {
      await toolDispatcher[block.name](block.input);
    }
  }
}

/**
 * Create a mock AgentRunner that yields pre-scripted responses. Each
 * call to `run()` or `resume()` pops the next response from the array.
 *
 * @param {Array<{text: string, success?: boolean}>} responses
 * @param {object[][]} [messages] - Per-call message arrays. Each entry
 *   is the list of SDK messages the runner emits for that call. If you
 *   omit it, the factory synthesises a single
 *   `{type:"assistant", content: resp.text}` per call.
 * @param {object} [opts]
 * @param {Record<string, function>} [opts.toolDispatcher] - Map of tool
 *   name to handler. The runner calls it for every `tool_use` block in
 *   the script.
 */
export function createMockRunner(responses, messages, { toolDispatcher } = {}) {
  const output = new PassThrough();
  let callIndex = 0;

  const runner = new AgentRunner({
    cwd: "/tmp",
    query: async function* () {},
    output,
    redactor: createNoopRedactor(),
  });

  const consume = async (msgs) => {
    for (const m of msgs) {
      if (runner.onLine) runner.onLine(JSON.stringify(m));
      await dispatchTools(toolDispatcher, m);
    }
  };

  const callOnce = async () => {
    const resp = responses[callIndex++];
    const msgs = messages?.[callIndex - 1] ?? [
      { type: "assistant", content: resp.text },
    ];
    await consume(msgs);
    runner.sessionId ??= "mock-session";
    return {
      success: resp.success ?? true,
      text: resp.text,
      sessionId: runner.sessionId,
      aborted: false,
      error: null,
    };
  };

  runner.run = callOnce;
  runner.resume = callOnce;
  return runner;
}
