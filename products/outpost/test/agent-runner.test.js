/**
 * AgentRunner unit tests
 *
 * Tests environment building and agent wake logic against injected mock
 * collaborators (runtime fs/proc/clock + a stubbed posix-spawn module).
 */
import { test, describe } from "node:test";
import assert from "node:assert";
import { AgentRunner } from "../src/agent-runner.js";
import {
  spy,
  createTestRuntime,
  createMockFs,
  createMockProcess,
} from "@forwardimpact/libmock";

const TEST_KB = "/work/outpost-test-kb";

/**
 * Create a mock spawn module that records calls and returns a successful result.
 * @param {Object} [options]
 * @param {number} [options.exitCode=0]
 * @param {string} [options.stdout="ok"]
 * @returns {{ module: Object, calls: Array }}
 */
function createMockSpawn({ exitCode = 0, stdout = "ok" } = {}) {
  const calls = [];
  return {
    calls,
    module: {
      spawn(executable, args, env, cwd) {
        calls.push({ executable, args, env, cwd });
        return {
          pid: 999,
          stdoutFile: "/tmp/mock-stdout",
          stderrFile: "/tmp/mock-stderr",
        };
      },
      readOutput: () => stdout,
      waitForExit: async () => exitCode,
    },
  };
}

function createMockStateManager() {
  return {
    save: spy(async () => {}),
    updateAgentState: spy(async () => {}),
  };
}

/**
 * Build a runtime whose mock fs reports TEST_KB as existing and whose proc env
 * carries the supplied vars.
 * @param {Record<string,string>} env
 */
function makeRuntime(env) {
  const fs = createMockFs({});
  fs.dirs.add(TEST_KB);
  return createTestRuntime({ fs, proc: createMockProcess({ env }) });
}

describe("AgentRunner", () => {
  describe("constructor validation", () => {
    test("throws when runtime is missing", () => {
      assert.throws(
        () =>
          new AgentRunner(
            createMockSpawn().module,
            createMockStateManager(),
            () => {},
            "/tmp/cache",
          ),
        /runtime.fs is required/,
      );
    });
  });

  describe("#buildSpawnEnv (via wake)", () => {
    test("passes runtime.proc.env to spawned process by default", async () => {
      const { module: spawnMod, calls } = createMockSpawn();
      const runner = new AgentRunner(
        spawnMod,
        createMockStateManager(),
        () => {},
        "/tmp/cache",
        makeRuntime({ HOME: "/home/u", PATH: "/usr/bin" }),
      );

      await runner.wake("test-agent", { kb: TEST_KB }, { agents: {} });

      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].env.HOME, "/home/u");
      assert.strictEqual(calls[0].env.PATH, "/usr/bin");
    });

    test("merges configEnv into spawn environment", async () => {
      const { module: spawnMod, calls } = createMockSpawn();
      const runner = new AgentRunner(
        spawnMod,
        createMockStateManager(),
        () => {},
        "/tmp/cache",
        makeRuntime({ HOME: "/home/u" }),
      );

      const configEnv = { NODE_EXTRA_CA_CERTS: "/etc/ssl/custom-ca.pem" };
      await runner.wake(
        "test-agent",
        { kb: TEST_KB },
        { agents: {} },
        configEnv,
      );

      assert.strictEqual(calls.length, 1);
      assert.strictEqual(
        calls[0].env.NODE_EXTRA_CA_CERTS,
        "/etc/ssl/custom-ca.pem",
      );
      assert.strictEqual(calls[0].env.HOME, "/home/u");
    });

    test("configEnv overrides runtime.proc.env values", async () => {
      const { module: spawnMod, calls } = createMockSpawn();
      const runner = new AgentRunner(
        spawnMod,
        createMockStateManager(),
        () => {},
        "/tmp/cache",
        makeRuntime({ TERM: "xterm" }),
      );

      await runner.wake(
        "test-agent",
        { kb: TEST_KB },
        { agents: {} },
        { TERM: "dumb" },
      );

      assert.strictEqual(calls[0].env.TERM, "dumb");
    });

    test("expands ~ in configEnv values", async () => {
      const { module: spawnMod, calls } = createMockSpawn();
      const runner = new AgentRunner(
        spawnMod,
        createMockStateManager(),
        () => {},
        "/tmp/cache",
        makeRuntime({}),
      );

      await runner.wake(
        "test-agent",
        { kb: TEST_KB },
        { agents: {} },
        { NODE_EXTRA_CA_CERTS: "~/certs/ca-bundle.pem" },
      );

      const env = calls[0].env;
      assert.ok(
        !env.NODE_EXTRA_CA_CERTS.startsWith("~"),
        "~ should be expanded",
      );
      assert.ok(
        env.NODE_EXTRA_CA_CERTS.endsWith("/certs/ca-bundle.pem"),
        "path suffix should be preserved",
      );
    });

    test("handles undefined configEnv (no extra vars)", async () => {
      const { module: spawnMod, calls } = createMockSpawn();
      const runner = new AgentRunner(
        spawnMod,
        createMockStateManager(),
        () => {},
        "/tmp/cache",
        makeRuntime({ HOME: "/home/u" }),
      );

      await runner.wake(
        "test-agent",
        { kb: TEST_KB },
        { agents: {} },
        undefined,
      );

      assert.strictEqual(calls.length, 1);
      assert.strictEqual(typeof calls[0].env, "object");
    });
  });

  describe("killActiveChildren", () => {
    test("sends SIGTERM via runtime.proc.kill to tracked children", async () => {
      const { module: spawnMod } = createMockSpawn();
      const runtime = makeRuntime({ HOME: "/home/u" });
      const runner = new AgentRunner(
        spawnMod,
        createMockStateManager(),
        () => {},
        "/tmp/cache",
        runtime,
      );

      await runner.wake("test-agent", { kb: TEST_KB }, { agents: {} });
      // pid 999 was tracked during wake but removed on exit; force one in.
      runner.activeChildren.add(4242);
      runner.killActiveChildren();

      assert.deepStrictEqual(runtime.proc.kills, [
        { pid: 4242, signal: "SIGTERM" },
      ]);
    });
  });
});
