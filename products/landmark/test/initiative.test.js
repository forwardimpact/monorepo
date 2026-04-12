import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runInitiativeCommand } from "../src/commands/initiative.js";
import { EMPTY_STATES } from "../src/lib/empty-state.js";

const INITIATIVES = [
  {
    id: "init-1",
    name: "Improve sprint estimation",
    scorecard_id: "quality",
    owner_email: "alice@example.com",
    due_date: "2025-06-01",
    priority: "high",
    passed_checks: 8,
    total_checks: 10,
    completion_pct: 80,
    completed_at: null,
    tags: ["planning"],
  },
  {
    id: "init-2",
    name: "Create incident runbooks",
    scorecard_id: null,
    owner_email: "bob@example.com",
    due_date: "2025-03-01",
    priority: "medium",
    passed_checks: 5,
    total_checks: 5,
    completion_pct: 100,
    completed_at: "2025-03-01T00:00:00Z",
    tags: ["reliability"],
  },
];

const SNAPSHOTS = [
  { snapshot_id: "snap-q4", scheduled_for: "2024-12-15" },
  { snapshot_id: "snap-q1", scheduled_for: "2025-03-15" },
];

const MAP_DATA = {
  drivers: [
    {
      id: "quality",
      name: "Quality",
      contributingSkills: ["task_completion", "planning"],
    },
  ],
};

function stubQueries({
  initiatives = INITIATIVES,
  snapshots = SNAPSHOTS,
} = {}) {
  return {
    listInitiatives: async (_sb, opts) => {
      let result = initiatives;
      if (opts?.status === "completed") {
        result = result.filter((i) => i.completed_at);
      }
      return result;
    },
    getInitiative: async (_sb, id) =>
      initiatives.find((i) => i.id === id) ?? null,
    listSnapshots: async () => snapshots,
    getSnapshotScores: async (_sb, snapshotId) => {
      if (snapshotId === "snap-q4") return [{ item_id: "quality", score: 42 }];
      if (snapshotId === "snap-q1") return [{ item_id: "quality", score: 58 }];
      return [];
    },
  };
}

describe("initiative list", () => {
  it("returns all initiatives", async () => {
    const result = await runInitiativeCommand({
      args: ["list"],
      options: {},
      supabase: {},
      mapData: MAP_DATA,
      format: "text",
      queries: stubQueries(),
    });
    assert.equal(result.view.initiatives.length, 2);
  });

  it("returns NO_INITIATIVES when empty", async () => {
    const result = await runInitiativeCommand({
      args: ["list"],
      options: {},
      supabase: {},
      mapData: MAP_DATA,
      format: "text",
      queries: stubQueries({ initiatives: [] }),
    });
    assert.equal(result.view, null);
    assert.equal(result.meta.emptyState, EMPTY_STATES.NO_INITIATIVES);
  });

  it("returns NO_INITIATIVES when table missing", async () => {
    const result = await runInitiativeCommand({
      args: ["list"],
      options: {},
      supabase: {},
      mapData: MAP_DATA,
      format: "text",
      queries: {
        ...stubQueries(),
        listInitiatives: async () => {
          const err = new Error("relation does not exist");
          err.code = "42P01";
          throw err;
        },
      },
    });
    assert.equal(result.view, null);
    assert.equal(result.meta.emptyState, EMPTY_STATES.NO_INITIATIVES);
  });
});

describe("initiative show", () => {
  it("returns initiative detail", async () => {
    const result = await runInitiativeCommand({
      args: ["show"],
      options: { id: "init-1" },
      supabase: {},
      mapData: MAP_DATA,
      format: "text",
      queries: stubQueries(),
    });
    assert.equal(result.view.initiative.name, "Improve sprint estimation");
  });

  it("returns empty state for unknown id", async () => {
    const result = await runInitiativeCommand({
      args: ["show"],
      options: { id: "nonexistent" },
      supabase: {},
      mapData: MAP_DATA,
      format: "text",
      queries: stubQueries(),
    });
    assert.equal(result.view, null);
    assert.ok(result.meta.emptyState.includes("nonexistent"));
  });
});

describe("initiative impact", () => {
  it("computes impact for completed initiatives", async () => {
    const result = await runInitiativeCommand({
      args: ["impact"],
      options: {},
      supabase: {},
      mapData: MAP_DATA,
      format: "text",
      queries: stubQueries(),
    });
    assert.ok(result.view.impacts.length > 0);
    // init-2 has no scorecard_id so delta should be null
    const init2 = result.view.impacts.find((i) => i.initiative.id === "init-2");
    assert.equal(init2.delta, null);
  });
});

describe("initiative subcommand validation", () => {
  it("throws for unknown subcommand", async () => {
    await assert.rejects(
      () =>
        runInitiativeCommand({
          args: ["bogus"],
          options: {},
          supabase: {},
          mapData: MAP_DATA,
          format: "text",
          queries: stubQueries(),
        }),
      /expected/,
    );
  });
});
