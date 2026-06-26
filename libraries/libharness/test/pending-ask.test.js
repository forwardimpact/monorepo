import { describe, test } from "node:test";
import assert from "node:assert";
import { PassThrough } from "node:stream";

import { Facilitator, Supervisor } from "@forwardimpact/libharness";
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
import { createToolUseMsg } from "@forwardimpact/libmock";

const noop = () => createNoopRedactor();

const askMsg = (to, question) =>
  createToolUseMsg("Ask", { to, question }, { id: `ask-${to ?? "broadcast"}` });
const answerMsg = (askId, message) =>
  createToolUseMsg("Answer", { askId, message }, { id: `answer-${askId}` });
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

/**
 * Build an Answer tool_use that quotes the askId of the *only* pending ask
 * targeted at `addressee`. The mock runner dispatches tool_uses inside the
 * scripted assistant message body, but the askId isn't known until the
 * sync Ask handler has run — so we resolve it lazily by snapshotting the
 * ctx at dispatch time via a custom dispatcher entry.
 */
function makeAnswerDispatcher(ctx, addressee, message) {
  const handler = createAnswerHandler(ctx, { from: addressee });
  return async (_input) => {
    const owed = [...ctx.pendingAsks.values()].find(
      (e) => e.addresseeName === addressee,
    );
    if (!owed) {
      // No pending ask — let the handler surface the error.
      return handler({ message });
    }
    return handler({ askId: owed.askId, message });
  };
}

describe("Pending-ask registry — handler transitions", () => {
  test("Sync Ask sets a pending entry; Answer clears it; Announce leaves it untouched", async () => {
    const { ctx } = seedFacilitated(["facilitator", "agent-1"]);
    const ask = createAskHandler(ctx, {
      from: "facilitator",
      defaultTo: undefined,
    });
    const answer = createAnswerHandler(ctx, { from: "agent-1" });
    const announce = createAnnounceHandler(ctx, { from: "agent-1" });

    const pending = ask({ question: "Are you there?", to: "agent-1" });
    await Promise.resolve();
    assert.strictEqual(ctx.pendingAsks.size, 1);
    const [entry] = [...ctx.pendingAsks.values()];

    await announce({ message: "Unrelated chatter" });
    assert.strictEqual(ctx.pendingAsks.size, 1);

    await answer({ askId: entry.askId, message: "Yes." });
    await pending;
    assert.strictEqual(ctx.pendingAsks.size, 0);
  });
});

describe("Pending-ask enforcement — facilitated mode", () => {
  test("happy path: Ask → Answer produces no protocol_violation", async () => {
    const { ctx, messageBus } = seedFacilitated(["facilitator", "agent-1"]);
    const askHandler = createAskHandler(ctx, {
      from: "facilitator",
      defaultTo: undefined,
    });
    const concludeHandler = createConcludeHandler(ctx);

    const facilitatorRunner = createMockRunner(
      [{ text: "Asking" }, { text: "Concluding" }],
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
      [[answerMsg(0, "Here.")]], // askId resolved lazily below
      {
        toolDispatcher: {
          Answer: makeAnswerDispatcher(ctx, "agent-1", "Here."),
        },
      },
    );

    const output = new PassThrough();
    const facilitator = new Facilitator({
      facilitatorRunner,
      agents: [{ name: "agent-1", role: "worker", runner: agentRunner }],
      messageBus,
      output,
      ctx,
      redactor: noop(),
    });

    const result = await facilitator.run("Start");
    assert.strictEqual(result.success, true);
    const violations = parseLines(output).filter(
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

    const facilitatorRunner = createMockRunner(
      [{ text: "Asking" }, { text: "Concluding" }],
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
        [answerMsg(0, "Answer after reminder")],
      ],
      {
        toolDispatcher: {
          Answer: makeAnswerDispatcher(ctx, "agent-1", "Answer after reminder"),
        },
      },
    );

    const output = new PassThrough();
    const facilitator = new Facilitator({
      facilitatorRunner,
      agents: [{ name: "agent-1", role: "worker", runner: agentRunner }],
      messageBus,
      output,
      ctx,
      redactor: noop(),
    });

    const result = await facilitator.run("Start");
    assert.strictEqual(result.success, true);
    const violations = parseLines(output).filter(
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

    // Lead turn 0: Ask, end turn. Turn 1: see [no answer], Conclude.
    const facilitatorRunner = createMockRunner(
      [{ text: "Asking" }, { text: "Advancing" }],
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
      ctx,
      redactor: noop(),
    });

    const result = await facilitator.run("Start");
    assert.strictEqual(result.success, true);
    const violations = parseLines(output).filter(
      (l) => l.event?.type === "protocol_violation",
    );
    assert.strictEqual(violations.length, 1);
    assert.strictEqual(violations[0].event.agent, "agent-1");
    assert.strictEqual(violations[0].event.mode, "facilitated");
    assert.strictEqual(typeof violations[0].event.askId, "number");
  });
});

describe("Pending-ask enforcement — supervised mode", () => {
  test("supervisor → agent Ask: agent ignores twice → protocol_violation, session advances", async () => {
    const { ctx, messageBus } = seedSupervise();
    // Supervise is now sync Ask like facilitate/discuss — supervisor Ask
    // blocks until agent answers; reminder/violation logic is shared.
    const supAskHandler = createAskHandler(ctx, {
      from: "supervisor",
      defaultTo: "agent",
    });
    const concludeHandler = createConcludeHandler(ctx);

    // Supervisor turn 0: Ask, end turn. Turn 1: see [no answer], Conclude.
    const supervisorRunner = createMockRunner(
      [{ text: "Asking" }, { text: "Advancing" }],
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
      ctx,
      messageBus,
      redactor: noop(),
    });

    const result = await supervisor.run("Task");
    assert.strictEqual(result.success, true);
    const violations = parseLines(output).filter(
      (l) => l.event?.type === "protocol_violation",
    );
    assert.strictEqual(violations.length, 1);
    assert.strictEqual(violations[0].event.mode, "supervised");
    assert.strictEqual(violations[0].event.agent, "agent");
  });
});

describe("Pending-ask enforcement — broadcast Ask", () => {
  test("one non-answering participant yields exactly one protocol_violation; others clear", async () => {
    const { ctx, messageBus } = seedFacilitated(["facilitator", "a", "b", "c"]);
    const askHandler = createAskHandler(ctx, {
      from: "facilitator",
      defaultTo: undefined,
    });
    const concludeHandler = createConcludeHandler(ctx);

    // Lead turn 0: broadcast Ask. Turn 1: a/b answers arrive while c is
    // still ignoring; lead just acknowledges and waits. Turn 2: c's
    // synthetic [no answer] lands after its reminder cycle; concludes.
    const facilitatorRunner = createMockRunner(
      [
        { text: "Asking all" },
        { text: "Got partial replies" },
        { text: "Concluding" },
      ],
      [
        [askMsg(undefined, "Ready?")],
        [{ type: "assistant", content: "Still waiting on c." }],
        [concludeMsg("Done")],
      ],
      {
        toolDispatcher: {
          Ask: (i) => askHandler(i),
          Conclude: (i) => concludeHandler(i),
        },
      },
    );

    const aRunner = createMockRunner(
      [{ text: "a yes" }],
      [[answerMsg(0, "A")]],
      { toolDispatcher: { Answer: makeAnswerDispatcher(ctx, "a", "A") } },
    );
    const bRunner = createMockRunner(
      [{ text: "b yes" }],
      [[answerMsg(0, "B")]],
      { toolDispatcher: { Answer: makeAnswerDispatcher(ctx, "b", "B") } },
    );
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
      ctx,
      redactor: noop(),
    });

    const result = await facilitator.run("Start");
    assert.strictEqual(result.success, true);
    const violations = parseLines(output).filter(
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
