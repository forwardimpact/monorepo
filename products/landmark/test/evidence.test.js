import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runEvidenceCommand } from "../src/commands/evidence.js";
import { EMPTY_STATES } from "../src/lib/empty-state.js";

const EVIDENCE_ROWS = [
  {
    skill_id: "task_completion",
    level_id: "working",
    marker_text: "Delivered a feature",
    matched: true,
    artifact_id: "art-1",
    rationale: "Clean delivery",
    created_at: "2025-01-15T00:00:00Z",
    github_artifacts: { email: "alice@example.com" },
  },
  {
    skill_id: "task_completion",
    level_id: "foundational",
    marker_text: "Small feature",
    matched: false,
    artifact_id: "art-2",
    rationale: null,
    created_at: "2025-01-10T00:00:00Z",
    github_artifacts: { email: "alice@example.com" },
  },
  {
    skill_id: "planning",
    level_id: "awareness",
    marker_text: "Followed plan",
    matched: true,
    artifact_id: "art-3",
    rationale: "On track",
    created_at: "2025-02-01T00:00:00Z",
    github_artifacts: { email: "alice@example.com" },
  },
];

function stubQueries({ evidence = EVIDENCE_ROWS } = {}) {
  return {
    getEvidence: async () => evidence,
    getArtifacts: async () => [
      { artifact_id: "art-1" },
      { artifact_id: "art-2" },
      { artifact_id: "art-3" },
    ],
    getUnscoredArtifacts: async () => [{ artifact_id: "art-2" }],
  };
}

describe("evidence command", () => {
  it("returns grouped evidence with coverage", async () => {
    const result = await runEvidenceCommand({
      options: { email: "alice@example.com" },
      supabase: {},
      format: "text",
      queries: stubQueries(),
    });
    assert.ok(result.view.evidence.task_completion);
    assert.equal(result.view.evidence.task_completion.matched, 1);
    assert.equal(result.view.coverage.scored, 2);
    assert.equal(result.view.coverage.total, 3);
  });

  it("returns empty state when no evidence", async () => {
    const result = await runEvidenceCommand({
      options: {},
      supabase: {},
      format: "text",
      queries: stubQueries({ evidence: [] }),
    });
    assert.equal(result.view, null);
    assert.equal(result.meta.emptyState, EMPTY_STATES.NO_EVIDENCE);
  });

  it("skips coverage when no email filter", async () => {
    const result = await runEvidenceCommand({
      options: { skill: "planning" },
      supabase: {},
      format: "text",
      queries: stubQueries(),
    });
    assert.equal(result.view.coverage, null);
  });
});
