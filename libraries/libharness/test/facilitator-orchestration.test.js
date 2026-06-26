import { describe, test } from "node:test";
import assert from "node:assert";
import { PassThrough } from "node:stream";

import { Facilitator } from "@forwardimpact/libharness";
import {
  createAnnounceHandler,
  createAskHandler,
  createConcludeHandler,
} from "../src/orchestration-toolkit.js";
import { createMockRunner } from "./mock-runner.js";
import {
  noop,
  concludeMsg,
  askMsg,
  answerMsgPlaceholder,
  announceMsg,
  seedCtx,
  answerDispatcher,
} from "./facilitator-helpers.js";

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
