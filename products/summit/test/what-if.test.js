import { before, test } from "node:test";
import assert from "node:assert/strict";

import { parseRosterYaml } from "../src/roster/yaml.js";
import {
  applyScenario,
  buildWhatIfReport,
  diffCoverage,
  diffRisks,
} from "../src/aggregation/what-if.js";
import { computeCoverage, resolveTeam } from "../src/aggregation/coverage.js";
import { detectRisks } from "../src/aggregation/risks.js";
import {
  parseJobExpression,
  parseScenario,
  ScenarioError,
  ScenarioType,
} from "../src/aggregation/scenarios.js";
import { UnknownJobFieldError } from "../src/aggregation/errors.js";

import { loadStarterData, snapshot } from "./fixtures.js";

const FIXTURE_YAML = `
teams:
  a:
    - name: Alice
      email: alice@example.com
      job: { discipline: software-engineering, level: J060 }
    - name: Bob
      email: bob@example.com
      job: { discipline: software-engineering, level: J040 }
`;

let data;

before(async () => {
  ({ data } = await loadStarterData());
});

test("parseJobExpression accepts flow YAML", () => {
  const job = parseJobExpression(
    "{ discipline: software-engineering, level: J060 }",
  );
  assert.equal(job.discipline, "software-engineering");
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
          add: "{ discipline: software-engineering, level: J060 }",
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
      add: "{ discipline: software-engineering, level: J060 }",
      allocation: "0.5",
    },
    { projectId: "p" },
  );
  assert.equal(scenario.type, ScenarioType.ADD);
  assert.equal(scenario.allocation, 0.5);
  assert.equal(scenario.projectId, "p");
});

test("applyScenario add: team grows by one member", () => {
  const roster = parseRosterYaml(FIXTURE_YAML);
  const scenario = parseScenario(
    {
      add: "{ discipline: software-engineering, level: J060 }",
    },
    { teamId: "a" },
  );
  const mutated = applyScenario(roster, data, scenario);
  assert.equal(mutated.teams.get("a").members.length, 3);
  // Input is not modified.
  assert.equal(roster.teams.get("a").members.length, 2);
});

test("applyScenario remove: throws on unknown name", () => {
  const roster = parseRosterYaml(FIXTURE_YAML);
  const scenario = parseScenario({ remove: "Nonexistent" }, { teamId: "a" });
  assert.throws(() => applyScenario(roster, data, scenario), ScenarioError);
});

test("applyScenario remove: drops the named member", () => {
  const roster = parseRosterYaml(FIXTURE_YAML);
  const scenario = parseScenario({ remove: "Alice" }, { teamId: "a" });
  const mutated = applyScenario(roster, data, scenario);
  assert.equal(mutated.teams.get("a").members.length, 1);
  assert.equal(mutated.teams.get("a").members[0].name, "Bob");
});

test("applyScenario promote: bumps level to the next rung", () => {
  const roster = parseRosterYaml(FIXTURE_YAML);
  const scenario = parseScenario({ promote: "Bob" }, { teamId: "a" });
  const mutated = applyScenario(roster, data, scenario);
  const bob = mutated.teams.get("a").members.find((m) => m.name === "Bob");
  assert.equal(bob.job.level, "J060");
});

test("applyScenario promote: errors at top level", () => {
  const roster = parseRosterYaml(FIXTURE_YAML);
  // Alice is already at J060 (top of starter); promote should error.
  const scenario = parseScenario({ promote: "Alice" }, { teamId: "a" });
  assert.throws(() => applyScenario(roster, data, scenario), ScenarioError);
});

test("applyScenario move: relocates between reporting teams", () => {
  const roster = parseRosterYaml(`
teams:
  a:
    - name: Alice
      email: a@example.com
      job: { discipline: software-engineering, level: J060 }
  b:
    - name: Bob
      email: b@example.com
      job: { discipline: software-engineering, level: J060 }
`);
  const scenario = parseScenario({ move: "Alice", to: "b" }, { teamId: "a" });
  const mutated = applyScenario(roster, data, scenario);
  assert.equal(mutated.teams.get("a").members.length, 0);
  assert.equal(mutated.teams.get("b").members.length, 2);
});

test("diffCoverage tracks headcount direction", () => {
  const roster = parseRosterYaml(FIXTURE_YAML);
  const baseline = snapshot(roster, data, "a");
  const scenario = parseScenario(
    { add: "{ discipline: software-engineering, level: J060 }" },
    { teamId: "a" },
  );
  const mutated = applyScenario(roster, data, scenario);
  const after = snapshot(mutated, data, "a");

  const diff = diffCoverage(baseline.coverage, after.coverage);
  const task = diff.capabilityChanges.find(
    (c) => c.skillId === "task-completion",
  );
  assert.equal(task.before.headcountDepth, 1);
  assert.equal(task.after.headcountDepth, 2);
  assert.equal(task.direction, "up");
});

test("what-if move: source loses skill, destination gains it on the same mutation", () => {
  const roster = parseRosterYaml(`
teams:
  a:
    - name: Alice
      email: alice@example.com
      job: { discipline: software-engineering, level: J060 }
    - name: Carol
      email: carol@example.com
      job: { discipline: software-engineering, level: J060 }
  b:
    - name: Bob
      email: bob@example.com
      job: { discipline: software-engineering, level: J060 }
`);
  const scenario = parseScenario({ move: "Alice", to: "b" }, { teamId: "a" });
  function snap(r, t) {
    const resolved = resolveTeam(r, data, t);
    const coverage = computeCoverage(resolved, data);
    const risks = detectRisks({ resolvedTeam: resolved, coverage, data });
    return { coverage, risks };
  }
  const beforeA = snap(roster, { teamId: "a" });
  const beforeB = snap(roster, { teamId: "b" });
  const mutated = applyScenario(roster, data, scenario);
  const afterA = snap(mutated, { teamId: "a" });
  const afterB = snap(mutated, { teamId: "b" });
  const report = buildWhatIfReport({
    scenario,
    teams: [
      { teamId: "a", role: "source", before: beforeA, after: afterA },
      { teamId: "b", role: "destination", before: beforeB, after: afterB },
    ],
  });
  const srcTask = report.teamDiffs[0].coverageDiff.capabilityChanges.find(
    (c) => c.skillId === "task-completion",
  );
  const dstTask = report.teamDiffs[1].coverageDiff.capabilityChanges.find(
    (c) => c.skillId === "task-completion",
  );
  assert.equal(srcTask.direction, "down");
  assert.equal(dstTask.direction, "up");
});

test("diffRisks finds resolved and new risks", () => {
  const roster = parseRosterYaml(FIXTURE_YAML);
  const baseline = snapshot(roster, data, "a");
  // Add a second J060 — task-completion SPOF goes from 1 → 2, so the
  // SPOF disappears.
  const scenario = parseScenario(
    { add: "{ discipline: software-engineering, level: J060 }" },
    { teamId: "a" },
  );
  const mutated = applyScenario(roster, data, scenario);
  const after = snapshot(mutated, data, "a");

  const risks = diffRisks(baseline.risks, after.risks);
  const removed = risks.removed.singlePoints.map((r) => r.skillId);
  assert.ok(removed.includes("task-completion"));
});
