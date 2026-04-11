import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

import { createDataLoader } from "@forwardimpact/map/loader";

import { parseRosterYaml } from "../src/roster/yaml.js";
import {
  applyScenario,
  diffCoverage,
  diffRisks,
} from "../src/aggregation/what-if.js";
import {
  parseJobExpression,
  parseScenario,
  ScenarioError,
  ScenarioType,
} from "../src/aggregation/scenarios.js";
import { computeCoverage, resolveTeam } from "../src/aggregation/coverage.js";
import { detectRisks } from "../src/aggregation/risks.js";
import { UnknownJobFieldError } from "../src/aggregation/errors.js";

const FIXTURE_DATA = join(import.meta.dirname, "fixtures", "map-data");

const FIXTURE_YAML = `
teams:
  a:
    - name: Alice
      email: alice@example.com
      job: { discipline: software_engineering, level: J060 }
    - name: Bob
      email: bob@example.com
      job: { discipline: software_engineering, level: J040 }
`;

async function loadData() {
  return createDataLoader().loadAllData(FIXTURE_DATA);
}

test("parseJobExpression accepts flow YAML", () => {
  const job = parseJobExpression(
    "{ discipline: software_engineering, level: J060 }",
  );
  assert.equal(job.discipline, "software_engineering");
  assert.equal(job.level, "J060");
});

test("parseJobExpression rejects missing discipline", () => {
  assert.throws(
    () => parseJobExpression("{ level: J060 }"),
    UnknownJobFieldError,
  );
});

test("parseScenario rejects multiple mutation flags", () => {
  assert.throws(
    () =>
      parseScenario(
        {
          add: "{ discipline: software_engineering, level: J060 }",
          remove: "Alice",
        },
        { teamId: "a" },
      ),
    ScenarioError,
  );
});

test("parseScenario parses --add with allocation", () => {
  const scenario = parseScenario(
    {
      add: "{ discipline: software_engineering, level: J060 }",
      allocation: "0.5",
    },
    { projectId: "p" },
  );
  assert.equal(scenario.type, ScenarioType.ADD);
  assert.equal(scenario.allocation, 0.5);
  assert.equal(scenario.projectId, "p");
});

test("applyScenario add: team grows by one member", async () => {
  const data = await loadData();
  const roster = parseRosterYaml(FIXTURE_YAML);
  const scenario = parseScenario(
    {
      add: "{ discipline: software_engineering, level: J060 }",
    },
    { teamId: "a" },
  );
  const mutated = applyScenario(roster, data, scenario);
  assert.equal(mutated.teams.get("a").members.length, 3);
  // Input is not modified.
  assert.equal(roster.teams.get("a").members.length, 2);
});

test("applyScenario remove: throws on unknown name", async () => {
  const data = await loadData();
  const roster = parseRosterYaml(FIXTURE_YAML);
  const scenario = parseScenario({ remove: "Nonexistent" }, { teamId: "a" });
  assert.throws(() => applyScenario(roster, data, scenario), ScenarioError);
});

test("applyScenario remove: drops the named member", async () => {
  const data = await loadData();
  const roster = parseRosterYaml(FIXTURE_YAML);
  const scenario = parseScenario({ remove: "Alice" }, { teamId: "a" });
  const mutated = applyScenario(roster, data, scenario);
  assert.equal(mutated.teams.get("a").members.length, 1);
  assert.equal(mutated.teams.get("a").members[0].name, "Bob");
});

test("applyScenario promote: bumps level to the next rung", async () => {
  const data = await loadData();
  const roster = parseRosterYaml(FIXTURE_YAML);
  const scenario = parseScenario({ promote: "Bob" }, { teamId: "a" });
  const mutated = applyScenario(roster, data, scenario);
  const bob = mutated.teams.get("a").members.find((m) => m.name === "Bob");
  assert.equal(bob.job.level, "J060");
});

test("applyScenario promote: errors at top level", async () => {
  const data = await loadData();
  const roster = parseRosterYaml(FIXTURE_YAML);
  // Alice is already at J060 (top of starter); promote should error.
  const scenario = parseScenario({ promote: "Alice" }, { teamId: "a" });
  assert.throws(() => applyScenario(roster, data, scenario), ScenarioError);
});

test("applyScenario move: relocates between reporting teams", async () => {
  const data = await loadData();
  const roster = parseRosterYaml(`
teams:
  a:
    - name: Alice
      email: a@example.com
      job: { discipline: software_engineering, level: J060 }
  b:
    - name: Bob
      email: b@example.com
      job: { discipline: software_engineering, level: J060 }
`);
  const scenario = parseScenario({ move: "Alice", to: "b" }, { teamId: "a" });
  const mutated = applyScenario(roster, data, scenario);
  assert.equal(mutated.teams.get("a").members.length, 0);
  assert.equal(mutated.teams.get("b").members.length, 2);
});

test("diffCoverage tracks headcount direction", async () => {
  const data = await loadData();
  const roster = parseRosterYaml(FIXTURE_YAML);
  const before = computeSnapshot(roster, data);
  const scenario = parseScenario(
    { add: "{ discipline: software_engineering, level: J060 }" },
    { teamId: "a" },
  );
  const mutated = applyScenario(roster, data, scenario);
  const after = computeSnapshot(mutated, data);

  const diff = diffCoverage(before.coverage, after.coverage);
  const task = diff.capabilityChanges.find(
    (c) => c.skillId === "task_completion",
  );
  assert.equal(task.before.headcountDepth, 1);
  assert.equal(task.after.headcountDepth, 2);
  assert.equal(task.direction, "up");
});

test("diffRisks finds resolved and new risks", async () => {
  const data = await loadData();
  const roster = parseRosterYaml(FIXTURE_YAML);
  const before = computeSnapshot(roster, data);
  // Add a second J060 — task_completion SPOF goes from 1 → 2, so the
  // SPOF disappears.
  const scenario = parseScenario(
    { add: "{ discipline: software_engineering, level: J060 }" },
    { teamId: "a" },
  );
  const mutated = applyScenario(roster, data, scenario);
  const after = computeSnapshot(mutated, data);

  const risks = diffRisks(before.risks, after.risks);
  const removed = risks.removed.singlePoints.map((r) => r.skillId);
  assert.ok(removed.includes("task_completion"));
});

function computeSnapshot(roster, data) {
  const resolved = resolveTeam(roster, data, { teamId: "a" });
  const coverage = computeCoverage(resolved, data);
  const risks = detectRisks({ resolvedTeam: resolved, coverage, data });
  return { resolved, coverage, risks };
}
