import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";

import { AgentRunner } from "@forwardimpact/libeval";
import { createNoopRedactor } from "../src/redaction.js";
import { createMockAgentQuery as mockQuery } from "@forwardimpact/libmock";

const noop = () => createNoopRedactor();

describe("AgentRunner LIBEVAL_SKILL env var", () => {
  let savedSkill;

  beforeEach(() => {
    savedSkill = process.env.LIBEVAL_SKILL;
    delete process.env.LIBEVAL_SKILL;
  });

  afterEach(() => {
    if (savedSkill !== undefined) {
      process.env.LIBEVAL_SKILL = savedSkill;
    } else {
      delete process.env.LIBEVAL_SKILL;
    }
  });

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

    const runner = new AgentRunner({
      cwd: "/tmp",
      query: mockQuery(messages),
      output: new PassThrough(),
      redactor: noop(),
    });

    await runner.run("test");
    assert.equal(process.env.LIBEVAL_SKILL, "kata-metrics");
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

    const runner = new AgentRunner({
      cwd: "/tmp",
      query: mockQuery(messages),
      output: new PassThrough(),
      redactor: noop(),
    });

    await runner.run("test");
    assert.equal(process.env.LIBEVAL_SKILL, "kata-review");
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

    const runner = new AgentRunner({
      cwd: "/tmp",
      query: mockQuery(messages),
      output: new PassThrough(),
      redactor: noop(),
    });

    await runner.run("test");
    assert.equal(process.env.LIBEVAL_SKILL, "kata-metrics");
  });
});
