import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createDslParser } from "@forwardimpact/libsyntheticgen/dsl";
import { buildEntities } from "@forwardimpact/libsyntheticgen/engine/entities";
import { createSeededRNG } from "@forwardimpact/libsyntheticgen/rng";
import { parseYamlPeople } from "@forwardimpact/map/activity/parse-people";

const parser = createDslParser();

// Minimal DSL with framework levels matching distribution keys.
const MINI_DSL = `
  universe integration_test {
    domain "Testing"
    seed 42
    org hq { name "HQ" }
    department eng {
      name "Engineering"
      parent hq
      headcount 5
      team alpha { name "Alpha" size 5 }
    }
    people {
      count 5
      distribution { J040 60% J060 40% }
      disciplines { software_engineering 100% }
    }
    framework {
      levels {
        J040 { title "Junior" rank 1 }
        J060 { title "Mid" rank 2 }
      }
    }
  }
`;

describe("synthetic → map integration", () => {
  let ast;
  let entities;

  test("DSL parses without error", () => {
    ast = parser.parse(MINI_DSL);
    assert.ok(ast);
    assert.ok(ast.people);
    assert.ok(ast.framework);
  });

  test("distribution keys match framework levels", () => {
    const distKeys = Object.keys(ast.people.distribution);
    const levelIds = ast.framework.levels.map((l) => l.id);
    for (const key of distKeys) {
      assert.ok(
        levelIds.includes(key),
        `distribution key "${key}" not in framework levels`,
      );
    }
  });

  test("generated people have valid levels", () => {
    const rng = createSeededRNG(42);
    entities = buildEntities(ast, rng);
    const levelIds = new Set(ast.framework.levels.map((l) => l.id));
    for (const person of entities.people) {
      assert.ok(
        levelIds.has(person.level),
        `person ${person.name} has level "${person.level}" not in framework`,
      );
    }
  });

  test("rendered roster parses through shared parser", async () => {
    const yaml = await import("yaml");
    const rosterYaml = yaml.stringify({ roster: entities.people });
    const parsed = parseYamlPeople(rosterYaml);
    assert.ok(parsed.length > 0, "parsed roster should have people");
    assert.ok(
      parsed[0].email || parsed[0].name,
      "parsed person should have fields",
    );
  });
});
