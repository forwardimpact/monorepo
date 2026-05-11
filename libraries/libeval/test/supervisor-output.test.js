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

describe("Supervisor - output and events", () => {
  test("output contains tagged lines with correct source and seq", async () => {
    const ctx = createOrchestrationContext();
    const concludeHandler = createConcludeHandler(ctx);

    const supervisorMessages = [
      [{ type: "assistant", content: "Go ahead" }],
      [concludeMsg("Done")],
    ];
    const agentMessages = [[{ type: "assistant", content: "Working" }]];

    const supervisorRunner = createMockRunner(
      [{ text: "Go ahead" }, { text: "Done" }],
      supervisorMessages,
      { toolDispatcher: { Conclude: (input) => concludeHandler(input) } },
    );
    const agentRunner = createMockRunner([{ text: "Working" }], agentMessages);

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

    await supervisor.run("Task");

    const data = output.read()?.toString() ?? "";
    const lines = data
      .trim()
      .split("\n")
      .filter((l) => l.length > 0);

    assert.ok(lines.length >= 4);

    const supervisorLine = JSON.parse(lines[0]);
    assert.strictEqual(supervisorLine.source, "supervisor");
    assert.strictEqual(typeof supervisorLine.seq, "number");
    assert.ok("event" in supervisorLine);

    const agentLine = JSON.parse(lines[1]);
    assert.strictEqual(agentLine.source, "agent");
    assert.ok("event" in agentLine);

    // Verify seq is monotonically increasing
    const seqs = lines
      .map((l) => JSON.parse(l))
      .filter((l) => typeof l.seq === "number")
      .map((l) => l.seq);
    for (let i = 1; i < seqs.length; i++) {
      assert.ok(
        seqs[i] > seqs[i - 1],
        `seq ${seqs[i]} should be > ${seqs[i - 1]}`,
      );
    }

    const summaryLine = JSON.parse(lines[lines.length - 1]);
    assert.strictEqual(summaryLine.source, "orchestrator");
    assert.strictEqual(typeof summaryLine.seq, "number");
    assert.strictEqual(summaryLine.event.type, "summary");
    assert.strictEqual(summaryLine.event.success, true);
  });

  test("events are nested under event key (no field collisions)", async () => {
    const ctx = createOrchestrationContext();
    const concludeHandler = createConcludeHandler(ctx);

    const sourceEvent = {
      type: "assistant",
      source: "sdk-internal",
      content: "test",
    };
    const supervisorRunner = createMockRunner(
      [{ text: "Go" }, { text: "Done" }],
      [[{ type: "assistant", content: "Go" }], [concludeMsg("Complete")]],
      { toolDispatcher: { Conclude: (input) => concludeHandler(input) } },
    );
    const agentRunner = createMockRunner([{ text: "Done" }], [[sourceEvent]]);

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

    await supervisor.run("Task");

    const data = output.read()?.toString() ?? "";
    const lines = data
      .trim()
      .split("\n")
      .filter((l) => l.length > 0);

    const tagged = JSON.parse(lines[1]);
    assert.strictEqual(tagged.source, "agent");
    assert.strictEqual(tagged.event.source, "sdk-internal");
  });

  test("mid-turn Redirect emits orchestrator events", async () => {
    const ctx = createOrchestrationContext();
    const concludeHandler = createConcludeHandler(ctx);
    const redirectHandler = createRedirectHandler(ctx);

    const agentMessages = [
      [
        {
          type: "assistant",
          message: {
            content: [{ type: "text", text: "Trying the wrong thing." }],
          },
        },
      ],
      [
        {
          type: "assistant",
          message: {
            content: [{ type: "text", text: "Switching to the right thing." }],
          },
        },
      ],
    ];

    const agentRunner = createMockRunner(
      [{ text: "Trying the wrong thing." }, { text: "Switching." }],
      agentMessages,
    );
    agentRunner.batchSize = 1;
    const supervisorRunner = createMockRunner(
      [
        { text: "Welcome." },
        { text: "Switch to the right path." },
        { text: "Keep going." },
        { text: "Done" },
      ],
      [
        undefined,
        [redirectMsg("Switch to the right path.")],
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

    const result = await supervisor.run("Task");
    assert.strictEqual(result.success, true);

    const lines = (output.read()?.toString() ?? "")
      .trim()
      .split("\n")
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l));

    const interventionRequested = lines.find(
      (l) =>
        l.source === "orchestrator" &&
        l.event?.type === "intervention_requested",
    );
    assert.ok(
      interventionRequested,
      "Trace must contain intervention_requested orchestrator event",
    );

    const summary = lines[lines.length - 1];
    assert.strictEqual(summary.source, "orchestrator");
    assert.strictEqual(summary.event.type, "summary");
    assert.strictEqual(summary.event.success, true);
  });

  test("emits supervisor output and summary when supervisor errors on turn 0", async () => {
    const supervisorMessages = [
      [{ type: "assistant", content: "Starting..." }],
    ];
    const supervisorRunner = createMockRunner(
      [{ text: "Starting...", success: false }],
      supervisorMessages,
    );

    const origRun = supervisorRunner.run;
    supervisorRunner.run = async (task) => {
      const result = await origRun.call(supervisorRunner, task);
      return { ...result, error: new Error("Process exited with code 1") };
    };

    const agentRunner = createMockRunner([]);

    const output = new PassThrough();
    const supervisor = new Supervisor({
      agentRunner,
      supervisorRunner,
      output,
      maxTurns: 10,
      redactor: noop(),
    });
    agentRunner.onLine = (line) => supervisor.emitLine(line);
    supervisorRunner.onLine = (line) => supervisor.emitLine(line);

    const result = await supervisor.run("Task");

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.turns, 0);

    const data = output.read()?.toString() ?? "";
    const lines = data
      .trim()
      .split("\n")
      .filter((l) => l.length > 0);

    assert.ok(lines.length >= 2, "Expected at least supervisor line + summary");

    const supervisorLine = JSON.parse(lines[0]);
    assert.strictEqual(supervisorLine.source, "supervisor");
    assert.strictEqual(typeof supervisorLine.seq, "number");

    const summaryLine = JSON.parse(lines[lines.length - 1]);
    assert.strictEqual(summaryLine.source, "orchestrator");
    assert.strictEqual(summaryLine.event.success, false);
    assert.strictEqual(summaryLine.event.turns, 0);
  });

  test("summary includes Conclude payload", async () => {
    const ctx = createOrchestrationContext();
    const concludeHandler = createConcludeHandler(ctx);

    const supervisorRunner = createMockRunner(
      [{ text: "Done" }],
      [[concludeMsg("Agent passed all checks")]],
      { toolDispatcher: { Conclude: (input) => concludeHandler(input) } },
    );

    const agentRunner = createMockRunner([]);
    const output = new PassThrough();
    const supervisor = new Supervisor({
      agentRunner,
      supervisorRunner,
      output,
      maxTurns: 10,
      ctx,
      redactor: noop(),
    });

    await supervisor.run("Task");

    const data = output.read()?.toString() ?? "";
    const lines = data
      .trim()
      .split("\n")
      .filter((l) => l.length > 0);
    const summaryLine = JSON.parse(lines[lines.length - 1]);
    assert.strictEqual(summaryLine.event.summary, "Agent passed all checks");
  });
});
