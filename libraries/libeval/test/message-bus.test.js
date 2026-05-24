import { describe, test } from "node:test";
import assert from "node:assert";

import { MessageBus, createMessageBus } from "../src/message-bus.js";

describe("MessageBus", () => {
  test("announce delivers to all others, not sender", () => {
    const bus = new MessageBus({ participants: ["a", "b", "c"] });
    bus.announce("a", "hello");

    assert.deepStrictEqual(bus.drain("a"), []);
    assert.deepStrictEqual(bus.drain("b"), [
      { from: "a", text: "hello", kind: "announce" },
    ]);
    assert.deepStrictEqual(bus.drain("c"), [
      { from: "a", text: "hello", kind: "announce" },
    ]);
  });

  test("ask delivers to the named recipient only", () => {
    const bus = new MessageBus({ participants: ["a", "b", "c"] });
    bus.ask("a", "b", "What?", 1);

    assert.deepStrictEqual(bus.drain("a"), []);
    assert.deepStrictEqual(bus.drain("b"), [
      { from: "a", text: "What?", kind: "ask", askId: 1 },
    ]);
    assert.deepStrictEqual(bus.drain("c"), []);
  });

  test("answer delivers directly to the asker", () => {
    const bus = new MessageBus({ participants: ["a", "b"] });
    bus.answer("b", "a", "Reply", 7);

    const msgs = bus.drain("a");
    assert.strictEqual(msgs.length, 1);
    assert.strictEqual(msgs[0].from, "b");
    assert.strictEqual(msgs[0].kind, "answer");
    assert.strictEqual(msgs[0].askId, 7);
  });

  test("answer accepts orchestrator-origin null answers without asserting participant", () => {
    const bus = new MessageBus({ participants: ["a", "b"] });
    bus.answer("@orchestrator", "a", "[no answer]", 12);
    const msgs = bus.drain("a");
    assert.strictEqual(msgs.length, 1);
    assert.strictEqual(msgs[0].from, "@orchestrator");
  });

  test("synthetic queues an orchestrator reminder on the participant queue", () => {
    const bus = new MessageBus({ participants: ["a"] });
    bus.synthetic("a", "Reminder");
    const msgs = bus.drain("a");
    assert.strictEqual(msgs.length, 1);
    assert.strictEqual(msgs[0].from, "@orchestrator");
    assert.strictEqual(msgs[0].kind, "synthetic");
  });

  test("drain returns and clears messages", () => {
    const bus = new MessageBus({ participants: ["a", "b"] });
    bus.announce("a", "msg1");
    bus.announce("a", "msg2");

    const messages = bus.drain("b");
    assert.strictEqual(messages.length, 2);
    assert.deepStrictEqual(bus.drain("b"), []);
  });

  test("drain on empty queue returns []", () => {
    const bus = new MessageBus({ participants: ["a"] });
    assert.deepStrictEqual(bus.drain("a"), []);
  });

  test("waitForMessages resolves when a message arrives", async () => {
    const bus = new MessageBus({ participants: ["a", "b"] });

    let resolved = false;
    const promise = bus.waitForMessages("b").then(() => {
      resolved = true;
    });

    assert.strictEqual(resolved, false);
    bus.announce("a", "wake up");
    await promise;
    assert.strictEqual(resolved, true);
  });

  test("waitForMessages resolves immediately if messages are already pending", async () => {
    const bus = new MessageBus({ participants: ["a", "b"] });
    bus.announce("a", "already here");

    await bus.waitForMessages("b");
    assert.strictEqual(bus.drain("b").length, 1);
  });

  test("unknown participant name throws", () => {
    const bus = new MessageBus({ participants: ["a"] });
    assert.throws(() => bus.announce("unknown", "msg"), /Unknown participant/);
    assert.throws(
      () => bus.ask("a", "unknown", "msg", 1),
      /Unknown participant/,
    );
    assert.throws(() => bus.drain("unknown"), /Unknown participant/);
    assert.throws(() => bus.waitForMessages("unknown"), /Unknown participant/);
  });

  test("createMessageBus factory returns an instance", () => {
    const bus = createMessageBus({ participants: ["x", "y"] });
    assert.ok(bus instanceof MessageBus);
  });
});
