import { describe, test } from "node:test";
import assert from "node:assert";
import { PassThrough } from "node:stream";

import { Facilitator } from "@forwardimpact/libeval";
import {
  createAnnounceHandler,
  createAnswerHandler,
  createAskHandler,
  createConcludeHandler,
  createOrchestrationContext,
  createRollCallHandler,
} from "../src/orchestration-toolkit.js";
import { MessageBus } from "../src/message-bus.js";
import { createNoopRedactor } from "../src/redaction.js";
import { createMockRunner } from "./mock-runner.js";
import { createToolUseMsg } from "@forwardimpact/libmock";

const noop = () => createNoopRedactor();

const concludeMsg = (summary, verdict = "success") =>
  createToolUseMsg("Conclude", { verdict, summary });
const askMsg = (to, question) =>
  createToolUseMsg(
    "Ask",
    { to, question },
    {
      id: `ask-${to ?? "broadcast"}-${Math.random().toString(36).slice(2, 6)}`,
    },
  );
const answerMsgPlaceholder = () =>
  createToolUseMsg(
    "Answer",
    // askId is resolved lazily by the dispatcher closure.
    { askId: 0, message: "" },
    { id: `answer-${Math.random().toString(36).slice(2, 6)}` },
  );
const announceMsg = (message) =>
  createToolUseMsg("Announce", { message }, { id: "announce-1" });

function seedCtx(participants) {
  const ctx = createOrchestrationContext();
  const messageBus = new MessageBus({ participants });
  ctx.messageBus = messageBus;
  ctx.participants = participants.map((name) => ({ name, role: name }));
  return { ctx, messageBus };
}

/**
 * Dispatcher that snapshots the only pending Ask addressed to `from` at
 * dispatch time and quotes its askId back to the Answer handler. Lets
 * mock scripts answer without knowing askIds ahead of time.
 */
function answerDispatcher(ctx, from, message) {
  const handler = createAnswerHandler(ctx, { from });
  return async () => {
    const owed = [...ctx.pendingAsks.values()].find(
      (e) => e.addresseeName === from,
    );
    return handler({ askId: owed?.askId, message });
  };
}

describe("Facilitator - core orchestration", () => {
  test("turn 0 Conclude: no agents start", async () => {
    const { ctx, messageBus } = seedCtx(["facilitator", "agent-1"]);
    const concludeHandler = createConcludeHandler(ctx);

    const facilitatorRunner = createMockRunner(
      [{ text: "Done immediately" }],
      [[concludeMsg("Nothing to do")]],
      { toolDispatcher: { Conclude: (input) => concludeHandler(input) } },
    );

    let agentStarted = false;
    const agentRunner = createMockRunner([{ text: "Never" }]);
    const origRun = agentRunner.run;
    agentRunner.run = async (task) => {
      agentStarted = true;
      return origRun.call(agentRunner, task);
    };

    const output = new PassThrough();
    const facilitator = new Facilitator({
      facilitatorRunner,
      agents: [{ name: "agent-1", role: "worker", runner: agentRunner }],
      messageBus,
      output,
      ctx,
      redactor: noop(),
    });

    const result = await facilitator.run("Quick task");
    assert.strictEqual(result.success, true);
    assert.strictEqual(agentStarted, false);
  });

  test("lazy start: agents only start when they receive a message", async () => {
    const { ctx, messageBus } = seedCtx(["facilitator", "agent-1", "agent-2"]);
    const concludeHandler = createConcludeHandler(ctx);
    const askHandler = createAskHandler(ctx, {
      from: "facilitator",
      defaultTo: undefined,
    });

    // Turn 0: Ask. Turn 1 (after agent-1's answer arrives): Conclude.
    const facilitatorRunner = createMockRunner(
      [{ text: "Assigning work" }, { text: "All done" }],
      [[askMsg("agent-1", "Explore the docs")], [concludeMsg("All done")]],
      {
        toolDispatcher: {
          Ask: (input) => askHandler(input),
          Conclude: (input) => concludeHandler(input),
        },
      },
    );

    let agent1Started = false;
    let agent2Started = false;
    const agent1Runner = createMockRunner(
      [{ text: "Found docs" }],
      [[answerMsgPlaceholder()]],
      {
        toolDispatcher: {
          Answer: answerDispatcher(ctx, "agent-1", "Found the docs"),
        },
      },
    );
    const origRun1 = agent1Runner.run;
    agent1Runner.run = async (task) => {
      agent1Started = true;
      return origRun1.call(agent1Runner, task);
    };
    const agent2Runner = createMockRunner([{ text: "Never called" }]);
    const origRun2 = agent2Runner.run;
    agent2Runner.run = async (task) => {
      agent2Started = true;
      return origRun2.call(agent2Runner, task);
    };

    const output = new PassThrough();
    const facilitator = new Facilitator({
      facilitatorRunner,
      agents: [
        { name: "agent-1", role: "explorer", runner: agent1Runner },
        { name: "agent-2", role: "tester", runner: agent2Runner },
      ],
      messageBus,
      output,
      ctx,
      redactor: noop(),
    });

    const result = await facilitator.run("Test task");
    assert.strictEqual(result.success, true);
    assert.strictEqual(agent1Started, true);
    assert.strictEqual(agent2Started, false);
  });

  test("trace uses universal { source, seq, event } envelope and seqs are monotone", async () => {
    const { ctx, messageBus } = seedCtx(["facilitator", "agent-1"]);
    const concludeHandler = createConcludeHandler(ctx);
    const askHandler = createAskHandler(ctx, {
      from: "facilitator",
      defaultTo: undefined,
    });
    const agentAnnounceHandler = createAnnounceHandler(ctx, {
      from: "agent-1",
    });

    const facilitatorRunner = createMockRunner(
      [{ text: "Go" }, { text: "Done" }],
      [[askMsg("agent-1", "Do work")], [concludeMsg("Complete")]],
      {
        toolDispatcher: {
          Ask: (input) => askHandler(input),
          Conclude: (input) => concludeHandler(input),
        },
      },
    );
    const agentRunner = createMockRunner(
      [{ text: "Working" }],
      [[answerMsgPlaceholder(), announceMsg("Heads up")]],
      {
        toolDispatcher: {
          Answer: answerDispatcher(ctx, "agent-1", "Done working"),
          Announce: (input) => agentAnnounceHandler(input),
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
    facilitatorRunner.onLine = (line) =>
      facilitator.emitLine("facilitator", line);
    agentRunner.onLine = (line) => facilitator.emitLine("agent-1", line);

    await facilitator.run("Do the work");

    const lines = (output.read()?.toString() ?? "")
      .trim()
      .split("\n")
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l));

    const seqs = lines
      .filter((l) => typeof l.seq === "number")
      .map((l) => l.seq);
    for (let i = 1; i < seqs.length; i++) {
      assert.ok(
        seqs[i] > seqs[i - 1],
        `seq ${seqs[i]} should be > ${seqs[i - 1]}`,
      );
    }

    const summary = lines.find(
      (l) => l.source === "orchestrator" && l.event?.type === "summary",
    );
    assert.ok(summary);
    assert.strictEqual(summary.event.success, true);
  });

  test("fail-fast: agent error aborts all sessions and re-throws", async () => {
    const { ctx, messageBus } = seedCtx(["facilitator", "agent-1", "agent-2"]);
    const askHandler = createAskHandler(ctx, {
      from: "facilitator",
      defaultTo: undefined,
    });

    const facilitatorRunner = createMockRunner(
      [{ text: "Assigning" }],
      [[askMsg("agent-1", "Do work"), askMsg("agent-2", "Do work")]],
      { toolDispatcher: { Ask: (input) => askHandler(input) } },
    );

    const agent1Runner = createMockRunner([{ text: "Crash" }]);
    agent1Runner.run = async () => {
      throw new Error("Agent-1 process crashed");
    };
    const agent2Runner = createMockRunner([{ text: "Working" }]);

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

    await assert.rejects(() => facilitator.run("Test fail-fast"), {
      message: "Agent-1 process crashed",
    });
  });
});

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
