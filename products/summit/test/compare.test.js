import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

import { createDataLoader } from "@forwardimpact/map/loader";

import { parseRosterYaml } from "../src/roster/yaml.js";
import { computeCoverage, resolveTeam } from "../src/aggregation/coverage.js";
import { detectRisks } from "../src/aggregation/risks.js";
import { diffCoverage, diffRisks } from "../src/aggregation/what-if.js";

const FIXTURE_DATA = join(import.meta.dirname, "fixtures", "map-data");

async function loadData() {
  return createDataLoader().loadAllData(FIXTURE_DATA);
}

test("diffCoverage across two teams shows per-skill differences", async () => {
  const data = await loadData();
  const roster = parseRosterYaml(`
teams:
  a:
    - name: Alice
      email: alice@example.com
      job: { discipline: software_engineering, level: J060 }
  b:
    - name: Bob
      email: bob@example.com
      job: { discipline: software_engineering, level: J040 }
`);
  const left = snapshot(roster, data, "a");
  const right = snapshot(roster, data, "b");
  const diff = diffCoverage(left.coverage, right.coverage);
  const task = diff.capabilityChanges.find(
    (c) => c.skillId === "task_completion",
  );
  // Alice (J060) is at working, Bob (J040) is below working.
  assert.equal(task.direction, "down");
});

test("diffRisks identifies risks that disappear across teams", async () => {
  const data = await loadData();
  const roster = parseRosterYaml(`
teams:
  a:
    - name: Alice
      email: alice@example.com
      job: { discipline: software_engineering, level: J060 }
  b:
    - name: Bob
      email: bob@example.com
      job: { discipline: software_engineering, level: J060 }
    - name: Carol
      email: carol@example.com
      job: { discipline: software_engineering, level: J060 }
`);
  const left = snapshot(roster, data, "a");
  const right = snapshot(roster, data, "b");
  const risks = diffRisks(left.risks, right.risks);
  // Team a has task_completion as SPOF (only Alice at working); team b has 2 working.
  const removedIds = risks.removed.singlePoints.map((s) => s.skillId);
  assert.ok(removedIds.includes("task_completion"));
});

function snapshot(roster, data, teamId) {
  const resolved = resolveTeam(roster, data, { teamId });
  const coverage = computeCoverage(resolved, data);
  const risks = detectRisks({ resolvedTeam: resolved, coverage, data });
  return { resolved, coverage, risks };
}
