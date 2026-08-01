import { describe, test } from "node:test";
import assert from "node:assert";
import { PassThrough } from "node:stream";

import { Facilitator } from "@forwardimpact/libharness";
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
const askMsg = (to, question, suffix) =>
  createToolUseMsg("Ask", { to, question }, { id: `ask-${to}-${suffix}` });
const answerMsgPlaceholder = (suffix) =>
  createToolUseMsg(
    "Answer",
    { askId: 0, message: "" },
    { id: `answer-${suffix}` },
  );

function seedCtx(participants) {
  const ctx = createOrchestrationContext();
  const messageBus = new MessageBus({ participants });
  ctx.messageBus = messageBus;
  ctx.participants = participants.map((name) => ({ name, role: name }));
  return { ctx, messageBus };
}

/**
 * Pop the *oldest* pending Ask addressed to `from` and route the answer
 * back through it. Mirrors how the agent picks up the next [ask#N] tag
 * from its inbox.
 */
function answerDispatcherInOrder(ctx, from, messages) {
  const handler = createAnswerHandler(ctx, { from });
  let cursor = 0;
  return async () => {
    const pending = [...ctx.pendingAsks.values()]
      .filter((e) => e.addresseeName === from)
      .sort((a, b) => a.askId - b.askId);
    const entry = pending[0];
    const message = messages[cursor++];
    return handler({ askId: entry?.askId, message });
  };
}

describe("Facilitator - duplicate-Ask resilience (regression for run 26336965189)", () => {
  test("two sequential Asks to the same addressee each get their own askId and the agent answers both", async () => {
    const { ctx, messageBus } = seedCtx(["facilitator", "agent-1"]);
    const concludeHandler = createConcludeHandler(ctx);
    const askHandler = createAskHandler(ctx, {
      from: "facilitator",
      defaultTo: undefined,
    });

    // The facilitator deliberately Asks twice in a row. That is the
    // broadcast-then-individual pattern that previously orphaned a queue
    // message. The lead issues both Asks in the same assistant turn and
    // dispatches them in parallel. Under the auto-resume model the lead
    // ends its turn after the two Asks. The agent answers each ask in
    // its own turn. A synthetic reminder unblocks the second. So the
    // lead may wake twice, once per answer. Conclude only runs after
    // both Asks clear. A second wake-up with nothing pending is a no-op
    // turn.
    const facilitatorRunner = createMockRunner(
      [
        { text: "Asking twice" },
        { text: "Waiting for the other answer" },
        { text: "Concluding" },
      ],
      [
        [
          askMsg("agent-1", "First question?", "1"),
          askMsg("agent-1", "Second question?", "2"),
        ],
        [],
        [concludeMsg("Both answered")],
      ],
      {
        toolDispatcher: {
          Ask: (input) => askHandler(input),
          Conclude: (input) => concludeHandler(input),
        },
      },
    );

    // The agent answers both, in order. Turn 1 answers ask#1. Turn 2
    // resumes when ask#2 lands and answers ask#2. This proves the two
    // asks coexist and never overwrite each other.
    const agent1Runner = createMockRunner(
      [{ text: "First" }, { text: "Second" }],
      [[answerMsgPlaceholder("1")], [answerMsgPlaceholder("2")]],
      {
        toolDispatcher: {
          Answer: answerDispatcherInOrder(ctx, "agent-1", [
            "answer to first",
            "answer to second",
          ]),
        },
      },
    );

    const output = new PassThrough();
    const facilitator = new Facilitator({
      facilitatorRunner,
      agents: [{ name: "agent-1", role: "worker", runner: agent1Runner }],
      messageBus,
      output,
      ctx,
      redactor: noop(),
    });

    const result = await facilitator.run("Test duplicate Asks");

    assert.strictEqual(result.success, true);
    assert.strictEqual(
      ctx.pendingAsks.size,
      0,
      "both pending entries should clear, and neither leaks as a phantom",
    );
  });
});
