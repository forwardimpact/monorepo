import { describe, test } from "node:test";
import assert from "node:assert";
import { tokenize } from "../src/dsl/tokenizer.js";
import { parse } from "../src/dsl/parser.js";

/**
 * Helper: tokenize then parse a DSL source string.
 * @param {string} source
 * @returns {import('../dsl/parser.js').TerrainAST}
 */
function parseDsl(source) {
  return parse(tokenize(source));
}

describe("parse — structure", () => {
  describe("terrain declaration", () => {
    test("parses minimal terrain with name", () => {
      const ast = parseDsl("terrain acme {}");
      assert.strictEqual(ast.name, "acme");
    });

    test("parses terrain with quoted name", () => {
      const ast = parseDsl('terrain "Acme Corp" {}');
      assert.strictEqual(ast.name, "Acme Corp");
    });

    test("parses domain", () => {
      const ast = parseDsl('terrain test { domain "engineering" }');
      assert.strictEqual(ast.domain, "engineering");
    });

    test("parses industry", () => {
      const ast = parseDsl('terrain test { industry "pharma" }');
      assert.strictEqual(ast.industry, "pharma");
    });

    test("parses seed", () => {
      const ast = parseDsl("terrain test { seed 123 }");
      assert.strictEqual(ast.seed, 123);
    });

    test("defaults seed to 42", () => {
      const ast = parseDsl("terrain test {}");
      assert.strictEqual(ast.seed, 42);
    });

    test("parses domain, industry, and seed together", () => {
      const ast = parseDsl(`terrain test {
        domain "engineering"
        industry "tech"
        seed 99
      }`);
      assert.strictEqual(ast.domain, "engineering");
      assert.strictEqual(ast.industry, "tech");
      assert.strictEqual(ast.seed, 99);
    });
  });

  describe("org structure", () => {
    test("parses single org", () => {
      const ast = parseDsl(`terrain test {
        org acme {
          name "Acme Corp"
          location "New York"
        }
      }`);
      assert.strictEqual(ast.orgs.length, 1);
      assert.strictEqual(ast.orgs[0].id, "acme");
      assert.strictEqual(ast.orgs[0].name, "Acme Corp");
      assert.strictEqual(ast.orgs[0].location, "New York");
    });

    test("parses multiple orgs", () => {
      const ast = parseDsl(`terrain test {
        org alpha { name "Alpha" }
        org beta { name "Beta" }
      }`);
      assert.strictEqual(ast.orgs.length, 2);
      assert.strictEqual(ast.orgs[0].id, "alpha");
      assert.strictEqual(ast.orgs[1].id, "beta");
    });
  });

  describe("department and team structures", () => {
    test("parses department with name and headcount", () => {
      const ast = parseDsl(`terrain test {
        department eng {
          name "Engineering"
          headcount 50
        }
      }`);
      assert.strictEqual(ast.departments.length, 1);
      assert.strictEqual(ast.departments[0].id, "eng");
      assert.strictEqual(ast.departments[0].name, "Engineering");
      assert.strictEqual(ast.departments[0].headcount, 50);
    });

    test("parses department with parent", () => {
      const ast = parseDsl(`terrain test {
        department sub_eng {
          name "Sub Engineering"
          parent eng
        }
      }`);
      assert.strictEqual(ast.departments[0].parent, "eng");
    });

    test("parses teams within departments", () => {
      const ast = parseDsl(`terrain test {
        department eng {
          name "Engineering"
          team frontend {
            name "Frontend Team"
            size 5
            manager @apollo
            repos ["ui-repo", "design-system"]
          }
        }
      }`);
      assert.strictEqual(ast.teams.length, 1);
      assert.strictEqual(ast.teams[0].id, "frontend");
      assert.strictEqual(ast.teams[0].department, "eng");
      assert.strictEqual(ast.teams[0].name, "Frontend Team");
      assert.strictEqual(ast.teams[0].size, 5);
      assert.strictEqual(ast.teams[0].manager, "apollo");
      assert.deepStrictEqual(ast.teams[0].repos, ["ui-repo", "design-system"]);
    });

    test("parses multiple teams in a department", () => {
      const ast = parseDsl(`terrain test {
        department eng {
          name "Engineering"
          team alpha { name "Alpha" size 3 }
          team beta { name "Beta" size 4 }
        }
      }`);
      assert.strictEqual(ast.teams.length, 2);
      assert.strictEqual(ast.teams[0].id, "alpha");
      assert.strictEqual(ast.teams[1].id, "beta");
    });
  });

  describe("people section", () => {
    test("parses people with count and names", () => {
      const ast = parseDsl(`terrain test {
        people {
          count 100
          names "greek"
        }
      }`);
      assert.strictEqual(ast.people.count, 100);
      assert.strictEqual(ast.people.names, "greek");
    });

    test("parses people with distribution", () => {
      const ast = parseDsl(`terrain test {
        people {
          count 50
          names "greek"
          distribution {
            junior 30%
            mid 50%
            senior 20%
          }
        }
      }`);
      assert.deepStrictEqual(ast.people.distribution, {
        junior: 30,
        mid: 50,
        senior: 20,
      });
    });

    test("parses people with disciplines", () => {
      const ast = parseDsl(`terrain test {
        people {
          count 50
          names "greek"
          disciplines {
            backend 40%
            frontend 30%
            devops 30%
          }
        }
      }`);
      assert.deepStrictEqual(ast.people.disciplines, {
        backend: 40,
        frontend: 30,
        devops: 30,
      });
    });
  });
});
