import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runVoiceCommand } from "../src/commands/voice.js";
import { EMPTY_STATES } from "../src/lib/empty-state.js";

const COMMENTS = [
  {
    comment_id: "c1",
    snapshot_id: "snap-1",
    email: "alice@example.com",
    text: "Estimation is always off, we overcommit every sprint",
    timestamp: "2025-03-10T00:00:00Z",
    getdx_snapshots: { scheduled_for: "2025-Q1" },
  },
  {
    comment_id: "c2",
    snapshot_id: "snap-1",
    email: "bob@example.com",
    text: "Incident response is painful, no runbook for the payment service",
    timestamp: "2025-03-11T00:00:00Z",
    getdx_snapshots: { scheduled_for: "2025-Q1" },
  },
  {
    comment_id: "c3",
    snapshot_id: "snap-2",
    email: "alice@example.com",
    text: "Planning process improved this quarter",
    timestamp: "2024-12-10T00:00:00Z",
    getdx_snapshots: { scheduled_for: "2024-Q4" },
  },
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

function stubQueries({ comments = COMMENTS, evidence = [] } = {}) {
  return {
    getSnapshotComments: async () => comments,
    getEvidence: async () => evidence,
    listSnapshots: async () => [
      { snapshot_id: "snap-1", scheduled_for: "2025-Q1" },
    ],
    getSnapshotScores: async () => [
      { item_id: "quality", score: 42, vs_org: -10 },
    ],
  };
}

describe("voice --email", () => {
  it("returns comments grouped by snapshot", async () => {
    const result = await runVoiceCommand({
      options: { email: "alice@example.com" },
      supabase: {},
      mapData: MAP_DATA,
      format: "text",
      queries: stubQueries(),
    });
    assert.ok(result.view);
    assert.equal(result.view.mode, "email");
    assert.ok(result.view.comments.length > 0);
  });

  it("returns NO_COMMENTS when none found", async () => {
    const result = await runVoiceCommand({
      options: { email: "alice@example.com" },
      supabase: {},
      mapData: MAP_DATA,
      format: "text",
      queries: stubQueries({ comments: [] }),
    });
    assert.equal(result.view, null);
    assert.ok(result.meta.emptyState.includes("comments"));
    assert.ok(result.meta.hint);
  });

  it("returns NO_COMMENTS when table is missing", async () => {
    const result = await runVoiceCommand({
      options: { email: "alice@example.com" },
      supabase: {},
      mapData: MAP_DATA,
      format: "text",
      queries: {
        ...stubQueries(),
        getSnapshotComments: async () => {
          const err = new Error("relation does not exist");
          err.code = "42P01";
          throw err;
        },
      },
    });
    assert.equal(result.view, null);
    assert.equal(result.meta.emptyState, EMPTY_STATES.NO_COMMENTS);
    assert.equal(result.meta.hint, undefined);
  });
});

describe("voice --manager", () => {
  it("returns themed comments", async () => {
    const result = await runVoiceCommand({
      options: { manager: "alice@example.com" },
      supabase: {},
      mapData: MAP_DATA,
      format: "text",
      queries: stubQueries(),
    });
    assert.ok(result.view);
    assert.equal(result.view.mode, "manager");
    assert.ok(result.view.themes.length > 0);
    const estimationTheme = result.view.themes.find(
      (t) => t.theme === "estimation",
    );
    assert.ok(estimationTheme);
    assert.equal(estimationTheme.count, 1);
  });

  it("includes health alignment for poor scores", async () => {
    const result = await runVoiceCommand({
      options: { manager: "alice@example.com" },
      supabase: {},
      mapData: MAP_DATA,
      format: "text",
      queries: stubQueries(),
    });
    assert.ok(result.view.healthAlignment.length > 0);
    assert.equal(result.view.healthAlignment[0].driverId, "quality");
  });
});

describe("voice validation", () => {
  it("throws when neither --email nor --manager is set", async () => {
    await assert.rejects(
      () =>
        runVoiceCommand({
          options: {},
          supabase: {},
          mapData: MAP_DATA,
          format: "text",
          queries: stubQueries(),
        }),
      /--email.*--manager/,
    );
  });
});
