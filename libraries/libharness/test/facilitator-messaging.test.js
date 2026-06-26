import { describe, test } from "node:test";
import assert from "node:assert";
import { PassThrough } from "node:stream";

import { Facilitator } from "@forwardimpact/libharness";
import {
  createAnnounceHandler,
  createAnswerHandler,
  createAskHandler,
  createConcludeHandler,
  createOrchestrationContext,
  createRollCallHandler,
} from "../src/orchestration-toolkit.js";
import { createMockRunner } from "./mock-runner.js";
import { createToolUseMsg } from "@forwardimpact/libmock";
import {
  noop,
  concludeMsg,
  askMsg,
  answerMsgPlaceholder,
  announceMsg,
  seedCtx,
  answerDispatcher,
} from "./facilitator-helpers.js";

describe("Facilitator - messaging", () => {
  test("Ask delivers questions to specific agents; each receives the right task", async () => {
    const { ctx, messageBus } = seedCtx(["facilitator", "agent-1", "agent-2"]);
    const concludeHandler = createConcludeHandler(ctx);
    const askHandler = createAskHandler(ctx, {
      from: "facilitator",
      defaultTo: undefined,
    });

    // Lead turn 0: parallel Asks. Turn 1: replies arrive (one or both
    // batches depending on microtask interleaving) → Conclude.
    const facilitatorRunner = createMockRunner(
      [{ text: "Assigning" }, { text: "Done" }],
      [
        [askMsg("agent-1", "Do task A"), askMsg("agent-2", "Do task B")],
        [concludeMsg("Complete")],
      ],
      {
        toolDispatcher: {
          Ask: (input) => askHandler(input),
          Conclude: (input) => concludeHandler(input),
        },
      },
    );

    let agent1Task = null;
    let agent2Task = null;
    const agent1Runner = createMockRunner(
      [{ text: "Did A" }],
      [[answerMsgPlaceholder()]],
      {
        toolDispatcher: { Answer: answerDispatcher(ctx, "agent-1", "A done") },
      },
    );
    const origRun1 = agent1Runner.run;
    agent1Runner.run = async (task) => {
      agent1Task = task;
      return origRun1.call(agent1Runner, task);
    };
    const agent2Runner = createMockRunner(
      [{ text: "Did B" }],
      [[answerMsgPlaceholder()]],
      {
        toolDispatcher: { Answer: answerDispatcher(ctx, "agent-2", "B done") },
      },
    );
    const origRun2 = agent2Runner.run;
    agent2Runner.run = async (task) => {
      agent2Task = task;
      return origRun2.call(agent2Runner, task);
    };

    const output = new PassThrough();
    const facilitator = new Facilitator({
      facilitatorRunner,
      agents: [
        { name: "agent-1", role: "a", runner: agent1Runner },
        { name: "agent-2", role: "b", runner: agent2Runner },
      ],
      messageBus,
      output,
      ctx,
      redactor: noop(),
    });

    await facilitator.run("Coordinate");

    assert.ok(agent1Task && agent1Task.includes("Do task A"));
    assert.ok(agent2Task && agent2Task.includes("Do task B"));
  });

  test("Announce delivers to all participants except sender", async () => {
    const { ctx, messageBus } = seedCtx(["facilitator", "agent-1", "agent-2"]);
    const concludeHandler = createConcludeHandler(ctx);
    const announceHandler = createAnnounceHandler(ctx, {
      from: "facilitator",
    });

    const facilitatorRunner = createMockRunner(
      [{ text: "Broadcasting" }],
      [[announceMsg("Everyone listen"), concludeMsg("Complete")]],
      {
        toolDispatcher: {
          Announce: (input) => announceHandler(input),
          Conclude: (input) => concludeHandler(input),
        },
      },
    );

    let agent1Task = null;
    let agent2Task = null;
    const agent1Runner = createMockRunner([{ text: "Heard" }]);
    const origRun1 = agent1Runner.run;
    agent1Runner.run = async (task) => {
      agent1Task = task;
      return origRun1.call(agent1Runner, task);
    };
    const agent2Runner = createMockRunner([{ text: "Heard" }]);
    const origRun2 = agent2Runner.run;
    agent2Runner.run = async (task) => {
      agent2Task = task;
      return origRun2.call(agent2Runner, task);
    };

    const output = new PassThrough();
    const facilitator = new Facilitator({
      facilitatorRunner,
      agents: [
        { name: "agent-1", role: "a", runner: agent1Runner },
        { name: "agent-2", role: "b", runner: agent2Runner },
      ],
      messageBus,
      output,
      ctx,
      redactor: noop(),
    });

    await facilitator.run("Broadcast test");

    assert.ok(agent1Task && agent1Task.includes("Everyone listen"));
    assert.ok(agent2Task && agent2Task.includes("Everyone listen"));
  });

  test("RollCall returns participant list", async () => {
    const ctx = createOrchestrationContext();
    ctx.participants = [
      { name: "facilitator", role: "facilitator" },
      { name: "agent-1", role: "explorer" },
    ];
    const result = await createRollCallHandler(ctx)();
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.length, 2);
  });
});

describe("Facilitator - bidirectional Ask", () => {
  test("agent-initiated Ask routes to the facilitator; facilitator answers via Answer", async () => {
    const { ctx, messageBus } = seedCtx(["facilitator", "agent-1"]);
    const concludeHandler = createConcludeHandler(ctx);
    const facilitatorAskHandler = createAskHandler(ctx, {
      from: "facilitator",
      defaultTo: undefined,
    });
    const agentAskHandler = createAskHandler(ctx, {
      from: "agent-1",
      defaultTo: "facilitator",
    });
    const facilitatorAnswerHandler = createAnswerHandler(ctx, {
      from: "facilitator",
    });

    // Sequence (each side handles one message per turn — no in-turn
    // Answer-and-Ask collapses, so the inboxes drain deterministically
    // under the auto-resume model):
    //
    //   fac.0: Ask agent ("What runtime?")            askId=1
    //   agt.0: Ask fac  ("What version is required?")  askId=2
    //   fac.1: Answer askId=2 (still owes askId=1)     end turn
    //   agt.1: Answer askId=1                          end turn
    //   fac.2: Conclude (no pending Asks)
    const facilitatorAnswerDispatcher = async () => {
      const owed = [...ctx.pendingAsks.values()].find(
        (e) => e.addresseeName === "facilitator",
      );
      return facilitatorAnswerHandler({
        askId: owed?.askId,
        message: "use Bun 1.2+",
      });
    };
    const facilitatorRunner = createMockRunner(
      [{ text: "Asking" }, { text: "Answering" }, { text: "Concluding" }],
      [
        [askMsg("agent-1", "What runtime?")],
        [
          createToolUseMsg(
            "Answer",
            { askId: 0, message: "use Bun 1.2+" },
            { id: "fac-ans-1" },
          ),
        ],
        [concludeMsg("Done")],
      ],
      {
        toolDispatcher: {
          Ask: (input) => facilitatorAskHandler(input),
          Answer: facilitatorAnswerDispatcher,
          Conclude: (input) => concludeHandler(input),
        },
      },
    );

    const agentRunner = createMockRunner(
      [{ text: "Asking back" }, { text: "Replying" }],
      [
        [
          createToolUseMsg(
            "Ask",
            { question: "What version is required?" },
            { id: "agt-ask-1" },
          ),
        ],
        [answerMsgPlaceholder()],
      ],
      {
        toolDispatcher: {
          Answer: answerDispatcher(ctx, "agent-1", "node"),
          Ask: (input) => agentAskHandler(input),
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

    const result = await facilitator.run("Bidirectional");
    assert.strictEqual(result.success, true);
    assert.strictEqual(ctx.pendingAsks.size, 0);
  });
});
