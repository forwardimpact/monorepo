import { describe, test } from "node:test";
import assert from "node:assert";
import {
  findTeamById,
  findDepartmentForTeam,
  findMostRecentScenarioForTeam,
} from "../src/dsl/helpers.js";

function makeAst() {
  return {
    departments: [
      { id: "dept_eng", name: "Engineering", _children: [] },
      { id: "dept_ops", name: "Operations", _children: [] },
    ],
    teams: [
      { id: "alpha", department: "dept_eng", name: "Alpha", repos: ["a", "b"] },
      { id: "beta", department: "dept_ops", name: "Beta", repos: ["c"] },
      { id: "gamma", department: "dept_missing", name: "Gamma", repos: [] },
    ],
    scenarios: [
      {
        id: "s1",
        timerange_start: "2026-01",
        affects: [{ team_id: "alpha" }],
      },
      {
        id: "s2",
        timerange_start: "2026-03",
        affects: [{ team_id: "alpha" }, { team_id: "beta" }],
      },
      {
        id: "s3",
        timerange_start: "2026-03",
        affects: [{ team_id: "alpha" }],
      },
      {
        id: "s0",
        timerange_start: "2026-02",
        affects: [{ team_id: "beta" }],
      },
    ],
  };
}

describe("findTeamById", () => {
  test("returns the matching team block", () => {
    const ast = makeAst();
    const team = findTeamById(ast, "alpha");
    assert.strictEqual(team?.id, "alpha");
    assert.strictEqual(team?.name, "Alpha");
  });

  test("returns null for missing id", () => {
    const ast = makeAst();
    assert.strictEqual(findTeamById(ast, "nope"), null);
  });

  test("returns null when ast has no teams array", () => {
    assert.strictEqual(findTeamById({}, "alpha"), null);
    assert.strictEqual(findTeamById(null, "alpha"), null);
  });
});

describe("findDepartmentForTeam", () => {
  test("returns the parent department", () => {
    const ast = makeAst();
    const team = findTeamById(ast, "alpha");
    const dept = findDepartmentForTeam(ast, team);
    assert.strictEqual(dept?.id, "dept_eng");
    assert.strictEqual(dept?.name, "Engineering");
  });

  test("returns null when team.department names a non-existent id", () => {
    const ast = makeAst();
    const team = findTeamById(ast, "gamma");
    assert.strictEqual(findDepartmentForTeam(ast, team), null);
  });

  test("returns null when team is null/undefined", () => {
    const ast = makeAst();
    assert.strictEqual(findDepartmentForTeam(ast, null), null);
    assert.strictEqual(findDepartmentForTeam(ast, undefined), null);
  });
});

describe("findMostRecentScenarioForTeam", () => {
  test("picks the scenario with max timerange_start; ties broken by id ASC (max-id wins)", () => {
    const ast = makeAst();
    const s = findMostRecentScenarioForTeam(ast, "alpha");
    assert.strictEqual(s?.id, "s3");
  });

  test("picks the single matching scenario for a team", () => {
    const ast = makeAst();
    const s = findMostRecentScenarioForTeam(ast, "beta");
    assert.strictEqual(s?.id, "s2");
  });

  test("returns null when no scenario affects the team", () => {
    const ast = makeAst();
    assert.strictEqual(findMostRecentScenarioForTeam(ast, "gamma"), null);
  });

  test("tolerates ast.scenarios undefined", () => {
    assert.strictEqual(
      findMostRecentScenarioForTeam({ scenarios: undefined }, "alpha"),
      null,
    );
    assert.strictEqual(findMostRecentScenarioForTeam({}, "alpha"), null);
  });
});
