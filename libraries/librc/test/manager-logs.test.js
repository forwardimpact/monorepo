import { describe, test, beforeEach } from "node:test";
import assert from "node:assert";
import { Readable } from "node:stream";

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

describe("ServiceManager - logs", () => {
  let mockConfig;
  let mockLogger;
  let mockFs;
  let baseDeps;
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

    // Sync-fs the lifecycle methods touch; logs() adds createReadStream
    // per-test. The full surface (createReadStream + stdout) now flows through
    // the injected runtime, so logs() reads runtime.fsSync.createReadStream and
    // pipes into runtime.proc.stdout — there is no deps.fs / deps.stdout.
    mockFs = {
      readFileSync: () => "12345",
      mkdirSync: () => {},
      openSync: () => 42,
      closeSync: () => {},
      unlinkSync: () => {},
    };

    baseDeps = {
      spawn: () => ({ unref: () => {} }),
      execSync: () => {},
      sendCommand: async () => ({ ok: true }),
      waitForSocket: async () => true,
    };
  });

  // Build deps whose runtime carries the given createReadStream over the
  // sync-fs base and a fresh capturing proc (read its `stdout.chunks`).
  const depsWith = (createReadStream, proc) => ({
    ...baseDeps,
    runtime: createTestRuntime({
      proc,
      fsSync: { ...mockFs, createReadStream },
    }),
  });

  test('throws "Unknown service: <name>" for unrecognised name', async () => {
    const runtime = createTestRuntime({
      fsSync: mockFs,
      proc: createMockProcess(),
    });
    const manager = new ServiceManager(mockConfig, mockLogger, {
      ...baseDeps,
      runtime,
    });
    await assertRejectsMessage(
      () => manager.logs("unknown"),
      /Unknown service: unknown/,
    );
  });

  test("emits file bytes to the runtime stdout sink for a known service", async () => {
    const proc = createMockProcess();
    const deps = depsWith(() => Readable.from(["log-canary-payload\n"]), proc);
    const manager = new ServiceManager(mockConfig, mockLogger, deps);
    await manager.logs("trace");

    assert.ok(proc.stdout.chunks.join("").includes("log-canary-payload"));
  });

  test("resolves silently when the current file is missing (ENOENT)", async () => {
    const proc = createMockProcess();
    const deps = depsWith(() => failingStream("ENOENT"), proc);
    const manager = new ServiceManager(mockConfig, mockLogger, deps);
    await manager.logs("trace");

    assert.strictEqual(proc.stdout.chunks.length, 0);
  });

  test("resolves silently when the current file is empty", async () => {
    const proc = createMockProcess();
    const deps = depsWith(() => Readable.from([]), proc);
    const manager = new ServiceManager(mockConfig, mockLogger, deps);
    await manager.logs("trace");

    assert.strictEqual(proc.stdout.chunks.length, 0);
  });

  test("propagates non-ENOENT stream errors", async () => {
    const proc = createMockProcess();
    const deps = depsWith(() => failingStream("EACCES"), proc);
    const manager = new ServiceManager(mockConfig, mockLogger, deps);
    await assertRejectsMessage(() => manager.logs("trace"), /EACCES/);
  });
});
