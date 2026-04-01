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
import { isDone } from "../src/supervisor.js";

/**
 * Create a mock AgentRunner that yields pre-scripted responses.
 * Each call to run() or resume() pops the next response from the array.
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

  // Override run and resume to return scripted responses
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

describe("isDone", () => {
  test("detects EVALUATION_COMPLETE on its own line", () => {
    assert.strictEqual(isDone("EVALUATION_COMPLETE"), true);
    assert.strictEqual(
      isDone("Some text\nEVALUATION_COMPLETE\nMore text"),
      true,
    );
    assert.strictEqual(isDone("Done.\n\nEVALUATION_COMPLETE"), true);
  });

  test("does not match EVALUATION_COMPLETE embedded in text", () => {
    assert.strictEqual(isDone("not EVALUATION_COMPLETE yet"), false);
    assert.strictEqual(isDone("The agent is EVALUATION_COMPLETE done"), false);
    assert.strictEqual(isDone("EVALUATION_COMPLETE_EXTRA"), false);
  });

  test("does not match empty or unrelated text", () => {
    assert.strictEqual(isDone(""), false);
    assert.strictEqual(isDone("All done!"), false);
    assert.strictEqual(isDone("DONE"), false);
  });
});

describe("Supervisor", () => {
  test("constructor throws on missing agentRunner", () => {
    assert.throws(
      () =>
        new Supervisor({
          supervisorRunner: createMockRunner([]),
          output: new PassThrough(),
        }),
      /agentRunner is required/,
    );
  });

  test("constructor throws on missing supervisorRunner", () => {
    assert.throws(
      () =>
        new Supervisor({
          agentRunner: createMockRunner([]),
          output: new PassThrough(),
        }),
      /supervisorRunner is required/,
    );
  });

  test("constructor throws on missing output", () => {
    assert.throws(
      () =>
        new Supervisor({
          agentRunner: createMockRunner([]),
          supervisorRunner: createMockRunner([]),
        }),
      /output is required/,
    );
  });

  test("completes on EVALUATION_COMPLETE from supervisor at turn 0", async () => {
    const agentRunner = createMockRunner([]);

    const supervisorRunner = createMockRunner([
      { text: "EVALUATION_COMPLETE" },
    ]);

    const output = new PassThrough();
    const supervisor = new Supervisor({
      agentRunner,
      supervisorRunner,
      output,
      maxTurns: 10,
    });

    const result = await supervisor.run("Install stuff");

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.turns, 0);
  });

  test("completes after one agent turn", async () => {
    const agentRunner = createMockRunner([
      { text: "I installed the packages." },
    ]);

    const supervisorRunner = createMockRunner([
      { text: "Welcome! Please install the packages." },
      { text: "Good work.\n\nEVALUATION_COMPLETE" },
    ]);

    const output = new PassThrough();
    const supervisor = new Supervisor({
      agentRunner,
      supervisorRunner,
      output,
      maxTurns: 10,
    });

    const result = await supervisor.run("Install stuff");

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.turns, 1);
  });

  test("runs multiple turns before completion", async () => {
    const agentRunner = createMockRunner([
      { text: "Started working." },
      { text: "Made progress." },
      { text: "Finished everything." },
    ]);

    const supervisorRunner = createMockRunner([
      { text: "Here is your task. Do the work." },
      { text: "Keep going, you need to do more." },
      { text: "Almost there, continue." },
      { text: "EVALUATION_COMPLETE" },
    ]);

    const output = new PassThrough();
    const supervisor = new Supervisor({
      agentRunner,
      supervisorRunner,
      output,
      maxTurns: 10,
    });

    const result = await supervisor.run("Do the work");

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.turns, 3);
  });

  test("enforces maxTurns limit", async () => {
    // Supervisor starts, agent responds each turn, supervisor never says done
    const agentRunner = createMockRunner([
      { text: "Turn 1" },
      { text: "Turn 2" },
    ]);

    const supervisorRunner = createMockRunner([
      { text: "Start working." },
      { text: "Continue." },
      { text: "Continue." },
    ]);

    const output = new PassThrough();
    const supervisor = new Supervisor({
      agentRunner,
      supervisorRunner,
      output,
      maxTurns: 2,
    });

    const result = await supervisor.run("Endless task");

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.turns, 2);
  });

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
    // The original event's `source` field is preserved inside `event`
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

    // Override run to simulate an error return
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

    // Output should still contain the supervisor's buffered lines + summary
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
      "Read",
      "Glob",
      "Grep",
    ]);
  });

  test("createSupervisor passes custom supervisor tools", () => {
    const supervisor = createSupervisor({
      supervisorCwd: "/tmp/sup",
      agentCwd: "/tmp/agent",
      query: async function* () {},
      output: new PassThrough(),
      supervisorAllowedTools: ["Bash", "Read", "Glob", "Grep", "Write", "Edit"],
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

  test("system prompt constants are non-empty strings", () => {
    assert.ok(typeof SUPERVISOR_SYSTEM_PROMPT === "string");
    assert.ok(typeof AGENT_SYSTEM_PROMPT === "string");
    assert.ok(SUPERVISOR_SYSTEM_PROMPT.length > 0);
    assert.ok(AGENT_SYSTEM_PROMPT.length > 0);
  });
});
