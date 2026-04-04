import { test, describe } from "node:test";
import assert from "node:assert";

import {
  calculateDriverCoverage,
  getDisciplineSkillIds,
  getLevelRank,
  isSeniorLevel,
} from "../derivation.js";
import {
  makeDiscipline,
  makeLevel,
  makeSeniorLevel,
  makeJuniorLevel,
  makeDrivers,
} from "./derivation-fixtures.js";

describe("calculateDriverCoverage", () => {
  /** Helper to build a minimal job for driver coverage tests */
  function makeJobForDrivers(skillProficiencies, behaviourMaturities) {
    return {
      skillMatrix: Object.entries(skillProficiencies).map(
        ([skillId, proficiency]) => ({ skillId, proficiency }),
      ),
      behaviourProfile: Object.entries(behaviourMaturities).map(
        ([behaviourId, maturity]) => ({ behaviourId, maturity }),
      ),
    };
  }

  test("full coverage when all skills and behaviours meet thresholds", () => {
    const job = makeJobForDrivers(
      {
        coding: "working",
        testing: "practitioner",
        ci_cd: "working",
        monitoring: "working",
        capacity_planning: "expert",
      },
      {
        ownership: "practicing",
        collaboration: "role_modeling",
      },
    );
    const drivers = makeDrivers();

    const results = calculateDriverCoverage({ job, drivers });

    const velocity = results.find((r) => r.driverId === "velocity");
    assert.strictEqual(velocity.skillCoverage, 1);
    assert.strictEqual(velocity.behaviourCoverage, 1);
    assert.strictEqual(velocity.overallScore, 1);
    assert.deepStrictEqual(velocity.missingSkills, []);
    assert.deepStrictEqual(velocity.missingBehaviours, []);
  });

  test("zero coverage when no skills or behaviours meet thresholds", () => {
    const job = makeJobForDrivers(
      {
        coding: "awareness",
        testing: "awareness",
        ci_cd: "awareness",
        monitoring: "awareness",
        capacity_planning: "awareness",
      },
      {
        ownership: "emerging",
        collaboration: "emerging",
      },
    );
    const drivers = makeDrivers();

    const results = calculateDriverCoverage({ job, drivers });

    const velocity = results.find((r) => r.driverId === "velocity");
    assert.strictEqual(velocity.skillCoverage, 0);
    assert.strictEqual(velocity.behaviourCoverage, 0);
    assert.strictEqual(velocity.overallScore, 0);
  });

  test("partial skill coverage", () => {
    const job = makeJobForDrivers(
      {
        coding: "working",
        testing: "foundational", // below "working" threshold
        ci_cd: "working",
      },
      { ownership: "practicing" },
    );
    const drivers = [
      {
        id: "velocity",
        name: "Velocity",
        contributingSkills: ["coding", "testing", "ci_cd"],
        contributingBehaviours: ["ownership"],
      },
    ];

    const results = calculateDriverCoverage({ job, drivers });

    const velocity = results[0];
    // 2 out of 3 skills covered
    assert.ok(Math.abs(velocity.skillCoverage - 2 / 3) < 0.001);
    assert.strictEqual(velocity.behaviourCoverage, 1);
    assert.deepStrictEqual(velocity.coveredSkills, ["coding", "ci_cd"]);
    assert.deepStrictEqual(velocity.missingSkills, ["testing"]);
  });

  test("partial behaviour coverage", () => {
    const job = makeJobForDrivers(
      {
        monitoring: "working",
        capacity_planning: "working",
      },
      {
        collaboration: "practicing",
        ownership: "developing", // below "practicing" threshold
      },
    );
    const drivers = [
      {
        id: "stability",
        name: "Stability",
        contributingSkills: ["monitoring", "capacity_planning"],
        contributingBehaviours: ["collaboration", "ownership"],
      },
    ];

    const results = calculateDriverCoverage({ job, drivers });

    const stability = results[0];
    assert.strictEqual(stability.skillCoverage, 1);
    assert.strictEqual(stability.behaviourCoverage, 0.5);
    assert.deepStrictEqual(stability.coveredBehaviours, ["collaboration"]);
    assert.deepStrictEqual(stability.missingBehaviours, ["ownership"]);
  });

  test("driver with no contributing skills has skill coverage 1", () => {
    const job = makeJobForDrivers({}, { collaboration: "practicing" });
    const drivers = [
      {
        id: "pure_behaviour",
        name: "Pure Behaviour Driver",
        contributingSkills: [],
        contributingBehaviours: ["collaboration"],
      },
    ];

    const results = calculateDriverCoverage({ job, drivers });

    assert.strictEqual(results[0].skillCoverage, 1);
  });

  test("driver with no contributing behaviours has behaviour coverage 1", () => {
    const job = makeJobForDrivers({ coding: "working" }, {});
    const drivers = [
      {
        id: "pure_skill",
        name: "Pure Skill Driver",
        contributingSkills: ["coding"],
        contributingBehaviours: [],
      },
    ];

    const results = calculateDriverCoverage({ job, drivers });

    assert.strictEqual(results[0].behaviourCoverage, 1);
  });

  test("results are sorted by overall score descending", () => {
    const job = makeJobForDrivers(
      {
        coding: "working",
        testing: "working",
        ci_cd: "working",
        monitoring: "awareness",
        capacity_planning: "awareness",
      },
      {
        ownership: "practicing",
        collaboration: "emerging",
      },
    );
    const drivers = makeDrivers();

    const results = calculateDriverCoverage({ job, drivers });

    assert.ok(results[0].overallScore >= results[1].overallScore);
  });

  test("skills not in job are counted as missing", () => {
    const job = makeJobForDrivers(
      { coding: "working" }, // testing and ci_cd not in job
      { ownership: "practicing" },
    );
    const drivers = [
      {
        id: "velocity",
        name: "Velocity",
        contributingSkills: ["coding", "testing", "ci_cd"],
        contributingBehaviours: ["ownership"],
      },
    ];

    const results = calculateDriverCoverage({ job, drivers });

    assert.deepStrictEqual(results[0].missingSkills, ["testing", "ci_cd"]);
  });
});

// =============================================================================
// getDisciplineSkillIds
// =============================================================================

describe("getDisciplineSkillIds", () => {
  test("returns all skill IDs from discipline", () => {
    const discipline = makeDiscipline();
    const ids = getDisciplineSkillIds(discipline);

    assert.deepStrictEqual(ids, [
      "coding",
      "testing",
      "ci_cd",
      "monitoring",
      "documentation",
    ]);
  });

  test("returns empty array for discipline with no skills", () => {
    const discipline = makeDiscipline({
      coreSkills: [],
      supportingSkills: [],
      broadSkills: [],
    });
    const ids = getDisciplineSkillIds(discipline);
    assert.deepStrictEqual(ids, []);
  });

  test("handles missing skill arrays gracefully", () => {
    const discipline = { id: "minimal" };
    const ids = getDisciplineSkillIds(discipline);
    assert.deepStrictEqual(ids, []);
  });

  test("preserves order: core, supporting, broad", () => {
    const discipline = makeDiscipline({
      coreSkills: ["a"],
      supportingSkills: ["b"],
      broadSkills: ["c"],
    });
    const ids = getDisciplineSkillIds(discipline);
    assert.deepStrictEqual(ids, ["a", "b", "c"]);
  });
});

// =============================================================================
// getLevelRank
// =============================================================================

describe("getLevelRank", () => {
  test("returns ordinalRank from level", () => {
    const level = makeLevel({ ordinalRank: 3 });
    assert.strictEqual(getLevelRank(level), 3);
  });

  test("returns correct rank for junior level", () => {
    const level = makeJuniorLevel();
    assert.strictEqual(getLevelRank(level), 1);
  });

  test("returns correct rank for senior level", () => {
    const level = makeSeniorLevel();
    assert.strictEqual(getLevelRank(level), 5);
  });
});

// =============================================================================
// isSeniorLevel
// =============================================================================

describe("isSeniorLevel", () => {
  test("returns false for junior level (rank 1)", () => {
    const level = makeJuniorLevel();
    assert.strictEqual(isSeniorLevel(level), false);
  });

  test("returns false for mid level (rank 3)", () => {
    const level = makeLevel();
    assert.strictEqual(isSeniorLevel(level), false);
  });

  test("returns true for staff level (rank 5)", () => {
    const level = makeSeniorLevel();
    assert.strictEqual(isSeniorLevel(level), true);
  });

  test("returns false for rank 4 (below threshold of 5)", () => {
    const level = makeLevel({ ordinalRank: 4 });
    assert.strictEqual(isSeniorLevel(level), false);
  });

  test("returns true for rank exactly at threshold (5)", () => {
    const level = makeLevel({ ordinalRank: 5 });
    assert.strictEqual(isSeniorLevel(level), true);
  });

  test("returns true for rank above threshold (6)", () => {
    const level = makeLevel({ ordinalRank: 6 });
    assert.strictEqual(isSeniorLevel(level), true);
  });
});
