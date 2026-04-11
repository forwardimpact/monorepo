import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

import { createDataLoader } from "@forwardimpact/map/loader";

import { parseRosterYaml } from "../src/roster/yaml.js";
import { computeCoverage, resolveTeam } from "../src/aggregation/coverage.js";
import {
  detectCriticalGaps,
  detectRisks,
  detectSinglePointsOfFailure,
} from "../src/aggregation/risks.js";
import { Audience, withAudienceFilter } from "../src/lib/audience.js";

const FIXTURE_DATA = join(import.meta.dirname, "fixtures", "map-data");

async function loadData() {
  return createDataLoader().loadAllData(FIXTURE_DATA);
}

test("detectSinglePointsOfFailure: skill with exactly one working+ holder", async () => {
  const data = await loadData();
  const roster = parseRosterYaml(`
teams:
  a:
    - name: Bob
      email: bob@example.com
      job: { discipline: software_engineering, level: J060 }
    - name: Alice
      email: alice@example.com
      job: { discipline: software_engineering, level: J040 }
`);
  const resolved = resolveTeam(roster, data, { teamId: "a" });
  const coverage = computeCoverage(resolved, data);
  const spofs = detectSinglePointsOfFailure(coverage);

  // task_completion: Bob working (J060 primary), Alice foundational → SPOF
  const task = spofs.find((s) => s.skillId === "task_completion");
  assert.ok(task);
  assert.equal(task.holder.email, "bob@example.com");
});

test("detectSinglePointsOfFailure severity tiers reflect allocation", async () => {
  const data = await loadData();
  const roster = parseRosterYaml(`
teams:
  a:
    - name: Alice
      email: alice@example.com
      job: { discipline: software_engineering, level: J040 }
projects:
  p:
    - name: Only
      job: { discipline: software_engineering, level: J060 }
      allocation: 0.3
`);
  const resolved = resolveTeam(roster, data, { projectId: "p" });
  const coverage = computeCoverage(resolved, data);
  const spofs = detectSinglePointsOfFailure(coverage);
  const task = spofs.find((s) => s.skillId === "task_completion");
  assert.equal(task.severity, "high");
});

test("detectCriticalGaps cites discipline reason for zero-depth skills", async () => {
  const data = await loadData();
  // All team members at J040 → task_completion foundational, planning
  // awareness, incident_response awareness. No skill at working+ → every
  // discipline skill is a critical gap.
  const roster = parseRosterYaml(`
teams:
  a:
    - name: A
      email: a@example.com
      job: { discipline: software_engineering, level: J040 }
    - name: B
      email: b@example.com
      job: { discipline: software_engineering, level: J040 }
`);
  const resolved = resolveTeam(roster, data, { teamId: "a" });
  const coverage = computeCoverage(resolved, data);
  const gaps = detectCriticalGaps(resolved, coverage, data);

  assert.ok(gaps.some((g) => g.skillId === "task_completion"));
  assert.ok(gaps.some((g) => g.skillId === "incident_response"));
  const incident = gaps.find((g) => g.skillId === "incident_response");
  assert.ok(/software_engineering/.test(incident.reason));
});

test("detectRisks on a zero-member team returns empty arrays", async () => {
  const data = await loadData();
  const resolved = {
    id: "empty",
    type: "reporting",
    members: [],
    effectiveFte: 0,
    managerEmail: null,
  };
  const coverage = computeCoverage(resolved, data);
  const risks = detectRisks({ resolvedTeam: resolved, coverage, data });
  assert.equal(risks.singlePointsOfFailure.length, 0);
  assert.equal(risks.criticalGaps.length, 0);
  assert.equal(risks.concentrationRisks.length, 0);
});

test("audience filter drops holder identity for SPOFs", async () => {
  const data = await loadData();
  const roster = parseRosterYaml(`
teams:
  a:
    - name: Bob
      email: bob@example.com
      job: { discipline: software_engineering, level: J060 }
    - name: Alice
      email: alice@example.com
      job: { discipline: software_engineering, level: J040 }
`);
  const resolved = resolveTeam(roster, data, { teamId: "a" });
  const coverage = computeCoverage(resolved, data);

  const directorCoverage = withAudienceFilter(coverage, Audience.DIRECTOR);
  const task = directorCoverage.skills.get("task_completion");
  // Director coverage has holders stripped, so a SPOF detector running
  // over the director coverage sees no named holder.
  assert.ok(task.holders.every((h) => !h.email && !h.name));
});
