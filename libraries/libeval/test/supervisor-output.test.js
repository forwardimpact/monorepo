import { describe, test } from "node:test";
import assert from "node:assert";
import { PassThrough } from "node:stream";

import {
  AgentRunner,
  Supervisor,
  createSupervisor,
  SUPERVISOR_SYSTEM_PROMPT,
  AGENT_SYSTEM_PROMPT,
} from "@forwardimpact/libeval";

/**
 * Create a mock AgentRunner that yields pre-scripted responses.
 * @param {object[]} responses - Array of {text, success} objects
 * @param {object[]} [messages] - Messages to buffer per turn
 * @returns {AgentRunner}
 */
function createMockRunner(responses, messages) {
  const output = new PassThrough();
  let callIndex = 0;

  const runner = new AgentRunner({
    cwd: "/tmp",
    query: async function* () {},
    output,
  });

  runner.run = async (_task) => {
    const resp = responses[callIndex++];
    const msgs = messages?.[callIndex - 1] ?? [
      { type: "assistant", content: resp.text },
    ];
    for (const m of msgs) {
      const line = JSON.stringify(m);
      runner.buffer.push(line);
      if (runner.onLine) runner.onLine(line);
    }
    runner.sessionId = "mock-session";
    return {
      success: resp.success ?? true,
      text: resp.text,
      sessionId: "mock-session",
    };
  };

  runner.resume = async (_prompt) => {
    const resp = responses[callIndex++];
    const msgs = messages?.[callIndex - 1] ?? [
      { type: "assistant", content: resp.text },
    ];
    for (const m of msgs) {
      const line = JSON.stringify(m);
      runner.buffer.push(line);
      if (runner.onLine) runner.onLine(line);
    }
    return { success: resp.success ?? true, text: resp.text };
  };

  return runner;
}

describe("Supervisor - output and events", () => {
  test("output contains tagged lines with correct source and turn", async () => {
    const supervisorMessages = [
      [{ type: "assistant", content: "Go ahead" }],
      [{ type: "assistant", content: "EVALUATION_COMPLETE" }],
    ];
    const agentMessages = [[{ type: "assistant", content: "Working" }]];

    const supervisorRunner = createMockRunner(
      [{ text: "Go ahead" }, { text: "EVALUATION_COMPLETE" }],
      supervisorMessages,
    );
    const agentRunner = createMockRunner([{ text: "Working" }], agentMessages);

    const output = new PassThrough();
    const supervisor = new Supervisor({
      agentRunner,
      supervisorRunner,
      output,
      maxTurns: 10,
    });
    agentRunner.onLine = (line) => supervisor.emitLine(line);
    supervisorRunner.onLine = (line) => supervisor.emitLine(line);

    await supervisor.run("Task");

    const data = output.read()?.toString() ?? "";
    const lines = data
      .trim()
      .split("\n")
      .filter((l) => l.length > 0);

    // Should have: supervisor turn 0, agent turn 1, supervisor turn 1, orchestrator summary
    assert.ok(lines.length >= 4);

    const supervisorLine = JSON.parse(lines[0]);
    assert.strictEqual(supervisorLine.source, "supervisor");
    assert.strictEqual(supervisorLine.turn, 0);
    assert.ok("event" in supervisorLine);

    const agentLine = JSON.parse(lines[1]);
    assert.strictEqual(agentLine.source, "agent");
    assert.strictEqual(agentLine.turn, 1);
    assert.ok("event" in agentLine);

    const summaryLine = JSON.parse(lines[lines.length - 1]);
    assert.strictEqual(summaryLine.source, "orchestrator");
    assert.strictEqual(summaryLine.type, "summary");
    assert.strictEqual(summaryLine.success, true);
  });

  test("events are nested under event key (no field collisions)", async () => {
    const sourceEvent = {
      type: "assistant",
      source: "sdk-internal",
      content: "test",
    };
    const supervisorRunner = createMockRunner(
      [{ text: "Go" }, { text: "EVALUATION_COMPLETE" }],
      [
        [{ type: "assistant", content: "Go" }],
        [{ type: "assistant", content: "ok" }],
      ],
    );
    const agentRunner = createMockRunner([{ text: "Done" }], [[sourceEvent]]);

    const output = new PassThrough();
    const supervisor = new Supervisor({
      agentRunner,
      supervisorRunner,
      output,
      maxTurns: 10,
    });
    agentRunner.onLine = (line) => supervisor.emitLine(line);
    supervisorRunner.onLine = (line) => supervisor.emitLine(line);

    await supervisor.run("Task");

    const data = output.read()?.toString() ?? "";
    const lines = data
      .trim()
      .split("\n")
      .filter((l) => l.length > 0);

    // First line is supervisor turn 0, second is agent turn 1
    const tagged = JSON.parse(lines[1]);
    assert.strictEqual(tagged.source, "agent");
    assert.strictEqual(tagged.event.source, "sdk-internal");
  });

  test("emits supervisor output and summary when supervisor errors on turn 0", async () => {
    const supervisorMessages = [
      [{ type: "assistant", content: "Starting..." }],
    ];
    const supervisorRunner = createMockRunner(
      [{ text: "Starting...", success: false }],
      supervisorMessages,
    );

    const origRun = supervisorRunner.run;
    supervisorRunner.run = async (task) => {
      const result = await origRun.call(supervisorRunner, task);
      return { ...result, error: new Error("Process exited with code 1") };
    };

    const agentRunner = createMockRunner([]);

    const output = new PassThrough();
    const supervisor = new Supervisor({
      agentRunner,
      supervisorRunner,
      output,
      maxTurns: 10,
    });
    agentRunner.onLine = (line) => supervisor.emitLine(line);
    supervisorRunner.onLine = (line) => supervisor.emitLine(line);

    const result = await supervisor.run("Task");

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.turns, 0);

    const data = output.read()?.toString() ?? "";
    const lines = data
      .trim()
      .split("\n")
      .filter((l) => l.length > 0);

    assert.ok(lines.length >= 2, "Expected at least supervisor line + summary");

    const supervisorLine = JSON.parse(lines[0]);
    assert.strictEqual(supervisorLine.source, "supervisor");
    assert.strictEqual(supervisorLine.turn, 0);

    const summaryLine = JSON.parse(lines[lines.length - 1]);
    assert.strictEqual(summaryLine.source, "orchestrator");
    assert.strictEqual(summaryLine.success, false);
    assert.strictEqual(summaryLine.turns, 0);
  });
});

describe("Supervisor - createSupervisor factory", () => {
  test("createSupervisor factory returns a Supervisor instance", () => {
    const supervisor = createSupervisor({
      supervisorCwd: "/tmp/sup",
      agentCwd: "/tmp/agent",
      query: async function* () {},
      output: new PassThrough(),
    });
    assert.ok(supervisor instanceof Supervisor);
  });

  test("createSupervisor uses default supervisor tools when none specified", () => {
    const supervisor = createSupervisor({
      supervisorCwd: "/tmp/sup",
      agentCwd: "/tmp/agent",
      query: async function* () {},
      output: new PassThrough(),
    });
    assert.deepStrictEqual(supervisor.supervisorRunner.allowedTools, [
      "Bash",
      "Read",
      "Glob",
      "Grep",
      "Write",
      "Edit",
    ]);
  });

  test("createSupervisor passes custom supervisor tools", () => {
    const supervisor = createSupervisor({
      supervisorCwd: "/tmp/sup",
      agentCwd: "/tmp/agent",
      query: async function* () {},
      output: new PassThrough(),
      supervisorAllowedTools: ["Read", "Glob", "Grep"],
    });
    assert.deepStrictEqual(supervisor.supervisorRunner.allowedTools, [
      "Read",
      "Glob",
      "Grep",
    ]);
  });

  test("createSupervisor wires system prompts to both runners", () => {
    const supervisor = createSupervisor({
      supervisorCwd: "/tmp/sup",
      agentCwd: "/tmp/agent",
      query: async function* () {},
      output: new PassThrough(),
    });

    assert.deepStrictEqual(supervisor.agentRunner.systemPrompt, {
      type: "preset",
      preset: "claude_code",
      append: AGENT_SYSTEM_PROMPT,
    });
    assert.deepStrictEqual(supervisor.supervisorRunner.systemPrompt, {
      type: "preset",
      preset: "claude_code",
      append: SUPERVISOR_SYSTEM_PROMPT,
    });
  });

  test("createSupervisor blocks Task and TaskOutput on supervisor by default", () => {
    const supervisor = createSupervisor({
      supervisorCwd: "/tmp/sup",
      agentCwd: "/tmp/agent",
      query: async function* () {},
      output: new PassThrough(),
    });
    assert.deepStrictEqual(supervisor.supervisorRunner.disallowedTools, [
      "Task",
      "TaskOutput",
    ]);
    assert.deepStrictEqual(supervisor.agentRunner.disallowedTools, []);
  });

  test("createSupervisor merges custom supervisorDisallowedTools with defaults", () => {
    const supervisor = createSupervisor({
      supervisorCwd: "/tmp/sup",
      agentCwd: "/tmp/agent",
      query: async function* () {},
      output: new PassThrough(),
      supervisorDisallowedTools: ["WebSearch", "Task"],
    });
    const disallowed = supervisor.supervisorRunner.disallowedTools;
    assert.ok(disallowed.includes("Task"));
    assert.ok(disallowed.includes("TaskOutput"));
    assert.ok(disallowed.includes("WebSearch"));
    assert.strictEqual(disallowed.length, new Set(disallowed).size);
  });

  test("system prompt constants are non-empty strings", () => {
    assert.ok(typeof SUPERVISOR_SYSTEM_PROMPT === "string");
    assert.ok(typeof AGENT_SYSTEM_PROMPT === "string");
    assert.ok(SUPERVISOR_SYSTEM_PROMPT.length > 0);
    assert.ok(AGENT_SYSTEM_PROMPT.length > 0);
  });

  test("SUPERVISOR_SYSTEM_PROMPT explains relay mechanism", () => {
    assert.ok(SUPERVISOR_SYSTEM_PROMPT.includes("relay"));
    assert.ok(SUPERVISOR_SYSTEM_PROMPT.includes("EVALUATION_COMPLETE"));
  });
});
