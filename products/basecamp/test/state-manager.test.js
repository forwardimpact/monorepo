import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";

import { StateManager } from "../src/state-manager.js";

describe("StateManager", () => {
  let mockFs;
  let written;

  beforeEach(() => {
    written = {};
    mockFs = {
      readFileSync: () => "{}",
      writeFileSync: (path, data) => {
        written[path] = data;
      },
      mkdirSync: () => {},
    };
  });

  describe("constructor validation", () => {
    test("throws when statePath is missing", () => {
      assert.throws(
        () => new StateManager(null, mockFs),
        /statePath is required/,
      );
    });

    test("throws when fs is missing", () => {
      assert.throws(
        () => new StateManager("/tmp/state.json", null),
        /fs is required/,
      );
    });

    test("creates instance with valid dependencies", () => {
      const sm = new StateManager("/tmp/state.json", mockFs);
      assert.ok(sm);
    });
  });

  describe("load", () => {
    test("loads and returns valid state from disk", () => {
      const stateData = { agents: { planner: { status: "idle" } } };
      mockFs.readFileSync = () => JSON.stringify(stateData);

      const sm = new StateManager("/tmp/state.json", mockFs);
      const state = sm.load();

      assert.deepStrictEqual(state, stateData);
    });

    test("returns default state when file has no agents key", () => {
      mockFs.readFileSync = () => JSON.stringify({ version: 1 });

      const sm = new StateManager("/tmp/state.json", mockFs);
      const state = sm.load();

      assert.deepStrictEqual(state, { agents: {} });
    });

    test("returns default state when file contains null", () => {
      mockFs.readFileSync = () => "null";

      const sm = new StateManager("/tmp/state.json", mockFs);
      const state = sm.load();

      assert.deepStrictEqual(state, { agents: {} });
    });

    test("returns default state and saves when file does not exist", () => {
      mockFs.readFileSync = () => {
        throw new Error("ENOENT");
      };

      const sm = new StateManager("/tmp/state.json", mockFs);
      const state = sm.load();

      assert.deepStrictEqual(state, { agents: {} });
      // Verify it saved the default state
      assert.ok(written["/tmp/state.json"]);
      const saved = JSON.parse(written["/tmp/state.json"]);
      assert.deepStrictEqual(saved, { agents: {} });
    });

    test("returns default state when file contains invalid JSON", () => {
      mockFs.readFileSync = () => "not valid json{{{";

      const sm = new StateManager("/tmp/state.json", mockFs);
      const state = sm.load();

      assert.deepStrictEqual(state, { agents: {} });
    });
  });

  describe("save", () => {
    test("writes state as formatted JSON", () => {
      const sm = new StateManager("/tmp/state.json", mockFs);
      const state = { agents: { planner: { status: "idle" } } };

      sm.save(state);

      const savedContent = written["/tmp/state.json"];
      assert.ok(savedContent);
      assert.ok(savedContent.endsWith("\n"));
      assert.deepStrictEqual(JSON.parse(savedContent), state);
    });

    test("creates parent directory before writing", () => {
      let createdDir = null;
      mockFs.mkdirSync = (dir, opts) => {
        createdDir = dir;
        assert.deepStrictEqual(opts, { recursive: true });
      };

      const sm = new StateManager("/data/basecamp/state.json", mockFs);
      sm.save({ agents: {} });

      assert.strictEqual(createdDir, "/data/basecamp");
    });
  });

  describe("resetStaleAgents", () => {
    test("resets agents with active status", () => {
      const state = {
        agents: {
          planner: { status: "active", startedAt: "2025-01-01T00:00:00Z" },
          researcher: { status: "idle" },
        },
      };

      const logs = [];
      const logFn = (msg) => logs.push(msg);

      const sm = new StateManager("/tmp/state.json", mockFs);
      const count = sm.resetStaleAgents(state, { reason: "startup" }, logFn);

      assert.strictEqual(count, 1);
      assert.strictEqual(state.agents.planner.status, "interrupted");
      assert.strictEqual(state.agents.planner.startedAt, null);
      assert.strictEqual(state.agents.planner.lastError, "startup");
      assert.strictEqual(state.agents.researcher.status, "idle");
      assert.ok(logs[0].includes("planner"));
    });

    test("respects maxAge — skips agents not yet stale", () => {
      const recentStart = new Date(Date.now() - 1000).toISOString(); // 1 second ago
      const state = {
        agents: {
          planner: { status: "active", startedAt: recentStart },
        },
      };

      const sm = new StateManager("/tmp/state.json", mockFs);
      const count = sm.resetStaleAgents(
        state,
        { reason: "timeout", maxAge: 60_000 },
        () => {},
      );

      assert.strictEqual(count, 0);
      assert.strictEqual(state.agents.planner.status, "active");
    });

    test("resets agents exceeding maxAge", () => {
      const oldStart = new Date(Date.now() - 120_000).toISOString(); // 2 minutes ago
      const state = {
        agents: {
          planner: { status: "active", startedAt: oldStart },
        },
      };

      const sm = new StateManager("/tmp/state.json", mockFs);
      const count = sm.resetStaleAgents(
        state,
        { reason: "timeout", maxAge: 60_000 },
        () => {},
      );

      assert.strictEqual(count, 1);
      assert.strictEqual(state.agents.planner.status, "interrupted");
    });

    test("saves state when agents are reset", () => {
      const state = {
        agents: {
          planner: { status: "active" },
        },
      };

      const sm = new StateManager("/tmp/state.json", mockFs);
      sm.resetStaleAgents(state, { reason: "shutdown" }, () => {});

      assert.ok(written["/tmp/state.json"]);
    });

    test("does not save when no agents are reset", () => {
      const state = {
        agents: {
          planner: { status: "idle" },
        },
      };

      const sm = new StateManager("/tmp/state.json", mockFs);
      sm.resetStaleAgents(state, { reason: "startup" }, () => {});

      assert.strictEqual(written["/tmp/state.json"], undefined);
    });

    test("returns zero when no agents exist", () => {
      const state = { agents: {} };

      const sm = new StateManager("/tmp/state.json", mockFs);
      const count = sm.resetStaleAgents(state, { reason: "startup" }, () => {});

      assert.strictEqual(count, 0);
    });
  });

  describe("updateAgentState", () => {
    test("parses Decision and Action lines from stdout", () => {
      const agentState = { status: "active", wakeCount: 2 };
      const stdout =
        "Processing...\nDecision: Update knowledge base\nAction: Wrote 3 files\nDone.";

      const sm = new StateManager("/tmp/state.json", mockFs);
      sm.updateAgentState(agentState, stdout, "planner", "/tmp/cache");

      assert.strictEqual(agentState.status, "idle");
      assert.strictEqual(agentState.startedAt, null);
      assert.strictEqual(agentState.lastDecision, "Update knowledge base");
      assert.strictEqual(agentState.lastAction, "Wrote 3 files");
      assert.strictEqual(agentState.lastError, null);
      assert.strictEqual(agentState.wakeCount, 3);
      assert.ok(agentState.lastWokeAt);
    });

    test("uses truncated stdout when no Decision line found", () => {
      const agentState = {};
      const stdout = "Just some output without decision markers";

      const sm = new StateManager("/tmp/state.json", mockFs);
      sm.updateAgentState(agentState, stdout, "researcher", "/tmp/cache");

      assert.strictEqual(
        agentState.lastDecision,
        "Just some output without decision markers",
      );
      assert.strictEqual(agentState.lastAction, null);
    });

    test("saves agent output to state directory", () => {
      const agentState = {};
      const stdout = "Decision: skip\nAction: none";

      const sm = new StateManager("/tmp/state.json", mockFs);
      sm.updateAgentState(agentState, stdout, "my-agent", "/tmp/cache");

      const outputPath = "/tmp/cache/state/my_agent_last_output.md";
      assert.strictEqual(written[outputPath], stdout);
    });

    test("initializes wakeCount from zero", () => {
      const agentState = {};

      const sm = new StateManager("/tmp/state.json", mockFs);
      sm.updateAgentState(agentState, "Decision: test", "agent", "/cache");

      assert.strictEqual(agentState.wakeCount, 1);
    });
  });
});
