import { describe, test } from "node:test";
import assert from "node:assert";
import { PassThrough } from "node:stream";

import {
  Judge,
  createJudge,
  JUDGE_SYSTEM_PROMPT,
} from "@forwardimpact/libharness";
import {
  createConcludeHandler,
  createOrchestrationContext,
} from "../src/orchestration-toolkit.js";
import { createNoopRedactor } from "../src/redaction.js";
import { createMockRunner } from "./mock-runner.js";
import { createToolUseMsg, createTestRuntime } from "@forwardimpact/libmock";

const noop = () => createNoopRedactor();
const RT = () => createTestRuntime();
const concludeMsg = (summary, verdict = "success") =>
  createToolUseMsg("Conclude", { verdict, summary });

function seedJudge() {
  const ctx = createOrchestrationContext();
  ctx.participants = [{ name: "judge", role: "judge" }];
  return { ctx };
}

describe("Judge - construction", () => {
  test("throws on missing runner", () => {
    assert.throws(
      () =>
        new Judge({
          output: new PassThrough(),
          ctx: createOrchestrationContext(),
          redactor: noop(),
        }),
      /runner is required/,
    );
  });

  test("throws on missing output", () => {
    assert.throws(
      () =>
        new Judge({
          runner: createMockRunner([]),
          ctx: createOrchestrationContext(),
          redactor: noop(),
        }),
      /output is required/,
    );
  });

  test("throws on missing ctx", () => {
    assert.throws(
      () =>
        new Judge({
          runner: createMockRunner([]),
          output: new PassThrough(),
          redactor: noop(),
        }),
      /ctx is required/,
    );
  });
});

describe("Judge.run", () => {
  test("returns success when Conclude is called with verdict='success'", async () => {
    const { ctx } = seedJudge();
    const concludeHandler = createConcludeHandler(ctx);
    const runner = createMockRunner(
      [{ text: "Done" }],
      [[concludeMsg("looks good")]],
      { toolDispatcher: { Conclude: (input) => concludeHandler(input) } },
    );
    const output = new PassThrough();
    const judge = new Judge({ runner, output, ctx, redactor: noop() });
    const result = await judge.run("Grade this.");
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.verdict, "success");
    assert.strictEqual(result.summary, "looks good");
  });

  test("returns failure when Conclude is called with verdict='failure'", async () => {
    const { ctx } = seedJudge();
    const concludeHandler = createConcludeHandler(ctx);
    const runner = createMockRunner(
      [{ text: "Bad" }],
      [[concludeMsg("did not meet criteria", "failure")]],
      { toolDispatcher: { Conclude: (input) => concludeHandler(input) } },
    );
    const output = new PassThrough();
    const judge = new Judge({ runner, output, ctx, redactor: noop() });
    const result = await judge.run("Grade this.");
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.verdict, "failure");
    assert.strictEqual(result.summary, "did not meet criteria");
  });

  test("returns verdict=null when the judge never calls Conclude", async () => {
    const { ctx } = seedJudge();
    const runner = createMockRunner([{ text: "thinking..." }]);
    const output = new PassThrough();
    const judge = new Judge({ runner, output, ctx, redactor: noop() });
    const result = await judge.run("Grade this.");
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.verdict, null);
    assert.strictEqual(result.summary, null);
  });

  test("emitLine tags trace lines with source='judge'", async () => {
    const { ctx } = seedJudge();
    const concludeHandler = createConcludeHandler(ctx);
    const runner = createMockRunner([{ text: "Done" }], [[concludeMsg("ok")]], {
      toolDispatcher: { Conclude: (input) => concludeHandler(input) },
    });
    const output = new PassThrough();
    const judge = new Judge({ runner, output, ctx, redactor: noop() });
    runner.onLine = (line) => judge.emitLine(line);
    await judge.run("Grade this.");
    const lines = (output.read()?.toString() ?? "").split("\n").filter(Boolean);
    // Every assistant line emitted via onLine should have source: "judge".
    const judgeLines = lines.filter((l) => l.includes('"source":"judge"'));
    assert.ok(
      judgeLines.length > 0,
      "expected at least one source='judge' line",
    );
    // Plus the orchestrator-source summary line.
    const summary = lines.find((l) => l.includes('"type":"summary"'));
    assert.ok(summary, "expected a summary line");
    assert.match(summary, /"source":"orchestrator"/);
    assert.match(summary, /"verdict":"success"/);
  });

  test("taskAmend is appended to the task before delivery", async () => {
    const { ctx } = seedJudge();
    const runner = createMockRunner([{ text: "ok" }]);
    let receivedTask = null;
    const origRun = runner.run;
    runner.run = async (task) => {
      receivedTask = task;
      return origRun.call(runner, task);
    };
    const output = new PassThrough();
    const judge = new Judge({
      runner,
      output,
      ctx,
      redactor: noop(),
      taskAmend: "EXTRA",
    });
    await judge.run("Original");
    assert.strictEqual(receivedTask, "Original\n\nEXTRA");
  });
});

describe("createJudge", () => {
  test("composes JUDGE_SYSTEM_PROMPT as the system-prompt trailer when no profile is supplied", () => {
    let capturedParams = null;
    // biome-ignore lint/correctness/useYield: AgentRunner only needs an async iterable; an empty generator is sufficient for capturing the spawn args.
    const mockQuery = async function* (params) {
      capturedParams = params;
    };
    const output = new PassThrough();
    const judge = createJudge({
      cwd: "/tmp",
      query: mockQuery,
      output,
      redactor: noop(),
      runtime: RT(),
    });
    assert.ok(judge instanceof Judge);
    // Trigger the underlying runner so we can inspect the options it
    // passes to the SDK.
    return judge.runner.run("noop").then(() => {
      assert.ok(capturedParams, "query should have been invoked");
      const sp = capturedParams.options?.systemPrompt;
      assert.ok(sp, "systemPrompt must be set");
      assert.strictEqual(sp.type, "preset");
      assert.strictEqual(sp.preset, "claude_code");
      assert.strictEqual(
        sp.append,
        `<session_protocol>\n${JUDGE_SYSTEM_PROMPT}\n</session_protocol>`,
      );
    });
  });

  test("registers the judge orchestration MCP server with only Conclude", () => {
    const output = new PassThrough();
    let capturedParams = null;
    // biome-ignore lint/correctness/useYield: AgentRunner only needs an async iterable; an empty generator is sufficient for capturing the spawn args.
    const mockQuery = async function* (params) {
      capturedParams = params;
    };
    const judge = createJudge({
      cwd: "/tmp",
      query: mockQuery,
      output,
      redactor: noop(),
      runtime: RT(),
    });
    return judge.runner.run("noop").then(() => {
      const orchestration = capturedParams.options.mcpServers?.orchestration;
      assert.ok(orchestration, "orchestration MCP server must be registered");
      // The MCP SDK creates an Sdk server; tools are discoverable via its
      // internals. Just assert that exactly the orchestration server is wired.
      assert.deepStrictEqual(Object.keys(capturedParams.options.mcpServers), [
        "orchestration",
      ]);
    });
  });

  test("defaults to read-only allowedTools (Read, Glob, Grep, Bash)", () => {
    const output = new PassThrough();
    let capturedParams = null;
    // biome-ignore lint/correctness/useYield: AgentRunner only needs an async iterable; an empty generator is sufficient for capturing the spawn args.
    const mockQuery = async function* (params) {
      capturedParams = params;
    };
    const judge = createJudge({
      cwd: "/tmp",
      query: mockQuery,
      output,
      redactor: noop(),
      runtime: RT(),
    });
    return judge.runner.run("noop").then(() => {
      assert.deepStrictEqual(capturedParams.options.allowedTools, [
        "Read",
        "Glob",
        "Grep",
        "Bash",
      ]);
    });
  });
});
