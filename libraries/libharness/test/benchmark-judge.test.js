import { describe, test } from "node:test";
import assert from "node:assert";

import {
  createMockAgentQuery,
  createMockFs,
  createMockProcess,
  createTestRuntime,
} from "@forwardimpact/libmock";

import { parseConcludeFromTrace, runJudge } from "../src/benchmark/judge.js";

const TRACE_PATH = "/traces/trace.ndjson";

/**
 * Seed the trace file in an in-memory fs and return `{ path, runtime }` for
 * `parseConcludeFromTrace`, which reads via `runtime.fs.readFile`.
 */
function traceRuntime(lines) {
  const body = lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
  return {
    path: TRACE_PATH,
    runtime: createTestRuntime({ fs: createMockFs({ [TRACE_PATH]: body }) }),
  };
}

function envelopeAssistant(source, blocks) {
  return {
    source,
    seq: 0,
    event: {
      type: "assistant",
      message: { content: blocks },
    },
  };
}

const concludeBlock = (verdict, summary) => ({
  type: "tool_use",
  name: "Conclude",
  input: { verdict, summary },
});

describe("runJudge trace redaction (spec criterion 9, judge lane)", () => {
  test("the convention-named judge lane carries only redacted content", async () => {
    const SECRET = "sentinel-env-value-2270";
    const templatePath = "/family/tasks/t/judge.task.md";
    const judgeTracePath = "/out/runs/t/0/trace--t-r0--judge.judge.ndjson";
    const fs = createMockFs({
      [templatePath]: "Judge the work at {{AGENT_TRACE_PATH}}.",
    });
    const runtime = createTestRuntime({
      fs,
      proc: createMockProcess({ env: { GH_TOKEN: SECRET } }),
    });
    const task = { id: "t", paths: { judge: templatePath } };
    const workdir = {
      cwd: "/out/runs/t/0/cwd",
      agentTracePath: "/out/runs/t/0/trace--t-r0--agent.agent.ndjson",
      judgeTracePath,
    };
    // The fake session leaks the sentinel env value in its assistant text;
    // the judge's redactor must scrub it before the lane file is written.
    const query = createMockAgentQuery([
      {
        type: "assistant",
        message: {
          content: [{ type: "text", text: `the token is ${SECRET}` }],
        },
      },
    ]);

    const result = await runJudge(
      task,
      workdir,
      { verdict: "pass" },
      {
        query,
        model: "m",
        runtime,
      },
    );

    const body = fs.readFileSync(judgeTracePath, "utf8");
    assert.ok(body.length > 0, "judge lane must be written");
    assert.ok(!body.includes(SECRET), "sentinel must not appear in the lane");
    assert.ok(
      body.includes("[REDACTED:env:GH_TOKEN]"),
      "redaction placeholder must appear in the lane",
    );
    // The mock session never calls Conclude — the verdict maps to fail.
    assert.strictEqual(result.verdict, "fail");
  });
});

describe("parseConcludeFromTrace", () => {
  test("supervisor success → pass", async () => {
    const { path, runtime } = traceRuntime([
      envelopeAssistant("supervisor", [concludeBlock("success", "all good")]),
    ]);
    const parsed = await parseConcludeFromTrace(path, runtime);
    assert.deepStrictEqual(parsed, { verdict: "pass", summary: "all good" });
  });

  test("no Conclude → null", async () => {
    const { path, runtime } = traceRuntime([
      envelopeAssistant("supervisor", [
        { type: "text", text: "I think the agent did fine." },
      ]),
    ]);
    const parsed = await parseConcludeFromTrace(path, runtime);
    assert.strictEqual(parsed, null);
  });

  test("two Conclude calls — last one wins", async () => {
    const { path, runtime } = traceRuntime([
      envelopeAssistant("supervisor", [concludeBlock("success", "first")]),
      envelopeAssistant("supervisor", [concludeBlock("failure", "second")]),
    ]);
    const parsed = await parseConcludeFromTrace(path, runtime);
    assert.deepStrictEqual(parsed, { verdict: "fail", summary: "second" });
  });

  test("agent-source Conclude is ignored (only supervisor counts)", async () => {
    const { path, runtime } = traceRuntime([
      envelopeAssistant("agent", [concludeBlock("success", "agent lies")]),
    ]);
    const parsed = await parseConcludeFromTrace(path, runtime);
    assert.strictEqual(parsed, null);
  });

  test("accepts mcp__orchestration__Conclude (the SDK's namespaced form)", async () => {
    // Live judge traces from the Claude Agent SDK report MCP-server tools
    // under their namespaced name. The orchestration `Conclude` tool
    // arrives as `mcp__orchestration__Conclude`.
    const { path, runtime } = traceRuntime([
      envelopeAssistant("supervisor", [
        {
          type: "tool_use",
          name: "mcp__orchestration__Conclude",
          input: { verdict: "success", summary: "ns ok" },
        },
      ]),
    ]);
    const parsed = await parseConcludeFromTrace(path, runtime);
    assert.deepStrictEqual(parsed, { verdict: "pass", summary: "ns ok" });
  });
});
