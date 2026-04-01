import { describe, test } from "node:test";
import assert from "node:assert";
import { PassThrough } from "node:stream";

import { AgentRunner, createAgentRunner } from "@forwardimpact/libeval";

/**
 * Create a mock query function that yields canned messages.
 * @param {object[]} messages - Messages to yield
 * @param {function} [captureOptions] - Callback to capture query options
 * @returns {function}
 */
function mockQuery(messages, captureOptions) {
  return async function* (params) {
    if (captureOptions) captureOptions(params);
    for (const msg of messages) {
      yield msg;
    }
  };
}

/**
 * Collect all NDJSON lines written to a PassThrough stream.
 * @param {PassThrough} stream
 * @returns {string[]}
 */
function collectLines(stream) {
  const data = stream.read();
  if (!data) return [];
  return data
    .toString()
    .trim()
    .split("\n")
    .filter((l) => l.length > 0);
}

describe("AgentRunner", () => {
  test("constructor throws on missing cwd", () => {
    assert.throws(
      () =>
        new AgentRunner({
          query: async function* () {},
          output: new PassThrough(),
        }),
      /cwd is required/,
    );
  });

  test("constructor throws on missing query", () => {
    assert.throws(
      () => new AgentRunner({ cwd: "/tmp", output: new PassThrough() }),
      /query is required/,
    );
  });

  test("constructor throws on missing output", () => {
    assert.throws(
      () =>
        new AgentRunner({
          cwd: "/tmp",
          query: async function* () {},
        }),
      /output is required/,
    );
  });

  test("constructor uses defaults for optional params", () => {
    const runner = new AgentRunner({
      cwd: "/tmp",
      query: async function* () {},
      output: new PassThrough(),
    });
    assert.strictEqual(runner.model, "opus");
    assert.strictEqual(runner.maxTurns, 50);
    assert.deepStrictEqual(runner.allowedTools, [
      "Bash",
      "Read",
      "Glob",
      "Grep",
      "Write",
      "Edit",
    ]);
    assert.strictEqual(runner.permissionMode, "bypassPermissions");
    assert.strictEqual(runner.sessionId, null);
  });

  test("run() writes NDJSON lines to output stream", async () => {
    const messages = [
      { type: "system", subtype: "init", session_id: "sess-1" },
      { type: "assistant", content: "Working on it..." },
      { type: "result", subtype: "success", result: "Done." },
    ];

    const output = new PassThrough();
    const runner = new AgentRunner({
      cwd: "/tmp",
      query: mockQuery(messages),
      output,
    });

    const result = await runner.run("Test task");
    const lines = collectLines(output);

    assert.strictEqual(lines.length, 3);
    assert.deepStrictEqual(JSON.parse(lines[0]), messages[0]);
    assert.deepStrictEqual(JSON.parse(lines[1]), messages[1]);
    assert.deepStrictEqual(JSON.parse(lines[2]), messages[2]);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.text, "Done.");
    assert.strictEqual(result.sessionId, "sess-1");
  });

  test("run() captures sessionId from init event", async () => {
    const messages = [
      { type: "system", subtype: "init", session_id: "my-session" },
      { type: "result", subtype: "success", result: "OK" },
    ];

    const output = new PassThrough();
    const runner = new AgentRunner({
      cwd: "/tmp",
      query: mockQuery(messages),
      output,
    });

    await runner.run("Task");
    assert.strictEqual(runner.sessionId, "my-session");
  });

  test("run() passes options to query", async () => {
    let captured = null;
    const query = mockQuery(
      [{ type: "result", subtype: "success", result: "OK" }],
      (params) => {
        captured = params;
      },
    );

    const output = new PassThrough();
    const runner = new AgentRunner({
      cwd: "/work",
      query,
      output,
      model: "sonnet",
      maxTurns: 10,
      allowedTools: ["Read", "Grep"],
      permissionMode: "plan",
    });

    await runner.run("My task");

    assert.strictEqual(captured.prompt, "My task");
    assert.strictEqual(captured.options.cwd, "/work");
    assert.strictEqual(captured.options.model, "sonnet");
    assert.strictEqual(captured.options.maxTurns, 10);
    assert.deepStrictEqual(captured.options.allowedTools, ["Read", "Grep"]);
    assert.strictEqual(captured.options.permissionMode, "plan");
    assert.strictEqual(captured.options.allowDangerouslySkipPermissions, true);
  });

  test("run() returns success=false on non-success subtype", async () => {
    const messages = [{ type: "result", subtype: "error", result: "Stopped" }];

    const output = new PassThrough();
    const runner = new AgentRunner({
      cwd: "/tmp",
      query: mockQuery(messages),
      output,
    });

    const result = await runner.run("Task");
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.text, "Stopped");
  });

  test("resume() passes sessionId via options.resume", async () => {
    let resumeCapture = null;

    const initMessages = [
      { type: "system", subtype: "init", session_id: "sess-42" },
      { type: "result", subtype: "success", result: "First done" },
    ];

    let callCount = 0;
    const query = async function* (params) {
      callCount++;
      if (callCount === 1) {
        for (const m of initMessages) yield m;
      } else {
        resumeCapture = params;
        yield { type: "result", subtype: "success", result: "Resumed" };
      }
    };

    const output = new PassThrough();
    const runner = new AgentRunner({ cwd: "/tmp", query, output });

    await runner.run("Initial task");
    const result = await runner.resume("Follow up");

    assert.strictEqual(resumeCapture.options.resume, "sess-42");
    assert.strictEqual(resumeCapture.prompt, "Follow up");
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.text, "Resumed");
  });

  test("drainOutput() returns buffered lines and clears buffer", async () => {
    const messages = [
      { type: "assistant", content: "Line 1" },
      { type: "result", subtype: "success", result: "Line 2" },
    ];

    const output = new PassThrough();
    const runner = new AgentRunner({
      cwd: "/tmp",
      query: mockQuery(messages),
      output,
    });

    await runner.run("Task");

    const drained = runner.drainOutput();
    assert.strictEqual(drained.length, 2);
    assert.deepStrictEqual(JSON.parse(drained[0]), messages[0]);
    assert.deepStrictEqual(JSON.parse(drained[1]), messages[1]);

    // Buffer should be empty after drain
    const secondDrain = runner.drainOutput();
    assert.strictEqual(secondDrain.length, 0);
  });

  test("run() captures error when query throws and returns buffered output", async () => {
    async function* failingQuery() {
      yield { type: "system", subtype: "init", session_id: "sess-err" };
      yield { type: "assistant", content: "Partial work" };
      throw new Error("Claude Code process exited with code 1");
    }

    const output = new PassThrough();
    const runner = new AgentRunner({
      cwd: "/tmp",
      query: () => failingQuery(),
      output,
    });

    const result = await runner.run("Task");
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
    assert.match(result.error.message, /exited with code 1/);
    assert.strictEqual(result.sessionId, "sess-err");

    // Buffered output should contain the messages yielded before the error
    const drained = runner.drainOutput();
    assert.strictEqual(drained.length, 2);
  });

  test("resume() captures error when query throws", async () => {
    const initMessages = [
      { type: "system", subtype: "init", session_id: "sess-r" },
      { type: "result", subtype: "success", result: "OK" },
    ];

    let callCount = 0;
    const query = async function* () {
      callCount++;
      if (callCount === 1) {
        for (const m of initMessages) yield m;
      } else {
        yield { type: "assistant", content: "Resuming..." };
        throw new Error("Process crashed");
      }
    };

    const output = new PassThrough();
    const runner = new AgentRunner({ cwd: "/tmp", query, output });

    await runner.run("Task");
    const result = await runner.resume("Continue");
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
    assert.match(result.error.message, /Process crashed/);
  });

  test("run() succeeds when SDK throws after emitting successful result", async () => {
    async function* creditExhaustedQuery() {
      yield { type: "system", subtype: "init", session_id: "sess-credit" };
      yield { type: "assistant", content: "Analysis complete." };
      yield { type: "result", subtype: "success", result: "Done." };
      throw new Error("Credit balance is too low");
    }

    const output = new PassThrough();
    const runner = new AgentRunner({
      cwd: "/tmp",
      query: () => creditExhaustedQuery(),
      output,
    });

    const result = await runner.run("Task");
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.text, "Done.");
    assert.ok(result.error);
    assert.match(result.error.message, /Credit balance/);
  });

  test("createAgentRunner factory returns an AgentRunner instance", () => {
    const runner = createAgentRunner({
      cwd: "/tmp",
      query: async function* () {},
      output: new PassThrough(),
    });
    assert.ok(runner instanceof AgentRunner);
  });
});
