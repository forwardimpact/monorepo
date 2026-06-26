import { describe, test } from "node:test";
import assert from "node:assert";

import {
  concludeSession,
  createAnnounceHandler,
  createConcludeHandler,
  createFacilitatedAgentToolServer,
  createFacilitatorToolServer,
  createOrchestrationContext,
  createRollCallHandler,
  createSupervisedAgentToolServer,
  createSupervisorToolServer,
} from "../src/orchestration-toolkit.js";
import { stubBus } from "./orchestration-toolkit-helpers.js";

describe("OrchestrationToolkit - simple handlers", () => {
  test("Conclude sets ctx.concluded, ctx.verdict, ctx.summary; returns ack", async () => {
    const ctx = createOrchestrationContext();
    ctx.messageBus = stubBus();
    const result = await createConcludeHandler(ctx)({
      verdict: "success",
      summary: "All done",
    });
    assert.strictEqual(ctx.concluded, true);
    assert.strictEqual(ctx.verdict, "success");
    assert.strictEqual(ctx.summary, "All done");
    assert.ok(result.content[0].text.includes("concluded"));
  });

  test("concludeSession cancels every pending Ask with a synthetic null answer (defensive cleanup)", () => {
    const ctx = createOrchestrationContext();
    ctx.messageBus = stubBus();
    ctx.pendingAsks.set(1, {
      askId: 1,
      askerName: "facilitator",
      addresseeName: "agent-1",
      question: "Q1?",
      reminded: false,
    });
    ctx.pendingAsks.set(2, {
      askId: 2,
      askerName: "agent-1",
      addresseeName: "facilitator",
      question: "Q2?",
      reminded: false,
    });

    concludeSession(ctx, {
      verdict: "failure",
      summary: "done",
      reason: "session concluded",
    });

    assert.strictEqual(ctx.pendingAsks.size, 0);
    const answers = ctx.messageBus.calls.filter((c) => c.method === "answer");
    assert.strictEqual(answers.length, 2);
    for (const a of answers) {
      assert.strictEqual(a.from, "@orchestrator");
      assert.ok(a.text.includes("session concluded"));
    }
  });

  test("Conclude refuses when Asks are still pending and leaves ctx.concluded false", async () => {
    const ctx = createOrchestrationContext();
    ctx.messageBus = stubBus();
    ctx.pendingAsks.set(1, {
      askId: 1,
      askerName: "facilitator",
      addresseeName: "agent-1",
      question: "Q1?",
      reminded: false,
    });

    const result = await createConcludeHandler(ctx)({
      verdict: "success",
      summary: "done",
    });

    assert.strictEqual(result.isError, true);
    assert.match(result.content[0].text, /Asks are still pending/);
    assert.strictEqual(ctx.concluded, false);
    assert.strictEqual(ctx.pendingAsks.size, 1);
    const answers = ctx.messageBus.calls.filter((c) => c.method === "answer");
    assert.strictEqual(answers.length, 0);
  });

  test("Announce publishes via the bus and never touches pendingAsks", async () => {
    const ctx = createOrchestrationContext();
    ctx.messageBus = stubBus();
    await createAnnounceHandler(ctx, { from: "agent-1" })({
      message: "Heads up",
    });
    assert.strictEqual(ctx.pendingAsks.size, 0);
    const a = ctx.messageBus.calls.find((c) => c.method === "announce");
    assert.strictEqual(a.text, "Heads up");
  });

  test("RollCall returns participants as JSON", async () => {
    const ctx = createOrchestrationContext();
    ctx.participants = [
      { name: "facilitator", role: "facilitator" },
      { name: "agent-1", role: "explorer" },
    ];
    const result = await createRollCallHandler(ctx)();
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.length, 2);
    assert.strictEqual(parsed[0].name, "facilitator");
  });
});

describe("OrchestrationToolkit - server factories", () => {
  test("createSupervisorToolServer builds an sdk-type server", () => {
    const ctx = createOrchestrationContext();
    ctx.participants = [
      { name: "supervisor", role: "supervisor" },
      { name: "agent", role: "agent" },
    ];
    assert.strictEqual(createSupervisorToolServer(ctx).type, "sdk");
  });

  test("createSupervisedAgentToolServer builds an sdk-type server", () => {
    assert.strictEqual(
      createSupervisedAgentToolServer(createOrchestrationContext()).type,
      "sdk",
    );
  });

  test("createFacilitatorToolServer builds an sdk-type server", () => {
    const ctx = createOrchestrationContext();
    ctx.messageBus = stubBus();
    assert.strictEqual(createFacilitatorToolServer(ctx).type, "sdk");
  });

  test("createFacilitatedAgentToolServer builds an sdk-type server", () => {
    const ctx = createOrchestrationContext();
    ctx.messageBus = stubBus();
    assert.strictEqual(
      createFacilitatedAgentToolServer(ctx, { from: "agent-1" }).type,
      "sdk",
    );
  });
});
