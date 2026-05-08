import { describe, test } from "node:test";
import assert from "node:assert";
import { tokenize } from "../src/dsl/tokenizer.js";
import { parse } from "../src/dsl/parser.js";
import { createSeededRNG } from "../src/engine/rng.js";
import { buildEntities } from "../src/engine/entities.js";
import { generateActivity } from "../src/engine/activity.js";
import { assertThrowsMessage } from "@forwardimpact/libharness";
import { MINI_TERRAIN } from "./fixtures/mini-terrain.fixture.js";

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

describe("DSL distribution key validation", () => {
  test("rejects distribution keys that don't match standard levels", () => {
    const source = `
      terrain test {
        domain "Testing"
        org hq { name "HQ" }
        department eng {
          name "Eng"
          parent hq
          headcount 3
          team alpha { name "A" size 3 }
        }
        people {
          count 5
          distribution { L1 50% L2 50% }
        }
        standard {
          levels {
            J040 { title "Junior" rank 1 }
            J060 { title "Mid" rank 2 }
          }
        }
      }
    `;
    assertThrowsMessage(
      () => parse(tokenize(source)),
      /distribution key "L1" does not match any standard level/,
    );
  });

  test("accepts distribution keys matching standard levels", () => {
    const source = `
      terrain test {
        domain "Testing"
        org hq { name "HQ" }
        department eng {
          name "Eng"
          parent hq
          headcount 3
          team alpha { name "A" size 3 }
        }
        people {
          count 5
          distribution { J040 50% J060 50% }
        }
        standard {
          levels {
            J040 { title "Junior" rank 1 }
            J060 { title "Mid" rank 2 }
          }
        }
      }
    `;
    assert.doesNotThrow(() => parse(tokenize(source)));
  });

  test("skips validation when standard has no levels", () => {
    // MINI_TERRAIN uses L1-L4 without standard levels — should still parse
    assert.doesNotThrow(() => parse(tokenize(MINI_TERRAIN)));
  });
});

describe("activity generation", () => {
  describe("deriveInitiatives", () => {
    test("generates initiatives from declining scenario drivers", () => {
      const { activity } = generateFromDsl(MINI_TERRAIN);
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
      const { activity } = generateFromDsl(MINI_TERRAIN);
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
      const { activity } = generateFromDsl(MINI_TERRAIN);
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
      const { activity } = generateFromDsl(MINI_TERRAIN);
      const scorecardIds = new Set(activity.scorecards.map((s) => s.id));
      for (const init of activity.initiatives) {
        assert.ok(
          scorecardIds.has(init.scorecard_id),
          `initiative ${init.id} should reference valid scorecard`,
        );
      }
    });

    test("scorecard has checks derived from driver skills", () => {
      const { activity } = generateFromDsl(MINI_TERRAIN);
      const sc = activity.scorecards[0];
      assert.ok(sc.checks.length > 0, "scorecard should have checks");
      assert.ok(sc.levels.length === 3, "scorecard should have 3 levels");
      assert.strictEqual(sc.type, "LEVEL");
    });
  });

  describe("commentActivity.generate", () => {
    test("generates comment keys for active snapshots", () => {
      const { activity } = generateFromDsl(MINI_TERRAIN);
      assert.ok(
        activity.comment.keys.length > 0,
        "should generate comment keys",
      );
    });

    test("comment keys have required metadata", () => {
      const { activity } = generateFromDsl(MINI_TERRAIN);
      const ck = activity.comment.keys[0];
      assert.ok(ck.snapshot_id);
      assert.ok(ck.email);
      assert.ok(ck.team_id);
      assert.ok(ck.timestamp);
      assert.ok(
        Array.isArray(ck.drivers) && ck.drivers.length >= 1,
        "drivers array present",
      );
      assert.ok(ck.driver_name, "render-time driver_name preserved");
      assert.ok(ck.topic_driver_id, "topic_driver_id present");
      assert.ok(ck.topic_trajectory, "topic_trajectory present");
      assert.ok(ck.scenario_name);
      assert.ok(ck.team_name);
    });

    test("comment keys are stable when upstream RNG drifts", () => {
      // Run once normally.
      const baseline = generateFromDsl(MINI_TERRAIN).activity.comment.keys;

      // Burn an arbitrary amount of entropy from the shared RNG before
      // generateActivity runs, simulating a cross-platform difference in
      // an upstream phase (e.g., generatePeople allocating one more name).
      const ast = parse(tokenize(MINI_TERRAIN));
      const rng = createSeededRNG(ast.seed);
      const { teams, people } = buildEntities(ast, rng);
      for (let i = 0; i < 17; i++) rng.random();
      const drifted = generateActivity(ast, rng, people, teams).comment.keys;

      assert.deepStrictEqual(
        drifted.map((c) => `${c.snapshot_id}|${c.email}`),
        baseline.map((c) => `${c.snapshot_id}|${c.email}`),
        "(snapshot_id, email) pairs must not depend on shared rng state",
      );
    });

    test("declining drivers weighted higher in comment selection", () => {
      const { activity } = generateFromDsl(MINI_TERRAIN);
      // The first snapshot overlaps with the "pressure" scenario (declining)
      const firstSnap = activity.snapshots[0];
      const firstSnapComments = activity.comment.keys.filter(
        (ck) => ck.snapshot_id === firstSnap.snapshot_id,
      );
      if (firstSnapComments.length > 0) {
        const decliningCount = firstSnapComments.filter(
          (ck) => ck.topic_trajectory === "declining",
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
      const { activity } = generateFromDsl(MINI_TERRAIN);
      assert.strictEqual(
        activity.rosterSnapshots.length,
        activity.snapshots.length,
      );
    });

    test("first roster snapshot matches initial roster", () => {
      const { activity } = generateFromDsl(MINI_TERRAIN);
      const first = activity.rosterSnapshots[0];
      assert.strictEqual(first.members, activity.roster.length);
      assert.strictEqual(first.changes.length, 0);
    });

    test("subsequent roster snapshots have changes", () => {
      const { activity } = generateFromDsl(MINI_TERRAIN);
      if (activity.rosterSnapshots.length > 1) {
        const second = activity.rosterSnapshots[1];
        assert.ok(
          second.changes.length > 0,
          "second snapshot should have roster changes",
        );
      }
    });

    test("roster snapshot entries have required fields", () => {
      const { activity } = generateFromDsl(MINI_TERRAIN);
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
      const { activity } = generateFromDsl(MINI_TERRAIN);
      assert.ok(
        activity.projectTeams.length > 0,
        "should generate project teams",
      );
      assert.strictEqual(activity.projectTeams[0].id, "proj_a");
    });

    test("project team members have allocation", () => {
      const { activity } = generateFromDsl(MINI_TERRAIN);
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
