import { describe, test } from "node:test";
import assert from "node:assert";
import { PassThrough } from "node:stream";

import { AgentRunner, createAgentRunner } from "@forwardimpact/libharness";
import { createNoopRedactor } from "../src/redaction.js";
import { createMockAgentQuery as mockQuery } from "@forwardimpact/libmock";
import { AGENT_MODEL } from "@forwardimpact/libutil/models";

const noop = () => createNoopRedactor();

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

  test("constructor throws on missing redactor", () => {
    assert.throws(
      () =>
        new AgentRunner({
          cwd: "/tmp",
          query: async function* () {},
          output: new PassThrough(),
        }),
      /redactor is required/,
    );
  });

  test("constructor uses defaults for optional params", () => {
    const runner = new AgentRunner({
      cwd: "/tmp",
      query: async function* () {},
      output: new PassThrough(),
      redactor: noop(),
    });
    assert.strictEqual(runner.model, AGENT_MODEL);
    assert.strictEqual(runner.maxTurns, 50);
    assert.deepStrictEqual(runner.allowedTools, [
      "Bash",
      "Read",
      "Glob",
      "Grep",
      "Write",
      "Edit",
    ]);
    assert.deepStrictEqual(runner.settingSources, []);
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
      redactor: noop(),
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
      redactor: noop(),
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
      settingSources: ["project"],
      redactor: noop(),
    });

    await runner.run("My task");

    assert.strictEqual(captured.prompt, "My task");
    assert.strictEqual(captured.options.cwd, "/work");
    assert.strictEqual(captured.options.model, "sonnet");
    assert.strictEqual(captured.options.maxTurns, 10);
    assert.deepStrictEqual(captured.options.allowedTools, ["Read", "Grep"]);
    assert.strictEqual(captured.options.permissionMode, "bypassPermissions");
    assert.strictEqual(captured.options.allowDangerouslySkipPermissions, true);
    assert.deepStrictEqual(captured.options.settingSources, ["project"]);
  });

  test("run() forwards maxTurns=0 as MAX_SAFE_INTEGER (unlimited)", async () => {
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
      maxTurns: 0,
      redactor: noop(),
    });

    await runner.run("Task");

    assert.strictEqual(captured.options.maxTurns, Number.MAX_SAFE_INTEGER);
  });

  test("run() returns success=false on non-success subtype", async () => {
    const messages = [{ type: "result", subtype: "error", result: "Stopped" }];

    const output = new PassThrough();
    const runner = new AgentRunner({
      cwd: "/tmp",
      query: mockQuery(messages),
      output,
      redactor: noop(),
    });

    const result = await runner.run("Task");
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.text, "Stopped");
  });

  test("run() returns success=false when result reports success but did no model work", async () => {
    // The SDK reports a failed init (e.g. invalid API key) as a clean
    // "success" with zero turns, zero cost, and zero token usage. That must
    // not pass as a green run — require evidence the model actually ran.
    const messages = [
      { type: "system", subtype: "init", session_id: "sess-noauth" },
      {
        type: "result",
        subtype: "success",
        result: "",
        num_turns: 1,
        total_cost_usd: 0,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    ];

    const output = new PassThrough();
    const runner = new AgentRunner({
      cwd: "/tmp",
      query: mockQuery(messages),
      output,
      redactor: noop(),
    });

    const result = await runner.run("Task");
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
    assert.match(result.error.message, /no model work|authentication/i);
  });

  test("run() returns success=true when result reports success with real token usage", async () => {
    const messages = [
      { type: "system", subtype: "init", session_id: "sess-ok" },
      {
        type: "result",
        subtype: "success",
        result: "Done.",
        num_turns: 5,
        total_cost_usd: 0.0523,
        usage: { input_tokens: 350, output_tokens: 42 },
      },
    ];

    const output = new PassThrough();
    const runner = new AgentRunner({
      cwd: "/tmp",
      query: mockQuery(messages),
      output,
      redactor: noop(),
    });

    const result = await runner.run("Task");
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.error, null);
  });

  test("run() returns success=false when result is flagged is_error despite success subtype", async () => {
    const messages = [
      {
        type: "result",
        subtype: "success",
        is_error: true,
        result: "",
        total_cost_usd: 0.01,
        usage: { input_tokens: 100, output_tokens: 5 },
      },
    ];

    const output = new PassThrough();
    const runner = new AgentRunner({
      cwd: "/tmp",
      query: mockQuery(messages),
      output,
      redactor: noop(),
    });

    const result = await runner.run("Task");
    assert.strictEqual(result.success, false);
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
    const runner = new AgentRunner({
      cwd: "/tmp",
      query,
      output,
      redactor: noop(),
    });

    await runner.run("Initial task");
    const result = await runner.resume("Follow up");

    assert.strictEqual(resumeCapture.options.resume, "sess-42");
    assert.strictEqual(resumeCapture.options.model, AGENT_MODEL);
    assert.strictEqual(resumeCapture.prompt, "Follow up");
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.text, "Resumed");
  });

  test("resume() forwards every per-call option that run() forwards", async () => {
    // Regression: SDK options are call-attached, not session-attached
    // (sdk.d.ts:1027-1507). Resume that drops cwd, allowedTools,
    // disallowedTools, systemPrompt, settingSources, or maxTurns lets the
    // agent silently lose its sandbox, tool restrictions, persona, CLAUDE.md
    // loading, or turn budget between turns. The cwd case was the original
    // bug — the session lookup fails with "No conversation found with session
    // ID: …" because the SDK falls back to process.cwd(). The others are
    // silent correctness failures (tools/prompt/settings drift on resume).
    let resumeCapture = null;
    let callCount = 0;
    const query = async function* (params) {
      callCount++;
      if (callCount === 1) {
        yield { type: "system", subtype: "init", session_id: "sess-opts" };
        yield { type: "result", subtype: "success", result: "First done" };
      } else {
        resumeCapture = params;
        yield { type: "result", subtype: "success", result: "Resumed" };
      }
    };

    const customSystemPrompt = {
      type: "preset",
      preset: "claude_code",
      append: "You are a test agent.",
    };
    const output = new PassThrough();
    const runner = new AgentRunner({
      cwd: "/tmp/agent-sandbox",
      query,
      output,
      model: "sonnet",
      maxTurns: 17,
      allowedTools: ["Read", "Grep"],
      disallowedTools: ["Bash", "WebFetch"],
      systemPrompt: customSystemPrompt,
      settingSources: ["project"],
      mcpServers: { orchestration: { command: "stub" } },
      redactor: noop(),
    });

    await runner.run("Initial task");
    await runner.resume("Follow up");

    const opts = resumeCapture.options;
    assert.strictEqual(opts.cwd, "/tmp/agent-sandbox");
    assert.strictEqual(opts.model, "sonnet");
    assert.strictEqual(opts.maxTurns, 17);
    assert.deepStrictEqual(opts.allowedTools, ["Read", "Grep"]);
    assert.deepStrictEqual(opts.disallowedTools, ["Bash", "WebFetch"]);
    assert.deepStrictEqual(opts.systemPrompt, customSystemPrompt);
    assert.deepStrictEqual(opts.settingSources, ["project"]);
    assert.strictEqual(opts.permissionMode, "bypassPermissions");
    assert.strictEqual(opts.allowDangerouslySkipPermissions, true);
    assert.strictEqual(opts.resume, "sess-opts");
    assert.deepStrictEqual(opts.mcpServers, {
      orchestration: { command: "stub" },
    });
  });

  test("resume() maps maxTurns=0 to MAX_SAFE_INTEGER like run() does", async () => {
    let resumeCapture = null;
    let callCount = 0;
    const query = async function* (params) {
      callCount++;
      if (callCount === 1) {
        yield { type: "system", subtype: "init", session_id: "sess-mt0" };
        yield { type: "result", subtype: "success", result: "OK" };
      } else {
        resumeCapture = params;
        yield { type: "result", subtype: "success", result: "Resumed" };
      }
    };

    const output = new PassThrough();
    const runner = new AgentRunner({
      cwd: "/tmp",
      query,
      output,
      maxTurns: 0,
      redactor: noop(),
    });

    await runner.run("Task");
    await runner.resume("Continue");

    assert.strictEqual(resumeCapture.options.maxTurns, Number.MAX_SAFE_INTEGER);
  });

  test("resume() passes mcpServers when configured", async () => {
    let resumeCapture = null;

    const initMessages = [
      { type: "system", subtype: "init", session_id: "sess-mcp" },
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

    const mcpServers = { orchestration: { command: "test-server" } };
    const output = new PassThrough();
    const runner = new AgentRunner({
      cwd: "/tmp",
      query,
      output,
      mcpServers,
      redactor: noop(),
    });

    await runner.run("Initial task");
    await runner.resume("Follow up");

    assert.deepStrictEqual(
      resumeCapture.options.mcpServers,
      mcpServers,
      "mcpServers must be passed on resume",
    );
  });

  test("run() captures error when query throws and still emits the lines yielded before the throw", async () => {
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
      redactor: noop(),
    });

    const result = await runner.run("Task");
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
    assert.match(result.error.message, /exited with code 1/);
    assert.strictEqual(result.sessionId, "sess-err");

    const lines = (output.read()?.toString() ?? "")
      .trim()
      .split("\n")
      .filter((l) => l.length > 0);
    assert.strictEqual(lines.length, 2);
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
    const runner = new AgentRunner({
      cwd: "/tmp",
      query,
      output,
      redactor: noop(),
    });

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
      redactor: noop(),
    });

    const result = await runner.run("Task");
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.text, "Done.");
    assert.ok(result.error);
    assert.match(result.error.message, /Credit balance/);
  });

  test("run() forwards pathToClaudeCodeExecutable when set", async () => {
    let captured = null;
    const query = mockQuery(
      [{ type: "result", subtype: "success", result: "OK" }],
      (params) => {
        captured = params;
      },
    );
    const runner = new AgentRunner({
      cwd: "/work",
      query,
      output: new PassThrough(),
      pathToClaudeCodeExecutable: "/opt/bin/claude",
      redactor: noop(),
    });
    await runner.run("task");
    assert.strictEqual(
      captured.options.pathToClaudeCodeExecutable,
      "/opt/bin/claude",
    );
  });

  test("run() omits pathToClaudeCodeExecutable when unset", async () => {
    let captured = null;
    const query = mockQuery(
      [{ type: "result", subtype: "success", result: "OK" }],
      (params) => {
        captured = params;
      },
    );
    const runner = new AgentRunner({
      cwd: "/work",
      query,
      output: new PassThrough(),
      redactor: noop(),
    });
    await runner.run("task");
    assert.ok(!("pathToClaudeCodeExecutable" in captured.options));
  });

  test("createAgentRunner factory returns an AgentRunner instance", () => {
    const runner = createAgentRunner({
      cwd: "/tmp",
      query: async function* () {},
      output: new PassThrough(),
      redactor: noop(),
    });
    assert.ok(runner instanceof AgentRunner);
  });
});
