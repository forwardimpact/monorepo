import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createMockQueries } from "@forwardimpact/libmock";

import { runCoverageCommand } from "../src/commands/coverage.js";
import { toText } from "../src/formatters/coverage.js";

const PERSON = {
  email: "alice@example.com",
  name: "Alice",
  discipline: "software-engineering",
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
  evidence = [],
} = {}) {
  return createMockQueries({
    getPerson: person,
    getArtifacts: artifacts,
    getUnscoredArtifacts: unscored,
    getEvidence: evidence,
  });
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

  it("breaks down the numerator by provenance class, zero classes shown", async () => {
    const result = await runCoverageCommand({
      options: { email: "alice@example.com" },
      supabase: {},
      format: "text",
      queries: stubQueries({
        evidence: [
          { provenance: "synthetic_placeholder" },
          { provenance: "synthetic_placeholder" },
          { provenance: "artifact_interpreted" },
          { provenance: null }, // legacy row → DB default class
        ],
      }),
    });
    assert.deepEqual(result.view.byProvenance, {
      synthetic_placeholder: 2,
      artifact_interpreted: 1,
      agent_attested: 0,
      human_attested: 1,
      unknown: 0,
    });
    const text = toText(result.view);
    assert.match(text, /By provenance \(evidence rows\):/);
    assert.match(text, /synthetic_placeholder\s+2/);
    assert.match(text, /artifact_interpreted\s+1/);
    assert.match(text, /agent_attested\s+0/);
    assert.match(text, /human_attested\s+1/);
    assert.doesNotMatch(text, /unknown/);
  });

  it("renders the unknown bucket only when non-zero", async () => {
    const result = await runCoverageCommand({
      options: { email: "alice@example.com" },
      supabase: {},
      format: "text",
      queries: stubQueries({
        evidence: [{ provenance: "made_up_value" }],
      }),
    });
    assert.equal(result.view.byProvenance.unknown, 1);
    const text = toText(result.view);
    assert.match(text, /unknown\s+1/);
  });

  it("renders the below-floor banner above the ratio line", async () => {
    const artifacts = Array.from({ length: 100 }, (_, i) => ({
      artifact_id: `a${i}`,
      artifact_type: "commit",
    }));
    const result = await runCoverageCommand({
      options: { email: "alice@example.com" },
      supabase: {},
      format: "text",
      queries: stubQueries({
        artifacts,
        unscored: artifacts.slice(1), // 1/100 = 1%
      }),
    });
    const text = toText(result.view);
    const lines = text.split("\n");
    const bannerIdx = lines.findIndex((l) =>
      l.includes("Coverage below floor"),
    );
    const ratioIdx = lines.findIndex((l) =>
      l.includes("1/100 artifacts interpreted"),
    );
    assert.ok(bannerIdx >= 0, "missing banner");
    assert.ok(ratioIdx > bannerIdx, "ratio should render after the banner");
    assert.match(text, /producer-skew diagnostic/);
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
