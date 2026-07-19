import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertRejectsMessage,
  createMockQueries,
} from "@forwardimpact/libmock";

import { runVoiceCommand } from "../src/commands/voice.js";
import { EMPTY_STATES } from "../src/lib/empty-state.js";
import { COMMENTS, MAP_DATA } from "./fixtures.js";

function stubQueries({ comments = COMMENTS, evidence = [] } = {}) {
  return createMockQueries({
    getSnapshotComments: comments,
    getEvidence: evidence,
    listSnapshots: [{ snapshot_id: "snap-1", scheduled_for: "2025-Q1" }],
    getSnapshotScores: [{ item_id: "quality", score: 42, vs_org: -10 }],
  });
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

  it("returns NO_COMMENTS_EMPTY when none found", async () => {
    const result = await runVoiceCommand({
      options: { email: "alice@example.com" },
      supabase: {},
      mapData: MAP_DATA,
      format: "text",
      queries: stubQueries({ comments: [] }),
    });
    assert.equal(result.view, null);
    assert.equal(result.meta.emptyState, EMPTY_STATES.NO_COMMENTS_EMPTY);
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

describe("voice subject defaulting", () => {
  it("throws with the sign-in hint when no flags and no identity", async () => {
    await assertRejectsMessage(
      () =>
        runVoiceCommand({
          options: {},
          supabase: {},
          mapData: MAP_DATA,
          format: "text",
          queries: stubQueries(),
        }),
      /--email.*fit-landmark login/,
    );
  });

  it("defaults to the signed-in identity's own voice with no flags", async () => {
    const result = await runVoiceCommand({
      options: {},
      identity: { email: "alice@example.com" },
      supabase: {},
      mapData: MAP_DATA,
      format: "text",
      queries: stubQueries(),
    });
    assert.ok(result.view);
    assert.equal(result.view.mode, "email");
  });

  it("stays manager-scoped when --manager is set and an identity exists", async () => {
    const result = await runVoiceCommand({
      options: { manager: "alice@example.com" },
      identity: { email: "someone-else@example.com" },
      supabase: {},
      mapData: MAP_DATA,
      format: "text",
      queries: stubQueries(),
    });
    assert.ok(result.view);
    assert.equal(result.view.mode, "manager");
  });
});
