import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createMockQueries } from "@forwardimpact/libmock";

import { runEvidenceCommand } from "../src/commands/evidence.js";
import { EMPTY_STATES } from "../src/lib/empty-state.js";
import { EVIDENCE_ROWS } from "./fixtures.js";

function stubQueries({ evidence = EVIDENCE_ROWS } = {}) {
  return createMockQueries({
    getEvidence: evidence,
    getArtifacts: [
      { artifact_id: "art-1" },
      { artifact_id: "art-2" },
      { artifact_id: "art-3" },
    ],
    getUnscoredArtifacts: [{ artifact_id: "art-2" }],
  });
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
