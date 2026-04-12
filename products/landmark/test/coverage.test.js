import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runCoverageCommand } from "../src/commands/coverage.js";

const PERSON = {
  email: "alice@example.com",
  name: "Alice",
  discipline: "software_engineering",
  level: "J040",
};

const ARTIFACTS = [
  { artifact_id: "a1", artifact_type: "pull_request" },
  { artifact_id: "a2", artifact_type: "pull_request" },
  { artifact_id: "a3", artifact_type: "review" },
  { artifact_id: "a4", artifact_type: "commit" },
];

const UNSCORED = [
  { artifact_id: "a3", artifact_type: "review" },
  { artifact_id: "a4", artifact_type: "commit" },
];

function stubQueries({
  person = PERSON,
  artifacts = ARTIFACTS,
  unscored = UNSCORED,
} = {}) {
  return {
    getPerson: async () => person,
    getArtifacts: async () => artifacts,
    getUnscoredArtifacts: async () => unscored,
  };
}

describe("coverage command", () => {
  it("returns coverage ratio and type breakdown", async () => {
    const result = await runCoverageCommand({
      options: { email: "alice@example.com" },
      supabase: {},
      format: "text",
      queries: stubQueries(),
    });
    assert.equal(result.view.coverage.scored, 2);
    assert.equal(result.view.coverage.total, 4);
    assert.equal(result.view.byType.pull_request, 2);
    assert.equal(result.view.uncoveredByType.review, 1);
  });

  it("returns PERSON_NOT_FOUND for unknown email", async () => {
    const result = await runCoverageCommand({
      options: { email: "nobody@example.com" },
      supabase: {},
      format: "text",
      queries: stubQueries({ person: null }),
    });
    assert.equal(result.view, null);
    assert.ok(result.meta.emptyState.includes("nobody@example.com"));
  });

  it("returns NO_ARTIFACTS when person has no artifacts", async () => {
    const result = await runCoverageCommand({
      options: { email: "alice@example.com" },
      supabase: {},
      format: "text",
      queries: stubQueries({ artifacts: [], unscored: [] }),
    });
    assert.equal(result.view, null);
    assert.ok(result.meta.emptyState.includes("alice@example.com"));
  });
});
