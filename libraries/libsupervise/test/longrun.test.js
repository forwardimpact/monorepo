import { describe, test, beforeEach } from "node:test";
import assert from "node:assert";
import { PassThrough } from "node:stream";
import { EventEmitter } from "node:events";

import {
  createTestRuntime,
  createMockSubprocess,
} from "@forwardimpact/libmock";

import { LongrunProcess } from "../src/longrun.js";

function emptyIterable() {
  return {
    async *[Symbol.asyncIterator]() {},
  };
}

describe("LongrunProcess", () => {
  let mockStdout;
  let mockStderr;
  let runtime;

  beforeEach(() => {
    mockStdout = new PassThrough();
    mockStderr = new PassThrough();
    runtime = createTestRuntime();
  });

  const opts = () => ({ runtime, stdout: mockStdout, stderr: mockStderr });

  describe("constructor", () => {
    test("throws if name is missing", () => {
      assert.throws(() => new LongrunProcess(), /name is required/);
    });

    test("throws if command is missing", () => {
      assert.throws(() => new LongrunProcess("test"), /command is required/);
    });

    test("throws if runtime is missing", () => {
      assert.throws(
        () => new LongrunProcess("test", "echo hello", {}),
        /runtime\.subprocess is required/,
      );
    });

    test("throws if stdout is missing", () => {
      assert.throws(
        () => new LongrunProcess("test", "echo hello", { runtime }),
        /options.stdout is required/,
      );
    });

    test("throws if stderr is missing", () => {
      assert.throws(
        () =>
          new LongrunProcess("test", "echo hello", {
            runtime,
            stdout: mockStdout,
          }),
        /options.stderr is required/,
      );
    });

    test("creates instance with valid parameters", () => {
      const longrun = new LongrunProcess("test", "echo hello", opts());
      assert.ok(longrun instanceof LongrunProcess);
      assert.ok(longrun instanceof EventEmitter);
    });

    test("accepts custom config options", () => {
      const longrun = new LongrunProcess("test", "echo hello", {
        ...opts(),
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
      const longrun = new LongrunProcess("my-service", "echo hello", opts());
      assert.strictEqual(longrun.name, "my-service");
    });
  });

  describe("getState", () => {
    test("returns initial state as down", () => {
      const longrun = new LongrunProcess("test", "echo hello", opts());
      const state = longrun.getState();

      assert.strictEqual(state.state, "down");
      assert.strictEqual(state.pid, null);
      assert.strictEqual(state.restartCount, 0);
    });
  });

  describe("signal", () => {
    test("does not throw when process is not running", () => {
      const longrun = new LongrunProcess("test", "echo hello", opts());
      assert.doesNotThrow(() => longrun.signal("SIGTERM"));
    });
  });

  describe("stop", () => {
    test("resolves immediately when process is not running", async () => {
      const longrun = new LongrunProcess("test", "echo hello", opts());
      await longrun.stop();
      const state = longrun.getState();

      assert.strictEqual(state.state, "down");
    });

    test("transitions to down state", async () => {
      const longrun = new LongrunProcess("test", "echo hello", opts());
      await longrun.stop();

      assert.strictEqual(longrun.getState().state, "down");
    });
  });

  describe("event emission", () => {
    test("is an EventEmitter", () => {
      const longrun = new LongrunProcess("test", "echo hello", opts());

      let eventReceived = false;
      longrun.on("test-event", () => {
        eventReceived = true;
      });
      longrun.emit("test-event");

      assert.strictEqual(eventReceived, true);
    });
  });

  describe("subprocess.spawn bridging (mock subprocess)", () => {
    test("routes through subprocess.spawn with a detached process group", async () => {
      const subprocess = createMockSubprocess({
        responses: { bash: { stdout: "hello\n", pid: 1234 } },
      });
      const rt = createTestRuntime({ subprocess });
      const longrun = new LongrunProcess("svc", "echo hello", {
        runtime: rt,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      const ups = [];
      longrun.on("up", (e) => ups.push(e));

      await longrun.start();

      const call = subprocess.calls.find((c) => c.cmd === "bash");
      assert.ok(call, "spawn was called with bash");
      assert.deepStrictEqual(call.args, ["-c", "echo hello"]);
      assert.strictEqual(call.opts.detached, true);
      assert.deepStrictEqual(ups, [{ name: "svc", pid: 1234 }]);
      // Stop supervising so the auto-restart backoff loop doesn't keep firing.
      await longrun.stop();
    });

    test("consumes the AsyncIterable stdout into the injected sink", async () => {
      const subprocess = createMockSubprocess({
        responses: { bash: { stdout: "line-a\nline-b\n", pid: 9 } },
      });
      const rt = createTestRuntime({ subprocess });
      const captured = [];
      const sink = new PassThrough();
      sink.on("data", (c) => captured.push(c.toString()));
      const longrun = new LongrunProcess("svc", "echo hi", {
        runtime: rt,
        stdout: sink,
        stderr: mockStderr,
      });
      await longrun.start();
      // Let the detached pump loop drain.
      await new Promise((r) => setImmediate(r));
      assert.strictEqual(captured.join(""), "line-a\nline-b\n");
      await longrun.stop();
    });

    test("emits error when spawn returns no pid (spawn failure)", async () => {
      // The default mock always hands back a pid; a spawn failure (pid
      // undefined) needs an explicit stub.
      const subprocess = {
        spawn: () => ({
          stdout: emptyIterable(),
          stderr: emptyIterable(),
          stdin: null,
          exitCode: Promise.resolve(127),
          signal: Promise.resolve(null),
          kill: () => {},
          pid: undefined,
        }),
      };
      const rt = createTestRuntime({ subprocess });
      const longrun = new LongrunProcess("svc", "bad", {
        runtime: rt,
        stdout: mockStdout,
        stderr: mockStderr,
      });
      const errors = [];
      longrun.on("error", (e) => errors.push(e));
      await longrun.start();
      assert.strictEqual(errors.length, 1);
      assert.strictEqual(errors[0].name, "svc");
      assert.match(errors[0].error.message, /failed to spawn/);
    });

    test("signal kills the process group via runtime.proc.kill", async () => {
      // A child whose exitCode never resolves stays "up" so the synchronous
      // signal() path can read its live pid.
      const subprocess = {
        spawn: () => ({
          stdout: emptyIterable(),
          stderr: emptyIterable(),
          stdin: null,
          exitCode: new Promise(() => {}),
          signal: new Promise(() => {}),
          kill: () => {},
          pid: 4242,
        }),
      };
      const kills = [];
      const rt = createTestRuntime({
        subprocess,
        proc: {
          env: {},
          kill: (pid, sig) => kills.push({ pid, sig }),
        },
      });
      const longrun = new LongrunProcess("svc", "sleep 100", {
        runtime: rt,
        stdout: mockStdout,
        stderr: mockStderr,
      });
      await longrun.start();
      longrun.signal("SIGUSR1");
      assert.deepStrictEqual(kills, [{ pid: -4242, sig: "SIGUSR1" }]);
    });
  });
});
