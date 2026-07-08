/**
 * Enricher keys on the contract's bare `team_id` (vendor-prefix mapping is
 * the consumer view's job) and degrades to null DSL fields when the story
 * AST or the team is absent.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  loadStory,
  enrichPersonaRow,
} from "../src/substrate/persona-enricher.js";
import { createTestRuntime } from "@forwardimpact/libmock";

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
    const row = { email: "p@x", team_id: "alpha" };
    const out = enrichPersonaRow(row, null);
    assert.equal(out.email, "p@x");
    assert.equal(out.repos, null);
    assert.equal(out.department_name, null);
    assert.equal(out.scenario, null);
  });

  test("resolves by bare team_id — no vendor prefix handling", () => {
    const row = { email: "p@x", team_id: "alpha" };
    const out = enrichPersonaRow(row, makeAst());
    assert.deepEqual(out.repos, ["a", "b"]);
    assert.equal(out.department_name, "Engineering");
    assert.equal(out.scenario.id, "s1");
  });

  test("vendor-prefixed ids no longer resolve", () => {
    const out = enrichPersonaRow(
      { email: "p@x", team_id: "gdx_team_alpha" },
      makeAst(),
    );
    assert.equal(out.repos, null);
    assert.equal(out.department_name, null);
    assert.equal(out.scenario, null);
  });

  test("returns three null fields when team_id is missing or unmapped", () => {
    const ast = makeAst();
    const noId = enrichPersonaRow({ email: "p@x" }, ast);
    assert.equal(noId.repos, null);
    assert.equal(noId.department_name, null);
    assert.equal(noId.scenario, null);

    const unknown = enrichPersonaRow({ email: "p@x", team_id: "unknown" }, ast);
    assert.equal(unknown.repos, null);
    assert.equal(unknown.department_name, null);
    assert.equal(unknown.scenario, null);
  });
});

describe("loadStory", () => {
  test("returns null when story.dsl is absent", async () => {
    const runtime = createTestRuntime();
    assert.equal(await loadStory(runtime, "/nowhere"), null);
  });
});
