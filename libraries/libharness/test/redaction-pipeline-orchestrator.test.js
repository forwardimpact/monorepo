import { describe, test } from "node:test";
import assert from "node:assert";

import { Supervisor, Facilitator } from "@forwardimpact/libharness";
import { createRedactor } from "../src/redaction.js";
import {
  createOrchestrationContext,
  createConcludeHandler,
} from "../src/orchestration-toolkit.js";
import { MessageBus } from "../src/message-bus.js";
import { createMockRunner } from "./mock-runner.js";
import { createToolUseMsg } from "@forwardimpact/libmock";
import {
  rt as _rt,
  captureSink,
  GH_SENT,
} from "./redaction-pipeline-helpers.js";

describe("Producer pipeline — Supervisor.emitSummary covers Conclude-handler text", () => {
  test("sentinel-bearing Conclude summary is redacted in the orchestrator summary line", async () => {
    const ctx = createOrchestrationContext();
    const messageBus = new MessageBus({
      participants: ["supervisor", "agent"],
    });
    ctx.messageBus = messageBus;
    ctx.participants = [
      { name: "supervisor", role: "supervisor" },
      { name: "agent", role: "agent" },
    ];
    const concludeHandler = createConcludeHandler(ctx);

    const SECRET_SUMMARY = `wrap-up with secret ${GH_SENT}`;
    const supervisorRunner = createMockRunner(
      [{ text: "Done" }],
      [
        [
          createToolUseMsg("Conclude", {
            verdict: "success",
            summary: SECRET_SUMMARY,
          }),
        ],
      ],
      {
        toolDispatcher: {
          Conclude: (input) => concludeHandler(input),
        },
      },
    );
    const agentRunner = createMockRunner([]);

    const sink = captureSink();
    const redactor = createRedactor({
      runtime: _rt,
      env: { GH_TOKEN: GH_SENT },
    });

    const supervisor = new Supervisor({
      agentRunner,
      supervisorRunner,
      output: sink.stream,
      maxTurns: 5,
      ctx,
      messageBus,
      redactor,
    });

    const result = await supervisor.run("Do the thing");
    assert.strictEqual(result.success, true);

    // The summary line is the orchestrator-source event.
    const summaryLines = sink.text
      .split("\n")
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l))
      .filter(
        (e) => e.source === "orchestrator" && e.event?.type === "summary",
      );

    assert.strictEqual(summaryLines.length, 1);
    const evt = summaryLines[0].event;
    assert.ok(
      !evt.summary.includes(GH_SENT),
      "GH_TOKEN sentinel leaked into supervisor summary",
    );
    assert.ok(evt.summary.includes("[REDACTED:env:GH_TOKEN]"));
  });
});

describe("Producer pipeline — Facilitator.emitSummary covers Conclude-handler text", () => {
  test("sentinel-bearing Conclude summary is redacted in the facilitator summary line", async () => {
    const ctx = createOrchestrationContext();
    const messageBus = new MessageBus({
      participants: ["facilitator", "agent-1"],
    });
    ctx.messageBus = messageBus;
    ctx.participants = [
      { name: "facilitator", role: "facilitator" },
      { name: "agent-1", role: "agent" },
    ];
    const concludeHandler = createConcludeHandler(ctx);

    const SECRET_SUMMARY = `facilitator wrap ${GH_SENT}`;
    const facilitatorRunner = createMockRunner(
      [{ text: "Wrap" }],
      [
        [
          createToolUseMsg("Conclude", {
            verdict: "success",
            summary: SECRET_SUMMARY,
          }),
        ],
      ],
      { toolDispatcher: { Conclude: (input) => concludeHandler(input) } },
    );
    const agentRunner = createMockRunner([]);

    const sink = captureSink();
    const redactor = createRedactor({
      runtime: _rt,
      env: { GH_TOKEN: GH_SENT },
    });

    const facilitator = new Facilitator({
      facilitatorRunner,
      agents: [{ name: "agent-1", role: "worker", runner: agentRunner }],
      messageBus,
      output: sink.stream,
      maxTurns: 5,
      ctx,
      redactor,
    });

    const result = await facilitator.run("Coordinate");
    assert.strictEqual(result.success, true);

    const summaryLines = sink.text
      .split("\n")
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l))
      .filter(
        (e) => e.source === "orchestrator" && e.event?.type === "summary",
      );

    assert.strictEqual(summaryLines.length, 1);
    const evt = summaryLines[0].event;
    assert.ok(
      !evt.summary.includes(GH_SENT),
      "GH_TOKEN sentinel leaked into facilitator summary",
    );
    assert.ok(evt.summary.includes("[REDACTED:env:GH_TOKEN]"));
  });
});
