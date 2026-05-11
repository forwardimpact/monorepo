import { describe, test } from "node:test";
import assert from "node:assert";
import { PassThrough } from "node:stream";

import { Facilitator, createFacilitator } from "@forwardimpact/libeval";
import {
  createOrchestrationContext,
  createConcludeHandler,
  createRollCallHandler,
  createAskHandler,
  createAnswerHandler,
  createAnnounceHandler,
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
const announceMsg = (message) =>
  createToolUseMsg("Announce", { message }, { id: "announce-1" });

function seedCtx(participants) {
  const ctx = createOrchestrationContext();
  const messageBus = new MessageBus({ participants });
  ctx.messageBus = messageBus;
  ctx.participants = participants.map((name) => ({ name, role: name }));
  return { ctx, messageBus };
}

describe("Facilitator - core orchestration", () => {
  test("turn 0 Conclude: no agents start", async () => {
    const { ctx, messageBus } = seedCtx(["facilitator", "agent-1"]);
    const concludeHandler = createConcludeHandler(ctx);

    const facilitatorRunner = createMockRunner(
      [{ text: "Done immediately" }],
      [[concludeMsg("Nothing to do")]],
      {
        toolDispatcher: {
          Conclude: (input) => concludeHandler(input),
        },
      },
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
      maxTurns: 10,
      ctx,
      redactor: noop(),
    });

    const result = await facilitator.run("Quick task");

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.turns, 1);
    assert.strictEqual(
      agentStarted,
      false,
      "Agent should not start when facilitator concludes on turn 0",
    );
  });

  test("lazy start: agents only start when they receive a message", async () => {
    const { ctx, messageBus } = seedCtx(["facilitator", "agent-1", "agent-2"]);
    const concludeHandler = createConcludeHandler(ctx);
    const askHandler = createAskHandler(ctx, {
      from: "facilitator",
      defaultTo: undefined,
    });

    const facilitatorRunner = createMockRunner(
      [{ text: "Assigning work" }, { text: "Done" }],
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
    const agent1AnswerHandler = createAnswerHandler(ctx, { from: "agent-1" });
    const agent1Runner = createMockRunner(
      [{ text: "Found docs" }],
      [[answerMsg("Found the docs")]],
      {
        toolDispatcher: {
          Answer: (input) => agent1AnswerHandler(input),
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
      maxTurns: 10,
      ctx,
      redactor: noop(),
    });

    const result = await facilitator.run("Test task");

    assert.strictEqual(result.success, true);
    assert.strictEqual(agent1Started, true, "agent-1 should have started");
    assert.strictEqual(
      agent2Started,
      false,
      "agent-2 should not have started (no message)",
    );
  });

  test("trace uses universal { source, seq, event } envelope", async () => {
    const { ctx, messageBus } = seedCtx(["facilitator", "agent-1"]);
    const concludeHandler = createConcludeHandler(ctx);
    const askHandler = createAskHandler(ctx, {
      from: "facilitator",
      defaultTo: undefined,
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

    const agentAnnounceHandler = createAnnounceHandler(ctx, {
      from: "agent-1",
    });
    const agentAnswerHandler = createAnswerHandler(ctx, { from: "agent-1" });
    const agentRunner = createMockRunner(
      [{ text: "Working" }],
      [[answerMsg("Done working"), announceMsg("Heads up")]],
      {
        toolDispatcher: {
          Answer: (input) => agentAnswerHandler(input),
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
      maxTurns: 10,
      ctx,
      redactor: noop(),
    });
    facilitatorRunner.onLine = (line) =>
      facilitator.emitLine("facilitator", line);
    agentRunner.onLine = (line) => facilitator.emitLine("agent-1", line);

    await facilitator.run("Do the work");

    const data = output.read()?.toString() ?? "";
    const lines = data
      .trim()
      .split("\n")
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l));

    // All lines with seq should be monotonically increasing
    const seqs = lines
      .filter((l) => typeof l.seq === "number")
      .map((l) => l.seq);
    for (let i = 1; i < seqs.length; i++) {
      assert.ok(
        seqs[i] > seqs[i - 1],
        `seq ${seqs[i]} should be > ${seqs[i - 1]}`,
      );
    }

    // Summary line should exist — wrapped in envelope
    const summary = lines.find(
      (l) => l.source === "orchestrator" && l.event?.type === "summary",
    );
    assert.ok(summary, "Trace should contain summary");
    assert.strictEqual(summary.event.success, true);
  });

  test("fail-fast: agent error aborts all sessions", async () => {
    const { ctx, messageBus } = seedCtx(["facilitator", "agent-1", "agent-2"]);
    const askHandler = createAskHandler(ctx, {
      from: "facilitator",
      defaultTo: undefined,
    });

    const facilitatorRunner = createMockRunner(
      [{ text: "Assigning" }],
      [[askMsg("agent-1", "Do work"), askMsg("agent-2", "Do work")]],
      {
        toolDispatcher: {
          Ask: (input) => askHandler(input),
        },
      },
    );

    // agent-1 throws an error
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
      maxTurns: 10,
      ctx,
      redactor: noop(),
    });

    await assert.rejects(() => facilitator.run("Test fail-fast"), {
      message: "Agent-1 process crashed",
    });
  });
});

describe("Facilitator - messaging", () => {
  test("Ask delivers question to a specific agent and Answer clears it", async () => {
    const { ctx, messageBus } = seedCtx(["facilitator", "agent-1", "agent-2"]);
    const concludeHandler = createConcludeHandler(ctx);
    const askHandler = createAskHandler(ctx, {
      from: "facilitator",
      defaultTo: undefined,
    });

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
    const agent1AnswerHandler = createAnswerHandler(ctx, { from: "agent-1" });
    const agent2AnswerHandler = createAnswerHandler(ctx, { from: "agent-2" });
    const agent1Runner = createMockRunner(
      [{ text: "Did A" }],
      [[answerMsg("A done")]],
      { toolDispatcher: { Answer: (i) => agent1AnswerHandler(i) } },
    );
    const origRun1 = agent1Runner.run;
    agent1Runner.run = async (task) => {
      agent1Task = task;
      return origRun1.call(agent1Runner, task);
    };
    const agent2Runner = createMockRunner(
      [{ text: "Did B" }],
      [[answerMsg("B done")]],
      { toolDispatcher: { Answer: (i) => agent2AnswerHandler(i) } },
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
      maxTurns: 10,
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
      [{ text: "Broadcasting" }, { text: "Done" }],
      [[announceMsg("Everyone listen")], [concludeMsg("Complete")]],
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
      // Wake the facilitator so it can emit its Conclude turn.
      messageBus.announce("agent-1", "Acknowledged");
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
      maxTurns: 10,
      ctx,
      redactor: noop(),
    });

    await facilitator.run("Broadcast test");

    assert.ok(
      agent1Task && agent1Task.includes("Everyone listen"),
      "agent-1 should receive the announcement",
    );
    assert.ok(
      agent2Task && agent2Task.includes("Everyone listen"),
      "agent-2 should receive the announcement",
    );
  });

  test("RollCall returns participant list", async () => {
    const ctx = createOrchestrationContext();
    ctx.participants = [
      { name: "facilitator", role: "facilitator" },
      { name: "agent-1", role: "explorer" },
    ];
    const rollCallHandler = createRollCallHandler(ctx);

    const result = await rollCallHandler();
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.length, 2);
    assert.strictEqual(parsed[0].name, "facilitator");
    assert.strictEqual(parsed[1].name, "agent-1");
  });
});

describe("Facilitator - factory required deps", () => {
  test("createFacilitator throws on missing redactor", () => {
    assert.throws(
      () =>
        createFacilitator({
          facilitatorCwd: "/tmp/fac",
          agentConfigs: [
            { name: "agent-1", role: "worker", cwd: "/tmp/agent" },
          ],
          query: async function* () {},
          output: new PassThrough(),
        }),
      /redactor is required/,
    );
  });
});
