import { describe, test } from "node:test";
import assert from "node:assert";
import { PassThrough } from "node:stream";

import {
  Supervisor,
  createSupervisor,
  SUPERVISOR_SYSTEM_PROMPT,
  AGENT_SYSTEM_PROMPT,
} from "@forwardimpact/libharness";
import { createTestRuntime } from "@forwardimpact/libmock";
import { createNoopRedactor } from "../src/redaction.js";

const baseOpts = () => ({
  supervisorCwd: "/tmp/sup",
  agentCwd: "/tmp/agent",
  query: async function* () {},
  output: new PassThrough(),
  redactor: createNoopRedactor(),
  runtime: createTestRuntime(),
});

describe("Supervisor - createSupervisor factory", () => {
  test("returns a Supervisor instance", () => {
    assert.ok(createSupervisor(baseOpts()) instanceof Supervisor);
  });

  test("createSupervisor throws on missing redactor", () => {
    const { redactor: _omitted, ...withoutRedactor } = baseOpts();
    assert.throws(
      () => createSupervisor(withoutRedactor),
      /redactor is required/,
    );
  });

  test("uses default supervisor tools when none specified", () => {
    const s = createSupervisor(baseOpts());
    assert.deepStrictEqual(s.supervisorRunner.allowedTools, [
      "Read",
      "Glob",
      "Grep",
      "Bash",
    ]);
  });

  test("passes custom supervisor tools", () => {
    const s = createSupervisor({
      ...baseOpts(),
      supervisorAllowedTools: ["Read", "Glob", "Grep"],
    });
    assert.deepStrictEqual(s.supervisorRunner.allowedTools, [
      "Read",
      "Glob",
      "Grep",
    ]);
  });

  test("supervisor lead gets plain string system prompt (no preset)", () => {
    const s = createSupervisor(baseOpts());
    assert.strictEqual(typeof s.supervisorRunner.systemPrompt, "string");
    assert.strictEqual(
      s.supervisorRunner.systemPrompt,
      `<session_protocol>\n${SUPERVISOR_SYSTEM_PROMPT}\n</session_protocol>`,
    );
  });

  test("agent gets claude_code preset system prompt", () => {
    const s = createSupervisor(baseOpts());
    assert.deepStrictEqual(s.agentRunner.systemPrompt, {
      type: "preset",
      preset: "claude_code",
      append: `<session_protocol>\n${AGENT_SYSTEM_PROMPT}\n</session_protocol>`,
    });
  });

  test("folds agentSystemPromptAmend into the agent <session_protocol>", () => {
    const s = createSupervisor({
      ...baseOpts(),
      agentSystemPromptAmend: "<TEST_MARKER>",
    });
    assert.strictEqual(
      s.agentRunner.systemPrompt.append,
      `<session_protocol>\n${AGENT_SYSTEM_PROMPT}\n\n<TEST_MARKER>\n</session_protocol>`,
    );
  });

  test("blocks sub-agent spawn and write tools on supervisor by default", () => {
    const s = createSupervisor(baseOpts());
    assert.deepStrictEqual(s.supervisorRunner.disallowedTools, [
      "Agent",
      "Task",
      "TaskOutput",
      "TaskStop",
      "Write",
      "Edit",
    ]);
    assert.deepStrictEqual(s.agentRunner.disallowedTools, []);
  });

  test("merges custom supervisorDisallowedTools with defaults", () => {
    const s = createSupervisor({
      ...baseOpts(),
      supervisorDisallowedTools: ["WebSearch", "Task"],
    });
    const d = s.supervisorRunner.disallowedTools;
    assert.ok(d.includes("Agent"));
    assert.ok(d.includes("Task"));
    assert.ok(d.includes("TaskOutput"));
    assert.ok(d.includes("TaskStop"));
    assert.ok(d.includes("WebSearch"));
    assert.strictEqual(d.length, new Set(d).size);
  });

  test("system prompt constants are non-empty strings", () => {
    assert.ok(typeof SUPERVISOR_SYSTEM_PROMPT === "string");
    assert.ok(typeof AGENT_SYSTEM_PROMPT === "string");
    assert.ok(SUPERVISOR_SYSTEM_PROMPT.length > 0);
    assert.ok(AGENT_SYSTEM_PROMPT.length > 0);
  });

  test("wires MCP servers to both runners", () => {
    const s = createSupervisor(baseOpts());
    assert.ok(s.agentRunner.mcpServers);
    assert.strictEqual(s.agentRunner.mcpServers.orchestration.type, "sdk");
    assert.ok(s.supervisorRunner.mcpServers);
    assert.strictEqual(s.supervisorRunner.mcpServers.orchestration.type, "sdk");
  });

  test("merges agentMcpServers into agent runner only", () => {
    const s = createSupervisor({
      ...baseOpts(),
      agentMcpServers: {
        guide: { type: "http", url: "http://localhost:3005" },
      },
    });
    assert.strictEqual(s.agentRunner.mcpServers.orchestration.type, "sdk");
    assert.strictEqual(s.agentRunner.mcpServers.guide.type, "http");
    assert.strictEqual(s.supervisorRunner.mcpServers.guide, undefined);
  });

  // After the sync-Ask refactor there's no outer "exchange" loop to bound —
  // the supervisor's run() carries the whole session through one
  // contiguous SDK call, the same shape as facilitate. `maxTurns` is the
  // per-runner SDK turn budget on both sides.
  test("maxTurns sets per-runner budget on both runners", () => {
    const s = createSupervisor({ ...baseOpts(), maxTurns: 50 });
    assert.strictEqual(s.agentRunner.maxTurns, 50);
    assert.strictEqual(s.supervisorRunner.maxTurns, 50);
  });

  test("maxTurns=0 propagates as unlimited", () => {
    const s = createSupervisor({ ...baseOpts(), maxTurns: 0 });
    assert.strictEqual(s.agentRunner.maxTurns, 0);
    assert.strictEqual(s.supervisorRunner.maxTurns, 0);
  });

  test("default maxTurns yields 200 per runner", () => {
    const s = createSupervisor(baseOpts());
    assert.strictEqual(s.agentRunner.maxTurns, 200);
    assert.strictEqual(s.supervisorRunner.maxTurns, 200);
  });
});
