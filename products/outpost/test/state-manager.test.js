import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";

import { createMockFs } from "@forwardimpact/libmock/mock";
import { createTestRuntime } from "@forwardimpact/libmock";
import { StateManager } from "../src/state-manager.js";

describe("StateManager", () => {
  let mockFs;
  let runtime;

  beforeEach(() => {
    mockFs = createMockFs({ "/tmp/state.json": "{}" });
    runtime = createTestRuntime({ fs: mockFs });
  });

  describe("constructor validation", () => {
    test("throws when statePath is missing", () => {
      assert.throws(
        () => new StateManager(null, runtime),
        /statePath is required/,
      );
    });

    test("throws when runtime.fs is missing", () => {
      assert.throws(
        () => new StateManager("/tmp/state.json", { clock: {} }),
        /runtime.fs is required/,
      );
    });

    test("creates instance with valid dependencies", () => {
      const sm = new StateManager("/tmp/state.json", runtime);
      assert.ok(sm);
    });
  });

  describe("load", () => {
    test("loads and returns valid state from disk", async () => {
      const stateData = { agents: { planner: { status: "idle" } } };
      runtime = createTestRuntime({
        fs: createMockFs({ "/tmp/state.json": JSON.stringify(stateData) }),
      });

      const sm = new StateManager("/tmp/state.json", runtime);
      const state = await sm.load();

      assert.deepStrictEqual(state, stateData);
    });

    test("returns default state when file has no agents key", async () => {
      runtime = createTestRuntime({
        fs: createMockFs({ "/tmp/state.json": JSON.stringify({ version: 1 }) }),
      });

      const sm = new StateManager("/tmp/state.json", runtime);
      const state = await sm.load();

      assert.deepStrictEqual(state, { agents: {} });
    });

    test("returns default state when file contains null", async () => {
      runtime = createTestRuntime({
        fs: createMockFs({ "/tmp/state.json": "null" }),
      });

      const sm = new StateManager("/tmp/state.json", runtime);
      const state = await sm.load();

      assert.deepStrictEqual(state, { agents: {} });
    });

    test("returns default state and saves when file does not exist", async () => {
      const fs = createMockFs({});
      runtime = createTestRuntime({ fs });

      const sm = new StateManager("/tmp/state.json", runtime);
      const state = await sm.load();

      assert.deepStrictEqual(state, { agents: {} });
      // Verify it saved the default state
      const saved = fs.data.get("/tmp/state.json");
      assert.ok(saved);
      assert.deepStrictEqual(JSON.parse(saved), { agents: {} });
    });

    test("returns default state when file contains invalid JSON", async () => {
      runtime = createTestRuntime({
        fs: createMockFs({ "/tmp/state.json": "not valid json{{{" }),
      });

      const sm = new StateManager("/tmp/state.json", runtime);
      const state = await sm.load();

      assert.deepStrictEqual(state, { agents: {} });
    });
  });

  describe("save", () => {
    test("writes state as formatted JSON", async () => {
      const sm = new StateManager("/tmp/state.json", runtime);
      const state = { agents: { planner: { status: "idle" } } };

      await sm.save(state);

      const savedContent = mockFs.data.get("/tmp/state.json");
      assert.ok(savedContent);
      assert.ok(savedContent.endsWith("\n"));
      assert.deepStrictEqual(JSON.parse(savedContent), state);
    });

    test("creates parent directory before writing", async () => {
      const sm = new StateManager("/data/outpost/state.json", runtime);
      await sm.save({ agents: {} });

      assert.strictEqual(mockFs.mkdir.mock.callCount(), 1);
      const [dir, opts] = mockFs.mkdir.mock.calls[0].arguments;
      assert.strictEqual(dir, "/data/outpost");
      assert.deepStrictEqual(opts, { recursive: true });
    });
  });

  describe("resetStaleAgents", () => {
    test("resets agents with active status", async () => {
      const state = {
        agents: {
          planner: { status: "active", startedAt: "2025-01-01T00:00:00Z" },
          researcher: { status: "idle" },
        },
      };

      const logs = [];
      const logFn = (msg) => logs.push(msg);

      const sm = new StateManager("/tmp/state.json", runtime);
      const count = await sm.resetStaleAgents(
        state,
        { reason: "startup" },
        logFn,
      );

      assert.strictEqual(count, 1);
      assert.strictEqual(state.agents.planner.status, "interrupted");
      assert.strictEqual(state.agents.planner.startedAt, null);
      assert.strictEqual(state.agents.planner.lastError, "startup");
      assert.strictEqual(state.agents.researcher.status, "idle");
      assert.ok(logs[0].includes("planner"));
    });

    test("respects maxAge — skips agents not yet stale", async () => {
      // Clock at a fixed virtual time; startedAt 1s before it.
      const now = 1_700_000_000_000;
      runtime = createTestRuntime({
        fs: mockFs,
        clock: createClockAt(now),
      });
      const recentStart = new Date(now - 1000).toISOString();
      const state = {
        agents: { planner: { status: "active", startedAt: recentStart } },
      };

      const sm = new StateManager("/tmp/state.json", runtime);
      const count = await sm.resetStaleAgents(
        state,
        { reason: "timeout", maxAge: 60_000 },
        () => {},
      );

      assert.strictEqual(count, 0);
      assert.strictEqual(state.agents.planner.status, "active");
    });

    test("resets agents exceeding maxAge", async () => {
      const now = 1_700_000_000_000;
      runtime = createTestRuntime({ fs: mockFs, clock: createClockAt(now) });
      const oldStart = new Date(now - 120_000).toISOString();
      const state = {
        agents: { planner: { status: "active", startedAt: oldStart } },
      };

      const sm = new StateManager("/tmp/state.json", runtime);
      const count = await sm.resetStaleAgents(
        state,
        { reason: "timeout", maxAge: 60_000 },
        () => {},
      );

      assert.strictEqual(count, 1);
      assert.strictEqual(state.agents.planner.status, "interrupted");
    });

    test("saves state when agents are reset", async () => {
      const state = { agents: { planner: { status: "active" } } };

      const sm = new StateManager("/tmp/state.json", runtime);
      await sm.resetStaleAgents(state, { reason: "shutdown" }, () => {});

      assert.ok(mockFs.writeFile.mock.callCount() > 0);
    });

    test("does not save when no agents are reset", async () => {
      const state = { agents: { planner: { status: "idle" } } };

      mockFs.writeFile.mock.resetCalls();

      const sm = new StateManager("/tmp/state.json", runtime);
      await sm.resetStaleAgents(state, { reason: "startup" }, () => {});

      assert.strictEqual(mockFs.writeFile.mock.callCount(), 0);
    });

    test("returns zero when no agents exist", async () => {
      const state = { agents: {} };

      const sm = new StateManager("/tmp/state.json", runtime);
      const count = await sm.resetStaleAgents(
        state,
        { reason: "startup" },
        () => {},
      );

      assert.strictEqual(count, 0);
    });
  });

  describe("updateAgentState", () => {
    test("parses Decision and Action lines from stdout", async () => {
      const agentState = { status: "active", wakeCount: 2 };
      const stdout =
        "Processing...\nDecision: Update knowledge base\nAction: Wrote 3 files\nDone.";

      const sm = new StateManager("/tmp/state.json", runtime);
      await sm.updateAgentState(agentState, stdout, "planner", "/tmp/cache");

      assert.strictEqual(agentState.status, "idle");
      assert.strictEqual(agentState.startedAt, null);
      assert.strictEqual(agentState.lastDecision, "Update knowledge base");
      assert.strictEqual(agentState.lastAction, "Wrote 3 files");
      assert.strictEqual(agentState.lastError, null);
      assert.strictEqual(agentState.wakeCount, 3);
      assert.ok(agentState.lastWokeAt);
    });

    test("uses truncated stdout when no Decision line found", async () => {
      const agentState = {};
      const stdout = "Just some output without decision markers";

      const sm = new StateManager("/tmp/state.json", runtime);
      await sm.updateAgentState(agentState, stdout, "researcher", "/tmp/cache");

      assert.strictEqual(
        agentState.lastDecision,
        "Just some output without decision markers",
      );
      assert.strictEqual(agentState.lastAction, null);
    });

    test("saves agent output to state directory", async () => {
      const agentState = {};
      const stdout = "Decision: skip\nAction: none";

      const sm = new StateManager("/tmp/state.json", runtime);
      await sm.updateAgentState(agentState, stdout, "my-agent", "/tmp/cache");

      const outputPath = "/tmp/cache/state/my_agent_last_output.md";
      assert.strictEqual(mockFs.data.get(outputPath), stdout);
    });

    test("initializes wakeCount from zero", async () => {
      const agentState = {};

      const sm = new StateManager("/tmp/state.json", runtime);
      await sm.updateAgentState(
        agentState,
        "Decision: test",
        "agent",
        "/cache",
      );

      assert.strictEqual(agentState.wakeCount, 1);
    });
  });
});

/**
 * Build a mock clock whose `now()` returns a fixed virtual time.
 * @param {number} ms
 */
function createClockAt(ms) {
  return {
    now: () => ms,
    sleep: async () => {},
    setTimeout: (fn, d) => setTimeout(fn, d),
    clearTimeout: (h) => clearTimeout(h),
  };
}
