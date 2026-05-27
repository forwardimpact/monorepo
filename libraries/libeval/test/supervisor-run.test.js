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
import { createToolUseMsg } from "@forwardimpact/libmock";

const noop = () => createNoopRedactor();

const concludeMsg = (summary, verdict = "success") =>
  createToolUseMsg("Conclude", { verdict, summary });
const askMsg = (question) =>
  createToolUseMsg("Ask", { question }, { id: "ask-1" });
const answerMsgPlaceholder = (suffix) =>
  createToolUseMsg(
    "Answer",
    { askId: 0, message: "" },
    { id: `answer-${suffix}` },
  );

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

/** Resolve askId of the only pending ask addressed to `from`. */
function answerDispatcher(ctx, from, message) {
  const handler = createAnswerHandler(ctx, { from });
  return async () => {
    const owed = [...ctx.pendingAsks.values()].find(
      (e) => e.addresseeName === from,
    );
    return handler({ askId: owed?.askId, message });
  };
}

describe("Supervisor - constructor validation", () => {
  test("throws on missing agentRunner", () => {
    assert.throws(
      () =>
        new Supervisor({
          supervisorRunner: createMockRunner([]),
          output: new PassThrough(),
          redactor: noop(),
        }),
      /agentRunner is required/,
    );
  });

  test("throws on missing supervisorRunner", () => {
    assert.throws(
      () =>
        new Supervisor({
          agentRunner: createMockRunner([]),
          output: new PassThrough(),
          redactor: noop(),
        }),
      /supervisorRunner is required/,
    );
  });

  test("throws on missing output", () => {
    assert.throws(
      () =>
        new Supervisor({
          agentRunner: createMockRunner([]),
          supervisorRunner: createMockRunner([]),
          redactor: noop(),
        }),
      /output is required/,
    );
  });
});

describe("Supervisor - sync session flow", () => {
  test("Conclude on turn 0 ends the session without starting the agent", async () => {
    const { ctx, messageBus } = seedSupervise();
    const concludeHandler = createConcludeHandler(ctx);

    let agentStarted = false;
    const agentRunner = createMockRunner([{ text: "Never" }]);
    const origRun = agentRunner.run;
    agentRunner.run = async (task) => {
      agentStarted = true;
      return origRun.call(agentRunner, task);
    };

    const supervisorRunner = createMockRunner(
      [{ text: "Done immediately" }],
      [[concludeMsg("Nothing to do")]],
      { toolDispatcher: { Conclude: (input) => concludeHandler(input) } },
    );

    const output = new PassThrough();
    const supervisor = new Supervisor({
      agentRunner,
      supervisorRunner,
      output,
      ctx,
      messageBus,
      redactor: noop(),
    });

    const result = await supervisor.run("Quick task");
    assert.strictEqual(result.success, true);
    assert.strictEqual(agentStarted, false);
    assert.strictEqual(ctx.summary, "Nothing to do");
  });

  test("Ask → agent answers → Conclude completes the session (verdict=success)", async () => {
    const { ctx, messageBus } = seedSupervise();
    const concludeHandler = createConcludeHandler(ctx);
    const askHandler = createAskHandler(ctx, {
      from: "supervisor",
      defaultTo: "agent",
    });

    const supervisorRunner = createMockRunner(
      [{ text: "Delegating" }, { text: "Concluding" }],
      [[askMsg("Install the packages.")], [concludeMsg("Done")]],
      {
        toolDispatcher: {
          Ask: (input) => askHandler(input),
          Conclude: (input) => concludeHandler(input),
        },
      },
    );

    const agentRunner = createMockRunner(
      [{ text: "Installed" }],
      [[answerMsgPlaceholder("1")]],
      {
        toolDispatcher: { Answer: answerDispatcher(ctx, "agent", "installed") },
      },
    );

    const output = new PassThrough();
    const supervisor = new Supervisor({
      agentRunner,
      supervisorRunner,
      output,
      ctx,
      messageBus,
      redactor: noop(),
    });

    const result = await supervisor.run("Install task");
    assert.strictEqual(result.success, true);
    assert.strictEqual(ctx.verdict, "success");
    assert.strictEqual(ctx.pendingAsks.size, 0);
  });

  test("Conclude with verdict=failure → result.success is false", async () => {
    const { ctx, messageBus } = seedSupervise();
    const concludeHandler = createConcludeHandler(ctx);
    const askHandler = createAskHandler(ctx, {
      from: "supervisor",
      defaultTo: "agent",
    });

    const supervisorRunner = createMockRunner(
      [{ text: "Reviewing" }, { text: "Concluding" }],
      [
        [askMsg("Do the work.")],
        [concludeMsg("Agent failed the task", "failure")],
      ],
      {
        toolDispatcher: {
          Ask: (input) => askHandler(input),
          Conclude: (input) => concludeHandler(input),
        },
      },
    );
    const agentRunner = createMockRunner(
      [{ text: "I tried." }],
      [[answerMsgPlaceholder("1")]],
      {
        toolDispatcher: {
          Answer: answerDispatcher(ctx, "agent", "I tried"),
        },
      },
    );

    const output = new PassThrough();
    const supervisor = new Supervisor({
      agentRunner,
      supervisorRunner,
      output,
      ctx,
      messageBus,
      redactor: noop(),
    });

    const result = await supervisor.run("Do the work");
    assert.strictEqual(result.success, false);
    assert.strictEqual(ctx.verdict, "failure");
  });

  test("agent error propagates: supervisor.run rejects with the agent's error", async () => {
    const { ctx, messageBus } = seedSupervise();
    const askHandler = createAskHandler(ctx, {
      from: "supervisor",
      defaultTo: "agent",
    });

    const supervisorRunner = createMockRunner(
      [{ text: "Delegating" }],
      [[askMsg("Do it.")]],
      { toolDispatcher: { Ask: (input) => askHandler(input) } },
    );
    const agentRunner = createMockRunner([{ text: "Crash" }]);
    agentRunner.run = async () => {
      throw new Error("Agent process crashed");
    };

    const output = new PassThrough();
    const supervisor = new Supervisor({
      agentRunner,
      supervisorRunner,
      output,
      ctx,
      messageBus,
      redactor: noop(),
    });

    await assert.rejects(() => supervisor.run("Install"), {
      message: "Agent process crashed",
    });
  });
});

describe("Supervisor - bidirectional Ask", () => {
  test("agent-initiated Ask routes to the supervisor; supervisor answers via Answer", async () => {
    const { ctx, messageBus } = seedSupervise();
    const concludeHandler = createConcludeHandler(ctx);
    const supAskHandler = createAskHandler(ctx, {
      from: "supervisor",
      defaultTo: "agent",
    });
    const agentAskHandler = createAskHandler(ctx, {
      from: "agent",
      defaultTo: "supervisor",
    });

    // Supervisor delegates work. When the agent's Ask comes back in the
    // tool_result's `incoming` field, supervisor answers it via Answer
    // and then concludes.
    const supervisorAnswerDispatcher = async () => {
      const owed = [...ctx.pendingAsks.values()].find(
        (e) => e.addresseeName === "supervisor",
      );
      return createAnswerHandler(ctx, { from: "supervisor" })({
        askId: owed?.askId,
        message: "Use npm.",
      });
    };
    const supervisorRunner = createMockRunner(
      [{ text: "Coordinating" }],
      [
        [
          askMsg("Install the packages."),
          createToolUseMsg(
            "Answer",
            { askId: 0, message: "Use npm." },
            { id: "sup-ans-1" },
          ),
          concludeMsg("Done"),
        ],
      ],
      {
        toolDispatcher: {
          Ask: (input) => supAskHandler(input),
          Answer: supervisorAnswerDispatcher,
          Conclude: (input) => concludeHandler(input),
        },
      },
    );

    // Agent answers the supervisor's question (with a question of its own
    // alongside, which is a sync Ask back).
    const agentAnswerDispatcher = async () => {
      const owed = [...ctx.pendingAsks.values()].find(
        (e) => e.addresseeName === "agent",
      );
      return createAnswerHandler(ctx, { from: "agent" })({
        askId: owed?.askId,
        message: "Installed.",
      });
    };
    const agentRunner = createMockRunner(
      [{ text: "Replying and asking back" }],
      [
        [
          answerMsgPlaceholder("a1"),
          createToolUseMsg(
            "Ask",
            { question: "npm or yarn?" },
            { id: "agt-ask-1" },
          ),
        ],
      ],
      {
        toolDispatcher: {
          Answer: agentAnswerDispatcher,
          Ask: (input) => agentAskHandler(input),
        },
      },
    );

    const output = new PassThrough();
    const supervisor = new Supervisor({
      agentRunner,
      supervisorRunner,
      output,
      ctx,
      messageBus,
      redactor: noop(),
    });

    const result = await supervisor.run("Install task");
    assert.strictEqual(result.success, true);
    assert.strictEqual(ctx.pendingAsks.size, 0);
  });
});
