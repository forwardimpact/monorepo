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

describe("Supervisor - advisor wiring", () => {
  const registeredTools = (runner) =>
    Object.keys(runner.mcpServers.orchestration.instance._registeredTools);

  test("with advisorModel the agent server carries the Advisor tool and the lead carries neither", () => {
    const s = createSupervisor({ ...baseOpts(), advisorModel: "adv-model" });
    assert.ok(registeredTools(s.agentRunner).includes("Advisor"));
    assert.ok(!registeredTools(s.supervisorRunner).includes("Advisor"));
    assert.ok(!s.supervisorRunner.systemPrompt.includes("`Advisor` tool"));
  });

  test("guidance is composed after an existing amendment in the agent prompt", () => {
    const s = createSupervisor({
      ...baseOpts(),
      advisorModel: "adv-model",
      agentSystemPromptAmend: "<EXISTING_AMEND>",
    });
    const append = s.agentRunner.systemPrompt.append;
    const amendAt = append.indexOf("<EXISTING_AMEND>");
    const guidanceAt = append.indexOf("`Advisor` tool is available");
    assert.ok(amendAt !== -1, "existing amendment present");
    assert.ok(guidanceAt !== -1, "guidance present");
    assert.ok(amendAt < guidanceAt, "guidance follows the amendment");
  });

  test("without advisorModel no advisor text or tool appears", () => {
    const s = createSupervisor(baseOpts());
    assert.ok(!s.agentRunner.systemPrompt.append.includes("Advisor"));
    assert.ok(!registeredTools(s.agentRunner).includes("Advisor"));
  });

  test("loop stop aborts a pending consult, which resolves fail-open", async () => {
    // The advisor session's query hangs until its abort controller fires —
    // the same shape as a wedged live consult.
    const hangingQuery = (params) =>
      (async function* () {
        await new Promise((_, reject) => {
          params.options.abortController.signal.addEventListener("abort", () =>
            reject(new Error("aborted by signal")),
          );
        });
      })();
    const s = createSupervisor({
      ...baseOpts(),
      query: hangingQuery,
      advisorModel: "adv-model",
    });

    const advisor =
      s.agentRunner.mcpServers.orchestration.instance._registeredTools.Advisor;
    const pending = advisor.handler({ question: "Q" }, {});
    // #stop() aborts this controller; trigger the same path directly.
    s.abortController.abort();
    const result = await pending;
    assert.match(result.content[0].text, /advisor is unavailable/);
  });
});
