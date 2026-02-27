import { describe, test, beforeEach } from "node:test";
import assert from "node:assert";

import { ServiceManager } from "../manager.js";

describe("ServiceManager", () => {
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
          { name: "trace", command: "npm run service:trace" },
          { name: "vector", command: "npm run service:vector" },
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
  });

  describe("stop", () => {
    test("logs not running if svscan is down", async () => {
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
      await manager.stop();

      const svscanLogs = logCalls.filter((l) => l.name === "svscan");
      assert.ok(svscanLogs.some((l) => l.msg === "Not running"));
    });

    test("removes services in reverse order", async () => {
      let removeOrder = [];
      const deps = {
        ...mockDeps,
        sendCommand: async (socket, cmd) => {
          if (cmd.command === "remove") {
            removeOrder.push(cmd.name);
          }
          return { ok: true };
        },
      };
      const manager = new ServiceManager(mockConfig, mockLogger, deps);
      await manager.stop();

      // setup is oneshot so only trace and vector are removed
      assert.deepStrictEqual(removeOrder, ["vector", "trace"]);
    });

    test("runs oneshot down commands", async () => {
      let execCalls = [];
      const deps = {
        ...mockDeps,
        execSync: (cmd, opts) => {
          execCalls.push({ cmd, opts });
        },
      };
      const manager = new ServiceManager(mockConfig, mockLogger, deps);
      await manager.stop();

      assert.ok(execCalls.some((c) => c.cmd === "echo teardown"));
    });

    test("sends shutdown command to svscan when stopping all", async () => {
      let shutdownSent = false;
      const deps = {
        ...mockDeps,
        sendCommand: async (socket, cmd) => {
          if (cmd.command === "shutdown") {
            shutdownSent = true;
          }
          return { ok: true };
        },
      };
      const manager = new ServiceManager(mockConfig, mockLogger, deps);
      await manager.stop();

      assert.strictEqual(shutdownSent, true);
    });

    test("does not shutdown svscan when stopping specific service", async () => {
      let shutdownSent = false;
      const deps = {
        ...mockDeps,
        sendCommand: async (socket, cmd) => {
          if (cmd.command === "shutdown") {
            shutdownSent = true;
          }
          return { ok: true };
        },
      };
      const manager = new ServiceManager(mockConfig, mockLogger, deps);
      await manager.stop("vector");

      assert.strictEqual(shutdownSent, false);
    });
  });

  describe("status", () => {
    test("logs not running if svscan is down", async () => {
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
      await manager.status();

      const svscanLogs = logCalls.filter((l) => l.name === "svscan");
      assert.ok(svscanLogs.some((l) => l.msg === "Not running"));
    });

    test("logs service statuses from response", async () => {
      const deps = {
        ...mockDeps,
        sendCommand: async () => ({
          services: {
            trace: { state: "up", pid: 1234 },
            vector: { state: "up", pid: 5678 },
          },
        }),
      };
      const manager = new ServiceManager(mockConfig, mockLogger, deps);
      await manager.status();

      const traceLogs = logCalls.filter((l) => l.name === "trace");
      assert.ok(traceLogs.some((l) => l.msg === "up"));

      const vectorLogs = logCalls.filter((l) => l.name === "vector");
      assert.ok(vectorLogs.some((l) => l.msg === "up"));
    });

    test("logs no services message when empty", async () => {
      const deps = {
        ...mockDeps,
        sendCommand: async () => ({ services: {} }),
      };
      const manager = new ServiceManager(mockConfig, mockLogger, deps);
      await manager.status();

      const statusLogs = logCalls.filter((l) => l.name === "status");
      assert.ok(statusLogs.some((l) => l.msg === "No services supervised"));
    });

    test("logs only specified service when name provided", async () => {
      const deps = {
        ...mockDeps,
        sendCommand: async () => ({
          services: {
            trace: { state: "up", pid: 1234 },
            vector: { state: "up", pid: 5678 },
          },
        }),
      };
      const manager = new ServiceManager(mockConfig, mockLogger, deps);
      await manager.status("trace");

      const traceLogs = logCalls.filter((l) => l.name === "trace");
      assert.ok(traceLogs.some((l) => l.msg === "up"));

      const vectorLogs = logCalls.filter((l) => l.name === "vector");
      assert.strictEqual(vectorLogs.length, 0);
    });

    test("throws for unknown service name", async () => {
      const manager = new ServiceManager(mockConfig, mockLogger, mockDeps);
      await assert.rejects(
        () => manager.status("unknown"),
        /Unknown service: unknown/,
      );
    });
  });

  describe("service filtering", () => {
    test("start with service name starts only up to that service", async () => {
      let startedServices = [];
      const deps = {
        ...mockDeps,
        sendCommand: async (socket, cmd) => {
          if (cmd.command === "add") {
            startedServices.push(cmd.name);
          }
          return { ok: true };
        },
      };
      const manager = new ServiceManager(mockConfig, mockLogger, deps);
      await manager.start("trace");

      assert.deepStrictEqual(startedServices, ["trace"]);
    });

    test("start with second service name starts first two services", async () => {
      let startedServices = [];
      const deps = {
        ...mockDeps,
        sendCommand: async (socket, cmd) => {
          if (cmd.command === "add") {
            startedServices.push(cmd.name);
          }
          return { ok: true };
        },
      };
      const manager = new ServiceManager(mockConfig, mockLogger, deps);
      await manager.start("vector");

      assert.deepStrictEqual(startedServices, ["trace", "vector"]);
    });

    test("start throws for unknown service name", async () => {
      const manager = new ServiceManager(mockConfig, mockLogger, mockDeps);
      await assert.rejects(
        () => manager.start("unknown"),
        /Unknown service: unknown/,
      );
    });

    test("stop with last service stops only that service", async () => {
      let stoppedServices = [];
      const deps = {
        ...mockDeps,
        execSync: (cmd) => stoppedServices.push(cmd),
        sendCommand: async (socket, cmd) => {
          if (cmd.command === "remove") {
            stoppedServices.push(cmd.name);
          }
          return { ok: true };
        },
      };
      const manager = new ServiceManager(mockConfig, mockLogger, deps);
      await manager.stop("setup");

      // setup is last, only it should stop (oneshot runs down command)
      assert.deepStrictEqual(stoppedServices, ["echo teardown"]);
    });

    test("stop with second service stops from that service to end", async () => {
      let stoppedServices = [];
      const deps = {
        ...mockDeps,
        execSync: (cmd) => stoppedServices.push(cmd),
        sendCommand: async (socket, cmd) => {
          if (cmd.command === "remove") {
            stoppedServices.push(cmd.name);
          }
          return { ok: true };
        },
      };
      const manager = new ServiceManager(mockConfig, mockLogger, deps);
      await manager.stop("vector");

      // Should stop setup (oneshot), then vector (reverse order from end)
      assert.deepStrictEqual(stoppedServices, ["echo teardown", "vector"]);
    });

    test("stop with first service stops all services in reverse", async () => {
      let stoppedServices = [];
      const deps = {
        ...mockDeps,
        execSync: (cmd) => stoppedServices.push(cmd),
        sendCommand: async (socket, cmd) => {
          if (cmd.command === "remove") {
            stoppedServices.push(cmd.name);
          }
          return { ok: true };
        },
      };
      const manager = new ServiceManager(mockConfig, mockLogger, deps);
      await manager.stop("trace");

      // Should stop setup (oneshot), vector, trace (reverse order)
      assert.deepStrictEqual(stoppedServices, [
        "echo teardown",
        "vector",
        "trace",
      ]);
    });

    test("stop throws for unknown service name", async () => {
      const manager = new ServiceManager(mockConfig, mockLogger, mockDeps);
      await assert.rejects(
        () => manager.stop("unknown"),
        /Unknown service: unknown/,
      );
    });
  });
});
