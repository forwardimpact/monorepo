import { describe, test } from "node:test";
import assert from "node:assert";
import { PassThrough } from "node:stream";

import { Supervisor } from "@forwardimpact/libeval";
import {
  createOrchestrationContext,
  createConcludeHandler,
  createRedirectHandler,
} from "../src/orchestration-toolkit.js";
import { createNoopRedactor } from "../src/redaction.js";
import { createMockRunner } from "./mock-runner.js";
import { createToolUseMsg } from "@forwardimpact/libharness";

const noop = () => createNoopRedactor();

const concludeMsg = (summary, verdict = "success") =>
  createToolUseMsg("Conclude", { verdict, summary });
const redirectMsg = (message) => createToolUseMsg("Redirect", { message });

describe("Supervisor - mid-turn intervention", () => {
  test("observation without intervention does not interrupt the agent", async () => {
    const ctx = createOrchestrationContext();
    const concludeHandler = createConcludeHandler(ctx);

    const agentMessages = [
      [
        {
          type: "assistant",
          message: {
            content: [{ type: "text", text: "I'm working on it." }],
          },
        },
      ],
    ];

    const agentRunner = createMockRunner(
      [{ text: "I'm working on it." }],
      agentMessages,
    );
    agentRunner.batchSize = 1;

    const supervisorRunner = createMockRunner(
      [
        { text: "Welcome! Please install." },
        { text: "Keep going." },
        { text: "Done" },
      ],
      [undefined, undefined, [concludeMsg("Complete")]],
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
      redactor: noop(),
    });
    agentRunner.onLine = (line) => supervisor.emitLine(line);
    supervisorRunner.onLine = (line) => supervisor.emitLine(line);

    let agentResumeCalls = 0;
    const origAgentResume = agentRunner.resume;
    agentRunner.resume = async (prompt) => {
      agentResumeCalls++;
      return origAgentResume.call(agentRunner, prompt);
    };

    const result = await supervisor.run("Install");

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.turns, 1);
    assert.strictEqual(
      agentResumeCalls,
      0,
      "Agent should not be resumed when supervisor never intervenes",
    );

    const data = output.read()?.toString() ?? "";
    const orchestratorEvents = data
      .trim()
      .split("\n")
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l))
      .filter((e) => e.source === "orchestrator");
    assert.ok(
      orchestratorEvents.some((e) => e.event?.type === "mid_turn_review"),
      "Trace should contain mid_turn_review when onBatch fires",
    );
    assert.ok(
      !orchestratorEvents.some(
        (e) => e.event?.type === "intervention_requested",
      ),
      "Trace should not contain intervention_requested when supervisor only observes",
    );
  });

  test("Redirect tool from mid-turn batch interrupts and relays", async () => {
    const ctx = createOrchestrationContext();
    const concludeHandler = createConcludeHandler(ctx);
    const redirectHandler = createRedirectHandler(ctx);

    const agentMessages = [
      [
        {
          type: "assistant",
          message: {
            content: [{ type: "text", text: "I'll try the wrong path." }],
          },
        },
      ],
      [
        {
          type: "assistant",
          message: {
            content: [
              { type: "text", text: "OK, switching to the documented path." },
            ],
          },
        },
      ],
    ];

    const agentRunner = createMockRunner(
      [
        { text: "I'll try the wrong path." },
        { text: "OK, switching to the documented path." },
      ],
      agentMessages,
    );
    agentRunner.batchSize = 1;

    const supervisorRunner = createMockRunner(
      [
        { text: "Welcome." },
        { text: "Stop and use the documented path." },
        { text: "Keep going." },
        { text: "Done" },
      ],
      [
        undefined,
        [redirectMsg("Stop and use the documented path.")],
        undefined,
        [concludeMsg("Complete")],
      ],
      {
        toolDispatcher: {
          Conclude: (input) => concludeHandler(input),
          Redirect: (input) => redirectHandler(input),
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
      redactor: noop(),
    });
    agentRunner.onLine = (line) => supervisor.emitLine(line);
    supervisorRunner.onLine = (line) => supervisor.emitLine(line);

    let agentResumeCalls = 0;
    let firstResumePrompt = null;
    const origAgentResume = agentRunner.resume;
    agentRunner.resume = async (prompt) => {
      agentResumeCalls++;
      if (agentResumeCalls === 1) firstResumePrompt = prompt;
      return origAgentResume.call(agentRunner, prompt);
    };

    const result = await supervisor.run("Install");

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.turns, 1);
    assert.strictEqual(
      agentResumeCalls,
      1,
      "Agent should be resumed exactly once after intervention",
    );
    assert.ok(
      firstResumePrompt && firstResumePrompt.includes("documented path"),
      "Resume prompt should carry the redirect message",
    );

    const orchestratorEvents = (output.read()?.toString() ?? "")
      .trim()
      .split("\n")
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l))
      .filter((e) => e.source === "orchestrator");
    assert.ok(
      orchestratorEvents.some(
        (e) => e.event?.type === "intervention_requested",
      ),
      "Trace should contain intervention_requested orchestrator event",
    );
    assert.ok(
      orchestratorEvents.some((e) => e.event?.type === "intervention_relayed"),
      "Trace should contain intervention_relayed orchestrator event",
    );
  });

  test("Redirect and Conclude in the same turn", async () => {
    const ctx = createOrchestrationContext();
    const concludeHandler = createConcludeHandler(ctx);
    const redirectHandler = createRedirectHandler(ctx);

    const agentMessages = [
      [
        {
          type: "assistant",
          message: { content: [{ type: "text", text: "Trying X." }] },
        },
      ],
      [
        {
          type: "assistant",
          message: { content: [{ type: "text", text: "OK trying Y." }] },
        },
      ],
    ];

    const agentRunner = createMockRunner(
      [{ text: "Trying X." }, { text: "Trying Y." }],
      agentMessages,
    );
    agentRunner.batchSize = 1;

    const supervisorRunner = createMockRunner(
      [
        { text: "Welcome." },
        { text: "Try Y instead." },
        { text: "Excellent." },
      ],
      [undefined, [redirectMsg("Try Y instead.")], [concludeMsg("Complete")]],
      {
        toolDispatcher: {
          Conclude: (input) => concludeHandler(input),
          Redirect: (input) => redirectHandler(input),
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
      redactor: noop(),
    });
    agentRunner.onLine = (line) => supervisor.emitLine(line);
    supervisorRunner.onLine = (line) => supervisor.emitLine(line);

    let agentResumeCalls = 0;
    const origAgentResume = agentRunner.resume;
    agentRunner.resume = async (prompt) => {
      agentResumeCalls++;
      return origAgentResume.call(agentRunner, prompt);
    };

    const result = await supervisor.run("Install");

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.turns, 1);
    assert.strictEqual(
      agentResumeCalls,
      1,
      "Agent.resume runs once (after redirect); Conclude then ends the turn",
    );

    const orchestratorEvents = (output.read()?.toString() ?? "")
      .trim()
      .split("\n")
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l))
      .filter((e) => e.source === "orchestrator");
    assert.ok(
      orchestratorEvents.some(
        (e) => e.event?.type === "intervention_requested",
      ),
      "Trace should contain intervention_requested",
    );
    assert.ok(
      orchestratorEvents.some((e) => e.event?.type === "complete_requested"),
      "Trace should contain complete_requested for mid-turn Conclude",
    );
  });
});
