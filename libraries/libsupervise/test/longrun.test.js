import { describe, test, beforeEach } from "node:test";
import assert from "node:assert";
import { PassThrough } from "node:stream";
import { EventEmitter } from "node:events";

import { LongrunProcess } from "../longrun.js";

describe("LongrunProcess", () => {
  let mockStdout;
  let mockStderr;

  beforeEach(() => {
    mockStdout = new PassThrough();
    mockStderr = new PassThrough();
  });

  describe("constructor", () => {
    test("throws if name is missing", () => {
      assert.throws(() => new LongrunProcess(), /name is required/);
    });

    test("throws if command is missing", () => {
      assert.throws(() => new LongrunProcess("test"), /command is required/);
    });

    test("throws if stdout is missing", () => {
      assert.throws(
        () => new LongrunProcess("test", "echo hello", {}),
        /options.stdout is required/,
      );
    });

    test("throws if stderr is missing", () => {
      assert.throws(
        () => new LongrunProcess("test", "echo hello", { stdout: mockStdout }),
        /options.stderr is required/,
      );
    });

    test("creates instance with valid parameters", () => {
      const longrun = new LongrunProcess("test", "echo hello", {
        stdout: mockStdout,
        stderr: mockStderr,
      });
      assert.ok(longrun instanceof LongrunProcess);
      assert.ok(longrun instanceof EventEmitter);
    });

    test("accepts custom config options", () => {
      const longrun = new LongrunProcess("test", "echo hello", {
        stdout: mockStdout,
        stderr: mockStderr,
        config: {
          minRestartDelay: 50,
          maxRestartDelay: 1000,
          backoffMultiplier: 3,
        },
      });
      assert.ok(longrun instanceof LongrunProcess);
    });
  });

  describe("name getter", () => {
    test("returns the service name", () => {
      const longrun = new LongrunProcess("my-service", "echo hello", {
        stdout: mockStdout,
        stderr: mockStderr,
      });
      assert.strictEqual(longrun.name, "my-service");
    });
  });

  describe("getState", () => {
    test("returns initial state as down", () => {
      const longrun = new LongrunProcess("test", "echo hello", {
        stdout: mockStdout,
        stderr: mockStderr,
      });
      const state = longrun.getState();

      assert.strictEqual(state.state, "down");
      assert.strictEqual(state.pid, null);
      assert.strictEqual(state.restartCount, 0);
    });
  });

  describe("signal", () => {
    test("does not throw when process is not running", () => {
      const longrun = new LongrunProcess("test", "echo hello", {
        stdout: mockStdout,
        stderr: mockStderr,
      });
      assert.doesNotThrow(() => longrun.signal("SIGTERM"));
    });
  });

  describe("stop", () => {
    test("resolves immediately when process is not running", async () => {
      const longrun = new LongrunProcess("test", "echo hello", {
        stdout: mockStdout,
        stderr: mockStderr,
      });
      await longrun.stop();
      const state = longrun.getState();

      assert.strictEqual(state.state, "down");
    });

    test("transitions to down state", async () => {
      const longrun = new LongrunProcess("test", "echo hello", {
        stdout: mockStdout,
        stderr: mockStderr,
      });
      await longrun.stop();

      assert.strictEqual(longrun.getState().state, "down");
    });
  });

  describe("event emission", () => {
    test("is an EventEmitter", () => {
      const longrun = new LongrunProcess("test", "echo hello", {
        stdout: mockStdout,
        stderr: mockStderr,
      });

      let eventReceived = false;
      longrun.on("test-event", () => {
        eventReceived = true;
      });
      longrun.emit("test-event");

      assert.strictEqual(eventReceived, true);
    });
  });
});

describe("LongrunProcess integration", () => {
  let mockStdout;
  let mockStderr;

  beforeEach(() => {
    mockStdout = new PassThrough();
    mockStderr = new PassThrough();
  });

  test("start and stop short-lived process", async () => {
    const longrun = new LongrunProcess("quick", "echo hello && exit 0", {
      stdout: mockStdout,
      stderr: mockStderr,
      config: {
        minRestartDelay: 10,
        maxRestartDelay: 50,
      },
    });

    const events = [];
    longrun.on("up", (e) => events.push({ type: "up", ...e }));
    longrun.on("backoff", (e) => events.push({ type: "backoff", ...e }));
    longrun.on("down", (e) => events.push({ type: "down", ...e }));

    await longrun.start();

    // Wait for process to spawn and emit up event
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Stop the process
    await longrun.stop(1000);

    assert.strictEqual(longrun.getState().state, "down");
  });
});
