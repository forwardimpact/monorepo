import { test, describe } from "node:test";
import assert from "node:assert";
import { PassThrough } from "node:stream";

import { Discusser, augmentContextForDiscuss } from "../src/discusser.js";
import { createOrchestrationContext } from "../src/orchestration-toolkit.js";
import { createNoopRedactor } from "../src/redaction.js";

function readLines(stream) {
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk.toString();
  });
  return () => buffer.split("\n").filter((line) => line.trim());
}

/** Minimal stand-in for OrchestrationLoop — emits one summary line and reports turns. */
function fakeLoop({ output, verdict, summary, turns, redactor }) {
  return {
    leadTurns: turns,
    counter: { next: () => 99 },
    emitLine() {},
    async run() {
      output.write(
        JSON.stringify(
          redactor.redactValue({
            source: "orchestrator",
            seq: 1,
            event: { type: "summary", verdict, summary, turns },
          }),
        ) + "\n",
      );
    },
  };
}

describe("Discusser orchestration", () => {
  test("emits the meta header before any other line when a discussion_id is set", async () => {
    const output = new PassThrough();
    const getLines = readLines(output);
    const redactor = createNoopRedactor();
    const ctx = augmentContextForDiscuss(
      createOrchestrationContext(),
      "GD_abc",
    );
    ctx.verdict = "adjourned";
    ctx.summary = "ok";

    const loop = fakeLoop({
      output,
      verdict: "adjourned",
      summary: "ok",
      turns: 3,
      redactor,
    });
    const discusser = new Discusser({
      loop,
      ctx,
      output,
      discussionId: "GD_abc",
      redactor,
    });

    const result = await discusser.run("hello");

    const lines = getLines();
    const first = JSON.parse(lines[0]);
    assert.strictEqual(first.event.type, "meta");
    assert.strictEqual(first.event.discussion_id, "GD_abc");

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.verdict, "adjourned");
    assert.strictEqual(result.turns, 3);
  });

  test("recess verdict is treated as suspended (success=false) and carries the trigger forward", async () => {
    const output = new PassThrough();
    const getLines = readLines(output);
    const redactor = createNoopRedactor();
    const ctx = augmentContextForDiscuss(createOrchestrationContext(), null);
    ctx.verdict = "recessed";
    ctx.recessTrigger = { kind: "missing_input", replies: 2 };
    ctx.summary = "awaiting replies";
    ctx.replies.push({ body: "outgoing reply", agent: "agent-1" });

    const loop = fakeLoop({
      output,
      verdict: "recessed",
      summary: "awaiting replies",
      turns: 5,
      redactor,
    });
    const discusser = new Discusser({
      loop,
      ctx,
      output,
      discussionId: null,
      redactor,
    });

    const result = await discusser.run("hi");

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.verdict, "recessed");
    assert.deepStrictEqual(result.trigger, {
      kind: "missing_input",
      replies: 2,
    });
    assert.strictEqual(result.replies.length, 1);

    // The last summary line is the discuss-augmented one; it carries replies and trigger.
    const lines = getLines();
    const last = JSON.parse(lines[lines.length - 1]);
    assert.strictEqual(last.event.type, "summary");
    assert.strictEqual(last.event.verdict, "recessed");
    assert.deepStrictEqual(last.event.trigger, {
      kind: "missing_input",
      replies: 2,
    });
    assert.strictEqual(last.event.replies.length, 1);
  });

  test("adjourned verdict is reported as success=true with replies aggregated on the summary", async () => {
    const output = new PassThrough();
    const getLines = readLines(output);
    const redactor = createNoopRedactor();
    const ctx = augmentContextForDiscuss(
      createOrchestrationContext(),
      "GD_kw_xyz",
    );
    ctx.verdict = "adjourned";
    ctx.summary = "done";
    ctx.replies.push(
      { body: "outgoing one", agent: "agent-1" },
      { body: "outgoing two", agent: "agent-2" },
    );

    const loop = fakeLoop({
      output,
      verdict: "adjourned",
      summary: "done",
      turns: 2,
      redactor,
    });
    const discusser = new Discusser({
      loop,
      ctx,
      output,
      discussionId: "GD_kw_xyz",
      redactor,
    });

    const result = await discusser.run("ping");

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.replies.length, 2);

    const lines = getLines();
    const last = JSON.parse(lines[lines.length - 1]);
    assert.strictEqual(last.event.replies.length, 2);
    assert.strictEqual(last.event.discussion_id, "GD_kw_xyz");
  });
});

describe("Discusser - summary shape", () => {
  test("the recessed summary no longer carries pending_asks (in-flight sync Asks were resolved at Recess time)", async () => {
    const output = new PassThrough();
    const getLines = readLines(output);
    const redactor = createNoopRedactor();
    const ctx = augmentContextForDiscuss(createOrchestrationContext(), null);
    ctx.verdict = "recessed";
    ctx.recessTrigger = { kind: "elapsed", elapsed: "PT1H" };
    ctx.summary = "awaiting";

    const loop = fakeLoop({
      output,
      verdict: "recessed",
      summary: "awaiting",
      turns: 1,
      redactor,
    });
    const discusser = new Discusser({
      loop,
      ctx,
      output,
      discussionId: null,
      redactor,
    });

    await discusser.run("ping");

    const lines = getLines();
    const last = JSON.parse(lines[lines.length - 1]);
    assert.strictEqual(last.event.type, "summary");
    assert.ok(
      !("pending_asks" in last.event),
      "summary must not include pending_asks under the sync-Ask model",
    );
  });
});
