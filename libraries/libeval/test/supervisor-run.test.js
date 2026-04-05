import { describe, test } from "node:test";
import assert from "node:assert";
import { PassThrough } from "node:stream";

import { AgentRunner, Supervisor } from "@forwardimpact/libeval";
import { isComplete } from "../src/supervisor.js";

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

describe("isComplete", () => {
  test("detects EVALUATION_COMPLETE on its own line", () => {
    assert.strictEqual(isComplete("EVALUATION_COMPLETE"), true);
    assert.strictEqual(
      isComplete("Some text\nEVALUATION_COMPLETE\nMore text"),
      true,
    );
    assert.strictEqual(isComplete("Done.\n\nEVALUATION_COMPLETE"), true);
  });

  test("tolerates markdown formatting around the signal", () => {
    assert.strictEqual(isComplete("**EVALUATION_COMPLETE**"), true);
    assert.strictEqual(isComplete("*EVALUATION_COMPLETE*"), true);
    assert.strictEqual(isComplete("__EVALUATION_COMPLETE__"), true);
    assert.strictEqual(isComplete("_EVALUATION_COMPLETE_"), true);
    assert.strictEqual(isComplete("`EVALUATION_COMPLETE`"), true);
    assert.strictEqual(
      isComplete(
        "Good work.\n\n**EVALUATION_COMPLETE**\n\nNow filing issues.",
      ),
      true,
    );
  });

  test("matches EVALUATION_COMPLETE anywhere in text", () => {
    assert.strictEqual(isComplete("not EVALUATION_COMPLETE yet"), true);
    assert.strictEqual(
      isComplete("The agent is EVALUATION_COMPLETE done"),
      true,
    );
    assert.strictEqual(
      isComplete("Great work! EVALUATION_COMPLETE. Now filing issues."),
      true,
    );
  });

  test("does not match empty or unrelated text", () => {
    assert.strictEqual(isComplete(""), false);
    assert.strictEqual(isComplete("All done!"), false);
    assert.strictEqual(isComplete("DONE"), false);
  });

  test("does not match old EVALUATION_SUCCESSFUL signal", () => {
    assert.strictEqual(isComplete("EVALUATION_SUCCESSFUL"), false);
  });
});

describe("Supervisor - run and turns", () => {
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

  test("detects EVALUATION_COMPLETE in streamed messages when result text differs", async () => {
    const agentRunner = createMockRunner([
      { text: "I installed the packages." },
    ]);

    const supervisorMessages = [
      undefined,
      [
        {
          type: "assistant",
          message: {
            content: [
              {
                type: "text",
                text: "Good work.\n\nEVALUATION_COMPLETE\n\nNow filing issues.",
              },
            ],
          },
        },
        {
          type: "assistant",
          message: {
            content: [
              { type: "text", text: "## Summary\n\nAll issues filed." },
            ],
          },
        },
      ],
    ];

    const supervisorRunner = createMockRunner(
      [
        { text: "Welcome! Please install the packages." },
        { text: "## Summary\n\nAll issues filed." },
      ],
      supervisorMessages,
    );

    const output = new PassThrough();
    const supervisor = new Supervisor({
      agentRunner,
      supervisorRunner,
      output,
      maxTurns: 10,
    });
    agentRunner.onLine = (line) => supervisor.emitLine(line);
    supervisorRunner.onLine = (line) => supervisor.emitLine(line);

    const result = await supervisor.run("Install stuff");

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.turns, 1);
  });

  test("relays only the last assistant text block to the agent", async () => {
    // Supervisor emits reasoning text ("Let me research...") then a tool call,
    // then a final task message. Only the final message should reach the agent.
    const supervisorMessages = [
      // Turn 0: multiple assistant messages with reasoning + task
      [
        {
          type: "assistant",
          message: {
            content: [
              { type: "text", text: "Let me research the product first." },
            ],
          },
        },
        {
          type: "assistant",
          message: {
            content: [
              {
                type: "text",
                text: "Hello! Here is your task: install the packages.",
              },
            ],
          },
        },
      ],
      // Turn 1: evaluation
      undefined,
    ];

    let capturedAgentPrompt = null;
    const agentRunner = createMockRunner([
      { text: "I installed the packages." },
    ]);
    const origRun = agentRunner.run;
    agentRunner.run = async (task) => {
      capturedAgentPrompt = task;
      return origRun.call(agentRunner, task);
    };

    const supervisorRunner = createMockRunner(
      [
        // SDK result text = last message text (but relay should use buffer)
        { text: "Hello! Here is your task: install the packages." },
        { text: "EVALUATION_COMPLETE" },
      ],
      supervisorMessages,
    );

    const output = new PassThrough();
    const supervisor = new Supervisor({
      agentRunner,
      supervisorRunner,
      output,
      maxTurns: 10,
    });

    await supervisor.run("Evaluate the product");

    // Agent should receive only the final text, not the reasoning
    assert.strictEqual(
      capturedAgentPrompt,
      "Hello! Here is your task: install the packages.",
    );
    assert.ok(
      !capturedAgentPrompt.includes("research"),
      "Reasoning text should not leak to agent",
    );
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
});
