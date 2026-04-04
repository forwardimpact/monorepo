import { describe, test } from "node:test";
import assert from "node:assert";
import { tokenize } from "../dsl/tokenizer.js";
import { parse } from "../dsl/parser.js";

/**
 * Helper: tokenize then parse a DSL source string.
 * @param {string} source
 * @returns {import('../dsl/parser.js').UniverseAST}
 */
function parseDsl(source) {
  return parse(tokenize(source));
}

describe("parse — framework section", () => {
  test("parses proficiencies and maturities as arrays", () => {
    const ast = parseDsl(`universe test {
      framework {
        proficiencies [awareness, foundational, working, practitioner, expert]
        maturities [emerging, developing, practicing, role_modeling, exemplifying]
      }
    }`);
    assert.deepStrictEqual(ast.framework.proficiencies, [
      "awareness",
      "foundational",
      "working",
      "practitioner",
      "expert",
    ]);
    assert.deepStrictEqual(ast.framework.maturities, [
      "emerging",
      "developing",
      "practicing",
      "role_modeling",
      "exemplifying",
    ]);
  });

  test("parses stages as array", () => {
    const ast = parseDsl(`universe test {
      framework {
        stages [discovery, delivery, optimization]
      }
    }`);
    assert.deepStrictEqual(ast.framework.stages, [
      "discovery",
      "delivery",
      "optimization",
    ]);
  });

  test("parses levels with title, rank, experience", () => {
    const ast = parseDsl(`universe test {
      framework {
        levels {
          J040 {
            title "Junior Engineer"
            rank 1
            experience "0-2 years"
          }
          J050 {
            title "Engineer"
            roleTitle "Team Lead"
            rank 2
            experience "2-5 years"
          }
        }
      }
    }`);
    assert.strictEqual(ast.framework.levels.length, 2);
    assert.strictEqual(ast.framework.levels[0].id, "J040");
    assert.strictEqual(
      ast.framework.levels[0].professionalTitle,
      "Junior Engineer",
    );
    assert.strictEqual(ast.framework.levels[0].rank, 1);
    assert.strictEqual(ast.framework.levels[0].experience, "0-2 years");
    assert.strictEqual(ast.framework.levels[1].managementTitle, "Team Lead");
  });

  test("parses capabilities with skills", () => {
    const ast = parseDsl(`universe test {
      framework {
        capabilities {
          coding {
            name "Coding"
            skills [javascript, python, go]
          }
        }
      }
    }`);
    assert.strictEqual(ast.framework.capabilities.length, 1);
    assert.strictEqual(ast.framework.capabilities[0].id, "coding");
    assert.strictEqual(ast.framework.capabilities[0].name, "Coding");
    assert.deepStrictEqual(ast.framework.capabilities[0].skills, [
      "javascript",
      "python",
      "go",
    ]);
  });

  test("parses behaviours", () => {
    const ast = parseDsl(`universe test {
      framework {
        behaviours {
          collaboration {
            name "Collaboration"
          }
          leadership {
            name "Leadership"
          }
        }
      }
    }`);
    assert.strictEqual(ast.framework.behaviours.length, 2);
    assert.strictEqual(ast.framework.behaviours[0].id, "collaboration");
    assert.strictEqual(ast.framework.behaviours[0].name, "Collaboration");
  });

  test("parses disciplines with tiers and tracks", () => {
    const ast = parseDsl(`universe test {
      framework {
        disciplines {
          backend_dev {
            roleTitle "Backend Developer"
            specialization "Backend"
            isProfessional true
            core [api_design, databases]
            supporting [testing]
            broad [observability]
            validTracks [null, platform]
          }
        }
      }
    }`);
    const disc = ast.framework.disciplines[0];
    assert.strictEqual(disc.id, "backend_dev");
    assert.strictEqual(disc.roleTitle, "Backend Developer");
    assert.strictEqual(disc.specialization, "Backend");
    assert.strictEqual(disc.isProfessional, true);
    assert.deepStrictEqual(disc.core, ["api_design", "databases"]);
    assert.deepStrictEqual(disc.supporting, ["testing"]);
    assert.deepStrictEqual(disc.broad, ["observability"]);
    assert.deepStrictEqual(disc.validTracks, [null, "platform"]);
  });

  test("parses tracks", () => {
    const ast = parseDsl(`universe test {
      framework {
        tracks {
          platform {
            name "Platform"
          }
        }
      }
    }`);
    assert.strictEqual(ast.framework.tracks.length, 1);
    assert.strictEqual(ast.framework.tracks[0].id, "platform");
    assert.strictEqual(ast.framework.tracks[0].name, "Platform");
  });

  test("parses drivers with skills and behaviours", () => {
    const ast = parseDsl(`universe test {
      framework {
        drivers {
          code_quality {
            name "Code Quality"
            skills [testing, code_review]
            behaviours [collaboration]
          }
        }
      }
    }`);
    const driver = ast.framework.drivers[0];
    assert.strictEqual(driver.id, "code_quality");
    assert.strictEqual(driver.name, "Code Quality");
    assert.deepStrictEqual(driver.skills, ["testing", "code_review"]);
    assert.deepStrictEqual(driver.behaviours, ["collaboration"]);
  });

  test("initializes empty framework arrays by default", () => {
    const ast = parseDsl("universe test { framework {} }");
    assert.deepStrictEqual(ast.framework.proficiencies, []);
    assert.deepStrictEqual(ast.framework.maturities, []);
    assert.deepStrictEqual(ast.framework.levels, []);
    assert.deepStrictEqual(ast.framework.capabilities, []);
    assert.deepStrictEqual(ast.framework.behaviours, []);
    assert.deepStrictEqual(ast.framework.disciplines, []);
    assert.deepStrictEqual(ast.framework.tracks, []);
    assert.deepStrictEqual(ast.framework.drivers, []);
    assert.deepStrictEqual(ast.framework.stages, []);
  });
});
