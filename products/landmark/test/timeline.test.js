import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runTimelineCommand } from "../src/commands/timeline.js";
import { EMPTY_STATES } from "../src/lib/empty-state.js";

const EVIDENCE = [
  {
    skill_id: "planning",
    level_id: "awareness",
    matched: true,
    created_at: "2024-07-15T00:00:00Z",
  },
  {
    skill_id: "planning",
    level_id: "foundational",
    matched: true,
    created_at: "2024-10-20T00:00:00Z",
  },
  {
    skill_id: "planning",
    level_id: "working",
    matched: true,
    created_at: "2025-02-01T00:00:00Z",
  },
  {
    skill_id: "task_completion",
    level_id: "working",
    matched: true,
    created_at: "2024-07-10T00:00:00Z",
  },
  {
    skill_id: "task_completion",
    level_id: "working",
    matched: true,
    created_at: "2025-01-05T00:00:00Z",
  },
];

function stubQueries({ evidence = EVIDENCE } = {}) {
  return { getEvidence: async () => evidence };
}

describe("timeline command", () => {
  it("returns quarterly timeline", async () => {
    const result = await runTimelineCommand({
      options: { email: "alice@example.com" },
      supabase: {},
      format: "text",
      queries: stubQueries(),
    });
    assert.ok(result.view.timeline.length > 0);
    // Q3 2024 has planning at awareness and task_completion at working
    const q3Planning = result.view.timeline.find(
      (t) => t.quarter === "2024-Q3" && t.skillId === "planning",
    );
    assert.equal(q3Planning.highestLevel, "awareness");
  });

  it("returns empty state when no evidence", async () => {
    const result = await runTimelineCommand({
      options: { email: "alice@example.com" },
      supabase: {},
      format: "text",
      queries: stubQueries({ evidence: [] }),
    });
    assert.equal(result.view, null);
    assert.equal(result.meta.emptyState, EMPTY_STATES.NO_EVIDENCE);
  });

  it("throws when --email is missing", async () => {
    await assert.rejects(
      () =>
        runTimelineCommand({
          options: {},
          supabase: {},
          format: "text",
          queries: stubQueries(),
        }),
      /--email/,
    );
  });
});
