import { describe, test } from "node:test";
import assert from "node:assert";

import {
  createTestRuntime,
  createMockFs,
  createMockClock,
} from "@forwardimpact/libmock";

import { LogWriter } from "../src/logger.js";

describe("LogWriter", () => {
  describe("constructor", () => {
    test("throws if logDir is missing", () => {
      assert.throws(
        () => new LogWriter(undefined, { runtime: createTestRuntime() }),
        /logDir is required/,
      );
    });

    test("throws if runtime.fs is missing", () => {
      assert.throws(
        () => new LogWriter("/logs", {}),
        /runtime\.fs is required/,
      );
    });
  });

  describe("init", () => {
    test("creates the log directory via runtime.fs", async () => {
      const fs = createMockFs();
      const writer = new LogWriter("/logs/svc", {
        runtime: createTestRuntime({ fs }),
      });
      await writer.init();
      assert.ok(fs.mkdir.mock.callCount() >= 1);
      assert.strictEqual(fs.mkdir.mock.calls[0].arguments[0], "/logs/svc");
    });
  });

  describe("write", () => {
    test("prepends an ISO timestamp from runtime.clock and appends", async () => {
      const fs = createMockFs();
      // 2021-01-01T00:00:00.000Z
      const clock = createMockClock({ start: 1609459200000 });
      const writer = new LogWriter("/logs/svc", {
        runtime: createTestRuntime({ fs, clock }),
      });
      await writer.init();
      await writer.write("hello\n");

      const current = fs.data.get("/logs/svc/current");
      assert.strictEqual(current, "2021-01-01T00:00:00.000Z hello\n");
    });

    test("omits the timestamp when disabled", async () => {
      const fs = createMockFs();
      const writer = new LogWriter("/logs/svc", {
        runtime: createTestRuntime({ fs }),
        config: { timestamp: false },
      });
      await writer.init();
      await writer.write("plain\n");

      assert.strictEqual(fs.data.get("/logs/svc/current"), "plain\n");
    });
  });

  describe("rotate", () => {
    test("renames current to a timestamped archive", async () => {
      const fs = createMockFs();
      const clock = createMockClock({ start: 1609459200000 });
      const writer = new LogWriter("/logs/svc", {
        runtime: createTestRuntime({ fs, clock }),
        config: { timestamp: false },
      });
      await writer.init();
      await writer.write("a\n");
      await writer.rotate();

      assert.strictEqual(fs.data.has("/logs/svc/current"), false);
      const archive = [...fs.data.keys()].find((k) => /\/@.*\.s$/.test(k));
      assert.ok(archive, "an @<timestamp>.s archive exists");
      assert.strictEqual(fs.data.get(archive), "a\n");
    });
  });
});
