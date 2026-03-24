/**
 * AgentRunner unit tests
 *
 * Tests environment building and agent wake logic.
 */
import { test, describe, mock, before, after } from "node:test";
import assert from "node:assert";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AgentRunner } from "../src/agent-runner.js";

const TEST_KB = join(tmpdir(), "basecamp-test-kb");

/**
 * Create a mock spawn module that records calls and returns a successful result.
 * @param {Object} [options]
 * @param {number} [options.exitCode=0]
 * @param {string} [options.stdout="ok"]
 * @param {string} [options.stderr=""]
 * @returns {{ module: Object, calls: Array }}
 */
function createMockSpawn({
  exitCode = 0,
  stdout = "ok",
  stderr: _stderr = "",
} = {}) {
  const calls = [];
  return {
    calls,
    module: {
      spawn(executable, args, env, cwd) {
        calls.push({ executable, args, env, cwd });
        return { pid: 999, stdoutFd: 3, stderrFd: 4 };
      },
      readAll: async () => stdout,
      waitForExit: async () => exitCode,
    },
  };
}

function createMockStateManager() {
  return {
    save: mock.fn(),
    updateAgentState: mock.fn(),
  };
}

describe("AgentRunner", () => {
  before(() => mkdirSync(TEST_KB, { recursive: true }));
  after(() => rmSync(TEST_KB, { recursive: true, force: true }));

  describe("#buildSpawnEnv (via wake)", () => {
    test("passes process.env to spawned process by default", async () => {
      const { module: spawnMod, calls } = createMockSpawn();
      const runner = new AgentRunner(
        spawnMod,
        createMockStateManager(),
        () => {},
        "/tmp/cache",
      );

      const agent = { kb: TEST_KB };
      const state = { agents: {} };
      await runner.wake("test-agent", agent, state);

      assert.strictEqual(calls.length, 1);
      const env = calls[0].env;
      assert.strictEqual(env.HOME, process.env.HOME);
      assert.strictEqual(env.PATH, process.env.PATH);
    });

    test("merges configEnv into spawn environment", async () => {
      const { module: spawnMod, calls } = createMockSpawn();
      const runner = new AgentRunner(
        spawnMod,
        createMockStateManager(),
        () => {},
        "/tmp/cache",
      );

      const agent = { kb: TEST_KB };
      const state = { agents: {} };
      const configEnv = { NODE_EXTRA_CA_CERTS: "/etc/ssl/custom-ca.pem" };
      await runner.wake("test-agent", agent, state, configEnv);

      assert.strictEqual(calls.length, 1);
      const env = calls[0].env;
      assert.strictEqual(env.NODE_EXTRA_CA_CERTS, "/etc/ssl/custom-ca.pem");
      assert.strictEqual(env.HOME, process.env.HOME);
    });

    test("configEnv overrides process.env values", async () => {
      const original = process.env.TERM;
      process.env.TERM = "xterm";
      try {
        const { module: spawnMod, calls } = createMockSpawn();
        const runner = new AgentRunner(
          spawnMod,
          createMockStateManager(),
          () => {},
          "/tmp/cache",
        );

        const agent = { kb: TEST_KB };
        const state = { agents: {} };
        const configEnv = { TERM: "dumb" };
        await runner.wake("test-agent", agent, state, configEnv);

        assert.strictEqual(calls[0].env.TERM, "dumb");
      } finally {
        if (original === undefined) delete process.env.TERM;
        else process.env.TERM = original;
      }
    });

    test("expands ~ in configEnv values", async () => {
      const { module: spawnMod, calls } = createMockSpawn();
      const runner = new AgentRunner(
        spawnMod,
        createMockStateManager(),
        () => {},
        "/tmp/cache",
      );

      const agent = { kb: TEST_KB };
      const state = { agents: {} };
      const configEnv = { NODE_EXTRA_CA_CERTS: "~/certs/ca-bundle.pem" };
      await runner.wake("test-agent", agent, state, configEnv);

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
      );

      const agent = { kb: TEST_KB };
      const state = { agents: {} };
      await runner.wake("test-agent", agent, state, undefined);

      assert.strictEqual(calls.length, 1);
      assert.strictEqual(typeof calls[0].env, "object");
    });
  });
});
