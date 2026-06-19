/**
 * Coverage for the synthetic DSL's `director` sub-block under a `department`.
 * Asserts both the parser shape and the entity-generation pipeline: a director
 * is a real organization_people row (is_manager, no team, no manager_email)
 * and the department's team managers are re-pointed to report to it, so a
 * single recursive get_team from the director's email resolves the whole
 * department.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { tokenize } from "../src/dsl/tokenizer.js";
import { parse } from "../src/dsl/parser.js";
import { buildEntities } from "../src/engine/entities.js";
import { createSeededRNG } from "../src/engine/rng.js";

function parseDsl(source) {
  return parse(tokenize(source));
}

// Two departments — one with a director, one without — so the test can assert
// that re-pointing is scoped to the director's own department.
const DSL = (directorBlock) => `terrain test {
  domain "example.test"
  seed 1
  org acme { name "Acme" }
  department it {
    name "IT"
    ${directorBlock}
    team alpha { size 3 manager @athena }
    team beta { size 3 manager @prometheus }
  }
  department rd {
    name "R&D"
    team gamma { size 3 manager @thoth }
  }
  people {
    count 12
    names "greek"
    distribution { J070 100% }
    disciplines { software_engineering 100% }
    archetypes { steady_contributor 100% }
  }
}`;

const DIRECTOR_BLOCK = `director @zeus {
      name "Zeus"
      title "Director of Engineering"
      level J090
      discipline engineering_management
    }`;

function build(source) {
  const ast = parseDsl(source);
  const rng = createSeededRNG(`${ast.seed}:test`);
  return { ast, ...buildEntities(ast, rng) };
}

describe("DSL director block", () => {
  test("parser collects the director onto its department", () => {
    const ast = parseDsl(DSL(DIRECTOR_BLOCK));
    const it = ast.departments.find((d) => d.id === "it");
    assert.deepEqual(it.director, {
      handle: "zeus",
      name: "Zeus",
      title: "Director of Engineering",
      level: "J090",
      discipline: "engineering_management",
    });
    const rd = ast.departments.find((d) => d.id === "rd");
    assert.equal(rd.director, undefined);
  });

  test("entity generation emits one director row with no team", () => {
    const { people } = build(DSL(DIRECTOR_BLOCK));
    const directors = people.filter((p) => p.is_manager && p.team_id === null);
    assert.equal(directors.length, 1);
    const zeus = directors[0];
    assert.equal(zeus.email, "zeus@example.test");
    assert.equal(zeus.is_manager, true);
    assert.equal(zeus.manager_email, null);
    assert.equal(zeus.department, "it");
    assert.equal(zeus.team_id, null);
    assert.equal(zeus.getdx_team_id, undefined);
    assert.equal(zeus.level, "J090");
    assert.equal(zeus.discipline, "engineering_management");
    assert.equal(zeus.title, "Director of Engineering");
  });

  test("the director's department team managers re-point to it", () => {
    const { people } = build(DSL(DIRECTOR_BLOCK));
    const athena = people.find((p) => p.name === "Athena");
    const prometheus = people.find((p) => p.name === "Prometheus");
    assert.equal(athena.manager_email, "zeus@example.test");
    assert.equal(prometheus.manager_email, "zeus@example.test");
  });

  test("managers outside the director's department are untouched", () => {
    const { people } = build(DSL(DIRECTOR_BLOCK));
    const thoth = people.find((p) => p.name === "Thoth");
    assert.equal(thoth.manager_email, null);
  });

  test("no director, no re-pointing and no extra row", () => {
    const { people } = build(DSL(""));
    assert.equal(
      people.filter((p) => p.is_manager && p.team_id === null).length,
      0,
    );
    assert.equal(
      people.some((p) => p.email === "zeus@example.test"),
      false,
    );
    const athena = people.find((p) => p.name === "Athena");
    assert.equal(athena.manager_email, null);
  });

  test("director name is reserved so no fill person collides on email", () => {
    const { people } = build(DSL(DIRECTOR_BLOCK));
    const emails = people.map((p) => p.email);
    assert.equal(emails.length, new Set(emails).size);
    assert.equal(
      people.filter((p) => p.email === "zeus@example.test").length,
      1,
    );
  });
});
