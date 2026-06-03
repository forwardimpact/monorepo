import { describe, test } from "node:test";
import assert from "node:assert";

import {
  cancelPendingAsks,
  createAnswerHandler,
  createAskHandler,
  createOrchestrationContext,
  pendingAsksOwedBy,
  remindOwedAsks,
} from "../src/orchestration-toolkit.js";
import { stubBus } from "./orchestration-toolkit-helpers.js";

describe("OrchestrationToolkit - Ask", () => {
  test("Ask with explicit `to` registers one pending entry, posts on the bus, returns the askId", async () => {
    const ctx = createOrchestrationContext();
    ctx.participants = [
      { name: "facilitator", role: "facilitator" },
      { name: "agent-1", role: "worker" },
    ];
    ctx.messageBus = stubBus();
    const result = await createAskHandler(ctx, {
      from: "facilitator",
      defaultTo: undefined,
    })({ question: "What?", to: "agent-1" });

    assert.strictEqual(ctx.pendingAsks.size, 1);
    const [entry] = [...ctx.pendingAsks.values()];
    assert.strictEqual(entry.askerName, "facilitator");
    assert.strictEqual(entry.addresseeName, "agent-1");
    const bodyAsk = ctx.messageBus.calls.find((c) => c.method === "ask");
    assert.strictEqual(bodyAsk.to, "agent-1");
    assert.strictEqual(bodyAsk.text, "What?");
    assert.strictEqual(bodyAsk.askId, entry.askId);
    assert.deepStrictEqual(JSON.parse(result.content[0].text), {
      askIds: [entry.askId],
    });
  });

  test("Ask with defaultTo uses it when `to` is omitted", async () => {
    const ctx = createOrchestrationContext();
    ctx.participants = [
      { name: "facilitator", role: "facilitator" },
      { name: "agent-1", role: "worker" },
    ];
    ctx.messageBus = stubBus();
    await createAskHandler(ctx, {
      from: "agent-1",
      defaultTo: "facilitator",
    })({ question: "Help?" });
    const [entry] = [...ctx.pendingAsks.values()];
    assert.strictEqual(entry.addresseeName, "facilitator");
  });

  test("Broadcast Ask fans out: one pending entry and one bus ask per addressee", async () => {
    const ctx = createOrchestrationContext();
    ctx.participants = [
      { name: "facilitator", role: "facilitator" },
      { name: "a", role: "worker" },
      { name: "b", role: "worker" },
    ];
    ctx.messageBus = stubBus();
    const result = await createAskHandler(ctx, {
      from: "facilitator",
      defaultTo: undefined,
    })({ question: "Ready?" });

    assert.strictEqual(ctx.pendingAsks.size, 2);
    const addressees = [...ctx.pendingAsks.values()].map(
      (e) => e.addresseeName,
    );
    assert.deepStrictEqual(addressees.sort(), ["a", "b"]);
    const askCalls = ctx.messageBus.calls.filter((c) => c.method === "ask");
    assert.strictEqual(askCalls.length, 2);
    const { askIds } = JSON.parse(result.content[0].text);
    assert.strictEqual(askIds.length, 2);
    assert.strictEqual(new Set(askIds).size, 2);
  });

  test("Two Asks to the same addressee coexist — each has its own askId, neither overwrites the other", async () => {
    const ctx = createOrchestrationContext();
    ctx.participants = [
      { name: "facilitator", role: "facilitator" },
      { name: "agent-1", role: "worker" },
    ];
    ctx.messageBus = stubBus();
    const ask = createAskHandler(ctx, {
      from: "facilitator",
      defaultTo: undefined,
    });
    const r1 = await ask({ question: "First?", to: "agent-1" });
    const r2 = await ask({ question: "Second?", to: "agent-1" });
    assert.strictEqual(ctx.pendingAsks.size, 2);
    const ids = [
      ...JSON.parse(r1.content[0].text).askIds,
      ...JSON.parse(r2.content[0].text).askIds,
    ];
    assert.strictEqual(new Set(ids).size, 2);
  });

  test("Broadcast with no other participants returns isError", async () => {
    const ctx = createOrchestrationContext();
    ctx.participants = [{ name: "facilitator", role: "facilitator" }];
    ctx.messageBus = stubBus();
    const result = await createAskHandler(ctx, {
      from: "facilitator",
      defaultTo: undefined,
    })({ question: "Anyone?" });
    assert.strictEqual(result.isError, true);
  });

  test("Ask returns isError when the session is already concluded", async () => {
    const ctx = createOrchestrationContext();
    ctx.participants = [
      { name: "facilitator", role: "facilitator" },
      { name: "agent-1", role: "worker" },
    ];
    ctx.messageBus = stubBus();
    ctx.concluded = true;
    const result = await createAskHandler(ctx, {
      from: "facilitator",
      defaultTo: undefined,
    })({ question: "Late?", to: "agent-1" });
    assert.strictEqual(result.isError, true);
    assert.strictEqual(ctx.pendingAsks.size, 0);
  });
});

describe("OrchestrationToolkit - Answer", () => {
  test("Answer with matching askId routes the reply on the bus and clears the pending entry", async () => {
    const ctx = createOrchestrationContext();
    ctx.messageBus = stubBus();
    ctx.pendingAsks.set(7, {
      askId: 7,
      askerName: "facilitator",
      addresseeName: "agent-1",
      question: "Q?",
      reminded: false,
    });
    const result = await createAnswerHandler(ctx, { from: "agent-1" })({
      askId: 7,
      message: "yes",
    });
    assert.strictEqual(result.content[0].text, "Answer delivered.");
    assert.strictEqual(ctx.pendingAsks.has(7), false);
    const answer = ctx.messageBus.calls.find((c) => c.method === "answer");
    assert.strictEqual(answer.from, "agent-1");
    assert.strictEqual(answer.to, "facilitator");
    assert.strictEqual(answer.askId, 7);
    assert.strictEqual(answer.text, "yes");
  });

  test("Answer without askId and no pending ask is routed as Announce", async () => {
    const ctx = createOrchestrationContext();
    ctx.messageBus = stubBus();
    const result = await createAnswerHandler(ctx, { from: "agent-1" })({
      message: "Unsolicited reply",
    });
    assert.strictEqual(result.isError, undefined);
    assert.ok(result.content[0].text.includes("Announce"));
    const announces = ctx.messageBus.calls.filter(
      (c) => c.method === "announce",
    );
    assert.strictEqual(announces.length, 1);
    assert.strictEqual(announces[0].text, "Unsolicited reply");
  });

  test("Answer without askId and exactly one pending ask auto-picks it", async () => {
    const ctx = createOrchestrationContext();
    ctx.messageBus = stubBus();
    ctx.pendingAsks.set(5, {
      askId: 5,
      askerName: "facilitator",
      addresseeName: "agent-1",
      question: "Q?",
      reminded: false,
    });
    const result = await createAnswerHandler(ctx, { from: "agent-1" })({
      message: "implicit",
    });
    assert.strictEqual(result.content[0].text, "Answer delivered.");
    assert.strictEqual(ctx.pendingAsks.has(5), false);
    const answer = ctx.messageBus.calls.find((c) => c.method === "answer");
    assert.strictEqual(answer.askId, 5);
    assert.strictEqual(answer.text, "implicit");
  });

  test("Answer without askId and many pending asks routes as Announce (ambiguous)", async () => {
    const ctx = createOrchestrationContext();
    ctx.messageBus = stubBus();
    for (const id of [1, 2]) {
      ctx.pendingAsks.set(id, {
        askId: id,
        askerName: "facilitator",
        addresseeName: "agent-1",
        question: `Q${id}?`,
        reminded: false,
      });
    }
    const result = await createAnswerHandler(ctx, { from: "agent-1" })({
      message: "shared",
    });
    assert.strictEqual(result.isError, undefined);
    assert.ok(result.content[0].text.includes("2 pending"));
    assert.strictEqual(ctx.pendingAsks.size, 2);
    const announces = ctx.messageBus.calls.filter(
      (c) => c.method === "announce",
    );
    assert.strictEqual(announces.length, 1);
  });

  test("Answer with unknown askId returns isError", async () => {
    const ctx = createOrchestrationContext();
    ctx.messageBus = stubBus();
    const result = await createAnswerHandler(ctx, { from: "agent-1" })({
      askId: 999,
      message: "Hi",
    });
    assert.strictEqual(result.isError, true);
    assert.ok(result.content[0].text.includes("999"));
  });

  test("Answer from the wrong participant returns isError; pending entry remains", async () => {
    const ctx = createOrchestrationContext();
    ctx.messageBus = stubBus();
    ctx.pendingAsks.set(7, {
      askId: 7,
      askerName: "facilitator",
      addresseeName: "agent-1",
      question: "Q?",
      reminded: false,
    });
    const result = await createAnswerHandler(ctx, { from: "agent-2" })({
      askId: 7,
      message: "wrong sender",
    });
    assert.strictEqual(result.isError, true);
    assert.ok(result.content[0].text.includes("addressed to agent-1"));
    assert.ok(ctx.pendingAsks.has(7));
  });
});

describe("OrchestrationToolkit - cancel & remind helpers", () => {
  test("cancelPendingAsks with an addressee filter cancels only that addressee's entries and routes a synthetic null", () => {
    const ctx = createOrchestrationContext();
    ctx.messageBus = stubBus();
    ctx.pendingAsks.set(1, {
      askId: 1,
      askerName: "facilitator",
      addresseeName: "agent-1",
      reminded: false,
    });
    ctx.pendingAsks.set(2, {
      askId: 2,
      askerName: "facilitator",
      addresseeName: "agent-2",
      reminded: false,
    });

    cancelPendingAsks(ctx, "boom", "agent-1");
    assert.strictEqual(ctx.pendingAsks.has(1), false);
    assert.strictEqual(ctx.pendingAsks.has(2), true);
    const ans = ctx.messageBus.calls.find((c) => c.method === "answer");
    assert.strictEqual(ans.from, "@orchestrator");
    assert.strictEqual(ans.to, "facilitator");
    assert.strictEqual(ans.askId, 1);
    assert.ok(ans.text.includes("boom"));
  });

  test("cancelPendingAsks with no addressee clears every entry and routes synthetic nulls", () => {
    const ctx = createOrchestrationContext();
    ctx.messageBus = stubBus();
    for (const id of [1, 2, 3]) {
      ctx.pendingAsks.set(id, {
        askId: id,
        askerName: "facilitator",
        addresseeName: `agent-${id}`,
        reminded: false,
      });
    }
    cancelPendingAsks(ctx, "kaboom");
    assert.strictEqual(ctx.pendingAsks.size, 0);
    const answers = ctx.messageBus.calls.filter((c) => c.method === "answer");
    assert.strictEqual(answers.length, 3);
    for (const a of answers) assert.ok(a.text.includes("kaboom"));
  });

  test("remindOwedAsks injects a synthetic reminder and marks all owed entries as reminded", () => {
    const ctx = createOrchestrationContext();
    ctx.messageBus = stubBus();
    for (const id of [1, 2]) {
      ctx.pendingAsks.set(id, {
        askId: id,
        askerName: "facilitator",
        addresseeName: "agent-1",
        question: `Q${id}`,
        reminded: false,
      });
    }
    assert.strictEqual(remindOwedAsks(ctx, "agent-1"), true);
    assert.strictEqual(ctx.pendingAsks.get(1).reminded, true);
    assert.strictEqual(ctx.pendingAsks.get(2).reminded, true);
    const s = ctx.messageBus.calls.find((c) => c.method === "synthetic");
    assert.strictEqual(s.to, "agent-1");
    assert.ok(s.text.includes("askId=1"));
    assert.ok(s.text.includes("askId=2"));
  });

  test("remindOwedAsks returns false when nothing is owed or all already reminded", () => {
    const ctx = createOrchestrationContext();
    ctx.messageBus = stubBus();
    assert.strictEqual(remindOwedAsks(ctx, "agent-1"), false);

    ctx.pendingAsks.set(1, {
      askId: 1,
      askerName: "facilitator",
      addresseeName: "agent-1",
      question: "Q1",
      reminded: true,
    });
    assert.strictEqual(remindOwedAsks(ctx, "agent-1"), false);
  });

  test("pendingAsksOwedBy filters by addressee", () => {
    const ctx = createOrchestrationContext();
    ctx.pendingAsks.set(1, {
      askId: 1,
      addresseeName: "a",
      askerName: "x",
      reminded: false,
    });
    ctx.pendingAsks.set(2, {
      askId: 2,
      addresseeName: "b",
      askerName: "x",
      reminded: false,
    });
    ctx.pendingAsks.set(3, {
      askId: 3,
      addresseeName: "a",
      askerName: "x",
      reminded: false,
    });
    const owed = pendingAsksOwedBy(ctx, "a");
    assert.deepStrictEqual(owed.map((e) => e.askId).sort(), [1, 3]);
  });
});
