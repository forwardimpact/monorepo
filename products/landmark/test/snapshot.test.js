import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  runSnapshotCommand,
  collectDriverWarnings,
} from "../src/commands/snapshot.js";
import { EMPTY_STATES } from "../src/lib/empty-state.js";

const SNAPSHOTS = [
  {
    snapshot_id: "snap-1",
    scheduled_for: "2025-03-15",
    completed_at: "2025-03-20",
  },
  {
    snapshot_id: "snap-2",
    scheduled_for: "2024-12-15",
    completed_at: "2025-01-05",
  },
];

const SCORES = [
  {
    snapshot_id: "snap-1",
    item_id: "quality",
    item_name: "Quality",
    score: 42,
    vs_prev: -5,
    vs_org: -10,
    vs_50th: -8,
    vs_75th: -25,
    vs_90th: -40,
  },
];

const TREND = [
  {
    item_id: "quality",
    score: 38,
    getdx_snapshots: { scheduled_for: "2024-06-15" },
  },
  {
    item_id: "quality",
    score: 42,
    getdx_snapshots: { scheduled_for: "2025-03-15" },
  },
];

const MAP_DATA = {
  drivers: [{ id: "quality", name: "Quality" }],
};

function stubQueries({
  snapshots = SNAPSHOTS,
  scores = SCORES,
  trend = TREND,
} = {}) {
  return {
    listSnapshots: async () => snapshots,
    getSnapshotScores: async () => scores,
    getItemTrend: async () => trend,
    getSnapshotComparison: async () => scores,
  };
}

describe("snapshot list", () => {
  it("returns all snapshots", async () => {
    const result = await runSnapshotCommand({
      args: ["list"],
      options: {},
      mapData: MAP_DATA,
      supabase: {},
      format: "text",
      queries: stubQueries(),
    });
    assert.equal(result.view.snapshots.length, 2);
  });

  it("returns empty state when no snapshots", async () => {
    const result = await runSnapshotCommand({
      args: ["list"],
      options: {},
      mapData: MAP_DATA,
      supabase: {},
      format: "text",
      queries: stubQueries({ snapshots: [] }),
    });
    assert.equal(result.view, null);
    assert.equal(result.meta.emptyState, EMPTY_STATES.NO_SNAPSHOTS);
  });
});

describe("snapshot show", () => {
  it("returns scores for a snapshot", async () => {
    const result = await runSnapshotCommand({
      args: ["show"],
      options: { snapshot: "snap-1" },
      mapData: MAP_DATA,
      supabase: {},
      format: "text",
      queries: stubQueries(),
    });
    assert.equal(result.view.snapshotId, "snap-1");
    assert.equal(result.view.scores.length, 1);
  });

  it("throws when --snapshot is missing", async () => {
    await assert.rejects(
      () =>
        runSnapshotCommand({
          args: ["show"],
          options: {},
          mapData: MAP_DATA,
          supabase: {},
          format: "text",
          queries: stubQueries(),
        }),
      /--snapshot/,
    );
  });
});

describe("snapshot trend", () => {
  it("returns trend data for an item", async () => {
    const result = await runSnapshotCommand({
      args: ["trend"],
      options: { item: "quality" },
      mapData: MAP_DATA,
      supabase: {},
      format: "text",
      queries: stubQueries(),
    });
    assert.equal(result.view.itemId, "quality");
    assert.equal(result.view.trend.length, 2);
  });

  it("throws when --item is missing", async () => {
    await assert.rejects(
      () =>
        runSnapshotCommand({
          args: ["trend"],
          options: {},
          mapData: MAP_DATA,
          supabase: {},
          format: "text",
          queries: stubQueries(),
        }),
      /--item/,
    );
  });
});

describe("snapshot compare", () => {
  it("returns comparison scores", async () => {
    const result = await runSnapshotCommand({
      args: ["compare"],
      options: { snapshot: "snap-1" },
      mapData: MAP_DATA,
      supabase: {},
      format: "text",
      queries: stubQueries(),
    });
    assert.equal(result.view.snapshotId, "snap-1");
  });
});

describe("collectDriverWarnings", () => {
  it("warns on unknown item_id", () => {
    const scores = [{ item_id: "quality" }, { item_id: "unknown_driver" }];
    const warnings = collectDriverWarnings(scores, MAP_DATA);
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes("unknown_driver"));
  });

  it("returns no warnings for known drivers", () => {
    const warnings = collectDriverWarnings(SCORES, MAP_DATA);
    assert.equal(warnings.length, 0);
  });
});

describe("snapshot subcommand validation", () => {
  it("throws for unknown subcommand", async () => {
    await assert.rejects(
      () =>
        runSnapshotCommand({
          args: ["bogus"],
          options: {},
          mapData: MAP_DATA,
          supabase: {},
          format: "text",
          queries: stubQueries(),
        }),
      /expected/,
    );
  });
});
