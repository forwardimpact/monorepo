import { describe, test } from "node:test";
import assert from "node:assert";
import { PassThrough } from "node:stream";

import {
  Facilitator,
  createFacilitator,
  FACILITATOR_SYSTEM_PROMPT,
  FACILITATED_AGENT_SYSTEM_PROMPT,
} from "@forwardimpact/libharness";
import { createTestRuntime } from "@forwardimpact/libmock";
import { createNoopRedactor } from "../src/redaction.js";

const baseOpts = () => ({
  facilitatorCwd: "/tmp/fac",
  agentConfigs: [
    { name: "agent-1", role: "worker", cwd: "/tmp/agent-1" },
    { name: "agent-2", role: "reviewer", cwd: "/tmp/agent-2" },
  ],
  query: async function* () {},
  output: new PassThrough(),
  redactor: createNoopRedactor(),
  runtime: createTestRuntime(),
});

const findAgent = (f, name) => f.agents.find((a) => a.name === name);

describe("Facilitator - createFacilitator factory", () => {
  test("returns a Facilitator instance", () => {
    assert.ok(createFacilitator(baseOpts()) instanceof Facilitator);
  });

  test("createFacilitator throws on missing redactor", () => {
    const { redactor: _omitted, ...withoutRedactor } = baseOpts();
    assert.throws(
      () => createFacilitator(withoutRedactor),
      /redactor is required/,
    );
  });

  test("uses default facilitator tools when none specified", () => {
    const f = createFacilitator(baseOpts());
    assert.deepStrictEqual(f.facilitatorRunner.allowedTools, [
      "Read",
      "Glob",
      "Grep",
    ]);
  });

  test("passes custom facilitator tools", () => {
    const f = createFacilitator({
      ...baseOpts(),
      facilitatorAllowedTools: ["Read", "Glob", "Grep"],
    });
    assert.deepStrictEqual(f.facilitatorRunner.allowedTools, [
      "Read",
      "Glob",
      "Grep",
    ]);
  });

  test("facilitator lead gets plain string system prompt (no preset)", () => {
    const f = createFacilitator(baseOpts());
    assert.strictEqual(typeof f.facilitatorRunner.systemPrompt, "string");
    assert.strictEqual(
      f.facilitatorRunner.systemPrompt,
      `<session_protocol>\n${FACILITATOR_SYSTEM_PROMPT}\n</session_protocol>`,
    );
  });

  test("agents get claude_code preset system prompt", () => {
    const f = createFacilitator(baseOpts());
    for (const agent of f.agents) {
      assert.deepStrictEqual(agent.runner.systemPrompt, {
        type: "preset",
        preset: "claude_code",
        append: `<session_protocol>\n${FACILITATED_AGENT_SYSTEM_PROMPT}\n</session_protocol>`,
      });
    }
  });

  test("blocks sub-agent spawn and write tools on facilitator by default", () => {
    const f = createFacilitator(baseOpts());
    assert.deepStrictEqual(f.facilitatorRunner.disallowedTools, [
      "Agent",
      "Task",
      "TaskOutput",
      "TaskStop",
      "Bash",
      "Write",
      "Edit",
    ]);
    for (const agent of f.agents) {
      assert.deepStrictEqual(agent.runner.disallowedTools, []);
    }
  });

  test("merges custom facilitatorDisallowedTools with defaults", () => {
    const f = createFacilitator({
      ...baseOpts(),
      facilitatorDisallowedTools: ["WebSearch", "Task"],
    });
    const d = f.facilitatorRunner.disallowedTools;
    assert.ok(d.includes("Agent"));
    assert.ok(d.includes("Task"));
    assert.ok(d.includes("TaskOutput"));
    assert.ok(d.includes("TaskStop"));
    assert.ok(d.includes("WebSearch"));
    assert.strictEqual(d.length, new Set(d).size);
  });

  test("system prompt constants are non-empty strings", () => {
    assert.ok(typeof FACILITATOR_SYSTEM_PROMPT === "string");
    assert.ok(typeof FACILITATED_AGENT_SYSTEM_PROMPT === "string");
    assert.ok(FACILITATOR_SYSTEM_PROMPT.length > 0);
    assert.ok(FACILITATED_AGENT_SYSTEM_PROMPT.length > 0);
  });

  test("wires MCP servers to facilitator and every agent runner", () => {
    const f = createFacilitator(baseOpts());
    assert.ok(f.facilitatorRunner.mcpServers);
    assert.strictEqual(
      f.facilitatorRunner.mcpServers.orchestration.type,
      "sdk",
    );
    for (const agent of f.agents) {
      assert.ok(agent.runner.mcpServers);
      assert.strictEqual(agent.runner.mcpServers.orchestration.type, "sdk");
    }
  });

  test("per-agent allowedTools and maxTurns propagate", () => {
    const f = createFacilitator({
      ...baseOpts(),
      agentConfigs: [
        {
          name: "agent-1",
          role: "worker",
          cwd: "/tmp/agent-1",
          allowedTools: ["Read", "Grep"],
          maxTurns: 7,
        },
      ],
    });
    const a = findAgent(f, "agent-1");
    assert.deepStrictEqual(a.runner.allowedTools, ["Read", "Grep"]);
    assert.strictEqual(a.runner.maxTurns, 7);
  });
});
