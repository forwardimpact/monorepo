import { describe, test } from "node:test";
import assert from "node:assert";
import { PassThrough } from "node:stream";

import { AgentRunner } from "@forwardimpact/libeval";

/**
 * Create a mock query function that yields canned messages.
 * @param {object[]} messages - Messages to yield
 * @returns {function}
 */
function mockQuery(messages) {
  return async function* () {
    for (const msg of messages) {
      yield msg;
    }
  };
}

const textBlock = (t) => ({
  type: "assistant",
  message: { content: [{ type: "text", text: t }] },
});

const toolOnly = (name) => ({
  type: "assistant",
  message: {
    content: [{ type: "tool_use", id: "tu_" + name, name, input: {} }],
  },
});

describe("AgentRunner - onBatch batching", () => {
  test("batchSize defaults to 3", () => {
    const runner = new AgentRunner({
      cwd: "/tmp",
      query: async function* () {},
      output: new PassThrough(),
    });
    assert.strictEqual(runner.batchSize, 3);
  });

  test("onBatch fires every 3 assistant text-block messages by default", async () => {
    // 5 text-block messages + terminal result. With the default batchSize
    // of 3, onBatch should fire on the 3rd text message and again on the
    // terminal result (flushing the remaining 2).
    const messages = [
      { type: "system", subtype: "init", session_id: "sess-batch" },
      textBlock("one"),
      textBlock("two"),
      textBlock("three"),
      textBlock("four"),
      textBlock("five"),
      { type: "result", subtype: "success", result: "Done." },
    ];

    const batches = [];
    const runner = new AgentRunner({
      cwd: "/tmp",
      query: mockQuery(messages),
      output: new PassThrough(),
    });
    runner.onBatch = async (lines) => {
      batches.push(lines.map((l) => JSON.parse(l)));
    };

    await runner.run("Task");

    // First flush carries init + first 3 text messages; second carries
    // remaining 2 text messages + the result.
    assert.strictEqual(batches.length, 2);
    assert.strictEqual(batches[0].length, 4);
    assert.strictEqual(batches[1].length, 3);
  });

  test("onBatch honours custom batchSize", async () => {
    // batchSize = 2: 4 text messages produce 2 flushes; result adds a 3rd.
    const messages = [
      textBlock("a"),
      textBlock("b"),
      textBlock("c"),
      textBlock("d"),
      { type: "result", subtype: "success", result: "Done." },
    ];

    const batches = [];
    const runner = new AgentRunner({
      cwd: "/tmp",
      query: mockQuery(messages),
      output: new PassThrough(),
      batchSize: 2,
    });
    runner.onBatch = async (lines) => {
      batches.push(lines.length);
    };

    await runner.run("Task");

    assert.deepStrictEqual(batches, [2, 2, 1]);
  });

  test("tool-only assistant messages ride along in the next flush", async () => {
    // Tool-only assistant messages accumulate without incrementing the
    // counter. The supervisor sees the preceding tool calls when the
    // flush eventually fires.
    const messages = [
      toolOnly("Read"),
      toolOnly("Grep"),
      textBlock("found it"),
      { type: "result", subtype: "success", result: "Done." },
    ];

    const batches = [];
    const runner = new AgentRunner({
      cwd: "/tmp",
      query: mockQuery(messages),
      output: new PassThrough(),
      batchSize: 1,
    });
    runner.onBatch = async (lines) => {
      batches.push(lines.map((l) => JSON.parse(l)));
    };

    await runner.run("Task");

    // First flush triggered by the single text-block message; it carries
    // the two preceding tool-only messages with it.
    assert.strictEqual(batches.length, 2);
    assert.strictEqual(batches[0].length, 3);
    assert.strictEqual(batches[0][0].message.content[0].type, "tool_use");
    assert.strictEqual(batches[0][1].message.content[0].type, "tool_use");
    assert.strictEqual(batches[0][2].message.content[0].type, "text");
    assert.strictEqual(batches[1].length, 1);
    assert.strictEqual(batches[1][0].type, "result");
  });

  test("terminal result always flushes even if batchSize not yet reached", async () => {
    // 1 text-block + result, batchSize = 5. The counter only reaches 1
    // but the terminal result must still flush.
    const messages = [
      textBlock("only one"),
      { type: "result", subtype: "success", result: "Done." },
    ];

    const batches = [];
    const runner = new AgentRunner({
      cwd: "/tmp",
      query: mockQuery(messages),
      output: new PassThrough(),
      batchSize: 5,
    });
    runner.onBatch = async (lines) => {
      batches.push(lines.length);
    };

    await runner.run("Task");

    assert.deepStrictEqual(batches, [2]);
  });
});

describe("AgentRunner - terminal flush on abnormal end", () => {
  test("iterator crash before a flush boundary still delivers the pending batch", async () => {
    // batchSize = 3: the first two text messages accumulate without
    // flushing. The iterator then throws before the threshold — the
    // pending batch must ship in a terminal flush.
    async function* crashingQuery() {
      yield { type: "system", subtype: "init", session_id: "sess-crash" };
      yield textBlock("step 1");
      yield textBlock("step 2");
      throw new Error("Claude Code process exited with code 1");
    }

    const batches = [];
    const runner = new AgentRunner({
      cwd: "/tmp",
      query: () => crashingQuery(),
      output: new PassThrough(),
    });
    runner.onBatch = async (lines) => {
      batches.push(lines.map((l) => JSON.parse(l)));
    };

    const result = await runner.run("Task");

    assert.ok(result.error);
    assert.match(result.error.message, /exited with code 1/);
    assert.strictEqual(batches.length, 1);
    assert.strictEqual(batches[0].length, 3);
    assert.strictEqual(batches[0][0].type, "system");
    assert.strictEqual(batches[0][1].type, "assistant");
    assert.strictEqual(batches[0][2].type, "assistant");
  });

  test("iterator crash after a completed batch does not re-flush", async () => {
    // batchSize = 2: two text messages trigger a normal flush, emptying
    // the pending batch. The iterator then throws with nothing pending —
    // the terminal flush must be a no-op, not an empty call.
    async function* crashingQuery() {
      yield textBlock("a");
      yield textBlock("b");
      throw new Error("boom");
    }

    const batches = [];
    const runner = new AgentRunner({
      cwd: "/tmp",
      query: () => crashingQuery(),
      output: new PassThrough(),
      batchSize: 2,
    });
    runner.onBatch = async (lines) => {
      batches.push(lines.length);
    };

    const result = await runner.run("Task");
    assert.ok(result.error);
    assert.match(result.error.message, /boom/);
    assert.deepStrictEqual(batches, [2]);
  });

  test("natural-end iterator without a result does not trigger terminal flush", async () => {
    // The real SDK always terminates with `result`. A mock that ends
    // naturally with pending lines is treated as an incomplete stub —
    // no phantom flush, since nothing about a natural end warrants a
    // new mid-turn review.
    async function* noResultQuery() {
      yield textBlock("one");
      yield textBlock("two");
      // No result, no error — just ends.
    }

    const batches = [];
    const runner = new AgentRunner({
      cwd: "/tmp",
      query: () => noResultQuery(),
      output: new PassThrough(),
      batchSize: 3,
    });
    runner.onBatch = async (lines) => {
      batches.push(lines.length);
    };

    const result = await runner.run("Task");
    assert.strictEqual(result.error, null);
    assert.strictEqual(batches.length, 0);
  });

  test("onBatch throw during terminal flush does not mask an earlier error", async () => {
    // The iterator threw first; the terminal flush also throws. The
    // original iterator error must win — it is the more actionable
    // condition to surface to the caller.
    async function* crashingQuery() {
      yield textBlock("partial");
      throw new Error("original failure");
    }

    const runner = new AgentRunner({
      cwd: "/tmp",
      query: () => crashingQuery(),
      output: new PassThrough(),
      batchSize: 3,
    });
    runner.onBatch = async () => {
      throw new Error("flush failure");
    };

    const result = await runner.run("Task");
    assert.ok(result.error);
    assert.match(result.error.message, /original failure/);
  });
});
