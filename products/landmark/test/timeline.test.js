import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertRejectsMessage,
  createMockQueries,
} from "@forwardimpact/libmock";

import { runTimelineCommand } from "../src/commands/timeline.js";
import { toText } from "../src/formatters/timeline.js";
import { EMPTY_STATES } from "../src/lib/empty-state.js";

// Timeline-specific evidence: spans multiple quarters (2024-Q3 through 2025-Q1)
// to exercise quarterly grouping. Distinct from fixtures.EVIDENCE_ROWS which
// tests skill/level matching rather than quarter boundaries.
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
    skill_id: "task-completion",
    level_id: "working",
    matched: true,
    created_at: "2024-07-10T00:00:00Z",
  },
  {
    skill_id: "task-completion",
    level_id: "working",
    matched: true,
    created_at: "2025-01-05T00:00:00Z",
  },
];

function stubQueries({
  evidence = EVIDENCE,
  artifacts = [],
  unscored = [],
} = {}) {
  return createMockQueries({
    getEvidence: evidence,
    getArtifacts: artifacts,
    getUnscoredArtifacts: unscored,
  });
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
    // Q3 2024 has planning at awareness and task-completion at working
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

  it("attaches coverage and renders the below-floor banner above the table", async () => {
    const artifacts = Array.from({ length: 100 }, (_, i) => ({
      artifact_id: `a${i}`,
    }));
    const result = await runTimelineCommand({
      options: { email: "alice@example.com" },
      supabase: {},
      format: "text",
      queries: stubQueries({
        artifacts,
        unscored: artifacts.slice(1), // 1/100 = 1%, below floor
      }),
    });
    assert.equal(result.view.coverage.ratio, 0.01);
    const text = toText(result.view);
    const lines = text.split("\n");
    const bannerIdx = lines.findIndex((l) =>
      l.includes("Coverage below floor"),
    );
    const firstEntryIdx = lines.findIndex((l) => l.includes("2024-Q3"));
    assert.ok(bannerIdx >= 0, "missing below-floor banner");
    assert.match(
      text,
      /timeline reflects measurement floor, not absence of growth/,
    );
    assert.ok(
      firstEntryIdx > bannerIdx,
      "table should render after the banner",
    );
  });

  it("renders no banner for a zero-artifact persona", async () => {
    const result = await runTimelineCommand({
      options: { email: "alice@example.com" },
      supabase: {},
      format: "text",
      queries: stubQueries({ artifacts: [] }),
    });
    assert.equal(result.view.coverage, null);
    const text = toText(result.view);
    assert.doesNotMatch(text, /Coverage below floor/);
  });

  it("throws when --email is missing", async () => {
    await assertRejectsMessage(
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
