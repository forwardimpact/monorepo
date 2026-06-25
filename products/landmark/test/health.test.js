import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createMockQueries } from "@forwardimpact/libmock";

import { runHealthCommand } from "../src/commands/health.js";
import { toText } from "../src/formatters/health.js";
import { EMPTY_STATES } from "../src/lib/empty-state.js";
import { MAP_DATA, SCORES, SNAPSHOTS, TEAM } from "./fixtures.js";

const HEALTH_SNAPSHOTS = [SNAPSHOTS[0]];

const HEALTH_EVIDENCE = [
  {
    skill_id: "task-completion",
    level_id: "working",
    matched: true,
    artifact_id: "art-1",
    created_at: "2025-01-15T00:00:00Z",
    github_artifacts: { email: "alice@example.com" },
  },
  {
    skill_id: "task-completion",
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

function stubQueries({
  team = TEAM,
  snapshots = HEALTH_SNAPSHOTS,
  scores = SCORES,
  evidence = HEALTH_EVIDENCE,
} = {}) {
  return createMockQueries({
    getOrganization: team,
    getTeam: team,
    listSnapshots: snapshots,
    getSnapshotScores: scores,
    getEvidence: evidence,
  });
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

  it("driverJoin.state is MATCHED with the existing fixture", async () => {
    const result = await runHealthCommand({
      options: { manager: "alice@example.com" },
      mapData: MAP_DATA,
      supabase: {},
      format: "text",
      queries: stubQueries(),
      summitFn: summitAbsent,
    });
    assert.equal(result.view.driverJoin.state, "MATCHED");
    assert.equal(result.view.driverJoin.matched, 1);
  });

  it("driverJoin.state is NO_DRIVERS when drivers.yaml is empty", async () => {
    const emptyDriversMap = { ...MAP_DATA, drivers: [] };
    const result = await runHealthCommand({
      options: { manager: "alice@example.com" },
      mapData: emptyDriversMap,
      supabase: {},
      format: "text",
      queries: stubQueries(),
      summitFn: summitAbsent,
    });
    assert.equal(result.view.driverJoin.state, "NO_DRIVERS");
    assert.equal(result.view.driverJoin.yamlIds, 0);
  });

  it("driverJoin.state is NO_MATCH when scores carry ids disjoint from drivers.yaml", async () => {
    const disjointScores = [
      { snapshot_id: "snap-1", item_id: "clear-direction", score: 50 },
      { snapshot_id: "snap-1", item_id: "deep-work", score: 60 },
    ];
    const result = await runHealthCommand({
      options: { manager: "alice@example.com" },
      mapData: MAP_DATA,
      supabase: {},
      format: "text",
      queries: stubQueries({ scores: disjointScores }),
      summitFn: summitAbsent,
    });
    assert.equal(result.view.driverJoin.state, "NO_MATCH");
    assert.equal(result.view.driverJoin.matched, 0);
    assert.equal(result.view.driverJoin.scoreIds, 2);
  });

  it("driverJoin.state is null when drivers configured but no team-scoped scores", async () => {
    const result = await runHealthCommand({
      options: { manager: "alice@example.com" },
      mapData: MAP_DATA,
      supabase: {},
      format: "text",
      queries: stubQueries({ scores: [] }),
      summitFn: summitAbsent,
    });
    assert.equal(result.view.driverJoin.state, null);
    assert.equal(result.view.driverJoin.scoreIds, 0);
  });
});

// ---------------------------------------------------------------------------
// Director-tier rollup: when the resolved members span >=2 GetDX teams, the
// view carries a per-team rollup + scope instead of a flat table.
// ---------------------------------------------------------------------------

// A two-team director scope. `getTeam(director)` returns members of both teams
// (each tagged with its getdx_team_id); scores carry getdx_team_id per team.
const ROLLUP_TEAM = [
  { email: "alice@example.com", name: "Alice", getdx_team_id: "gdx_team_a" },
  { email: "bob@example.com", name: "Bob", getdx_team_id: "gdx_team_a" },
  { email: "carol@example.com", name: "Carol", getdx_team_id: "gdx_team_b" },
  { email: "dave@example.com", name: "Dave", getdx_team_id: "gdx_team_b" },
];

const ROLLUP_SCORES = [
  {
    snapshot_id: "snap-1",
    getdx_team_id: "gdx_team_a",
    team_name: "Team Alpha",
    item_id: "quality",
    item_name: "Quality",
    score: 42,
    vs_prev: -5,
    vs_org: -10,
    vs_50th: -8,
    vs_75th: -25,
    vs_90th: -40,
  },
  {
    snapshot_id: "snap-1",
    getdx_team_id: "gdx_team_b",
    team_name: "Team Beta",
    item_id: "quality",
    item_name: "Quality",
    score: 71,
    vs_prev: 3,
    vs_org: 6,
    vs_50th: 12,
    vs_75th: 4,
    vs_90th: -9,
  },
];

describe("health command — director-tier rollup", () => {
  it("emits per-team rollup + scope when members span >=2 teams", async () => {
    const result = await runHealthCommand({
      options: { manager: "zeus@bionova.example" },
      mapData: MAP_DATA,
      supabase: {},
      format: "text",
      queries: stubQueries({ team: ROLLUP_TEAM, scores: ROLLUP_SCORES }),
      summitFn: summitAbsent,
    });
    assert.ok(result.view.scope);
    assert.equal(result.view.scope.teamCount, 2);
    assert.equal(result.view.teamRollup.length, 2);
    assert.equal(result.view.drivers, undefined);

    const ids = result.view.teamRollup.map((t) => t.teamId).sort();
    assert.deepEqual(ids, ["gdx_team_a", "gdx_team_b"]);
    const names = result.view.teamRollup.map((t) => t.teamName).sort();
    assert.deepEqual(names, ["Team Alpha", "Team Beta"]);
  });

  it("single-team scope keeps the flat shape (no scope, has drivers)", async () => {
    const oneTeam = ROLLUP_TEAM.filter((p) => p.getdx_team_id === "gdx_team_a");
    const oneTeamScores = ROLLUP_SCORES.filter(
      (s) => s.getdx_team_id === "gdx_team_a",
    );
    const result = await runHealthCommand({
      options: { manager: "alice@example.com" },
      mapData: MAP_DATA,
      supabase: {},
      format: "text",
      queries: stubQueries({ team: oneTeam, scores: oneTeamScores }),
      summitFn: summitAbsent,
    });
    assert.equal(result.view.scope, undefined);
    assert.ok(Array.isArray(result.view.drivers));
    assert.equal(result.view.teamRollup, undefined);
  });

  it("a team's rollup rows equal that team's single-team projection", async () => {
    // Single-team run for Team Alpha.
    const oneTeam = ROLLUP_TEAM.filter((p) => p.getdx_team_id === "gdx_team_a");
    const oneTeamScores = ROLLUP_SCORES.filter(
      (s) => s.getdx_team_id === "gdx_team_a",
    );
    const single = await runHealthCommand({
      options: { manager: "alice@example.com" },
      mapData: MAP_DATA,
      supabase: {},
      format: "text",
      queries: stubQueries({ team: oneTeam, scores: oneTeamScores }),
      summitFn: summitAbsent,
    });

    // Director run spanning both teams.
    const rollup = await runHealthCommand({
      options: { manager: "zeus@bionova.example" },
      mapData: MAP_DATA,
      supabase: {},
      format: "text",
      queries: stubQueries({ team: ROLLUP_TEAM, scores: ROLLUP_SCORES }),
      summitFn: summitAbsent,
    });

    const alphaSection = rollup.view.teamRollup.find(
      (t) => t.teamId === "gdx_team_a",
    );

    // Equal on every team-manager column the single-team rollup produces.
    const project = (d) => ({
      id: d.id,
      name: d.name,
      score: d.score,
      vs_prev: d.vs_prev,
      vs_org: d.vs_org,
      vs_50th: d.vs_50th,
      vs_75th: d.vs_75th,
      vs_90th: d.vs_90th,
      contributingSkills: d.contributingSkills,
    });
    assert.deepEqual(
      alphaSection.drivers.map(project),
      single.view.drivers.map(project),
    );
  });

  it("rollup text output names teams and carries no ranking language", async () => {
    const result = await runHealthCommand({
      options: { manager: "zeus@bionova.example" },
      mapData: MAP_DATA,
      supabase: {},
      format: "text",
      queries: stubQueries({ team: ROLLUP_TEAM, scores: ROLLUP_SCORES }),
      summitFn: summitAbsent,
    });
    const out = toText(result.view, result.meta);
    assert.match(out, /Across 2 teams/);
    assert.match(out, /Team: Team Alpha/);
    assert.match(out, /Team: Team Beta/);
    // No ranking or singling-out vocabulary — the surface must not rank teams.
    assert.doesNotMatch(out, /lowest|highest|leaderboard|top \d|rank/i);
  });
});
