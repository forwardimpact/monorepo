import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runPracticedCommand } from "../src/commands/practiced.js";
import { EMPTY_STATES } from "../src/lib/empty-state.js";

const MAP_DATA = {
  levels: [
    {
      id: "J040",
      ordinalRank: 1,
      baseSkillProficiencies: {
        primary: "foundational",
        secondary: "awareness",
        broad: "awareness",
      },
    },
    {
      id: "J060",
      ordinalRank: 2,
      baseSkillProficiencies: {
        primary: "working",
        secondary: "foundational",
        broad: "awareness",
      },
    },
  ],
  disciplines: [
    {
      id: "software_engineering",
      coreSkills: ["task_completion"],
      supportingSkills: ["planning"],
      broadSkills: ["incident_response"],
    },
  ],
  tracks: [{ id: "platform", skillModifiers: {} }],
  skills: [
    { id: "task_completion", name: "Task Completion" },
    { id: "planning", name: "Planning" },
    { id: "incident_response", name: "Incident Response" },
  ],
  capabilities: [],
};

const TEAM = [
  {
    email: "alice@example.com",
    name: "Alice",
    discipline: "software_engineering",
    level: "J040",
    track: "platform",
  },
  {
    email: "bob@example.com",
    name: "Bob",
    discipline: "software_engineering",
    level: "J060",
    track: null,
  },
  {
    email: "carol@example.com",
    name: "Carol",
    discipline: "software_engineering",
    level: "J040",
    track: "platform",
  },
];

const PATTERNS = [
  { skill_id: "task_completion", matched: 5, unmatched: 2, total: 7 },
  { skill_id: "planning", matched: 0, unmatched: 1, total: 1 },
];

function stubQueries({ team = TEAM, patterns = PATTERNS } = {}) {
  return {
    getTeam: async () => team,
    getPracticePatterns: async () => patterns,
  };
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
