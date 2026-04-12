import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  groupEvidenceBySkill,
  groupEvidenceByQuarter,
  highestLevelPerSkillPerQuarter,
  buildMarkerChecklist,
  computeCoverageRatio,
  filterEvidenceByTeam,
} from "../src/lib/evidence-helpers.js";

describe("groupEvidenceBySkill", () => {
  it("groups rows by skill_id", () => {
    const rows = [
      { skill_id: "planning", matched: true },
      { skill_id: "planning", matched: false },
      { skill_id: "task_completion", matched: true },
    ];
    const grouped = groupEvidenceBySkill(rows);
    assert.equal(grouped.get("planning").matched, 1);
    assert.equal(grouped.get("planning").unmatched, 1);
    assert.equal(grouped.get("task_completion").matched, 1);
  });
});

describe("groupEvidenceByQuarter", () => {
  it("groups rows by quarter", () => {
    const rows = [
      { created_at: "2025-01-15T00:00:00Z" },
      { created_at: "2025-04-01T00:00:00Z" },
      { created_at: "2025-01-30T00:00:00Z" },
    ];
    const grouped = groupEvidenceByQuarter(rows);
    assert.equal(grouped.get("2025-Q1").length, 2);
    assert.equal(grouped.get("2025-Q2").length, 1);
  });
});

describe("highestLevelPerSkillPerQuarter", () => {
  it("picks the highest matched level per (quarter, skill)", () => {
    const rows = [
      {
        skill_id: "planning",
        level_id: "awareness",
        matched: true,
        created_at: "2025-01-15T00:00:00Z",
      },
      {
        skill_id: "planning",
        level_id: "working",
        matched: true,
        created_at: "2025-01-20T00:00:00Z",
      },
      {
        skill_id: "planning",
        level_id: "foundational",
        matched: true,
        created_at: "2025-04-10T00:00:00Z",
      },
      {
        skill_id: "task_completion",
        level_id: "working",
        matched: true,
        created_at: "2025-01-05T00:00:00Z",
      },
      {
        skill_id: "task_completion",
        level_id: "awareness",
        matched: false,
        created_at: "2025-01-06T00:00:00Z",
      },
    ];
    const result = highestLevelPerSkillPerQuarter(rows);

    const q1Planning = result.find(
      (r) => r.quarter === "2025-Q1" && r.skillId === "planning",
    );
    assert.equal(q1Planning.highestLevel, "working");

    const q2Planning = result.find(
      (r) => r.quarter === "2025-Q2" && r.skillId === "planning",
    );
    assert.equal(q2Planning.highestLevel, "foundational");

    const q1Task = result.find(
      (r) => r.quarter === "2025-Q1" && r.skillId === "task_completion",
    );
    assert.equal(q1Task.highestLevel, "working");
  });

  it("ignores unmatched rows", () => {
    const rows = [
      {
        skill_id: "planning",
        level_id: "working",
        matched: false,
        created_at: "2025-01-15T00:00:00Z",
      },
    ];
    const result = highestLevelPerSkillPerQuarter(rows);
    assert.equal(result.length, 0);
  });
});

describe("buildMarkerChecklist", () => {
  it("marks evidenced markers", () => {
    const markers = {
      human: ["Delivered a feature end-to-end"],
      agent: ["Completed a multi-file change"],
    };
    const evidence = [
      {
        matched: true,
        marker_text: "Delivered a feature end-to-end",
        artifact_id: "abc",
        rationale: "Good",
      },
    ];
    const checklist = buildMarkerChecklist(markers, evidence);
    assert.equal(checklist.length, 2);
    assert.equal(checklist[0].evidenced, true);
    assert.equal(checklist[0].artifactId, "abc");
    assert.equal(checklist[1].evidenced, false);
  });
});

describe("computeCoverageRatio", () => {
  it("computes the coverage ratio", () => {
    const all = [
      { artifact_id: "a" },
      { artifact_id: "b" },
      { artifact_id: "c" },
    ];
    const unscored = [{ artifact_id: "c" }];
    const result = computeCoverageRatio(all, unscored);
    assert.equal(result.scored, 2);
    assert.equal(result.total, 3);
    assert.ok(Math.abs(result.ratio - 2 / 3) < 0.001);
  });

  it("handles empty artifacts", () => {
    const result = computeCoverageRatio([], []);
    assert.equal(result.ratio, 0);
  });
});

describe("filterEvidenceByTeam", () => {
  it("filters to team emails via github_artifacts join", () => {
    const rows = [
      { github_artifacts: { email: "alice@example.com" } },
      { github_artifacts: { email: "bob@example.com" } },
      { github_artifacts: { email: "carol@example.com" } },
    ];
    const teamEmails = new Set(["alice@example.com", "carol@example.com"]);
    const filtered = filterEvidenceByTeam(rows, teamEmails);
    assert.equal(filtered.length, 2);
  });
});
