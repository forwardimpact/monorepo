import { test, describe } from "node:test";
import assert from "node:assert";

import {
  deriveBehaviourMaturity,
  deriveSkillMatrix,
  deriveBehaviourProfile,
} from "../derivation.js";
import {
  makeDiscipline,
  makeManagementDiscipline,
  makeLevel,
  makeSeniorLevel,
  makeTrack,
  makeSkills,
  makeBehaviours,
} from "./derivation-fixtures.js";

describe("deriveBehaviourMaturity", () => {
  test("returns base maturity without modifiers", () => {
    const discipline = makeDiscipline({ behaviourModifiers: {} });
    const level = makeLevel(); // baseBehaviourMaturity=developing

    const result = deriveBehaviourMaturity({
      discipline,
      level,
      behaviourId: "collaboration",
    });
    assert.strictEqual(result, "developing");
  });

  test("applies discipline behaviour modifier", () => {
    const discipline = makeDiscipline({
      behaviourModifiers: { collaboration: 1 },
    });
    const level = makeLevel(); // baseBehaviourMaturity=developing(1)

    const result = deriveBehaviourMaturity({
      discipline,
      level,
      behaviourId: "collaboration",
    });
    assert.strictEqual(result, "practicing"); // 1 + 1 = 2 = practicing
  });

  test("applies track behaviour modifier", () => {
    const discipline = makeDiscipline({ behaviourModifiers: {} });
    const level = makeLevel();
    const track = makeTrack({ behaviourModifiers: { ownership: 1 } });

    const result = deriveBehaviourMaturity({
      discipline,
      level,
      track,
      behaviourId: "ownership",
    });
    assert.strictEqual(result, "practicing"); // developing(1) + 1 = 2
  });

  test("combines discipline and track modifiers additively", () => {
    const discipline = makeDiscipline({
      behaviourModifiers: { collaboration: 1 },
    });
    const level = makeLevel(); // developing(1)
    const track = makeTrack({ behaviourModifiers: { collaboration: 1 } });

    const result = deriveBehaviourMaturity({
      discipline,
      level,
      track,
      behaviourId: "collaboration",
    });
    assert.strictEqual(result, "role_modeling"); // 1 + 1 + 1 = 3 = role_modeling
  });

  test("clamps to exemplifying at upper bound", () => {
    const discipline = makeDiscipline({
      behaviourModifiers: { collaboration: 2 },
    });
    const level = makeSeniorLevel(); // practicing(2)
    const track = makeTrack({ behaviourModifiers: { collaboration: 2 } });

    const result = deriveBehaviourMaturity({
      discipline,
      level,
      track,
      behaviourId: "collaboration",
    });
    assert.strictEqual(result, "exemplifying"); // 2 + 2 + 2 = 6, clamped to 4
  });

  test("clamps to emerging at lower bound", () => {
    const discipline = makeDiscipline({
      behaviourModifiers: { collaboration: -3 },
    });
    const level = makeLevel(); // developing(1)

    const result = deriveBehaviourMaturity({
      discipline,
      level,
      behaviourId: "collaboration",
    });
    assert.strictEqual(result, "emerging"); // 1 + (-3) = -2, clamped to 0
  });

  test("handles null track", () => {
    const discipline = makeDiscipline({ behaviourModifiers: {} });
    const level = makeLevel();

    const result = deriveBehaviourMaturity({
      discipline,
      level,
      track: null,
      behaviourId: "ownership",
    });
    assert.strictEqual(result, "developing");
  });

  test("returns base maturity for behaviour with no modifiers anywhere", () => {
    const discipline = makeDiscipline({ behaviourModifiers: {} });
    const level = makeLevel();
    const track = makeTrack({ behaviourModifiers: {} });

    const result = deriveBehaviourMaturity({
      discipline,
      level,
      track,
      behaviourId: "ownership",
    });
    assert.strictEqual(result, "developing");
  });
});

// =============================================================================
// deriveSkillMatrix
// =============================================================================

describe("deriveSkillMatrix", () => {
  test("includes all discipline skills", () => {
    const discipline = makeDiscipline();
    const level = makeLevel();
    const skills = makeSkills();

    const matrix = deriveSkillMatrix({ discipline, level, skills });

    const skillIds = matrix.map((e) => e.skillId);
    assert.ok(skillIds.includes("coding"));
    assert.ok(skillIds.includes("testing"));
    assert.ok(skillIds.includes("ci_cd"));
    assert.ok(skillIds.includes("monitoring"));
    assert.ok(skillIds.includes("documentation"));
  });

  test("excludes skills not in discipline and not track-added", () => {
    const discipline = makeDiscipline();
    const level = makeLevel();
    const skills = makeSkills();

    const matrix = deriveSkillMatrix({ discipline, level, skills });

    const skillIds = matrix.map((e) => e.skillId);
    assert.ok(!skillIds.includes("capacity_planning"));
    assert.ok(!skillIds.includes("load_balancing"));
  });

  test("includes track-added skills with positive modifier", () => {
    const discipline = makeDiscipline();
    const level = makeLevel();
    const track = makeTrack({ skillModifiers: { scale: 1 } });
    const skills = makeSkills();

    const matrix = deriveSkillMatrix({ discipline, level, track, skills });

    const skillIds = matrix.map((e) => e.skillId);
    assert.ok(skillIds.includes("capacity_planning"));
    assert.ok(skillIds.includes("load_balancing"));
  });

  test("track-added skills have type 'track'", () => {
    const discipline = makeDiscipline();
    const level = makeLevel();
    const track = makeTrack({ skillModifiers: { scale: 1 } });
    const skills = makeSkills();

    const matrix = deriveSkillMatrix({ discipline, level, track, skills });

    const capPlanning = matrix.find((e) => e.skillId === "capacity_planning");
    assert.strictEqual(capPlanning.type, "track");
  });

  test("sorts by type order then name", () => {
    const discipline = makeDiscipline();
    const level = makeLevel();
    const skills = makeSkills();

    const matrix = deriveSkillMatrix({ discipline, level, skills });

    // Primary skills should come first
    const types = matrix.map((e) => e.type);
    const primaryLastIndex = types.lastIndexOf("primary");
    const secondaryFirstIndex = types.indexOf("secondary");
    const broadFirstIndex = types.indexOf("broad");

    if (secondaryFirstIndex !== -1) {
      assert.ok(primaryLastIndex < secondaryFirstIndex);
    }
    if (broadFirstIndex !== -1 && secondaryFirstIndex !== -1) {
      assert.ok(types.lastIndexOf("secondary") < broadFirstIndex);
    }
  });

  test("includes proficiency descriptions", () => {
    const discipline = makeDiscipline();
    const level = makeLevel();
    const skills = makeSkills();

    const matrix = deriveSkillMatrix({ discipline, level, skills });

    const coding = matrix.find((e) => e.skillId === "coding");
    assert.strictEqual(coding.proficiency, "working");
    assert.strictEqual(coding.proficiencyDescription, "Writes production code");
  });

  test("handles empty skills array", () => {
    const discipline = makeDiscipline();
    const level = makeLevel();

    const matrix = deriveSkillMatrix({ discipline, level, skills: [] });
    assert.strictEqual(matrix.length, 0);
  });

  test("sets isHumanOnly from skill data", () => {
    const discipline = makeManagementDiscipline();
    const level = makeLevel();
    const skills = makeSkills();

    const matrix = deriveSkillMatrix({ discipline, level, skills });

    const peopleMgmt = matrix.find((e) => e.skillId === "people_management");
    assert.strictEqual(peopleMgmt.isHumanOnly, true);

    const deliveryMgmt = matrix.find((e) => e.skillId === "delivery_mgmt");
    assert.strictEqual(deliveryMgmt.isHumanOnly, false);
  });
});

// =============================================================================
// deriveBehaviourProfile
// =============================================================================

describe("deriveBehaviourProfile", () => {
  test("derives maturity for all behaviours", () => {
    const discipline = makeDiscipline({ behaviourModifiers: {} });
    const level = makeLevel();
    const behaviours = makeBehaviours();

    const profile = deriveBehaviourProfile({ discipline, level, behaviours });

    assert.strictEqual(profile.length, 2);
    const collab = profile.find((e) => e.behaviourId === "collaboration");
    assert.strictEqual(collab.maturity, "developing");
  });

  test("includes maturity descriptions", () => {
    const discipline = makeDiscipline({ behaviourModifiers: {} });
    const level = makeLevel();
    const behaviours = makeBehaviours();

    const profile = deriveBehaviourProfile({ discipline, level, behaviours });

    const collab = profile.find((e) => e.behaviourId === "collaboration");
    assert.strictEqual(collab.maturityDescription, "Contributes to team");
  });

  test("sorts by name alphabetically", () => {
    const discipline = makeDiscipline({ behaviourModifiers: {} });
    const level = makeLevel();
    const behaviours = makeBehaviours();

    const profile = deriveBehaviourProfile({ discipline, level, behaviours });

    assert.strictEqual(profile[0].behaviourName, "Collaboration");
    assert.strictEqual(profile[1].behaviourName, "Ownership");
  });

  test("applies modifiers from discipline and track", () => {
    const discipline = makeDiscipline({
      behaviourModifiers: { collaboration: 1 },
    });
    const level = makeLevel(); // developing(1)
    const track = makeTrack({ behaviourModifiers: { ownership: 1 } });
    const behaviours = makeBehaviours();

    const profile = deriveBehaviourProfile({
      discipline,
      level,
      track,
      behaviours,
    });

    const collab = profile.find((e) => e.behaviourId === "collaboration");
    assert.strictEqual(collab.maturity, "practicing"); // 1 + 1 = 2

    const ownership = profile.find((e) => e.behaviourId === "ownership");
    assert.strictEqual(ownership.maturity, "practicing"); // 1 + 1 = 2
  });

  test("handles empty behaviours array", () => {
    const discipline = makeDiscipline();
    const level = makeLevel();

    const profile = deriveBehaviourProfile({
      discipline,
      level,
      behaviours: [],
    });
    assert.strictEqual(profile.length, 0);
  });
});

// =============================================================================
// isValidJobCombination
// =============================================================================
