import { describe, test } from "node:test";
import assert from "node:assert";
import { PassThrough } from "node:stream";

import { AgentRunner, Supervisor } from "@forwardimpact/libeval";
import { isSuccessful } from "../src/supervisor.js";

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

describe("isSuccessful", () => {
  test("detects EVALUATION_SUCCESSFUL on its own line", () => {
    assert.strictEqual(isSuccessful("EVALUATION_SUCCESSFUL"), true);
    assert.strictEqual(
      isSuccessful("Some text\nEVALUATION_SUCCESSFUL\nMore text"),
      true,
    );
    assert.strictEqual(isSuccessful("Done.\n\nEVALUATION_SUCCESSFUL"), true);
  });

  test("tolerates markdown formatting around the signal", () => {
    assert.strictEqual(isSuccessful("**EVALUATION_SUCCESSFUL**"), true);
    assert.strictEqual(isSuccessful("*EVALUATION_SUCCESSFUL*"), true);
    assert.strictEqual(isSuccessful("__EVALUATION_SUCCESSFUL__"), true);
    assert.strictEqual(isSuccessful("_EVALUATION_SUCCESSFUL_"), true);
    assert.strictEqual(isSuccessful("`EVALUATION_SUCCESSFUL`"), true);
    assert.strictEqual(
      isSuccessful(
        "Good work.\n\n**EVALUATION_SUCCESSFUL**\n\nNow filing issues.",
      ),
      true,
    );
  });

  test("matches EVALUATION_SUCCESSFUL anywhere in text", () => {
    assert.strictEqual(isSuccessful("not EVALUATION_SUCCESSFUL yet"), true);
    assert.strictEqual(
      isSuccessful("The agent is EVALUATION_SUCCESSFUL done"),
      true,
    );
    assert.strictEqual(
      isSuccessful("Great work! EVALUATION_SUCCESSFUL. Now filing issues."),
      true,
    );
  });

  test("does not match empty or unrelated text", () => {
    assert.strictEqual(isSuccessful(""), false);
    assert.strictEqual(isSuccessful("All done!"), false);
    assert.strictEqual(isSuccessful("DONE"), false);
  });

  test("does not match old EVALUATION_COMPLETE signal", () => {
    assert.strictEqual(isSuccessful("EVALUATION_COMPLETE"), false);
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

  test("completes on EVALUATION_SUCCESSFUL from supervisor at turn 0", async () => {
    const agentRunner = createMockRunner([]);

    const supervisorRunner = createMockRunner([
      { text: "EVALUATION_SUCCESSFUL" },
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
      { text: "Good work.\n\nEVALUATION_SUCCESSFUL" },
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

  test("detects EVALUATION_SUCCESSFUL in streamed messages when result text differs", async () => {
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
                text: "Good work.\n\nEVALUATION_SUCCESSFUL\n\nNow filing issues.",
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
      { text: "EVALUATION_SUCCESSFUL" },
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
