import { before, test } from "node:test";
import assert from "node:assert/strict";

import { parseRosterYaml } from "../src/roster/yaml.js";
import { diffCoverage, diffRisks } from "../src/aggregation/what-if.js";

import { loadStarterData, snapshot } from "./fixtures.js";

let data;

before(async () => {
  ({ data } = await loadStarterData());
});

test("diffCoverage across two teams shows per-skill differences", () => {
  const roster = parseRosterYaml(`
teams:
  a:
    - name: Alice
      email: alice@example.com
      job: { discipline: software-engineering, level: J060 }
  b:
    - name: Bob
      email: bob@example.com
      job: { discipline: software-engineering, level: J040 }
`);
  const left = snapshot(roster, data, "a");
  const right = snapshot(roster, data, "b");
  const diff = diffCoverage(left.coverage, right.coverage);
  const task = diff.capabilityChanges.find(
    (c) => c.skillId === "task-completion",
  );
  // Alice (J060) is at working, Bob (J040) is below working.
  assert.equal(task.direction, "down");
});

test("diffRisks identifies risks that disappear across teams", () => {
  const roster = parseRosterYaml(`
teams:
  a:
    - name: Alice
      email: alice@example.com
      job: { discipline: software-engineering, level: J060 }
  b:
    - name: Bob
      email: bob@example.com
      job: { discipline: software-engineering, level: J060 }
    - name: Carol
      email: carol@example.com
      job: { discipline: software-engineering, level: J060 }
`);
  const left = snapshot(roster, data, "a");
  const right = snapshot(roster, data, "b");
  const risks = diffRisks(left.risks, right.risks);
  // Team a has task-completion as SPOF (only Alice at working); team b has 2 working.
  const removedIds = risks.removed.singlePoints.map((s) => s.skillId);
  assert.ok(removedIds.includes("task-completion"));
});
