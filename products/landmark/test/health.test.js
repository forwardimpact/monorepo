import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runHealthCommand } from "../src/commands/health.js";
import { EMPTY_STATES } from "../src/lib/empty-state.js";

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
];

const SNAPSHOTS = [
  {
    snapshot_id: "snap-1",
    scheduled_for: "2025-03-15",
    completed_at: "2025-03-20",
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

const EVIDENCE = [
  {
    skill_id: "task_completion",
    level_id: "working",
    matched: true,
    artifact_id: "art-1",
    created_at: "2025-01-15T00:00:00Z",
    github_artifacts: { email: "alice@example.com" },
  },
  {
    skill_id: "task_completion",
    level_id: "foundational",
    matched: true,
    artifact_id: "art-2",
    created_at: "2025-02-01T00:00:00Z",
    github_artifacts: { email: "bob@example.com" },
  },
  {
    skill_id: "planning",
    level_id: "awareness",
    matched: false,
    artifact_id: "art-3",
    created_at: "2025-01-20T00:00:00Z",
    github_artifacts: { email: "alice@example.com" },
  },
];

const MAP_DATA = {
  drivers: [
    {
      id: "quality",
      name: "Quality",
      contributingSkills: ["task_completion", "planning"],
      contributingBehaviours: ["systems_thinking"],
    },
    {
      id: "reliability",
      name: "Reliability",
      contributingSkills: ["incident_response"],
      contributingBehaviours: ["systems_thinking"],
    },
  ],
  skills: [
    { id: "task_completion", name: "Task Completion" },
    { id: "planning", name: "Planning" },
    { id: "incident_response", name: "Incident Response" },
  ],
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
  capabilities: [],
};

function stubQueries({
  team = TEAM,
  snapshots = SNAPSHOTS,
  scores = SCORES,
  evidence = EVIDENCE,
} = {}) {
  return {
    getOrganization: async () => team,
    getTeam: async () => team,
    listSnapshots: async () => snapshots,
    getSnapshotScores: async () => scores,
    getEvidence: async () => evidence,
  };
}

function summitPresent(_params) {
  return {
    available: true,
    recommendations: [
      {
        skill: "planning",
        impact: "critical",
        candidates: [
          { email: "bob@example.com", name: "Bob", currentLevel: "Level II" },
        ],
      },
    ],
    warnings: [],
  };
}

function summitAbsent() {
  return { available: false, recommendations: [], warnings: [] };
}

describe("health command", () => {
  it("renders health with Summit present", async () => {
    const result = await runHealthCommand({
      options: { manager: "alice@example.com" },
      mapData: MAP_DATA,
      supabase: {},
      format: "text",
      queries: stubQueries(),
      summitFn: summitPresent,
    });
    assert.ok(result.view);
    assert.ok(result.view.drivers.length > 0);
    assert.equal(result.view.summitAvailable, true);

    const quality = result.view.drivers.find((d) => d.id === "quality");
    assert.ok(quality);
    assert.equal(quality.score, 42);
    assert.ok(quality.contributingSkills.length > 0);
    assert.ok(quality.recommendations.length > 0);
  });

  it("renders health without Summit", async () => {
    const result = await runHealthCommand({
      options: { manager: "alice@example.com" },
      mapData: MAP_DATA,
      supabase: {},
      format: "text",
      queries: stubQueries(),
      summitFn: summitAbsent,
    });
    assert.ok(result.view);
    assert.equal(result.view.summitAvailable, false);

    const quality = result.view.drivers.find((d) => d.id === "quality");
    assert.equal(quality.recommendations.length, 0);
  });

  it("warns on unknown item_id", async () => {
    const scoresWithUnknown = [
      ...SCORES,
      { snapshot_id: "snap-1", item_id: "unknown_driver", score: 50 },
    ];
    const result = await runHealthCommand({
      options: { manager: "alice@example.com" },
      mapData: MAP_DATA,
      supabase: {},
      format: "text",
      queries: stubQueries({ scores: scoresWithUnknown }),
      summitFn: summitAbsent,
    });
    assert.ok(result.meta.warnings.some((w) => w.includes("unknown_driver")));
  });

  it("returns NO_SNAPSHOTS when empty", async () => {
    const result = await runHealthCommand({
      options: { manager: "alice@example.com" },
      mapData: MAP_DATA,
      supabase: {},
      format: "text",
      queries: stubQueries({ snapshots: [] }),
      summitFn: summitAbsent,
    });
    assert.equal(result.view, null);
    assert.equal(result.meta.emptyState, EMPTY_STATES.NO_SNAPSHOTS);
  });

  it("returns MANAGER_NOT_FOUND for unknown manager", async () => {
    const result = await runHealthCommand({
      options: { manager: "nobody@example.com" },
      mapData: MAP_DATA,
      supabase: {},
      format: "text",
      queries: stubQueries({ team: [] }),
      summitFn: summitAbsent,
    });
    assert.equal(result.view, null);
    assert.ok(result.meta.emptyState.includes("nobody@example.com"));
  });
});
