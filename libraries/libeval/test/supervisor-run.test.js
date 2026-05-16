import { describe, test } from "node:test";
import assert from "node:assert";
import { PassThrough } from "node:stream";

import { Supervisor } from "@forwardimpact/libeval";
import {
  createOrchestrationContext,
  createConcludeHandler,
  createAskHandler,
  createAnswerHandler,
} from "../src/orchestration-toolkit.js";
import { MessageBus } from "../src/message-bus.js";
import { createNoopRedactor } from "../src/redaction.js";
import { createMockRunner } from "./mock-runner.js";
import { createToolUseMsg } from "@forwardimpact/libharness";

const noop = () => createNoopRedactor();

const concludeMsg = (summary, verdict = "success") =>
  createToolUseMsg("Conclude", { verdict, summary });
const askMsg = (question) =>
  createToolUseMsg("Ask", { question }, { id: "ask-1" });
const answerMsg = (message) =>
  createToolUseMsg("Answer", { message }, { id: "answer-1" });

function seedSupervise() {
  const ctx = createOrchestrationContext();
  const messageBus = new MessageBus({ participants: ["supervisor", "agent"] });
  ctx.messageBus = messageBus;
  ctx.participants = [
    { name: "supervisor", role: "supervisor" },
    { name: "agent", role: "agent" },
  ];
  return { ctx, messageBus };
}

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

  test("completes on Conclude tool call from supervisor at turn 0", async () => {
    const { ctx, messageBus } = seedSupervise();
    const concludeHandler = createConcludeHandler(ctx);

    const agentRunner = createMockRunner([]);

    const supervisorRunner = createMockRunner(
      [{ text: "Done" }],
      [[concludeMsg("All tasks complete")]],
      {
        toolDispatcher: {
          Conclude: (input) => concludeHandler(input),
        },
      },
    );

    const output = new PassThrough();
    const supervisor = new Supervisor({
      agentRunner,
      supervisorRunner,
      output,
      maxTurns: 10,
      ctx,
      messageBus,
      redactor: noop(),
    });

    const result = await supervisor.run("Install stuff");

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.turns, 0);
    assert.strictEqual(result.concluded, true);
    assert.strictEqual(ctx.summary, "All tasks complete");
  });

  test("completes after one agent turn", async () => {
    const { ctx, messageBus } = seedSupervise();
    const concludeHandler = createConcludeHandler(ctx);

    const agentRunner = createMockRunner([
      { text: "I installed the packages." },
    ]);

    const supervisorRunner = createMockRunner(
      [
        { text: "Welcome! Please install the packages." },
        { text: "Good work." },
      ],
      [undefined, [concludeMsg("Agent completed the task")]],
      {
        toolDispatcher: {
          Conclude: (input) => concludeHandler(input),
        },
      },
    );

    const output = new PassThrough();
    const supervisor = new Supervisor({
      agentRunner,
      supervisorRunner,
      output,
      maxTurns: 10,
      ctx,
      messageBus,
      redactor: noop(),
    });

    const result = await supervisor.run("Install stuff");

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.turns, 1);
    assert.strictEqual(result.concluded, true);
  });

  test("relays only the last assistant text block to the agent", async () => {
    const { ctx, messageBus } = seedSupervise();
    const concludeHandler = createConcludeHandler(ctx);

    const supervisorMessages = [
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
      [concludeMsg("Done")],
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
        { text: "Hello! Here is your task: install the packages." },
        { text: "Done" },
      ],
      supervisorMessages,
      {
        toolDispatcher: {
          Conclude: (input) => concludeHandler(input),
        },
      },
    );

    const output = new PassThrough();
    const supervisor = new Supervisor({
      agentRunner,
      supervisorRunner,
      output,
      maxTurns: 10,
      ctx,
      messageBus,
      redactor: noop(),
    });

    await supervisor.run("Evaluate the product");

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
    const { ctx, messageBus } = seedSupervise();
    const concludeHandler = createConcludeHandler(ctx);

    const agentRunner = createMockRunner([
      { text: "Started working." },
      { text: "Made progress." },
      { text: "Finished everything." },
    ]);

    const supervisorRunner = createMockRunner(
      [
        { text: "Here is your task. Do the work." },
        { text: "Keep going, you need to do more." },
        { text: "Almost there, continue." },
        { text: "Done" },
      ],
      [undefined, undefined, undefined, [concludeMsg("Complete")]],
      {
        toolDispatcher: {
          Conclude: (input) => concludeHandler(input),
        },
      },
    );

    const output = new PassThrough();
    const supervisor = new Supervisor({
      agentRunner,
      supervisorRunner,
      output,
      maxTurns: 10,
      ctx,
      messageBus,
      redactor: noop(),
    });

    const result = await supervisor.run("Do the work");

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.turns, 3);
  });

  test("enforces maxTurns limit", async () => {
    const { ctx, messageBus } = seedSupervise();
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
      ctx,
      messageBus,
      redactor: noop(),
    });

    const result = await supervisor.run("Endless task");

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.turns, 2);
    assert.strictEqual(result.concluded, false);
  });

  test("concluded=true even when verdict is failure", async () => {
    const { ctx, messageBus } = seedSupervise();
    const concludeHandler = createConcludeHandler(ctx);

    const agentRunner = createMockRunner([
      { text: "I did the work but it's wrong." },
    ]);

    const supervisorRunner = createMockRunner(
      [{ text: "Please do the work." }, { text: "That is not acceptable." }],
      [undefined, [concludeMsg("Agent failed the task", "failure")]],
      {
        toolDispatcher: {
          Conclude: (input) => concludeHandler(input),
        },
      },
    );

    const output = new PassThrough();
    const supervisor = new Supervisor({
      agentRunner,
      supervisorRunner,
      output,
      maxTurns: 10,
      ctx,
      messageBus,
      redactor: noop(),
    });

    const result = await supervisor.run("Do the work");

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.turns, 1);
    assert.strictEqual(result.concluded, true);
  });

  test("agent Ask → supervisor Answer round-trip", async () => {
    const { ctx, messageBus } = seedSupervise();
    const concludeHandler = createConcludeHandler(ctx);
    const agentAskHandler = createAskHandler(ctx, {
      from: "agent",
      defaultTo: "supervisor",
    });
    const supervisorAnswerHandler = createAnswerHandler(ctx, {
      from: "supervisor",
    });

    // Agent turn 1: calls Ask(question). Turn ends.
    const agentMessages = [
      [
        {
          type: "assistant",
          message: {
            content: [{ type: "text", text: "I have a question." }],
          },
        },
        askMsg("Should I use npm or yarn?"),
      ],
    ];

    const agentRunner = createMockRunner(
      [{ text: "Asked" }, { text: "Got the answer, proceeding." }],
      [
        ...agentMessages,
        [
          {
            type: "assistant",
            message: {
              content: [{ type: "text", text: "Got the answer, proceeding." }],
            },
          },
        ],
      ],
      {
        toolDispatcher: {
          Ask: (input) => agentAskHandler(input),
        },
      },
    );

    // Supervisor turn 0: relay task. Supervisor turn 1: Answer the agent's
    // question. Supervisor turn 2: Conclude.
    const supervisorRunner = createMockRunner(
      [
        { text: "Install the packages." },
        { text: "Use npm install." },
        { text: "Good" },
      ],
      [undefined, [answerMsg("Use npm install.")], [concludeMsg("Complete")]],
      {
        toolDispatcher: {
          Answer: (input) => supervisorAnswerHandler(input),
          Conclude: (input) => concludeHandler(input),
        },
      },
    );

    const output = new PassThrough();
    const supervisor = new Supervisor({
      agentRunner,
      supervisorRunner,
      output,
      maxTurns: 10,
      ctx,
      messageBus,
      redactor: noop(),
    });

    const result = await supervisor.run("Install task");

    assert.strictEqual(result.success, true);
    // After Answer, the pending ask entry keyed by "supervisor" is cleared.
    assert.strictEqual(ctx.pendingAsks.has("supervisor"), false);
  });
});
