/**
 * Coverage for the synthetic DSL's `service_account` sub-block under
 * `people {}`. Asserts both the parser shape and the entity-generation
 * pipeline (`kind="service_account"` rows, no level, no manager_email,
 * discipline "system").
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

const MIN_DSL = (extra = "") => `terrain test {
  domain "example.test"
  seed 1
  org acme { name "Acme" }
  department core { team alpha { size 2 manager "Manager Alpha" } }
  people {
    count 2
    names "greek"
    distribution { mid 100% }
    disciplines { backend 100% }
    archetypes { steady-contributor 100% }
    ${extra}
  }
}`;

describe("DSL service_account block", () => {
  test("parser collects service_account entries", () => {
    const ast = parseDsl(
      MIN_DSL(`
        service_account "kata-agent-team" {
          name "Kata Agent Team"
          email "kata-agent-team@example.test"
        }
        service_account qa_bot { email "qa@example.test" }
      `),
    );
    assert.equal(ast.people.service_accounts.length, 2);
    assert.deepEqual(ast.people.service_accounts[0], {
      id: "kata-agent-team",
      name: "Kata Agent Team",
      email: "kata-agent-team@example.test",
    });
    assert.equal(ast.people.service_accounts[1].id, "qa_bot");
    assert.equal(ast.people.service_accounts[1].email, "qa@example.test");
  });

  test("parser defaults service_accounts to empty when absent", () => {
    const ast = parseDsl(MIN_DSL());
    assert.deepEqual(ast.people.service_accounts, []);
  });

  test("entity generator emits kind='service_account' rows", () => {
    const ast = parseDsl(
      MIN_DSL(`
        service_account "kata-agent-team" {
          name "Kata Agent Team"
          email "kata-agent-team@example.test"
        }
      `),
    );
    const rng = createSeededRNG(`${ast.seed}:test`);
    const { people } = buildEntities(ast, rng);

    const sa = people.find((p) => p.kind === "service_account");
    assert.ok(sa, "service_account row not generated");
    assert.equal(sa.email, "kata-agent-team@example.test");
    assert.equal(sa.name, "Kata Agent Team");
    assert.equal(sa.level, null);
    assert.equal(sa.manager_email, null);
    assert.equal(sa.team_id, null);
    assert.equal(sa.discipline, "system");
  });

  test("human rows default to kind='human'", () => {
    const ast = parseDsl(MIN_DSL());
    const rng = createSeededRNG(`${ast.seed}:test`);
    const { people } = buildEntities(ast, rng);
    assert.ok(people.length > 0);
    for (const p of people) {
      assert.equal(p.kind, "human");
    }
  });
});
