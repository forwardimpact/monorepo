import { before, test } from "node:test";
import assert from "node:assert/strict";
import { createMockClock } from "@forwardimpact/libmock";

import { parseRosterYaml } from "../src/roster/yaml.js";
import { computeCoverage, resolveTeam } from "../src/aggregation/coverage.js";
import { detectRisks } from "../src/aggregation/risks.js";
import {
  decorateCoverageWithEvidence,
  decorateRisksWithEvidence,
  EvidenceUnavailableError,
  loadEvidence,
} from "../src/evidence/index.js";
import { SupabaseUnavailableError } from "../src/lib/supabase.js";

import { loadStarterData } from "./fixtures.js";

let data;

before(async () => {
  ({ data } = await loadStarterData());
});

test("loadEvidence transforms evidence rows into an EvidenceMap", async () => {
  const fakeRows = [
    {
      skill_id: "task-completion",
      matched: true,
      created_at: new Date().toISOString(),
      github_artifacts: { email: "alice@example.com" },
    },
    {
      skill_id: "task-completion",
      matched: true,
      created_at: new Date().toISOString(),
      github_artifacts: { email: "bob@example.com" },
    },
    {
      skill_id: "planning",
      matched: false,
      created_at: new Date().toISOString(),
      github_artifacts: { email: "alice@example.com" },
    },
  ];

  const evidence = await loadEvidence(
    {},
    {
      team: { managerEmail: null },
      fetchEvidence: async () => fakeRows,
      clock: createMockClock({ start: Date.now() }),
    },
  );

  assert.equal(evidence.size, 1);
  const task = evidence.get("task-completion");
  assert.equal(task.count, 2);
  assert.equal(task.practitioners.size, 2);
});

test("decorateCoverageWithEvidence attaches evidencedDepth per skill", () => {
  const roster = parseRosterYaml(`
teams:
  a:
    - name: Alice
      email: alice@example.com
      job: { discipline: software-engineering, level: J060 }
    - name: Bob
      email: bob@example.com
      job: { discipline: software-engineering, level: J040 }
`);
  const resolved = resolveTeam(roster, data, { teamId: "a" });
  const coverage = computeCoverage(resolved, data);
  const evidence = new Map();
  evidence.set("task-completion", {
    count: 1,
    practitioners: new Set(["alice@example.com"]),
  });

  const decorated = decorateCoverageWithEvidence(coverage, evidence);
  const task = decorated.skills.get("task-completion");
  assert.equal(task.evidencedDepth, 1);
  assert.deepEqual(task.evidencedHolders, ["alice@example.com"]);
  // Empty evidence path: planning has no evidence.
  const planning = decorated.skills.get("planning");
  assert.equal(planning.evidencedDepth, 0);
});

test("decorateRisksWithEvidence flips a skill into SPOF when only one practitioner", () => {
  const roster = parseRosterYaml(`
teams:
  a:
    - name: Alice
      email: alice@example.com
      job: { discipline: software-engineering, level: J060 }
    - name: Bob
      email: bob@example.com
      job: { discipline: software-engineering, level: J060 }
`);
  const resolved = resolveTeam(roster, data, { teamId: "a" });
  const coverage = computeCoverage(resolved, data);
  const risks = detectRisks({ resolvedTeam: resolved, coverage, data });
  // Both Alice and Bob hold task-completion at working so it's not a SPOF
  // by derivation.
  assert.equal(
    risks.singlePointsOfFailure.find((s) => s.skillId === "task-completion"),
    undefined,
  );

  const evidence = new Map();
  evidence.set("task-completion", {
    count: 1,
    practitioners: new Set(["alice@example.com"]),
  });
  const decoratedCoverage = decorateCoverageWithEvidence(coverage, evidence);
  const decoratedRisks = decorateRisksWithEvidence(
    risks,
    decoratedCoverage,
    evidence,
  );

  assert.ok(
    decoratedRisks.singlePointsOfFailure.find(
      (s) => s.skillId === "task-completion",
    ),
  );
});

test("EvidenceUnavailableError is a SupabaseUnavailableError", () => {
  const err = new EvidenceUnavailableError("testing");
  assert.ok(err instanceof SupabaseUnavailableError);
  assert.ok(err.code === "SUMMIT_EVIDENCE_UNAVAILABLE");
});

test("decorateRisksWithEvidence ignores practitioners outside the team", () => {
  const roster = parseRosterYaml(`
teams:
  a:
    - name: Alice
      email: alice@example.com
      job: { discipline: software-engineering, level: J060 }
    - name: Bob
      email: bob@example.com
      job: { discipline: software-engineering, level: J060 }
`);
  const resolved = resolveTeam(roster, data, { teamId: "a" });
  const coverage = computeCoverage(resolved, data);
  const risks = detectRisks({ resolvedTeam: resolved, coverage, data });

  // Evidence says task-completion has TWO practitioners, but only one
  // is on the team — the other is from another team. The team-intersect
  // must drop the outsider and leave decoratedRisks with a SPOF for
  // task-completion.
  const evidence = new Map();
  evidence.set("task-completion", {
    count: 2,
    practitioners: new Set(["alice@example.com", "outsider@example.com"]),
  });
  const decoratedCoverage = decorateCoverageWithEvidence(coverage, evidence);
  const decoratedRisks = decorateRisksWithEvidence(
    risks,
    decoratedCoverage,
    evidence,
  );

  const task = decoratedRisks.singlePointsOfFailure.find(
    (s) => s.skillId === "task-completion",
  );
  assert.ok(
    task,
    "task-completion must be a SPOF when only one team member has evidence",
  );
});

test("loadEvidence filters by team emails when team is provided", async () => {
  const fakeRows = [
    {
      skill_id: "task-completion",
      matched: true,
      created_at: new Date().toISOString(),
      github_artifacts: { email: "alice@example.com" },
    },
    {
      skill_id: "task-completion",
      matched: true,
      created_at: new Date().toISOString(),
      github_artifacts: { email: "outsider@example.com" },
    },
  ];

  const evidence = await loadEvidence(
    {},
    {
      team: {
        members: [{ email: "alice@example.com" }],
      },
      fetchEvidence: async () => fakeRows,
      clock: createMockClock({ start: Date.now() }),
    },
  );

  const task = evidence.get("task-completion");
  assert.equal(task.practitioners.size, 1);
  assert.ok(task.practitioners.has("alice@example.com"));
});
