import { describe, test } from "node:test";
import assert from "node:assert";
import { PassThrough } from "node:stream";

import { Supervisor } from "@forwardimpact/libeval";
import {
  createOrchestrationContext,
  createConcludeHandler,
  createAskHandler,
} from "../src/orchestration-toolkit.js";
import { createNoopRedactor } from "../src/redaction.js";
import { MessageBus } from "../src/message-bus.js";
import { createMockRunner } from "./mock-runner.js";
import { createToolUseMsg } from "@forwardimpact/libmock";

const noop = () => createNoopRedactor();

const concludeMsg = (summary, verdict = "success") =>
  createToolUseMsg("Conclude", { verdict, summary });

function seedCtx() {
  const ctx = createOrchestrationContext();
  const messageBus = new MessageBus({ participants: ["supervisor", "agent"] });
  ctx.messageBus = messageBus;
  ctx.participants = [
    { name: "supervisor", role: "supervisor" },
    { name: "agent", role: "agent" },
  ];
  return { ctx, messageBus };
}

describe("Supervisor - output and events", () => {
  test("output contains tagged lines with correct source and seq", async () => {
    const { ctx, messageBus } = seedCtx();
    const concludeHandler = createConcludeHandler(ctx);

    const supervisorRunner = createMockRunner(
      [{ text: "Go ahead" }],
      [[concludeMsg("Done")]],
      { toolDispatcher: { Conclude: (input) => concludeHandler(input) } },
    );
    const agentRunner = createMockRunner([{ text: "Never" }]);

    const output = new PassThrough();
    const supervisor = new Supervisor({
      agentRunner,
      supervisorRunner,
      output,
      ctx,
      messageBus,
      redactor: noop(),
    });
    agentRunner.onLine = (line) => supervisor.emitLine("agent", line);
    supervisorRunner.onLine = (line) => supervisor.emitLine("supervisor", line);

    await supervisor.run("Task");

    const data = output.read()?.toString() ?? "";
    const lines = data
      .trim()
      .split("\n")
      .filter((l) => l.length > 0);

    assert.ok(lines.length >= 2);

    const supervisorLine = JSON.parse(lines[0]);
    assert.strictEqual(supervisorLine.source, "orchestrator");
    assert.ok("event" in supervisorLine);

    // Seq monotonically increasing
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
    assert.strictEqual(summaryLine.event.type, "summary");
    assert.strictEqual(summaryLine.event.success, true);
  });

  test("events are nested under `event` key (no field collisions)", async () => {
    const { ctx, messageBus } = seedCtx();
    const concludeHandler = createConcludeHandler(ctx);

    const supervisorRunner = createMockRunner(
      [{ text: "Done" }],
      [[concludeMsg("Complete")]],
      { toolDispatcher: { Conclude: (input) => concludeHandler(input) } },
    );
    const agentRunner = createMockRunner([{ text: "Never" }]);

    const output = new PassThrough();
    const supervisor = new Supervisor({
      agentRunner,
      supervisorRunner,
      output,
      ctx,
      messageBus,
      redactor: noop(),
    });
    supervisorRunner.onLine = (line) => supervisor.emitLine("supervisor", line);

    await supervisor.run("Task");

    const data = output.read()?.toString() ?? "";
    const lines = data
      .trim()
      .split("\n")
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l));

    for (const line of lines) {
      // Every line is the universal { source, seq, event } envelope.
      assert.ok(typeof line.source === "string");
      assert.ok(typeof line.seq === "number");
      assert.ok("event" in line);
    }
  });

  test("emits supervisor output and re-throws when the supervisor runner errors", async () => {
    const { ctx, messageBus } = seedCtx();
    const supervisorRunner = createMockRunner(
      [{ text: "Starting..." }],
      [[{ type: "assistant", content: "Starting..." }]],
    );
    supervisorRunner.run = async () => {
      throw new Error("Process exited with code 1");
    };
    const agentRunner = createMockRunner([]);

    const output = new PassThrough();
    const supervisor = new Supervisor({
      agentRunner,
      supervisorRunner,
      output,
      ctx,
      messageBus,
      redactor: noop(),
    });
    await assert.rejects(() => supervisor.run("Task"), {
      message: "Process exited with code 1",
    });
  });

  test("summary includes Conclude payload (summary text and verdict)", async () => {
    const { ctx, messageBus } = seedCtx();
    const concludeHandler = createConcludeHandler(ctx);
    const askHandler = createAskHandler(ctx, {
      from: "supervisor",
      defaultTo: "agent",
    });

    const supervisorRunner = createMockRunner(
      [{ text: "Done" }],
      [[concludeMsg("Agent passed all checks")]],
      {
        toolDispatcher: {
          Ask: (input) => askHandler(input),
          Conclude: (input) => concludeHandler(input),
        },
      },
    );
    const agentRunner = createMockRunner([]);

    const output = new PassThrough();
    const supervisor = new Supervisor({
      agentRunner,
      supervisorRunner,
      output,
      ctx,
      messageBus,
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
    assert.strictEqual(summaryLine.event.verdict, "success");
  });
});
