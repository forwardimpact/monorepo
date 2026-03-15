import { describe, test } from "node:test";
import assert from "node:assert";
import { tokenize } from "../dsl/tokenizer.js";
import { parse } from "../dsl/parser.js";
import { createSeededRNG } from "../engine/rng.js";
import { buildEntities } from "../engine/entities.js";
import { generateActivity } from "../engine/activity.js";

/**
 * Helper: parse DSL, build entities, generate activity.
 * @param {string} source
 * @returns {object}
 */
function generateFromDsl(source) {
  const ast = parse(tokenize(source));
  const rng = createSeededRNG(ast.seed);
  const { orgs, departments, teams, people, projects } = buildEntities(
    ast,
    rng,
  );
  const activity = generateActivity(ast, rng, people, teams);
  return { ast, orgs, departments, teams, people, projects, activity };
}

const MINI_UNIVERSE = `universe test {
  domain "test.example"
  seed 42

  org hq { name "HQ" location "NY" }

  department eng {
    name "Engineering"
    parent hq
    headcount 10

    team alpha {
      name "Alpha Team"
      size 5
      manager @zeus
      repos ["repo-a"]
    }

    team beta {
      name "Beta Team"
      size 5
      manager @hera
      repos ["repo-b"]
    }
  }

  people {
    count 10
    names "greek_mythology"
    distribution {
      L1 40%
      L2 30%
      L3 20%
      L4 10%
    }
    disciplines {
      software_engineering 80%
      data_engineering 20%
    }
  }

  project proj_a {
    name "Project Alpha"
    type "platform"
    teams [alpha, beta]
    timeline_start 2024-06
    timeline_end 2025-06
  }

  snapshots {
    quarterly_from 2024-07
    quarterly_to 2025-07
    account_id "acct_test"
    comments_per_snapshot 5
  }

  scenario pressure {
    name "Release Pressure"
    timerange_start 2024-07
    timerange_end 2025-01

    affect alpha {
      github_commits "spike"
      github_prs "elevated"
      dx_drivers {
        deep_work { trajectory "declining" magnitude -6 }
        ease_of_release { trajectory "declining" magnitude -4 }
      }
      evidence_skills [architecture_design]
      evidence_floor "working"
    }
  }

  scenario improvement {
    name "Culture Improvement"
    timerange_start 2025-01
    timerange_end 2025-06

    affect beta {
      github_commits "moderate"
      github_prs "moderate"
      dx_drivers {
        learning_culture { trajectory "rising" magnitude 5 }
        connectedness { trajectory "rising" magnitude 3 }
      }
      evidence_skills [team_collaboration]
      evidence_floor "foundational"
    }
  }

  framework {
    proficiencies [awareness, foundational, working, practitioner, expert]
    drivers {
      deep_work {
        name "Deep Work"
        skills [architecture_design, data_integration]
        behaviours []
      }
      ease_of_release {
        name "Ease of Release"
        skills [change_management, sre_practices]
        behaviours []
      }
      learning_culture {
        name "Learning Culture"
        skills [mentoring, technical_writing]
        behaviours []
      }
      connectedness {
        name "Connectedness"
        skills [team_collaboration, stakeholder_management]
        behaviours []
      }
    }
  }
}`;

describe("activity generation", () => {
  describe("deriveInitiatives", () => {
    test("generates initiatives from declining scenario drivers", () => {
      const { activity } = generateFromDsl(MINI_UNIVERSE);
      const initiatives = activity.initiatives;
      assert.ok(
        initiatives.length > 0,
        "should generate at least one initiative",
      );

      // Declining deep_work with magnitude -6 should produce priority 0
      const deepWorkInit = initiatives.find(
        (i) => i._driver_id === "deep_work",
      );
      assert.ok(deepWorkInit, "should have initiative for deep_work driver");
      assert.strictEqual(deepWorkInit.priority, 0);
      assert.ok(deepWorkInit.name.includes("Alpha Team"));
      assert.ok(deepWorkInit.scorecard_id);
      assert.ok(deepWorkInit.owner.email);
    });

    test("generates initiatives from rising scenario drivers", () => {
      const { activity } = generateFromDsl(MINI_UNIVERSE);
      const risingInit = activity.initiatives.find(
        (i) => i._driver_id === "learning_culture",
      );
      assert.ok(risingInit, "should have initiative for rising driver");
      assert.ok(
        risingInit.priority >= 3,
        "rising initiatives should have lower priority",
      );
      assert.ok(risingInit.name.includes("Sustain"));
    });

    test("initiative has all required GetDX API fields", () => {
      const { activity } = generateFromDsl(MINI_UNIVERSE);
      const init = activity.initiatives[0];
      assert.ok(init.id);
      assert.ok(init.name);
      assert.ok(init.description);
      assert.ok(init.scorecard_id);
      assert.ok(init.scorecard_name);
      assert.strictEqual(typeof init.priority, "number");
      assert.strictEqual(typeof init.published, "boolean");
      assert.ok(init.complete_by);
      assert.strictEqual(typeof init.percentage_complete, "number");
      assert.strictEqual(typeof init.passed_checks, "number");
      assert.strictEqual(typeof init.total_checks, "number");
      assert.strictEqual(typeof init.remaining_dev_days, "number");
      assert.ok(init.owner.id);
      assert.ok(init.owner.name);
      assert.ok(init.owner.email);
      assert.ok(Array.isArray(init.tags));
    });
  });

  describe("deriveScorecards", () => {
    test("generates a scorecard per initiative", () => {
      const { activity } = generateFromDsl(MINI_UNIVERSE);
      const scorecardIds = new Set(activity.scorecards.map((s) => s.id));
      for (const init of activity.initiatives) {
        assert.ok(
          scorecardIds.has(init.scorecard_id),
          `initiative ${init.id} should reference valid scorecard`,
        );
      }
    });

    test("scorecard has checks derived from driver skills", () => {
      const { activity } = generateFromDsl(MINI_UNIVERSE);
      const sc = activity.scorecards[0];
      assert.ok(sc.checks.length > 0, "scorecard should have checks");
      assert.ok(sc.levels.length === 3, "scorecard should have 3 levels");
      assert.strictEqual(sc.type, "LEVEL");
    });
  });

  describe("generateCommentKeys", () => {
    test("generates comment keys for active snapshots", () => {
      const { activity } = generateFromDsl(MINI_UNIVERSE);
      assert.ok(
        activity.commentKeys.length > 0,
        "should generate comment keys",
      );
    });

    test("comment keys have required metadata", () => {
      const { activity } = generateFromDsl(MINI_UNIVERSE);
      const ck = activity.commentKeys[0];
      assert.ok(ck.snapshot_id);
      assert.ok(ck.email);
      assert.ok(ck.team_id);
      assert.ok(ck.timestamp);
      assert.ok(ck.driver_id);
      assert.ok(ck.driver_name);
      assert.ok(ck.trajectory);
      assert.strictEqual(typeof ck.magnitude, "number");
      assert.ok(ck.scenario_name);
      assert.ok(ck.team_name);
    });

    test("declining drivers weighted higher in comment selection", () => {
      const { activity } = generateFromDsl(MINI_UNIVERSE);
      // The first snapshot overlaps with the "pressure" scenario (declining)
      const firstSnap = activity.snapshots[0];
      const firstSnapComments = activity.commentKeys.filter(
        (ck) => ck.snapshot_id === firstSnap.snapshot_id,
      );
      if (firstSnapComments.length > 0) {
        const decliningCount = firstSnapComments.filter(
          (ck) => ck.trajectory === "declining",
        ).length;
        assert.ok(
          decliningCount >= firstSnapComments.length * 0.5,
          "declining comments should be weighted higher",
        );
      }
    });
  });

  describe("generateRosterSnapshots", () => {
    test("generates one roster snapshot per survey snapshot", () => {
      const { activity } = generateFromDsl(MINI_UNIVERSE);
      assert.strictEqual(
        activity.rosterSnapshots.length,
        activity.snapshots.length,
      );
    });

    test("first roster snapshot matches initial roster", () => {
      const { activity } = generateFromDsl(MINI_UNIVERSE);
      const first = activity.rosterSnapshots[0];
      assert.strictEqual(first.members, activity.roster.length);
      assert.strictEqual(first.changes.length, 0);
    });

    test("subsequent roster snapshots have changes", () => {
      const { activity } = generateFromDsl(MINI_UNIVERSE);
      if (activity.rosterSnapshots.length > 1) {
        const second = activity.rosterSnapshots[1];
        assert.ok(
          second.changes.length > 0,
          "second snapshot should have roster changes",
        );
      }
    });

    test("roster snapshot entries have required fields", () => {
      const { activity } = generateFromDsl(MINI_UNIVERSE);
      const entry = activity.rosterSnapshots[0].roster[0];
      assert.ok(entry.email);
      assert.ok(entry.name);
      assert.ok(entry.discipline);
      assert.ok(entry.level);
      assert.ok(entry.team_id);
    });
  });

  describe("deriveProjectTeams", () => {
    test("generates project teams from DSL projects", () => {
      const { activity } = generateFromDsl(MINI_UNIVERSE);
      assert.ok(
        activity.projectTeams.length > 0,
        "should generate project teams",
      );
      assert.strictEqual(activity.projectTeams[0].id, "proj_a");
    });

    test("project team members have allocation", () => {
      const { activity } = generateFromDsl(MINI_UNIVERSE);
      const pt = activity.projectTeams[0];
      assert.ok(pt.members.length > 0);
      for (const m of pt.members) {
        assert.ok(m.email);
        assert.ok(m.job);
        assert.strictEqual(typeof m.allocation, "number");
        assert.ok(m.allocation > 0 && m.allocation <= 1.0);
      }
    });
  });
});
