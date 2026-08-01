import { describe, test } from "node:test";
import assert from "node:assert";
import { EventEmitter } from "node:events";

import { SupervisionTree } from "../src/tree.js";
import {
  createMockSubprocess,
  createSilentLogger,
  createTestRuntime,
} from "@forwardimpact/libmock";

const mockLogger = createSilentLogger();
const cfg = (extra = {}) => ({
  runtime: createTestRuntime(),
  logger: mockLogger,
  ...extra,
});

describe("SupervisionTree", () => {
  describe("constructor", () => {
    test("throws if logDir is missing", () => {
      assert.throws(
        () => new SupervisionTree(undefined, cfg()),
        /logDir is required/,
      );
    });

    test("throws if config.runtime is missing", () => {
      assert.throws(
        () => new SupervisionTree("/tmp/logs", { logger: mockLogger }),
        /config\.runtime is required/,
      );
    });

    test("throws if config.logger is missing", () => {
      assert.throws(
        () =>
          new SupervisionTree("/tmp/logs", { runtime: createTestRuntime() }),
        /config\.logger is required/,
      );
    });

    test("creates instance with logDir and logger", () => {
      const tree = new SupervisionTree("/tmp/logs", cfg());
      assert.ok(tree instanceof SupervisionTree);
      assert.ok(tree instanceof EventEmitter);
    });

    test("accepts config options", () => {
      const tree = new SupervisionTree(
        "/tmp/logs",
        cfg({ shutdownTimeout: 5000 }),
      );
      assert.ok(tree instanceof SupervisionTree);
    });
  });

  describe("start", () => {
    test("emits start event", async () => {
      const tree = new SupervisionTree("/tmp/logs", cfg());
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
      const tree = new SupervisionTree("/tmp/logs", cfg());
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
      const tree = new SupervisionTree("/tmp/logs", cfg());

      let eventReceived = false;
      tree.on("test-event", () => {
        eventReceived = true;
      });
      tree.emit("test-event");

      assert.strictEqual(eventReceived, true);
    });

    test("emits lifecycle events", async () => {
      const tree = new SupervisionTree("/tmp/logs", cfg());
      const events = [];

      tree.on("start", () => events.push("start"));
      tree.on("stop", () => events.push("stop"));

      await tree.start();
      await tree.stop();

      assert.deepStrictEqual(events, ["start", "stop"]);
    });
  });

  // Each supervised service gets its own fit-logger child (daemontools s6-log
  // model). The tree pipes the service's stdout and stderr into the logger's
  // stdin. The logger writes one rotated log per service. The tree launches
  // that child in a different way when svscan is a compiled binary.
  describe("log process", () => {
    /**
     * Run `add` against a subprocess that captures the calls.
     * Return the logger spawn.
     */
    async function logSpawnFor({ isCompiled }) {
      const subprocess = createMockSubprocess();
      const tree = new SupervisionTree(
        "/tmp/logs",
        cfg({ runtime: createTestRuntime({ subprocess }), isCompiled }),
      );
      await tree.start();
      await tree.add("web", "run-web");
      // The logger is the spawn with the --dir flag. The service itself
      // goes through `bash -c`.
      const logCall = subprocess.calls.find((c) => c.args.includes("--dir"));
      // The mock child "exits" immediately. The mock clock's setTimeout uses
      // real timers. If the tree stays up, it respawns the logger every 100ms
      // forever. stop() flips the guard that gates the restart.
      await tree.stop();
      return logCall;
    }

    test("source mode runs fit-logger under node with the per-service log dir", async () => {
      const logCall = await logSpawnFor({ isCompiled: false });
      assert.ok(logCall, "the tree spawns a logger process");
      assert.strictEqual(logCall.cmd, "node");
      assert.match(logCall.args[0], /bin\/fit-logger\.js$/);
      assert.deepStrictEqual(logCall.args.slice(1), ["--dir", "/tmp/logs/web"]);
    });

    test("compiled mode execs the sibling fit-logger resolved from PATH", async () => {
      const logCall = await logSpawnFor({ isCompiled: true });
      assert.ok(logCall, "the tree spawns a logger process");
      assert.strictEqual(logCall.cmd, "fit-logger");
      assert.deepStrictEqual(logCall.args, ["--dir", "/tmp/logs/web"]);
    });

    test("pipes the service streams into the logger through a stdin pipe", async () => {
      const logCall = await logSpawnFor({ isCompiled: false });
      assert.deepStrictEqual(logCall.opts.stdio, [
        "pipe",
        "inherit",
        "inherit",
      ]);
    });
  });
});
