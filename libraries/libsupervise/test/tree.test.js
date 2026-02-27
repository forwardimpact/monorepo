import { describe, test } from "node:test";
import assert from "node:assert";
import { EventEmitter } from "node:events";

import { SupervisionTree } from "../tree.js";

describe("SupervisionTree", () => {
  describe("constructor", () => {
    test("throws if logDir is missing", () => {
      assert.throws(() => new SupervisionTree(), /logDir is required/);
    });

    test("creates instance with logDir", () => {
      const tree = new SupervisionTree("/tmp/logs");
      assert.ok(tree instanceof SupervisionTree);
      assert.ok(tree instanceof EventEmitter);
    });

    test("accepts config options", () => {
      const tree = new SupervisionTree("/tmp/logs", { shutdownTimeout: 5000 });
      assert.ok(tree instanceof SupervisionTree);
    });
  });

  describe("start", () => {
    test("emits start event", async () => {
      const tree = new SupervisionTree("/tmp/logs");
      let eventEmitted = false;

      tree.on("start", () => {
        eventEmitted = true;
      });

      await tree.start();

      assert.strictEqual(eventEmitted, true);
    });
  });

  describe("stop", () => {
    test("emits stop event", async () => {
      const tree = new SupervisionTree("/tmp/logs");
      let eventEmitted = false;

      tree.on("stop", () => {
        eventEmitted = true;
      });

      await tree.start();
      await tree.stop();

      assert.strictEqual(eventEmitted, true);
    });
  });

  describe("event emission", () => {
    test("is an EventEmitter", () => {
      const tree = new SupervisionTree("/tmp/logs");

      let eventReceived = false;
      tree.on("test-event", () => {
        eventReceived = true;
      });
      tree.emit("test-event");

      assert.strictEqual(eventReceived, true);
    });

    test("emits lifecycle events", async () => {
      const tree = new SupervisionTree("/tmp/logs");
      const events = [];

      tree.on("start", () => events.push("start"));
      tree.on("stop", () => events.push("stop"));

      await tree.start();
      await tree.stop();

      assert.deepStrictEqual(events, ["start", "stop"]);
    });
  });
});
