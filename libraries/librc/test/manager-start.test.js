import { describe, test, beforeEach } from "node:test";
import assert from "node:assert";

import { ServiceManager } from "../manager.js";

describe("ServiceManager - constructor, paths, running, start", () => {
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
      spawn: () => {
        const child = { unref: () => {} };
        return child;
      },
      execSync: () => {},
      process: {
        kill: (pid, signal) => {
          if (signal === 0 && pid === 12345) return true;
          throw new Error("ESRCH");
        },
      },
      sendCommand: async () => ({ ok: true }),
      waitForSocket: async () => true,
    };
  });

  describe("constructor", () => {
    test("throws if config is missing", () => {
      assert.throws(() => new ServiceManager(), /config is required/);
    });

    test("throws if logger is missing", () => {
      assert.throws(() => new ServiceManager(mockConfig), /logger is required/);
    });

    test("creates instance with valid parameters", () => {
      const manager = new ServiceManager(mockConfig, mockLogger, mockDeps);
      assert.ok(manager instanceof ServiceManager);
    });
  });

  describe("getRuntimePaths", () => {
    test("returns correct paths based on rootDir", () => {
      const manager = new ServiceManager(mockConfig, mockLogger, mockDeps);
      const paths = manager.getRuntimePaths();

      assert.strictEqual(paths.socketPath, "/test/project/data/svscan.sock");
      assert.strictEqual(paths.pidFile, "/test/project/data/svscan.pid");
      assert.strictEqual(paths.logFile, "/test/project/data/svscan.log");
    });
  });

  describe("isSvscanRunning", () => {
    test("returns true when daemon is running", () => {
      const manager = new ServiceManager(mockConfig, mockLogger, mockDeps);
      assert.strictEqual(manager.isSvscanRunning(), true);
    });

    test("returns false when PID file does not exist", () => {
      const deps = {
        ...mockDeps,
        fs: {
          ...mockDeps.fs,
          readFileSync: () => {
            throw new Error("ENOENT");
          },
        },
      };
      const manager = new ServiceManager(mockConfig, mockLogger, deps);
      assert.strictEqual(manager.isSvscanRunning(), false);
    });

    test("returns false when process is not alive", () => {
      const deps = {
        ...mockDeps,
        process: {
          kill: () => {
            throw new Error("ESRCH");
          },
        },
      };
      const manager = new ServiceManager(mockConfig, mockLogger, deps);
      assert.strictEqual(manager.isSvscanRunning(), false);
    });
  });

  describe("start", () => {
    test("starts svscan if not running", async () => {
      const deps = {
        ...mockDeps,
        fs: {
          ...mockDeps.fs,
          readFileSync: () => {
            throw new Error("ENOENT");
          },
        },
      };
      const manager = new ServiceManager(mockConfig, mockLogger, deps);
      await manager.start();

      const svscanLogs = logCalls.filter((l) => l.name === "svscan");
      assert.ok(svscanLogs.some((l) => l.msg === "Starting daemon"));
      assert.ok(svscanLogs.some((l) => l.msg === "Spawning svscan"));
    });

    test("restarts svscan if already running", async () => {
      const manager = new ServiceManager(mockConfig, mockLogger, mockDeps);
      await manager.start();

      const svscanLogs = logCalls.filter((l) => l.name === "svscan");
      assert.ok(
        svscanLogs.some(
          (l) => l.msg === "Restarting daemon (fresh environment)",
        ),
      );
      assert.ok(svscanLogs.some((l) => l.msg === "Starting daemon"));
      assert.ok(svscanLogs.some((l) => l.msg === "Spawning svscan"));
    });

    test("adds longrun services to supervision", async () => {
      const manager = new ServiceManager(mockConfig, mockLogger, mockDeps);
      await manager.start();

      const traceLogs = logCalls.filter((l) => l.name === "trace");
      assert.ok(traceLogs.some((l) => l.msg === "Starting service"));
      assert.ok(traceLogs.some((l) => l.msg === "Service started"));
    });

    test("runs oneshot up commands", async () => {
      let execCalls = [];
      const deps = {
        ...mockDeps,
        execSync: (cmd, opts) => {
          execCalls.push({ cmd, opts });
        },
      };
      const manager = new ServiceManager(mockConfig, mockLogger, deps);
      await manager.start();

      assert.ok(execCalls.some((c) => c.cmd === "echo setup"));
    });

    test("logs error when add fails", async () => {
      const deps = {
        ...mockDeps,
        sendCommand: async () => ({ ok: false, error: "unknown error" }),
      };
      const manager = new ServiceManager(mockConfig, mockLogger, deps);
      await manager.start();

      const errorLogs = logCalls.filter((l) => l.level === "error");
      assert.ok(errorLogs.some((l) => l.msg === "Add failed"));
    });

    test("skips optional oneshot service on failure", async () => {
      const config = {
        ...mockConfig,
        init: {
          ...mockConfig.init,
          services: [
            {
              name: "optional-setup",
              type: "oneshot",
              up: "false",
              optional: true,
            },
            { name: "trace", command: "bun run service:trace" },
          ],
        },
      };
      const deps = {
        ...mockDeps,
        execSync: (cmd) => {
          if (cmd === "false") throw new Error("Command failed");
        },
      };
      const manager = new ServiceManager(config, mockLogger, deps);
      await manager.start();

      const skipLogs = logCalls.filter(
        (l) => l.name === "optional-setup" && l.msg.includes("Optional"),
      );
      assert.strictEqual(skipLogs.length, 1);

      const traceLogs = logCalls.filter(
        (l) => l.name === "trace" && l.msg === "Service started",
      );
      assert.strictEqual(traceLogs.length, 1);
    });

    test("throws for required oneshot service on failure", async () => {
      const config = {
        ...mockConfig,
        init: {
          ...mockConfig.init,
          services: [{ name: "required-setup", type: "oneshot", up: "false" }],
        },
      };
      const deps = {
        ...mockDeps,
        execSync: () => {
          throw new Error("Command failed");
        },
      };
      const manager = new ServiceManager(config, mockLogger, deps);
      await assert.rejects(() => manager.start(), /Command failed/);
    });

    test("skips optional longrun service when add fails", async () => {
      const config = {
        ...mockConfig,
        init: {
          ...mockConfig.init,
          services: [
            { name: "optional-svc", command: "bun run svc", optional: true },
            { name: "trace", command: "bun run service:trace" },
          ],
        },
      };
      const deps = {
        ...mockDeps,
        sendCommand: async (socket, cmd) => {
          if (cmd.command === "add" && cmd.name === "optional-svc") {
            return { ok: false, error: "binary not found" };
          }
          return { ok: true };
        },
      };
      const manager = new ServiceManager(config, mockLogger, deps);
      await manager.start();

      const skipLogs = logCalls.filter(
        (l) => l.name === "optional-svc" && l.msg.includes("Optional"),
      );
      assert.strictEqual(skipLogs.length, 1);

      const traceLogs = logCalls.filter(
        (l) => l.name === "trace" && l.msg === "Service started",
      );
      assert.strictEqual(traceLogs.length, 1);
    });
  });
});
