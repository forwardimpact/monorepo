import { before, test } from "node:test";
import assert from "node:assert/strict";

import { parseRosterYaml } from "../src/roster/yaml.js";
import { computeCoverage, resolveTeam } from "../src/aggregation/coverage.js";
import {
  detectCriticalGaps,
  detectRisks,
  detectSinglePointsOfFailure,
} from "../src/aggregation/risks.js";
import { Audience, withAudienceFilter } from "../src/lib/audience.js";

import { loadStarterData } from "./fixtures.js";

let data;

before(async () => {
  ({ data } = await loadStarterData());
});

test("detectSinglePointsOfFailure: skill with exactly one working+ holder", () => {
  const roster = parseRosterYaml(`
teams:
  a:
    - name: Bob
      email: bob@example.com
      job: { discipline: software-engineering, level: J060 }
    - name: Alice
      email: alice@example.com
      job: { discipline: software-engineering, level: J040 }
`);
  const resolved = resolveTeam(roster, data, { teamId: "a" });
  const coverage = computeCoverage(resolved, data);
  const spofs = detectSinglePointsOfFailure(coverage);

  // task-completion: Bob working (J060 core), Alice foundational → SPOF
  const task = spofs.find((s) => s.skillId === "task-completion");
  assert.ok(task);
  assert.equal(task.holder.email, "bob@example.com");
});

test("detectSinglePointsOfFailure severity tiers reflect allocation", () => {
  const roster = parseRosterYaml(`
teams:
  a:
    - name: Alice
      email: alice@example.com
      job: { discipline: software-engineering, level: J040 }
projects:
  p:
    - name: Only
      job: { discipline: software-engineering, level: J060 }
      allocation: 0.3
`);
  const resolved = resolveTeam(roster, data, { projectId: "p" });
  const coverage = computeCoverage(resolved, data);
  const spofs = detectSinglePointsOfFailure(coverage);
  const task = spofs.find((s) => s.skillId === "task-completion");
  assert.equal(task.severity, "high");
});

test("detectCriticalGaps cites discipline reason for zero-depth skills", () => {
  // All team members at J040 → task-completion foundational, planning
  // awareness, incident-response awareness. No skill at working+ → every
  // discipline skill is a critical gap.
  const roster = parseRosterYaml(`
teams:
  a:
    - name: A
      email: a@example.com
      job: { discipline: software-engineering, level: J040 }
    - name: B
      email: b@example.com
      job: { discipline: software-engineering, level: J040 }
`);
  const resolved = resolveTeam(roster, data, { teamId: "a" });
  const coverage = computeCoverage(resolved, data);
  const gaps = detectCriticalGaps(resolved, coverage, data);

  assert.ok(gaps.some((g) => g.skillId === "task-completion"));
  assert.ok(gaps.some((g) => g.skillId === "incident-response"));
  const incident = gaps.find((g) => g.skillId === "incident-response");
  assert.ok(/software-engineering/.test(incident.reason));
});

test("detectRisks on a zero-member team returns empty arrays", () => {
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

test("audience filter drops holder identity for SPOFs", () => {
  const roster = parseRosterYaml(`
teams:
  a:
    - name: Bob
      email: bob@example.com
      job: { discipline: software-engineering, level: J060 }
    - name: Alice
      email: alice@example.com
      job: { discipline: software-engineering, level: J040 }
`);
  const resolved = resolveTeam(roster, data, { teamId: "a" });
  const coverage = computeCoverage(resolved, data);

  const directorCoverage = withAudienceFilter(coverage, Audience.DIRECTOR);
  const task = directorCoverage.skills.get("task-completion");
  // Director coverage has holders stripped, so a SPOF detector running
  // over the director coverage sees no named holder.
  assert.ok(task.holders.every((h) => !h.email && !h.name));
});
