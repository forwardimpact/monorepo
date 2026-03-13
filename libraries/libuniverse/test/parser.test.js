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

describe("parse", () => {
  describe("universe declaration", () => {
    test("parses minimal universe with name", () => {
      const ast = parseDsl("universe acme {}");
      assert.strictEqual(ast.name, "acme");
    });

    test("parses universe with quoted name", () => {
      const ast = parseDsl('universe "Acme Corp" {}');
      assert.strictEqual(ast.name, "Acme Corp");
    });

    test("parses domain", () => {
      const ast = parseDsl('universe test { domain "engineering" }');
      assert.strictEqual(ast.domain, "engineering");
    });

    test("parses industry", () => {
      const ast = parseDsl('universe test { industry "pharma" }');
      assert.strictEqual(ast.industry, "pharma");
    });

    test("parses seed", () => {
      const ast = parseDsl("universe test { seed 123 }");
      assert.strictEqual(ast.seed, 123);
    });

    test("defaults seed to 42", () => {
      const ast = parseDsl("universe test {}");
      assert.strictEqual(ast.seed, 42);
    });

    test("parses domain, industry, and seed together", () => {
      const ast = parseDsl(`universe test {
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
      const ast = parseDsl(`universe test {
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
      const ast = parseDsl(`universe test {
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
      const ast = parseDsl(`universe test {
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
      const ast = parseDsl(`universe test {
        department sub_eng {
          name "Sub Engineering"
          parent eng
        }
      }`);
      assert.strictEqual(ast.departments[0].parent, "eng");
    });

    test("parses teams within departments", () => {
      const ast = parseDsl(`universe test {
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
      const ast = parseDsl(`universe test {
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
      const ast = parseDsl(`universe test {
        people {
          count 100
          names "greek"
        }
      }`);
      assert.strictEqual(ast.people.count, 100);
      assert.strictEqual(ast.people.names, "greek");
    });

    test("parses people with distribution", () => {
      const ast = parseDsl(`universe test {
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
      const ast = parseDsl(`universe test {
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

  describe("project section", () => {
    test("parses project with all fields", () => {
      const ast = parseDsl(`universe test {
        project alpha {
          name "Project Alpha"
          type "greenfield"
          phase "build"
          teams ["frontend", "backend"]
          timeline_start 2024-01
          timeline_end 2024-06
          prose_topic "Cloud migration"
          prose_tone "technical"
        }
      }`);
      assert.strictEqual(ast.projects.length, 1);
      const proj = ast.projects[0];
      assert.strictEqual(proj.id, "alpha");
      assert.strictEqual(proj.name, "Project Alpha");
      assert.strictEqual(proj.type, "greenfield");
      assert.strictEqual(proj.phase, "build");
      assert.deepStrictEqual(proj.teams, ["frontend", "backend"]);
      assert.strictEqual(proj.timeline_start, "2024-01");
      assert.strictEqual(proj.timeline_end, "2024-06");
      assert.strictEqual(proj.prose_topic, "Cloud migration");
      assert.strictEqual(proj.prose_tone, "technical");
    });

    test("parses multiple projects", () => {
      const ast = parseDsl(`universe test {
        project a { name "A" type "greenfield" }
        project b { name "B" type "migration" }
      }`);
      assert.strictEqual(ast.projects.length, 2);
    });
  });

  describe("framework section", () => {
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

  describe("snapshots section", () => {
    test("parses snapshots with quarterly range and account_id", () => {
      const ast = parseDsl(`universe test {
        snapshots {
          quarterly_from 2024-01
          quarterly_to 2024-12
          account_id "acct-123"
        }
      }`);
      assert.strictEqual(ast.snapshots.quarterly_from, "2024-01");
      assert.strictEqual(ast.snapshots.quarterly_to, "2024-12");
      assert.strictEqual(ast.snapshots.account_id, "acct-123");
    });
  });

  describe("scenario section", () => {
    test("parses scenario with affects", () => {
      const ast = parseDsl(`universe test {
        scenario growth {
          name "Growth Phase"
          timerange_start 2024-01
          timerange_end 2024-06
          affect frontend {
            github_commits "high"
            github_prs "medium"
            evidence_skills [javascript, css]
            evidence_floor "foundational"
          }
        }
      }`);
      assert.strictEqual(ast.scenarios.length, 1);
      assert.strictEqual(ast.scenarios[0].id, "growth");
      assert.strictEqual(ast.scenarios[0].name, "Growth Phase");
      assert.strictEqual(ast.scenarios[0].timerange_start, "2024-01");
      assert.strictEqual(ast.scenarios[0].affects.length, 1);
      assert.strictEqual(ast.scenarios[0].affects[0].team_id, "frontend");
      assert.strictEqual(ast.scenarios[0].affects[0].github_commits, "high");
      assert.deepStrictEqual(ast.scenarios[0].affects[0].evidence_skills, [
        "javascript",
        "css",
      ]);
    });

    test("parses scenario affect with dx_drivers", () => {
      const ast = parseDsl(`universe test {
        scenario test_scenario {
          name "Test"
          affect team_a {
            dx_drivers {
              code_review {
                trajectory "improving"
                magnitude 5
              }
            }
          }
        }
      }`);
      const affect = ast.scenarios[0].affects[0];
      assert.strictEqual(affect.dx_drivers.length, 1);
      assert.strictEqual(affect.dx_drivers[0].driver_id, "code_review");
      assert.strictEqual(affect.dx_drivers[0].trajectory, "improving");
      assert.strictEqual(affect.dx_drivers[0].magnitude, 5);
    });
  });

  describe("content section", () => {
    test("parses content block", () => {
      const ast = parseDsl(`universe test {
        content kb {
          articles 10
          article_topics ["testing", "deployment"]
          blogs 5
          faqs 20
          howtos 8
          howto_topics ["setup", "config"]
          reviews 3
          comments 15
          courses 2
          events 4
          personas 6
          persona_levels [junior, senior]
          briefings_per_persona 3
          notes_per_persona 5
        }
      }`);
      assert.strictEqual(ast.content.length, 1);
      const c = ast.content[0];
      assert.strictEqual(c.id, "kb");
      assert.strictEqual(c.articles, 10);
      assert.deepStrictEqual(c.article_topics, ["testing", "deployment"]);
      assert.strictEqual(c.blogs, 5);
      assert.strictEqual(c.faqs, 20);
      assert.strictEqual(c.howtos, 8);
      assert.deepStrictEqual(c.howto_topics, ["setup", "config"]);
      assert.strictEqual(c.reviews, 3);
      assert.strictEqual(c.comments, 15);
      assert.strictEqual(c.courses, 2);
      assert.strictEqual(c.events, 4);
      assert.strictEqual(c.personas, 6);
      assert.deepStrictEqual(c.persona_levels, ["junior", "senior"]);
      assert.strictEqual(c.briefings_per_persona, 3);
      assert.strictEqual(c.notes_per_persona, 5);
    });
  });

  describe("default AST values", () => {
    test("initializes empty arrays and nulls", () => {
      const ast = parseDsl("universe empty {}");
      assert.strictEqual(ast.domain, null);
      assert.strictEqual(ast.industry, null);
      assert.strictEqual(ast.people, null);
      assert.strictEqual(ast.snapshots, null);
      assert.strictEqual(ast.framework, null);
      assert.deepStrictEqual(ast.orgs, []);
      assert.deepStrictEqual(ast.departments, []);
      assert.deepStrictEqual(ast.teams, []);
      assert.deepStrictEqual(ast.projects, []);
      assert.deepStrictEqual(ast.scenarios, []);
      assert.deepStrictEqual(ast.content, []);
    });
  });

  describe("error handling", () => {
    test("throws on missing universe keyword", () => {
      assert.throws(() => parseDsl("domain {}"), /Expected KEYWORD 'universe'/);
    });

    test("throws on missing opening brace", () => {
      assert.throws(() => parseDsl("universe test domain"), /Expected LBRACE/);
    });

    test("throws on unexpected keyword at top level", () => {
      assert.throws(
        () => parseDsl("universe test { manager }"),
        /Unexpected keyword 'manager' at top level/,
      );
    });

    test("throws on unexpected keyword in org", () => {
      assert.throws(
        () => parseDsl("universe test { org x { size 5 } }"),
        /Unexpected 'size' in org/,
      );
    });

    test("throws on unexpected keyword in department", () => {
      assert.throws(
        () => parseDsl("universe test { department x { repos [] } }"),
        /Unexpected 'repos' in department/,
      );
    });

    test("throws on unexpected keyword in team", () => {
      assert.throws(
        () =>
          parseDsl("universe test { department x { team t { headcount 5 } } }"),
        /Unexpected 'headcount' in team/,
      );
    });

    test("throws when expecting number but getting string", () => {
      assert.throws(
        () => parseDsl('universe test { seed "abc" }'),
        /Expected number/,
      );
    });

    test("throws when expecting string but getting number", () => {
      assert.throws(
        () => parseDsl("universe test { domain 123 }"),
        /Expected STRING/,
      );
    });
  });
});
