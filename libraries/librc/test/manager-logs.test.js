import { describe, test, beforeEach } from "node:test";
import assert from "node:assert";
import { Readable, Writable } from "node:stream";

import { ServiceManager } from "../src/manager.js";
import {
  assertRejectsMessage,
  createMockProcess,
  createTestRuntime,
} from "@forwardimpact/libmock";

// Stream that asynchronously fails with an Error carrying the given code.
const failingStream = (code) =>
  new Readable({
    read() {
      process.nextTick(() => {
        const err = new Error(`${code}: simulated`);
        err.code = code;
        this.destroy(err);
      });
    },
  });

// Writable that captures every chunk into an array of Buffers.
const capturingSink = () => {
  const captured = [];
  const sink = new Writable({
    write(chunk, _enc, cb) {
      captured.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      cb();
    },
  });
  sink.captured = captured;
  return sink;
};

describe("ServiceManager - logs", () => {
  let mockConfig;
  let mockLogger;
  let mockDeps;
  let logCalls;

  beforeEach(() => {
    logCalls = [];

    mockConfig = {
      rootDir: "/test/project",
      init: {
        log_dir: "data/logs",
        services: [
          { name: "trace", command: "bun run service:trace" },
          { name: "vector", command: "bun run service:vector" },
          {
            name: "setup",
            type: "oneshot",
            up: "echo setup",
            down: "echo teardown",
          },
        ],
      },
    };

    mockLogger = {
      debug: (name, msg, data) =>
        logCalls.push({ level: "debug", name, msg, data }),
      info: (name, msg, data) =>
        logCalls.push({ level: "info", name, msg, data }),
      error: (name, msg, data) =>
        logCalls.push({ level: "error", name, msg, data }),
    };

    mockDeps = {
      fs: {
        readFileSync: () => "12345",
        mkdirSync: () => {},
        openSync: () => 42,
        closeSync: () => {},
        unlinkSync: () => {},
      },
      spawn: () => ({ unref: () => {} }),
      execSync: () => {},
      runtime: createTestRuntime({
        proc: createMockProcess({
          kill: (pid, signal) => {
            if (signal === 0 && pid === 12345) return true;
            throw new Error("ESRCH");
          },
        }),
      }),
      sendCommand: async () => ({ ok: true }),
      waitForSocket: async () => true,
    };
  });

  test('throws "Unknown service: <name>" for unrecognised name', async () => {
    const manager = new ServiceManager(mockConfig, mockLogger, mockDeps);
    await assertRejectsMessage(
      () => manager.logs("unknown"),
      /Unknown service: unknown/,
    );
  });

  test("emits file bytes to the stdout sink for a known service", async () => {
    const stdout = capturingSink();
    const deps = {
      ...mockDeps,
      fs: {
        ...mockDeps.fs,
        createReadStream: () => Readable.from(["log-canary-payload\n"]),
      },
      stdout,
    };
    const manager = new ServiceManager(mockConfig, mockLogger, deps);
    await manager.logs("trace");

    assert.ok(
      Buffer.concat(stdout.captured)
        .toString("utf8")
        .includes("log-canary-payload"),
    );
  });

  test("resolves silently when the current file is missing (ENOENT)", async () => {
    const stdout = capturingSink();
    const deps = {
      ...mockDeps,
      fs: {
        ...mockDeps.fs,
        createReadStream: () => failingStream("ENOENT"),
      },
      stdout,
    };
    const manager = new ServiceManager(mockConfig, mockLogger, deps);
    await manager.logs("trace");

    assert.strictEqual(stdout.captured.length, 0);
  });

  test("resolves silently when the current file is empty", async () => {
    const stdout = capturingSink();
    const deps = {
      ...mockDeps,
      fs: {
        ...mockDeps.fs,
        createReadStream: () => Readable.from([]),
      },
      stdout,
    };
    const manager = new ServiceManager(mockConfig, mockLogger, deps);
    await manager.logs("trace");

    assert.strictEqual(stdout.captured.length, 0);
  });

  test("propagates non-ENOENT stream errors", async () => {
    const stdout = capturingSink();
    const deps = {
      ...mockDeps,
      fs: {
        ...mockDeps.fs,
        createReadStream: () => failingStream("EACCES"),
      },
      stdout,
    };
    const manager = new ServiceManager(mockConfig, mockLogger, deps);
    await assertRejectsMessage(() => manager.logs("trace"), /EACCES/);
  });
});
