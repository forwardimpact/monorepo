import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";

import { AgentRunner } from "@forwardimpact/libeval";
import { createNoopRedactor } from "../src/redaction.js";
import {
  createMockAgentQuery as mockQuery,
  createTestRuntime,
} from "@forwardimpact/libmock";

const noop = () => createNoopRedactor();

describe("AgentRunner LIBEVAL_SKILL env var", () => {
  test("Skill tool_use sets LIBEVAL_SKILL", async () => {
    const messages = [
      { type: "system", subtype: "init", session_id: "s1" },
      {
        type: "assistant",
        content: [
          {
            type: "tool_use",
            name: "Skill",
            input: { skill: "kata-metrics" },
          },
        ],
      },
      { type: "result", subtype: "success", result: "done" },
    ];

    const runtime = createTestRuntime();
    const runner = new AgentRunner({
      cwd: "/tmp",
      query: mockQuery(messages),
      output: new PassThrough(),
      redactor: noop(),
      runtime,
    });

    await runner.run("test");
    assert.equal(runtime.proc.env.LIBEVAL_SKILL, "kata-metrics");
  });

  test("second Skill tool_use updates LIBEVAL_SKILL", async () => {
    const messages = [
      { type: "system", subtype: "init", session_id: "s1" },
      {
        type: "assistant",
        content: [
          {
            type: "tool_use",
            name: "Skill",
            input: { skill: "kata-metrics" },
          },
        ],
      },
      {
        type: "assistant",
        content: [
          {
            type: "tool_use",
            name: "Skill",
            input: { skill: "kata-review" },
          },
        ],
      },
      { type: "result", subtype: "success", result: "done" },
    ];

    const runtime = createTestRuntime();
    const runner = new AgentRunner({
      cwd: "/tmp",
      query: mockQuery(messages),
      output: new PassThrough(),
      redactor: noop(),
      runtime,
    });

    await runner.run("test");
    assert.equal(runtime.proc.env.LIBEVAL_SKILL, "kata-review");
  });

  test("non-Skill tool_use leaves LIBEVAL_SKILL unchanged", async () => {
    const messages = [
      { type: "system", subtype: "init", session_id: "s1" },
      {
        type: "assistant",
        content: [
          {
            type: "tool_use",
            name: "Skill",
            input: { skill: "kata-metrics" },
          },
        ],
      },
      {
        type: "assistant",
        content: [
          {
            type: "tool_use",
            name: "Bash",
            input: { command: "ls" },
          },
        ],
      },
      { type: "result", subtype: "success", result: "done" },
    ];

    const runtime = createTestRuntime();
    const runner = new AgentRunner({
      cwd: "/tmp",
      query: mockQuery(messages),
      output: new PassThrough(),
      redactor: noop(),
      runtime,
    });

    await runner.run("test");
    assert.equal(runtime.proc.env.LIBEVAL_SKILL, "kata-metrics");
  });
});
