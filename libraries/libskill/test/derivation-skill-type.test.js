import { test, describe } from "node:test";
import assert from "node:assert";

import {
  buildSkillTypeMap,
  getSkillTypeForDiscipline,
  findMaxBaseSkillProficiency,
  deriveSkillProficiency,
} from "../src/derivation.js";
import {
  makeDiscipline,
  makeLevel,
  makeSeniorLevel,
  makeJuniorLevel,
  makeTrack,
  makeSkills,
} from "./derivation-fixtures.js";

describe("buildSkillTypeMap", () => {
  test("maps core skills to core tier", () => {
    const discipline = makeDiscipline();
    const map = buildSkillTypeMap(discipline);
    assert.strictEqual(map.get("coding"), "core");
    assert.strictEqual(map.get("testing"), "core");
  });

  test("maps supporting skills to supporting tier", () => {
    const discipline = makeDiscipline();
    const map = buildSkillTypeMap(discipline);
    assert.strictEqual(map.get("ci_cd"), "supporting");
    assert.strictEqual(map.get("monitoring"), "supporting");
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

  test("handles discipline with no skill arrays", () => {
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
  test("returns core for core skill", () => {
    const discipline = makeDiscipline();
    assert.strictEqual(
      getSkillTypeForDiscipline({ discipline, skillId: "coding" }),
      "core",
    );
  });

  test("returns supporting for supporting skill", () => {
    const discipline = makeDiscipline();
    assert.strictEqual(
      getSkillTypeForDiscipline({ discipline, skillId: "ci_cd" }),
      "supporting",
    );
  });

  test("returns broad for broad skill", () => {
    const discipline = makeDiscipline();
    assert.strictEqual(
      getSkillTypeForDiscipline({ discipline, skillId: "documentation" }),
      "broad",
    );
  });

  test("returns null for skill not in discipline", () => {
    const discipline = makeDiscipline();
    assert.strictEqual(
      getSkillTypeForDiscipline({ discipline, skillId: "capacity_planning" }),
      null,
    );
  });

  test("returns null for empty discipline", () => {
    const discipline = makeDiscipline({
      coreSkills: [],
      supportingSkills: [],
      broadSkills: [],
    });
    assert.strictEqual(
      getSkillTypeForDiscipline({ discipline, skillId: "coding" }),
      null,
    );
  });
});

// =============================================================================
// findMaxBaseSkillProficiency
// =============================================================================

describe("findMaxBaseSkillProficiency", () => {
  test("returns highest proficiency index from level", () => {
    const level = makeLevel();
    // core=working(2), supporting=foundational(1), broad=awareness(0)
    const maxIndex = findMaxBaseSkillProficiency(level);
    assert.strictEqual(maxIndex, 2); // working is index 2
  });

  test("returns correct max for senior level", () => {
    const level = makeSeniorLevel();
    // core=practitioner(3), supporting=working(2), broad=foundational(1)
    const maxIndex = findMaxBaseSkillProficiency(level);
    assert.strictEqual(maxIndex, 3); // practitioner is index 3
  });

  test("returns correct max for junior level", () => {
    const level = makeJuniorLevel();
    // core=foundational(1), supporting=awareness(0), broad=awareness(0)
    const maxIndex = findMaxBaseSkillProficiency(level);
    assert.strictEqual(maxIndex, 1); // foundational is index 1
  });

  test("handles level where all proficiencies are the same", () => {
    const level = makeLevel({
      baseSkillProficiencies: {
        core: "working",
        supporting: "working",
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
  test("returns base proficiency for core skill without track", () => {
    const discipline = makeDiscipline();
    const level = makeLevel(); // core=working
    const skills = makeSkills();

    const result = deriveSkillProficiency({
      discipline,
      level,
      skillId: "coding",
      skills,
    });
    assert.strictEqual(result, "working");
  });

  test("returns base proficiency for supporting skill", () => {
    const discipline = makeDiscipline();
    const level = makeLevel(); // supporting=foundational
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

  test("applies positive track modifier through capability", () => {
    const discipline = makeDiscipline();
    const level = makeLevel(); // supporting=foundational(1), max=working(2)
    const track = makeTrack({ skillModifiers: { delivery: 1 } });
    const skills = makeSkills();

    // ci_cd is supporting, capability=delivery, base=foundational(1), +1 = working(2)
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
    const level = makeLevel(); // core=working(2)
    const track = makeTrack({ skillModifiers: { delivery: -1 } });
    const skills = makeSkills();

    // coding is core, capability=delivery, base=working(2), -1 = foundational(1)
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
    // core=working(2), supporting=foundational(1), broad=awareness(0), max=2
    const level = makeLevel();
    const track = makeTrack({ skillModifiers: { delivery: 2 } });
    const skills = makeSkills();

    // ci_cd is supporting, base=foundational(1), +2=3 but capped at max=2(working)
    const result = deriveSkillProficiency({
      discipline,
      level,
      track,
      skillId: "ci_cd",
      skills,
    });
    assert.strictEqual(result, "working");
  });

  test("does not cap negative modifier (can go below base)", () => {
    const discipline = makeDiscipline();
    const level = makeLevel(); // core=working(2)
    const track = makeTrack({ skillModifiers: { delivery: -2 } });
    const skills = makeSkills();

    // coding is core, base=working(2), -2=0 = awareness
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
    const level = makeJuniorLevel(); // core=foundational(1)
    const track = makeTrack({ skillModifiers: { delivery: -5 } });
    const skills = makeSkills();

    // coding is core, base=foundational(1), -5=-4 clamped to 0=awareness
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
    const level = makeSeniorLevel(); // core=practitioner(3), max=3
    // Modifier of +1 with core base=3 would go to 4 but capped at max=3
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
