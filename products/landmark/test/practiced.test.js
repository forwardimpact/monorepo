import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createMockQueries } from "@forwardimpact/libmock";

import { runPracticedCommand } from "../src/commands/practiced.js";
import { EMPTY_STATES } from "../src/lib/empty-state.js";
import { MAP_DATA, PATTERNS, TEAM } from "./fixtures.js";

const PRACTICED_TEAM = [
  ...TEAM,
  {
    email: "carol@example.com",
    name: "Carol",
    discipline: "software_engineering",
    level: "J040",
    track: "platform",
  },
];

// Override planning pattern to matched: 0 so the skill is flagged
// "on paper only" (derived but unevidenced).
const PRACTICED_PATTERNS = [
  PATTERNS[0],
  { skill_id: "planning", matched: 0, unmatched: 1, total: 1 },
];

function stubQueries({
  team = PRACTICED_TEAM,
  patterns = PRACTICED_PATTERNS,
} = {}) {
  return createMockQueries({
    getTeam: team,
    getPracticePatterns: patterns,
  });
}

describe("practiced command", () => {
  it("returns derived vs evidenced comparison", async () => {
    const result = await runPracticedCommand({
      options: { manager: "alice@example.com" },
      mapData: MAP_DATA,
      supabase: {},
      format: "text",
      queries: stubQueries(),
    });
    assert.ok(result.view);
    assert.equal(result.view.teamSize, 3);

    const taskComp = result.view.skills.find(
      (s) => s.skillId === "task_completion",
    );
    assert.ok(taskComp.derivedDepth);
    assert.equal(taskComp.evidencedCount, 5);
    assert.equal(taskComp.flag, null);

    const planning = result.view.skills.find((s) => s.skillId === "planning");
    assert.equal(planning.flag, "on paper only");
  });

  it("returns empty state when team is empty", async () => {
    const result = await runPracticedCommand({
      options: { manager: "nobody@example.com" },
      mapData: MAP_DATA,
      supabase: {},
      format: "text",
      queries: stubQueries({ team: [] }),
    });
    assert.equal(result.view, null);
    assert.ok(result.meta.emptyState.includes("nobody@example.com"));
  });

  it("returns NO_EVIDENCE when no practice patterns", async () => {
    const result = await runPracticedCommand({
      options: { manager: "alice@example.com" },
      mapData: MAP_DATA,
      supabase: {},
      format: "text",
      queries: stubQueries({ patterns: [] }),
    });
    assert.equal(result.meta.emptyState, EMPTY_STATES.NO_EVIDENCE);
  });
});
