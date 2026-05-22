import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { enrichPersonaRow } from "../../src/lib/persona-enricher.js";

function makeAst() {
  return {
    departments: [{ id: "dept_eng", name: "Engineering", _children: [] }],
    teams: [
      { id: "alpha", department: "dept_eng", name: "Alpha", repos: ["a", "b"] },
    ],
    scenarios: [
      {
        id: "s1",
        timerange_start: "2026-03",
        affects: [{ team_id: "alpha" }],
      },
    ],
  };
}

describe("enrichPersonaRow", () => {
  test("returns row with three null fields when ast is null", () => {
    const row = { email: "p@x", getdx_team_id: "gdx_team_alpha" };
    const out = enrichPersonaRow(row, null);
    assert.equal(out.email, "p@x");
    assert.equal(out.repos, null);
    assert.equal(out.department_name, null);
    assert.equal(out.scenario, null);
  });

  test("returns repos, department_name, scenario when ast matches", () => {
    const row = { email: "p@x", getdx_team_id: "gdx_team_alpha" };
    const out = enrichPersonaRow(row, makeAst());
    assert.deepEqual(out.repos, ["a", "b"]);
    assert.equal(out.department_name, "Engineering");
    assert.equal(out.scenario.id, "s1");
  });

  test("returns three null fields when getdx_team_id is missing or unmapped", () => {
    const ast = makeAst();
    const noId = enrichPersonaRow({ email: "p@x" }, ast);
    assert.equal(noId.repos, null);
    assert.equal(noId.department_name, null);
    assert.equal(noId.scenario, null);

    const noPrefix = enrichPersonaRow(
      { email: "p@x", getdx_team_id: "alpha" },
      ast,
    );
    assert.equal(noPrefix.repos, null);
    assert.equal(noPrefix.department_name, null);
    assert.equal(noPrefix.scenario, null);

    const unknown = enrichPersonaRow(
      { email: "p@x", getdx_team_id: "gdx_team_unknown" },
      ast,
    );
    assert.equal(unknown.repos, null);
    assert.equal(unknown.department_name, null);
    assert.equal(unknown.scenario, null);
  });
});
