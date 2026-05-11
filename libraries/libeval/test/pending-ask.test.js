import { describe, test } from "node:test";
import assert from "node:assert";
import { PassThrough } from "node:stream";

import { Facilitator, Supervisor } from "@forwardimpact/libeval";
import {
  createOrchestrationContext,
  createAskHandler,
  createAnswerHandler,
  createAnnounceHandler,
  createConcludeHandler,
} from "../src/orchestration-toolkit.js";
import { isSuppressedOrchestratorEvent } from "../src/render/orchestrator-filter.js";
import { MessageBus } from "../src/message-bus.js";
import { createNoopRedactor } from "../src/redaction.js";
import { createMockRunner } from "./mock-runner.js";
import { createToolUseMsg } from "@forwardimpact/libharness";

const noop = () => createNoopRedactor();

const askMsg = (to, question) =>
  createToolUseMsg("Ask", { to, question }, { id: `ask-${to}` });
const answerMsg = (message) =>
  createToolUseMsg("Answer", { message }, { id: "answer-1" });
const concludeMsg = (summary, verdict = "success") =>
  createToolUseMsg("Conclude", { verdict, summary });

function seedFacilitated(names) {
  const ctx = createOrchestrationContext();
  const messageBus = new MessageBus({ participants: names });
  ctx.messageBus = messageBus;
  ctx.participants = names.map((name) => ({ name, role: name }));
  return { ctx, messageBus };
}

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

function parseLines(output) {
  return (output.read()?.toString() ?? "")
    .trim()
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l));
}

describe("Pending-ask registry — handler transitions (SC 2)", () => {
  test("Ask sets a pending entry, Answer clears it, Announce leaves it untouched", async () => {
    const { ctx } = seedFacilitated(["facilitator", "agent-1"]);
    const ask = createAskHandler(ctx, {
      from: "facilitator",
      defaultTo: undefined,
    });
    const answer = createAnswerHandler(ctx, { from: "agent-1" });
    const announce = createAnnounceHandler(ctx, { from: "agent-1" });

    await ask({ question: "Are you there?", to: "agent-1" });
    assert.strictEqual(ctx.pendingAsks.size, 1);
    assert.ok(ctx.pendingAsks.has("agent-1"));

    await announce({ message: "Unrelated chatter" });
    assert.strictEqual(ctx.pendingAsks.size, 1);

    await answer({ message: "Yes." });
    assert.strictEqual(ctx.pendingAsks.size, 0);
  });
});

describe("Pending-ask enforcement — facilitated mode (SC 3)", () => {
  test("happy path: Ask → Answer produces no protocol_violation", async () => {
    const { ctx, messageBus } = seedFacilitated(["facilitator", "agent-1"]);
    const askHandler = createAskHandler(ctx, {
      from: "facilitator",
      defaultTo: undefined,
    });
    const concludeHandler = createConcludeHandler(ctx);
    const agentAnswerHandler = createAnswerHandler(ctx, { from: "agent-1" });

    const facilitatorRunner = createMockRunner(
      [{ text: "Asking" }, { text: "Done" }],
      [[askMsg("agent-1", "What?")], [concludeMsg("Done")]],
      {
        toolDispatcher: {
          Ask: (i) => askHandler(i),
          Conclude: (i) => concludeHandler(i),
        },
      },
    );
    const agentRunner = createMockRunner(
      [{ text: "Replying" }],
      [[answerMsg("Here.")]],
      {
        toolDispatcher: { Answer: (i) => agentAnswerHandler(i) },
      },
    );

    const output = new PassThrough();
    const facilitator = new Facilitator({
      facilitatorRunner,
      agents: [{ name: "agent-1", role: "worker", runner: agentRunner }],
      messageBus,
      output,
      maxTurns: 10,
      ctx,
      redactor: noop(),
    });

    const result = await facilitator.run("Start");
    assert.strictEqual(result.success, true);
    const lines = parseLines(output);
    const violations = lines.filter(
      (l) => l.event?.type === "protocol_violation",
    );
    assert.strictEqual(violations.length, 0);
  });

  test("one-reminder path: agent answers after synthetic reminder → no violation", async () => {
    const { ctx, messageBus } = seedFacilitated(["facilitator", "agent-1"]);
    const askHandler = createAskHandler(ctx, {
      from: "facilitator",
      defaultTo: undefined,
    });
    const concludeHandler = createConcludeHandler(ctx);
    const agentAnswerHandler = createAnswerHandler(ctx, { from: "agent-1" });

    const facilitatorRunner = createMockRunner(
      [{ text: "Asking" }, { text: "Done" }],
      [[askMsg("agent-1", "What?")], [concludeMsg("Done")]],
      {
        toolDispatcher: {
          Ask: (i) => askHandler(i),
          Conclude: (i) => concludeHandler(i),
        },
      },
    );
    // Agent turn 1: no Answer. Agent turn 2 (post-reminder resume): Answer.
    const agentRunner = createMockRunner(
      [{ text: "thinking" }, { text: "replying" }],
      [
        [{ type: "assistant", content: "thinking..." }],
        [answerMsg("Answer after reminder")],
      ],
      {
        toolDispatcher: { Answer: (i) => agentAnswerHandler(i) },
      },
    );

    const output = new PassThrough();
    const facilitator = new Facilitator({
      facilitatorRunner,
      agents: [{ name: "agent-1", role: "worker", runner: agentRunner }],
      messageBus,
      output,
      maxTurns: 10,
      ctx,
      redactor: noop(),
    });

    const result = await facilitator.run("Start");
    assert.strictEqual(result.success, true);
    const lines = parseLines(output);
    const violations = lines.filter(
      (l) => l.event?.type === "protocol_violation",
    );
    assert.strictEqual(violations.length, 0);
  });

  test("violation path: two ignored detections emit exactly one protocol_violation and the session advances", async () => {
    const { ctx, messageBus } = seedFacilitated(["facilitator", "agent-1"]);
    const askHandler = createAskHandler(ctx, {
      from: "facilitator",
      defaultTo: undefined,
    });
    const concludeHandler = createConcludeHandler(ctx);

    const facilitatorRunner = createMockRunner(
      [{ text: "Asking" }, { text: "Closing" }],
      [[askMsg("agent-1", "What?")], [concludeMsg("Advanced")]],
      {
        toolDispatcher: {
          Ask: (i) => askHandler(i),
          Conclude: (i) => concludeHandler(i),
        },
      },
    );
    // Agent never Answers — two silent turns in a row.
    const agentRunner = createMockRunner(
      [{ text: "silence" }, { text: "still silent" }],
      [
        [{ type: "assistant", content: "quiet 1" }],
        [{ type: "assistant", content: "quiet 2" }],
      ],
    );

    const output = new PassThrough();
    const facilitator = new Facilitator({
      facilitatorRunner,
      agents: [{ name: "agent-1", role: "worker", runner: agentRunner }],
      messageBus,
      output,
      maxTurns: 10,
      ctx,
      redactor: noop(),
    });

    const result = await facilitator.run("Start");
    assert.strictEqual(result.success, true);
    const lines = parseLines(output);
    const violations = lines.filter(
      (l) => l.event?.type === "protocol_violation",
    );
    assert.strictEqual(violations.length, 1);
    assert.strictEqual(violations[0].event.agent, "agent-1");
    assert.strictEqual(violations[0].event.mode, "facilitated");
    assert.strictEqual(typeof violations[0].event.askId, "number");
  });
});

describe("Pending-ask enforcement — supervised mode (SC 3)", () => {
  test("supervisor → agent Ask: agent ignores twice → protocol_violation, session advances", async () => {
    const { ctx, messageBus } = seedSupervise();
    const supAskHandler = createAskHandler(ctx, {
      from: "supervisor",
      defaultTo: "agent",
    });
    const concludeHandler = createConcludeHandler(ctx);

    // Supervisor turn 0: Ask. Turn 1 (endOfTurnReview): Conclude after
    // seeing the agent never answered.
    const supervisorRunner = createMockRunner(
      [{ text: "Asking" }, { text: "Concluding" }],
      [
        [askMsg(undefined, "Are you ready?")],
        [concludeMsg("Advanced past violation")],
      ],
      {
        toolDispatcher: {
          Ask: (i) => supAskHandler(i),
          Conclude: (i) => concludeHandler(i),
        },
      },
    );

    // Agent never Answers — turn 1 silent, turn 2 (post-reminder) still silent.
    const agentRunner = createMockRunner(
      [{ text: "thinking" }, { text: "still thinking" }],
      [
        [{ type: "assistant", content: "silence 1" }],
        [{ type: "assistant", content: "silence 2" }],
      ],
    );

    const output = new PassThrough();
    const supervisor = new Supervisor({
      agentRunner,
      supervisorRunner,
      output,
      maxTurns: 5,
      ctx,
      messageBus,
      redactor: noop(),
    });

    const result = await supervisor.run("Task");
    assert.strictEqual(result.success, true);
    const lines = parseLines(output);
    const violations = lines.filter(
      (l) => l.event?.type === "protocol_violation",
    );
    assert.strictEqual(violations.length, 1);
    assert.strictEqual(violations[0].event.mode, "supervised");
    assert.strictEqual(violations[0].event.agent, "agent");
  });
});

describe("Pending-ask enforcement — broadcast Ask (SC 3)", () => {
  test("one non-answering participant yields exactly one protocol_violation; others clear", async () => {
    const { ctx, messageBus } = seedFacilitated(["facilitator", "a", "b", "c"]);
    const askHandler = createAskHandler(ctx, {
      from: "facilitator",
      defaultTo: undefined,
    });
    const concludeHandler = createConcludeHandler(ctx);
    const aAnswer = createAnswerHandler(ctx, { from: "a" });
    const bAnswer = createAnswerHandler(ctx, { from: "b" });

    const facilitatorRunner = createMockRunner(
      [{ text: "Asking all" }, { text: "Done" }],
      [[askMsg(undefined, "Ready?")], [concludeMsg("Done")]],
      {
        toolDispatcher: {
          Ask: (i) => askHandler(i),
          Conclude: (i) => concludeHandler(i),
        },
      },
    );

    const aRunner = createMockRunner([{ text: "a yes" }], [[answerMsg("A")]], {
      toolDispatcher: { Answer: (i) => aAnswer(i) },
    });
    const bRunner = createMockRunner([{ text: "b yes" }], [[answerMsg("B")]], {
      toolDispatcher: { Answer: (i) => bAnswer(i) },
    });
    // c never answers (two silent turns for the reminder cycle)
    const cRunner = createMockRunner(
      [{ text: "silence 1" }, { text: "silence 2" }],
      [
        [{ type: "assistant", content: "1" }],
        [{ type: "assistant", content: "2" }],
      ],
    );

    const output = new PassThrough();
    const facilitator = new Facilitator({
      facilitatorRunner,
      agents: [
        { name: "a", role: "a", runner: aRunner },
        { name: "b", role: "b", runner: bRunner },
        { name: "c", role: "c", runner: cRunner },
      ],
      messageBus,
      output,
      maxTurns: 10,
      ctx,
      redactor: noop(),
    });

    const result = await facilitator.run("Start");
    assert.strictEqual(result.success, true);
    const lines = parseLines(output);
    const violations = lines.filter(
      (l) => l.event?.type === "protocol_violation",
    );
    assert.strictEqual(violations.length, 1);
    assert.strictEqual(violations[0].event.agent, "c");
  });
});

describe("Orchestrator filter preserves protocol_violation", () => {
  test("protocol_violation is not in the suppressed set", () => {
    assert.strictEqual(
      isSuppressedOrchestratorEvent({ type: "protocol_violation" }),
      false,
    );
  });
});
