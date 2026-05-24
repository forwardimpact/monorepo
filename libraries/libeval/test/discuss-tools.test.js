import { test, describe } from "node:test";
import assert from "node:assert";

import {
  createRequestForCommentHandler,
  createRecessHandler,
  createAdjournHandler,
} from "../src/discuss-tools.js";
import { augmentContextForDiscuss } from "../src/discusser.js";
import { createOrchestrationContext } from "../src/orchestration-toolkit.js";

function makeCtx(discussionId = null) {
  return augmentContextForDiscuss(createOrchestrationContext(), discussionId);
}

describe("DiscussTools handlers", () => {
  test("RequestForComment pushes one reply per addressee with a shared correlation id", async () => {
    const ctx = makeCtx("GD_kw_test");
    const handler = createRequestForCommentHandler(ctx);

    const result = await handler({
      channel: "github-discussions",
      body: "Please weigh in on the spec.",
      addressees: ["alice", "bob"],
    });

    assert.strictEqual(ctx.replies.length, 2);
    assert.strictEqual(ctx.replies[0].addressee, "alice");
    assert.strictEqual(ctx.replies[0].body, "Please weigh in on the spec.");
    assert.strictEqual(ctx.replies[0].thread_id, "GD_kw_test");
    assert.strictEqual(ctx.replies[1].addressee, "bob");
    assert.strictEqual(
      ctx.replies[0].correlation_id,
      ctx.replies[1].correlation_id,
    );

    const payload = JSON.parse(result.content[0].text);
    assert.match(payload.correlation_id, /^rfc_\d+$/);
    assert.strictEqual(payload.channel, "github-discussions");
  });

  test("RequestForComment emits a single anonymous reply when no addressees are listed", async () => {
    const ctx = makeCtx();
    const handler = createRequestForCommentHandler(ctx);

    await handler({ channel: "msteams", body: "Status update" });

    assert.strictEqual(ctx.replies.length, 1);
    assert.strictEqual(ctx.replies[0].addressee, undefined);
    assert.strictEqual(ctx.replies[0].body, "Status update");
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
});
