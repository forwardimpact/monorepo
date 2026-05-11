import { describe, test } from "node:test";
import assert from "node:assert";
import { PassThrough } from "node:stream";

import { Facilitator } from "@forwardimpact/libeval";
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
const askMsg = (to, question) =>
  createToolUseMsg("Ask", { to, question }, { id: `ask-${to}` });
const answerMsg = (message) =>
  createToolUseMsg("Answer", { message }, { id: "answer-1" });

function seedCtx(participants) {
  const ctx = createOrchestrationContext();
  const messageBus = new MessageBus({ participants });
  ctx.messageBus = messageBus;
  ctx.participants = participants.map((name) => ({ name, role: name }));
  return { ctx, messageBus };
}

describe("Facilitator - re-Ask recovery", () => {
  test("re-Ask overwrites consumed slot so agent can Answer", async () => {
    const { ctx, messageBus } = seedCtx(["facilitator", "agent-1"]);
    const concludeHandler = createConcludeHandler(ctx);
    const askHandler = createAskHandler(ctx, {
      from: "facilitator",
      defaultTo: undefined,
    });

    // Turn 0: Ask agent-1 "What is 2+2?"
    // Turn 1 (after premature answer): Ask agent-1 again
    // Turn 2 (after correct answer): Conclude
    const facilitatorRunner = createMockRunner(
      [{ text: "Asking" }, { text: "Re-asking" }, { text: "Done" }],
      [
        [askMsg("agent-1", "What is 2+2?")],
        [askMsg("agent-1", "Please answer: what is 2+2?")],
        [concludeMsg("Complete")],
      ],
      {
        toolDispatcher: {
          Ask: (input) => askHandler(input),
          Conclude: (input) => concludeHandler(input),
        },
      },
    );

    const agent1AnswerHandler = createAnswerHandler(ctx, { from: "agent-1" });
    // Run 0: premature answer consuming the Ask slot
    // Resume (after re-Ask): correct answer — should succeed
    const agent1Runner = createMockRunner(
      [{ text: "Ready" }, { text: "Four" }],
      [[answerMsg("Ready")], [answerMsg("4")]],
      { toolDispatcher: { Answer: (i) => agent1AnswerHandler(i) } },
    );

    const output = new PassThrough();
    const facilitator = new Facilitator({
      facilitatorRunner,
      agents: [{ name: "agent-1", role: "worker", runner: agent1Runner }],
      messageBus,
      output,
      maxTurns: 10,
      ctx,
      redactor: noop(),
    });

    const result = await facilitator.run("Test re-Ask recovery");

    assert.strictEqual(result.success, true);
    assert.ok(
      !ctx.pendingAsks.has("agent-1"),
      "pending ask should be cleared after agent answered the re-Ask",
    );
  });
});
