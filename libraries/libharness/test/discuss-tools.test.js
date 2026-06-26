import { test, describe } from "node:test";
import assert from "node:assert";

import {
  createRecessHandler,
  createAdjournHandler,
} from "../src/discuss-tools.js";
import { createRequestForCommentHandler } from "../src/orchestration-toolkit.js";
import { augmentContextForDiscuss } from "../src/discusser.js";
import { createOrchestrationContext } from "../src/orchestration-toolkit.js";

function makeCtx(discussionId = null) {
  return augmentContextForDiscuss(createOrchestrationContext(), discussionId);
}

describe("DiscussTools handlers", () => {
  test("RequestForComment pushes one RFC per addressee with a shared correlation id", async () => {
    const ctx = makeCtx("GD_kw_test");
    const handler = createRequestForCommentHandler(ctx);

    const result = await handler({
      channel: "github-discussions",
      body: "Please weigh in on the spec.",
      addressees: ["alice", "bob"],
    });

    assert.strictEqual(ctx.rfcs.length, 2);
    assert.strictEqual(ctx.rfcs[0].addressee, "alice");
    assert.strictEqual(ctx.rfcs[0].body, "Please weigh in on the spec.");
    assert.strictEqual(ctx.rfcs[0].thread_id, "GD_kw_test");
    assert.strictEqual(ctx.rfcs[0].channel, "github-discussions");
    assert.strictEqual(ctx.rfcs[1].addressee, "bob");
    assert.strictEqual(ctx.rfcs[0].correlation_id, ctx.rfcs[1].correlation_id);

    const payload = JSON.parse(result.content[0].text);
    assert.match(payload.correlation_id, /^rfc_\d+$/);
    assert.strictEqual(payload.channel, "github-discussions");
    assert.strictEqual(
      ctx.replies.length,
      0,
      "replies should not be populated by RFC",
    );
  });

  test("RequestForComment emits a single anonymous RFC when no addressees are listed", async () => {
    const ctx = makeCtx();
    const handler = createRequestForCommentHandler(ctx);

    await handler({ channel: "msteams", body: "Status update" });

    assert.strictEqual(ctx.rfcs.length, 1);
    assert.strictEqual(ctx.rfcs[0].addressee, undefined);
    assert.strictEqual(ctx.rfcs[0].body, "Status update");
    assert.strictEqual(ctx.rfcs[0].channel, "msteams");
  });

  test("RequestForComment works on a context without discuss augmentation", async () => {
    const ctx = createOrchestrationContext();
    const handler = createRequestForCommentHandler(ctx);

    await handler({ channel: "github-discussions", body: "open question" });

    assert.strictEqual(ctx.rfcs.length, 1);
    assert.strictEqual(ctx.rfcCounter, 1);
  });

  test("Recess marks the session concluded with verdict='recessed' and records the trigger", async () => {
    const ctx = makeCtx();
    ctx.messageBus = { answer: () => {} };
    const handler = createRecessHandler(ctx);
    const trigger = { kind: "elapsed", elapsed: "P14D" };

    await handler({ reason: "Awaiting human input", trigger });

    assert.strictEqual(ctx.concluded, true);
    assert.strictEqual(ctx.verdict, "recessed");
    assert.deepStrictEqual(ctx.recessTrigger, trigger);
    assert.strictEqual(ctx.summary, "Awaiting human input");
  });

  test("Adjourn marks the session concluded with the given verdict and summary", async () => {
    const ctx = makeCtx();
    ctx.messageBus = { answer: () => {} };
    const handler = createAdjournHandler(ctx);

    await handler({
      verdict: "adjourned",
      summary: "Discussion settled",
      outcome: "approved",
    });

    assert.strictEqual(ctx.concluded, true);
    assert.strictEqual(ctx.verdict, "adjourned");
    assert.strictEqual(ctx.summary, "Discussion settled");
    assert.strictEqual(ctx.outcome, "approved");
  });

  test("Recess refuses when Asks are still pending and leaves ctx.concluded false", async () => {
    const ctx = makeCtx();
    ctx.messageBus = { answer: () => {} };
    ctx.pendingAsks.set(7, {
      askId: 7,
      askerName: "lead",
      addresseeName: "agent-1",
      reminded: false,
    });
    const handler = createRecessHandler(ctx);

    const result = await handler({
      reason: "premature",
      trigger: { kind: "elapsed", elapsed: "PT1H" },
    });

    assert.strictEqual(result.isError, true);
    assert.match(result.content[0].text, /Asks are still pending/);
    assert.strictEqual(ctx.concluded, false);
    assert.strictEqual(ctx.recessTrigger, null);
    assert.strictEqual(ctx.pendingAsks.size, 1);
  });

  test("Adjourn refuses when Asks are still pending and leaves ctx.concluded false", async () => {
    const ctx = makeCtx();
    ctx.messageBus = { answer: () => {} };
    ctx.pendingAsks.set(9, {
      askId: 9,
      askerName: "lead",
      addresseeName: "agent-1",
      reminded: false,
    });
    const handler = createAdjournHandler(ctx);

    const result = await handler({
      verdict: "adjourned",
      summary: "early exit",
    });

    assert.strictEqual(result.isError, true);
    assert.match(result.content[0].text, /Asks are still pending/);
    assert.strictEqual(ctx.concluded, false);
    assert.strictEqual(ctx.pendingAsks.size, 1);
  });
});
