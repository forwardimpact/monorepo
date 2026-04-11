import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

import { createDataLoader } from "@forwardimpact/map/loader";

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

const FIXTURE_DATA = join(import.meta.dirname, "fixtures", "map-data");

async function loadData() {
  return createDataLoader().loadAllData(FIXTURE_DATA);
}

test("loadEvidence transforms evidence rows into an EvidenceMap", async () => {
  const fakeRows = [
    {
      skill_id: "task_completion",
      matched: true,
      created_at: new Date().toISOString(),
      github_artifacts: { email: "alice@example.com" },
    },
    {
      skill_id: "task_completion",
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
    },
  );

  assert.equal(evidence.size, 1);
  const task = evidence.get("task_completion");
  assert.equal(task.count, 2);
  assert.equal(task.practitioners.size, 2);
});

test("decorateCoverageWithEvidence attaches evidencedDepth per skill", async () => {
  const data = await loadData();
  const roster = parseRosterYaml(`
teams:
  a:
    - name: Alice
      email: alice@example.com
      job: { discipline: software_engineering, level: J060 }
    - name: Bob
      email: bob@example.com
      job: { discipline: software_engineering, level: J040 }
`);
  const resolved = resolveTeam(roster, data, { teamId: "a" });
  const coverage = computeCoverage(resolved, data);
  const evidence = new Map();
  evidence.set("task_completion", {
    count: 1,
    practitioners: new Set(["alice@example.com"]),
  });

  const decorated = decorateCoverageWithEvidence(coverage, evidence);
  const task = decorated.skills.get("task_completion");
  assert.equal(task.evidencedDepth, 1);
  assert.deepEqual(task.evidencedHolders, ["alice@example.com"]);
  // Empty evidence path: planning has no evidence.
  const planning = decorated.skills.get("planning");
  assert.equal(planning.evidencedDepth, 0);
});

test("decorateRisksWithEvidence flips a skill into SPOF when only one practitioner", async () => {
  const data = await loadData();
  const roster = parseRosterYaml(`
teams:
  a:
    - name: Alice
      email: alice@example.com
      job: { discipline: software_engineering, level: J060 }
    - name: Bob
      email: bob@example.com
      job: { discipline: software_engineering, level: J060 }
`);
  const resolved = resolveTeam(roster, data, { teamId: "a" });
  const coverage = computeCoverage(resolved, data);
  const risks = detectRisks({ resolvedTeam: resolved, coverage, data });
  // Both Alice and Bob hold task_completion at working so it's not a SPOF
  // by derivation.
  assert.equal(
    risks.singlePointsOfFailure.find((s) => s.skillId === "task_completion"),
    undefined,
  );

  const evidence = new Map();
  evidence.set("task_completion", {
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
      (s) => s.skillId === "task_completion",
    ),
  );
});

test("EvidenceUnavailableError is a SupabaseUnavailableError", () => {
  const err = new EvidenceUnavailableError("testing");
  assert.ok(err instanceof SupabaseUnavailableError);
  assert.ok(err.code === "SUMMIT_EVIDENCE_UNAVAILABLE");
});
