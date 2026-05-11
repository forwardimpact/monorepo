import { describe, test } from "node:test";
import assert from "node:assert";
import { PassThrough } from "node:stream";

import {
  Supervisor,
  createSupervisor,
  SUPERVISOR_SYSTEM_PROMPT,
  AGENT_SYSTEM_PROMPT,
} from "@forwardimpact/libeval";
import { createNoopRedactor } from "../src/redaction.js";

const baseOpts = () => ({
  supervisorCwd: "/tmp/sup",
  agentCwd: "/tmp/agent",
  query: async function* () {},
  output: new PassThrough(),
  redactor: createNoopRedactor(),
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
      "Bash",
      "Read",
      "Glob",
      "Grep",
      "Write",
      "Edit",
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

  test("wires system prompts to both runners", () => {
    const s = createSupervisor(baseOpts());
    assert.deepStrictEqual(s.agentRunner.systemPrompt, {
      type: "preset",
      preset: "claude_code",
      append: AGENT_SYSTEM_PROMPT,
    });
    assert.deepStrictEqual(s.supervisorRunner.systemPrompt, {
      type: "preset",
      preset: "claude_code",
      append: SUPERVISOR_SYSTEM_PROMPT,
    });
  });

  test("blocks sub-agent spawn tools on supervisor by default", () => {
    const s = createSupervisor(baseOpts());
    assert.deepStrictEqual(s.supervisorRunner.disallowedTools, [
      "Agent",
      "Task",
      "TaskOutput",
      "TaskStop",
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
});
