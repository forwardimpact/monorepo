import { test, describe } from "node:test";
import assert from "node:assert";

import {
  buildSkillTypeMap,
  getSkillTypeForDiscipline,
  findMaxBaseSkillProficiency,
  deriveSkillProficiency,
} from "../derivation.js";
import {
  makeDiscipline,
  makeLevel,
  makeSeniorLevel,
  makeJuniorLevel,
  makeTrack,
  makeSkills,
} from "./derivation-fixtures.js";

describe("buildSkillTypeMap", () => {
  test("maps core skills to primary", () => {
    const discipline = makeDiscipline();
    const map = buildSkillTypeMap(discipline);
    assert.strictEqual(map.get("coding"), "primary");
    assert.strictEqual(map.get("testing"), "primary");
  });

  test("maps supporting skills to secondary", () => {
    const discipline = makeDiscipline();
    const map = buildSkillTypeMap(discipline);
    assert.strictEqual(map.get("ci_cd"), "secondary");
    assert.strictEqual(map.get("monitoring"), "secondary");
  });

  test("maps broad skills to broad", () => {
    const discipline = makeDiscipline();
    const map = buildSkillTypeMap(discipline);
    assert.strictEqual(map.get("documentation"), "broad");
  });

  test("returns undefined for unknown skill", () => {
    const discipline = makeDiscipline();
    const map = buildSkillTypeMap(discipline);
    assert.strictEqual(map.get("nonexistent"), undefined);
  });

  test("handles discipline with empty skill arrays", () => {
    const discipline = makeDiscipline({
      coreSkills: [],
      supportingSkills: [],
      broadSkills: [],
    });
    const map = buildSkillTypeMap(discipline);
    assert.strictEqual(map.size, 0);
  });

  test("handles discipline with missing skill arrays", () => {
    const discipline = {
      id: "minimal",
      roleTitle: "Minimal",
    };
    const map = buildSkillTypeMap(discipline);
    assert.strictEqual(map.size, 0);
  });
});

// =============================================================================
// getSkillTypeForDiscipline
// =============================================================================

describe("getSkillTypeForDiscipline", () => {
  test("returns primary for core skill", () => {
    const discipline = makeDiscipline();
    assert.strictEqual(
      getSkillTypeForDiscipline(discipline, "coding"),
      "primary",
    );
  });

  test("returns secondary for supporting skill", () => {
    const discipline = makeDiscipline();
    assert.strictEqual(
      getSkillTypeForDiscipline(discipline, "ci_cd"),
      "secondary",
    );
  });

  test("returns broad for broad skill", () => {
    const discipline = makeDiscipline();
    assert.strictEqual(
      getSkillTypeForDiscipline(discipline, "documentation"),
      "broad",
    );
  });

  test("returns null for skill not in discipline", () => {
    const discipline = makeDiscipline();
    assert.strictEqual(
      getSkillTypeForDiscipline(discipline, "capacity_planning"),
      null,
    );
  });

  test("returns null for empty discipline", () => {
    const discipline = makeDiscipline({
      coreSkills: [],
      supportingSkills: [],
      broadSkills: [],
    });
    assert.strictEqual(getSkillTypeForDiscipline(discipline, "coding"), null);
  });
});

// =============================================================================
// findMaxBaseSkillProficiency
// =============================================================================

describe("findMaxBaseSkillProficiency", () => {
  test("returns highest proficiency index from level", () => {
    const level = makeLevel();
    // primary=working(2), secondary=foundational(1), broad=awareness(0)
    const maxIndex = findMaxBaseSkillProficiency(level);
    assert.strictEqual(maxIndex, 2); // working is index 2
  });

  test("returns correct max for senior level", () => {
    const level = makeSeniorLevel();
    // primary=practitioner(3), secondary=working(2), broad=foundational(1)
    const maxIndex = findMaxBaseSkillProficiency(level);
    assert.strictEqual(maxIndex, 3); // practitioner is index 3
  });

  test("returns correct max for junior level", () => {
    const level = makeJuniorLevel();
    // primary=foundational(1), secondary=awareness(0), broad=awareness(0)
    const maxIndex = findMaxBaseSkillProficiency(level);
    assert.strictEqual(maxIndex, 1); // foundational is index 1
  });

  test("handles level where all proficiencies are the same", () => {
    const level = makeLevel({
      baseSkillProficiencies: {
        primary: "working",
        secondary: "working",
        broad: "working",
      },
    });
    const maxIndex = findMaxBaseSkillProficiency(level);
    assert.strictEqual(maxIndex, 2); // working is index 2
  });
});

// =============================================================================
// deriveSkillProficiency
// =============================================================================

describe("deriveSkillProficiency", () => {
  test("returns base proficiency for primary skill without track", () => {
    const discipline = makeDiscipline();
    const level = makeLevel(); // primary=working
    const skills = makeSkills();

    const result = deriveSkillProficiency({
      discipline,
      level,
      skillId: "coding",
      skills,
    });
    assert.strictEqual(result, "working");
  });

  test("returns base proficiency for secondary skill", () => {
    const discipline = makeDiscipline();
    const level = makeLevel(); // secondary=foundational
    const skills = makeSkills();

    const result = deriveSkillProficiency({
      discipline,
      level,
      skillId: "ci_cd",
      skills,
    });
    assert.strictEqual(result, "foundational");
  });

  test("returns base proficiency for broad skill", () => {
    const discipline = makeDiscipline();
    const level = makeLevel(); // broad=awareness
    const skills = makeSkills();

    const result = deriveSkillProficiency({
      discipline,
      level,
      skillId: "documentation",
      skills,
    });
    assert.strictEqual(result, "awareness");
  });

  test("applies positive track modifier via capability", () => {
    const discipline = makeDiscipline();
    const level = makeLevel(); // secondary=foundational(1), max=working(2)
    const track = makeTrack({ skillModifiers: { delivery: 1 } });
    const skills = makeSkills();

    // ci_cd is secondary, capability=delivery, base=foundational(1), +1 = working(2)
    const result = deriveSkillProficiency({
      discipline,
      level,
      track,
      skillId: "ci_cd",
      skills,
    });
    assert.strictEqual(result, "working");
  });

  test("applies negative track modifier", () => {
    const discipline = makeDiscipline();
    const level = makeLevel(); // primary=working(2)
    const track = makeTrack({ skillModifiers: { delivery: -1 } });
    const skills = makeSkills();

    // coding is primary, capability=delivery, base=working(2), -1 = foundational(1)
    const result = deriveSkillProficiency({
      discipline,
      level,
      track,
      skillId: "coding",
      skills,
    });
    assert.strictEqual(result, "foundational");
  });

  test("caps positive modifier at max base proficiency", () => {
    const discipline = makeDiscipline();
    // primary=working(2), secondary=foundational(1), broad=awareness(0), max=2
    const level = makeLevel();
    const track = makeTrack({ skillModifiers: { delivery: 2 } });
    const skills = makeSkills();

    // ci_cd is secondary, base=foundational(1), +2=3 but capped at max=2(working)
    const result = deriveSkillProficiency({
      discipline,
      level,
      track,
      skillId: "ci_cd",
      skills,
    });
    assert.strictEqual(result, "working");
  });

  test("negative modifier is not capped (can go below base)", () => {
    const discipline = makeDiscipline();
    const level = makeLevel(); // primary=working(2)
    const track = makeTrack({ skillModifiers: { delivery: -2 } });
    const skills = makeSkills();

    // coding is primary, base=working(2), -2=0 = awareness
    const result = deriveSkillProficiency({
      discipline,
      level,
      track,
      skillId: "coding",
      skills,
    });
    assert.strictEqual(result, "awareness");
  });

  test("clamps to awareness when modifier goes below zero", () => {
    const discipline = makeDiscipline();
    const level = makeJuniorLevel(); // primary=foundational(1)
    const track = makeTrack({ skillModifiers: { delivery: -5 } });
    const skills = makeSkills();

    // coding is primary, base=foundational(1), -5=-4 clamped to 0=awareness
    const result = deriveSkillProficiency({
      discipline,
      level,
      track,
      skillId: "coding",
      skills,
    });
    assert.strictEqual(result, "awareness");
  });

  test("clamps to expert when modifier would exceed range", () => {
    const discipline = makeDiscipline();
    const level = makeSeniorLevel(); // primary=practitioner(3), max=3
    // Modifier of +1 with primary base=3 would go to 4 but capped at max=3
    const track = makeTrack({ skillModifiers: { delivery: 1 } });
    const skills = makeSkills();

    const result = deriveSkillProficiency({
      discipline,
      level,
      track,
      skillId: "coding",
      skills,
    });
    assert.strictEqual(result, "practitioner");
  });

  test("returns null for skill not in discipline without positive track modifier", () => {
    const discipline = makeDiscipline(); // does not have capacity_planning
    const level = makeLevel();
    const skills = makeSkills();

    const result = deriveSkillProficiency({
      discipline,
      level,
      skillId: "capacity_planning",
      skills,
    });
    assert.strictEqual(result, null);
  });

  test("track-added skill with positive modifier returns proficiency", () => {
    const discipline = makeDiscipline(); // does not have capacity_planning
    const level = makeLevel(); // broad=awareness(0), max=working(2)
    const track = makeTrack({ skillModifiers: { scale: 1 } });
    const skills = makeSkills();

    // capacity_planning is not in discipline, capability=scale, track modifier=+1
    // base uses broad=awareness(0), +1=foundational(1), capped at max=2 -> foundational
    const result = deriveSkillProficiency({
      discipline,
      level,
      track,
      skillId: "capacity_planning",
      skills,
    });
    assert.strictEqual(result, "foundational");
  });

  test("track-added skill with zero modifier returns null", () => {
    const discipline = makeDiscipline();
    const level = makeLevel();
    const track = makeTrack({ skillModifiers: { scale: 0 } });
    const skills = makeSkills();

    const result = deriveSkillProficiency({
      discipline,
      level,
      track,
      skillId: "capacity_planning",
      skills,
    });
    assert.strictEqual(result, null);
  });

  test("track-added skill with negative modifier returns null", () => {
    const discipline = makeDiscipline();
    const level = makeLevel();
    const track = makeTrack({ skillModifiers: { scale: -1 } });
    const skills = makeSkills();

    const result = deriveSkillProficiency({
      discipline,
      level,
      track,
      skillId: "capacity_planning",
      skills,
    });
    assert.strictEqual(result, null);
  });

  test("handles null track (uses no modifier)", () => {
    const discipline = makeDiscipline();
    const level = makeLevel();
    const skills = makeSkills();

    const result = deriveSkillProficiency({
      discipline,
      level,
      track: null,
      skillId: "coding",
      skills,
    });
    assert.strictEqual(result, "working");
  });
});

// =============================================================================
// deriveBehaviourMaturity
// =============================================================================
