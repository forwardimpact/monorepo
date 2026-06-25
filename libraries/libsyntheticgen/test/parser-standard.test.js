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

describe("parse — standard section", () => {
  test("parses proficiencies and maturities as arrays", () => {
    const ast = parseDsl(`terrain test {
      standard {
        proficiencies [awareness, foundational, working, practitioner, expert]
        maturities [emerging, developing, practicing, role-modeling, exemplifying]
      }
    }`);
    assert.deepStrictEqual(ast.standard.proficiencies, [
      "awareness",
      "foundational",
      "working",
      "practitioner",
      "expert",
    ]);
    assert.deepStrictEqual(ast.standard.maturities, [
      "emerging",
      "developing",
      "practicing",
      "role-modeling",
      "exemplifying",
    ]);
  });

  test("parses levels with title, rank, experience", () => {
    const ast = parseDsl(`terrain test {
      standard {
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
    assert.strictEqual(ast.standard.levels.length, 2);
    assert.strictEqual(ast.standard.levels[0].id, "J040");
    assert.strictEqual(
      ast.standard.levels[0].professionalTitle,
      "Junior Engineer",
    );
    assert.strictEqual(ast.standard.levels[0].rank, 1);
    assert.strictEqual(ast.standard.levels[0].experience, "0-2 years");
    assert.strictEqual(ast.standard.levels[1].managementTitle, "Team Lead");
  });

  test("parses capabilities with skills", () => {
    const ast = parseDsl(`terrain test {
      standard {
        capabilities {
          coding {
            name "Coding"
            skills [javascript, python, go]
          }
        }
      }
    }`);
    assert.strictEqual(ast.standard.capabilities.length, 1);
    assert.strictEqual(ast.standard.capabilities[0].id, "coding");
    assert.strictEqual(ast.standard.capabilities[0].name, "Coding");
    assert.deepStrictEqual(ast.standard.capabilities[0].skills, [
      "javascript",
      "python",
      "go",
    ]);
  });

  test("parses behaviours", () => {
    const ast = parseDsl(`terrain test {
      standard {
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
    assert.strictEqual(ast.standard.behaviours.length, 2);
    assert.strictEqual(ast.standard.behaviours[0].id, "collaboration");
    assert.strictEqual(ast.standard.behaviours[0].name, "Collaboration");
  });

  test("parses disciplines with tiers and tracks", () => {
    const ast = parseDsl(`terrain test {
      standard {
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
    const disc = ast.standard.disciplines[0];
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
    const ast = parseDsl(`terrain test {
      standard {
        tracks {
          platform {
            name "Platform"
          }
        }
      }
    }`);
    assert.strictEqual(ast.standard.tracks.length, 1);
    assert.strictEqual(ast.standard.tracks[0].id, "platform");
    assert.strictEqual(ast.standard.tracks[0].name, "Platform");
  });

  test("parses drivers with skills and behaviours", () => {
    const ast = parseDsl(`terrain test {
      standard {
        drivers {
          code_quality {
            name "Code Quality"
            skills [testing, code-review]
            behaviours [collaboration]
          }
        }
      }
    }`);
    const driver = ast.standard.drivers[0];
    assert.strictEqual(driver.id, "code_quality");
    assert.strictEqual(driver.name, "Code Quality");
    assert.deepStrictEqual(driver.skills, ["testing", "code-review"]);
    assert.deepStrictEqual(driver.behaviours, ["collaboration"]);
  });

  test("initializes empty standard arrays by default", () => {
    const ast = parseDsl("terrain test { standard {} }");
    assert.deepStrictEqual(ast.standard.proficiencies, []);
    assert.deepStrictEqual(ast.standard.maturities, []);
    assert.deepStrictEqual(ast.standard.levels, []);
    assert.deepStrictEqual(ast.standard.capabilities, []);
    assert.deepStrictEqual(ast.standard.behaviours, []);
    assert.deepStrictEqual(ast.standard.disciplines, []);
    assert.deepStrictEqual(ast.standard.tracks, []);
    assert.deepStrictEqual(ast.standard.drivers, []);
  });
});
