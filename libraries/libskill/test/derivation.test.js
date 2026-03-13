import { test, describe } from "node:test";
import assert from "node:assert";

import {
  buildSkillTypeMap,
  getSkillTypeForDiscipline,
  findMaxBaseSkillProficiency,
  deriveSkillProficiency,
  deriveBehaviourMaturity,
  deriveSkillMatrix,
  deriveBehaviourProfile,
  isValidJobCombination,
  generateJobTitle,
  deriveResponsibilities,
  deriveJob,
  calculateDriverCoverage,
  getDisciplineSkillIds,
  getLevelRank,
  isSeniorLevel,
} from "../derivation.js";

// =============================================================================
// Test Fixtures
// =============================================================================

/** @returns {Object} A professional (IC) discipline */
function makeDiscipline(overrides = {}) {
  return {
    id: "software_engineering",
    roleTitle: "Software Engineer",
    specialization: "Software Engineering",
    isManagement: false,
    isProfessional: true,
    coreSkills: ["coding", "testing"],
    supportingSkills: ["ci_cd", "monitoring"],
    broadSkills: ["documentation"],
    behaviourModifiers: {},
    validTracks: [],
    ...overrides,
  };
}

/** @returns {Object} A management discipline */
function makeManagementDiscipline(overrides = {}) {
  return makeDiscipline({
    id: "engineering_management",
    roleTitle: "Engineering",
    specialization: "Engineering Management",
    isManagement: true,
    isProfessional: false,
    coreSkills: ["people_management", "delivery_mgmt"],
    supportingSkills: ["process_design"],
    broadSkills: ["coding"],
    behaviourModifiers: { collaboration: 1 },
    validTracks: [null, "platform"],
    ...overrides,
  });
}

/** @returns {Object} A mid-level (Level III) */
function makeLevel(overrides = {}) {
  return {
    id: "level_3",
    professionalTitle: "Level III",
    managementTitle: "Manager",
    ordinalRank: 3,
    baseSkillProficiencies: {
      primary: "working",
      secondary: "foundational",
      broad: "awareness",
    },
    baseBehaviourMaturity: "developing",
    expectations: {
      impactScope: "team",
      autonomyExpectation: "independently",
      influenceScope: "team",
      complexityHandled: "moderate",
    },
    ...overrides,
  };
}

/** @returns {Object} A senior level (Staff) */
function makeSeniorLevel(overrides = {}) {
  return makeLevel({
    id: "level_5",
    professionalTitle: "Staff",
    managementTitle: "Director",
    ordinalRank: 5,
    baseSkillProficiencies: {
      primary: "practitioner",
      secondary: "working",
      broad: "foundational",
    },
    baseBehaviourMaturity: "practicing",
    ...overrides,
  });
}

/** @returns {Object} A junior level (Level I) */
function makeJuniorLevel(overrides = {}) {
  return makeLevel({
    id: "level_1",
    professionalTitle: "Level I",
    managementTitle: "Associate",
    ordinalRank: 1,
    baseSkillProficiencies: {
      primary: "foundational",
      secondary: "awareness",
      broad: "awareness",
    },
    baseBehaviourMaturity: "emerging",
    ...overrides,
  });
}

/** @returns {Object} A track with skill and behaviour modifiers */
function makeTrack(overrides = {}) {
  return {
    id: "platform",
    name: "Platform",
    description: "Platform engineering track",
    skillModifiers: { scale: 1 },
    behaviourModifiers: { collaboration: 1 },
    ...overrides,
  };
}

/** @returns {Object[]} Standard skills array */
function makeSkills() {
  return [
    {
      id: "coding",
      name: "Coding",
      capability: "delivery",
      isHumanOnly: false,
      proficiencyDescriptions: {
        awareness: "Understands basic coding",
        foundational: "Writes simple code",
        working: "Writes production code",
        practitioner: "Designs systems",
        expert: "Defines coding standards",
      },
    },
    {
      id: "testing",
      name: "Testing",
      capability: "delivery",
      isHumanOnly: false,
      proficiencyDescriptions: {
        awareness: "Understands testing",
        foundational: "Writes unit tests",
        working: "Designs test strategies",
        practitioner: "Leads testing practice",
        expert: "Defines testing culture",
      },
    },
    {
      id: "ci_cd",
      name: "CI/CD",
      capability: "delivery",
      isHumanOnly: false,
      proficiencyDescriptions: {
        awareness: "Understands CI/CD",
        foundational: "Uses pipelines",
        working: "Configures pipelines",
        practitioner: "Designs CI/CD systems",
        expert: "Defines CI/CD strategy",
      },
    },
    {
      id: "monitoring",
      name: "Monitoring",
      capability: "reliability",
      isHumanOnly: false,
      proficiencyDescriptions: {
        awareness: "Understands monitoring",
        foundational: "Uses dashboards",
        working: "Configures alerts",
        practitioner: "Designs observability",
        expert: "Defines monitoring strategy",
      },
    },
    {
      id: "documentation",
      name: "Documentation",
      capability: "documentation",
      isHumanOnly: false,
      proficiencyDescriptions: {
        awareness: "Reads docs",
        foundational: "Writes basic docs",
        working: "Maintains documentation",
      },
    },
    {
      id: "capacity_planning",
      name: "Capacity Planning",
      capability: "scale",
      isHumanOnly: false,
      proficiencyDescriptions: {
        awareness: "Understands capacity",
        foundational: "Estimates capacity",
        working: "Plans capacity",
        practitioner: "Leads capacity planning",
        expert: "Defines capacity strategy",
      },
    },
    {
      id: "load_balancing",
      name: "Load Balancing",
      capability: "scale",
      isHumanOnly: false,
      proficiencyDescriptions: {
        awareness: "Understands load balancing",
        foundational: "Configures basic LB",
        working: "Designs LB strategies",
      },
    },
    {
      id: "people_management",
      name: "People Management",
      capability: "people",
      isHumanOnly: true,
      proficiencyDescriptions: {},
    },
    {
      id: "delivery_mgmt",
      name: "Delivery Management",
      capability: "process",
      isHumanOnly: false,
      proficiencyDescriptions: {},
    },
    {
      id: "process_design",
      name: "Process Design",
      capability: "process",
      isHumanOnly: false,
      proficiencyDescriptions: {},
    },
  ];
}

/** @returns {Object[]} Standard behaviours array */
function makeBehaviours() {
  return [
    {
      id: "collaboration",
      name: "Collaboration",
      maturityDescriptions: {
        emerging: "Works with others",
        developing: "Contributes to team",
        practicing: "Facilitates collaboration",
        role_modeling: "Models collaboration",
        exemplifying: "Shapes collaborative culture",
      },
    },
    {
      id: "ownership",
      name: "Ownership",
      maturityDescriptions: {
        emerging: "Takes responsibility",
        developing: "Owns deliverables",
        practicing: "Owns outcomes",
        role_modeling: "Models ownership",
        exemplifying: "Shapes ownership culture",
      },
    },
  ];
}

/** @returns {Object[]} Standard capabilities array */
function makeCapabilities() {
  return [
    {
      id: "delivery",
      name: "Delivery",
      emojiIcon: "🚀",
      ordinalRank: 1,
      professionalResponsibilities: {
        foundational: "Delivers assigned tasks",
        working: "Delivers features independently",
        practitioner: "Leads delivery across teams",
        expert: "Defines delivery strategy",
      },
      managementResponsibilities: {
        foundational: "Supports delivery",
        working: "Manages delivery",
        practitioner: "Leads delivery org-wide",
        expert: "Defines delivery culture",
      },
    },
    {
      id: "scale",
      name: "Scale",
      emojiIcon: "📈",
      ordinalRank: 2,
      professionalResponsibilities: {
        foundational: "Understands scale concerns",
        working: "Designs for scale",
        practitioner: "Leads scale initiatives",
        expert: "Defines scale strategy",
      },
      managementResponsibilities: {},
    },
    {
      id: "reliability",
      name: "Reliability",
      emojiIcon: "🛡️",
      ordinalRank: 3,
      professionalResponsibilities: {
        foundational: "Follows reliability practices",
        working: "Implements reliability",
        practitioner: "Leads reliability",
        expert: "Defines reliability strategy",
      },
      managementResponsibilities: {},
    },
    {
      id: "documentation",
      name: "Documentation",
      emojiIcon: "📝",
      ordinalRank: 4,
      professionalResponsibilities: {
        foundational: "Writes basic docs",
        working: "Maintains documentation",
        practitioner: "Leads documentation practice",
        expert: "Defines documentation strategy",
      },
      managementResponsibilities: {},
    },
  ];
}

/** @returns {Object[]} Standard drivers array */
function makeDrivers() {
  return [
    {
      id: "velocity",
      name: "Velocity",
      contributingSkills: ["coding", "testing", "ci_cd"],
      contributingBehaviours: ["ownership"],
    },
    {
      id: "stability",
      name: "Stability",
      contributingSkills: ["monitoring", "capacity_planning"],
      contributingBehaviours: ["collaboration", "ownership"],
    },
  ];
}

// =============================================================================
// buildSkillTypeMap
// =============================================================================

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

describe("isValidJobCombination", () => {
  test("trackless job with empty validTracks is valid (legacy)", () => {
    const discipline = makeDiscipline({ validTracks: [] });
    const level = makeLevel();

    const result = isValidJobCombination({ discipline, level });
    assert.strictEqual(result, true);
  });

  test("trackless job with null in validTracks is valid", () => {
    const discipline = makeDiscipline({ validTracks: [null, "platform"] });
    const level = makeLevel();

    const result = isValidJobCombination({ discipline, level });
    assert.strictEqual(result, true);
  });

  test("trackless job with only track IDs in validTracks is invalid", () => {
    const discipline = makeDiscipline({ validTracks: ["platform", "data"] });
    const level = makeLevel();

    const result = isValidJobCombination({ discipline, level });
    assert.strictEqual(result, false);
  });

  test("tracked job with matching validTracks is valid", () => {
    const discipline = makeDiscipline({ validTracks: [null, "platform"] });
    const level = makeLevel();
    const track = makeTrack({ id: "platform" });

    const result = isValidJobCombination({ discipline, level, track });
    assert.strictEqual(result, true);
  });

  test("tracked job with non-matching validTracks is invalid", () => {
    const discipline = makeDiscipline({ validTracks: [null, "data"] });
    const level = makeLevel();
    const track = makeTrack({ id: "platform" });

    const result = isValidJobCombination({ discipline, level, track });
    assert.strictEqual(result, false);
  });

  test("tracked job with validTracks containing only null rejects tracks", () => {
    const discipline = makeDiscipline({ validTracks: [null] });
    const level = makeLevel();
    const track = makeTrack({ id: "platform" });

    const result = isValidJobCombination({ discipline, level, track });
    assert.strictEqual(result, false);
  });

  test("tracked job with empty validTracks is valid (legacy)", () => {
    const discipline = makeDiscipline({ validTracks: [] });
    const level = makeLevel();
    const track = makeTrack({ id: "platform" });

    const result = isValidJobCombination({ discipline, level, track });
    assert.strictEqual(result, true);
  });

  test("discipline minLevel constraint rejects lower levels", () => {
    const discipline = makeDiscipline({ minLevel: "level_3" });
    const level = makeLevel({ id: "level_1", ordinalRank: 1 });
    const levels = [
      makeLevel({ id: "level_1", ordinalRank: 1 }),
      makeLevel({ id: "level_3", ordinalRank: 3 }),
    ];

    const result = isValidJobCombination({ discipline, level, levels });
    assert.strictEqual(result, false);
  });

  test("discipline minLevel constraint allows equal level", () => {
    const discipline = makeDiscipline({ minLevel: "level_3" });
    const level = makeLevel({ id: "level_3", ordinalRank: 3 });
    const levels = [makeLevel({ id: "level_3", ordinalRank: 3 })];

    const result = isValidJobCombination({ discipline, level, levels });
    assert.strictEqual(result, true);
  });

  test("track minLevel constraint rejects lower levels", () => {
    const discipline = makeDiscipline({ validTracks: ["platform"] });
    const level = makeLevel({ id: "level_1", ordinalRank: 1 });
    const track = makeTrack({ id: "platform", minLevel: "level_3" });
    const levels = [
      makeLevel({ id: "level_1", ordinalRank: 1 }),
      makeLevel({ id: "level_3", ordinalRank: 3 }),
    ];

    const result = isValidJobCombination({
      discipline,
      level,
      track,
      levels,
    });
    assert.strictEqual(result, false);
  });

  test("track minLevel constraint allows higher level", () => {
    const discipline = makeDiscipline({ validTracks: ["platform"] });
    const level = makeSeniorLevel({ id: "level_5", ordinalRank: 5 });
    const track = makeTrack({ id: "platform", minLevel: "level_3" });
    const levels = [
      makeLevel({ id: "level_3", ordinalRank: 3 }),
      makeSeniorLevel({ id: "level_5", ordinalRank: 5 }),
    ];

    const result = isValidJobCombination({
      discipline,
      level,
      track,
      levels,
    });
    assert.strictEqual(result, true);
  });

  test("invalidCombinations rule rejects matching combo", () => {
    const discipline = makeDiscipline({ validTracks: ["platform"] });
    const level = makeLevel();
    const track = makeTrack({ id: "platform" });
    const validationRules = {
      invalidCombinations: [
        {
          discipline: "software_engineering",
          track: "platform",
          level: "level_3",
        },
      ],
    };

    const result = isValidJobCombination({
      discipline,
      level,
      track,
      validationRules,
    });
    assert.strictEqual(result, false);
  });

  test("invalidCombinations with partial match still rejects", () => {
    const discipline = makeDiscipline({ validTracks: ["platform"] });
    const level = makeLevel();
    const track = makeTrack({ id: "platform" });
    const validationRules = {
      invalidCombinations: [
        { discipline: "software_engineering", track: "platform" },
      ],
    };

    const result = isValidJobCombination({
      discipline,
      level,
      track,
      validationRules,
    });
    assert.strictEqual(result, false);
  });

  test("invalidCombinations non-matching combo allows it", () => {
    const discipline = makeDiscipline({ validTracks: ["platform"] });
    const level = makeLevel();
    const track = makeTrack({ id: "platform" });
    const validationRules = {
      invalidCombinations: [
        { discipline: "other_discipline", track: "platform" },
      ],
    };

    const result = isValidJobCombination({
      discipline,
      level,
      track,
      validationRules,
    });
    assert.strictEqual(result, true);
  });

  test("no validationRules allows everything", () => {
    const discipline = makeDiscipline({ validTracks: ["platform"] });
    const level = makeLevel();
    const track = makeTrack({ id: "platform" });

    const result = isValidJobCombination({ discipline, level, track });
    assert.strictEqual(result, true);
  });
});

// =============================================================================
// generateJobTitle
// =============================================================================

describe("generateJobTitle", () => {
  test("IC without track: professionalTitle + roleTitle", () => {
    const discipline = makeDiscipline();
    const level = makeSeniorLevel({ professionalTitle: "Staff" });

    const title = generateJobTitle(discipline, level);
    assert.strictEqual(title, "Staff Software Engineer");
  });

  test("IC with Level prefix without track: roleTitle + professionalTitle", () => {
    const discipline = makeDiscipline();
    const level = makeLevel({ professionalTitle: "Level III" });

    const title = generateJobTitle(discipline, level);
    assert.strictEqual(title, "Software Engineer Level III");
  });

  test("IC with track: professionalTitle + roleTitle - trackName", () => {
    const discipline = makeDiscipline();
    const level = makeSeniorLevel({ professionalTitle: "Staff" });
    const track = makeTrack({ name: "Platform" });

    const title = generateJobTitle(discipline, level, track);
    assert.strictEqual(title, "Staff Software Engineer - Platform");
  });

  test("IC with Level prefix and track: roleTitle + professionalTitle - trackName", () => {
    const discipline = makeDiscipline();
    const level = makeLevel({ professionalTitle: "Level III" });
    const track = makeTrack({ name: "Platform" });

    const title = generateJobTitle(discipline, level, track);
    assert.strictEqual(title, "Software Engineer Level III - Platform");
  });

  test("management without track: managementTitle, roleTitle", () => {
    const discipline = makeManagementDiscipline();
    const level = makeLevel({ managementTitle: "Manager" });

    const title = generateJobTitle(discipline, level);
    assert.strictEqual(title, "Manager, Engineering");
  });

  test("management with track: managementTitle, roleTitle - trackName", () => {
    const discipline = makeManagementDiscipline();
    const level = makeLevel({ managementTitle: "Manager" });
    const track = makeTrack({ name: "Platform" });

    const title = generateJobTitle(discipline, level, track);
    // Uses en-dash
    assert.strictEqual(title, "Manager, Engineering \u2013 Platform");
  });

  test("IC without track uses non-Level professionalTitle", () => {
    const discipline = makeDiscipline();
    const level = makeLevel({ professionalTitle: "Principal" });

    const title = generateJobTitle(discipline, level);
    assert.strictEqual(title, "Principal Software Engineer");
  });
});

// =============================================================================
// deriveResponsibilities
// =============================================================================

describe("deriveResponsibilities", () => {
  test("returns empty array for empty capabilities", () => {
    const result = deriveResponsibilities({
      skillMatrix: [],
      capabilities: [],
      discipline: makeDiscipline(),
    });
    assert.deepStrictEqual(result, []);
  });

  test("returns empty array for null capabilities", () => {
    const result = deriveResponsibilities({
      skillMatrix: [],
      capabilities: null,
      discipline: makeDiscipline(),
    });
    assert.deepStrictEqual(result, []);
  });

  test("skips awareness-only capabilities", () => {
    const skillMatrix = [
      {
        skillId: "documentation",
        skillName: "Documentation",
        capability: "documentation",
        type: "broad",
        proficiency: "awareness",
      },
    ];
    const capabilities = makeCapabilities();
    const discipline = makeDiscipline();

    const result = deriveResponsibilities({
      skillMatrix,
      capabilities,
      discipline,
    });

    const docResp = result.find((r) => r.capability === "documentation");
    assert.strictEqual(docResp, undefined);
  });

  test("uses professionalResponsibilities for IC discipline", () => {
    const skillMatrix = [
      {
        skillId: "coding",
        skillName: "Coding",
        capability: "delivery",
        type: "primary",
        proficiency: "working",
      },
    ];
    const capabilities = makeCapabilities();
    const discipline = makeDiscipline();

    const result = deriveResponsibilities({
      skillMatrix,
      capabilities,
      discipline,
    });

    const delivery = result.find((r) => r.capability === "delivery");
    assert.strictEqual(
      delivery.responsibility,
      "Delivers features independently",
    );
  });

  test("uses managementResponsibilities for management discipline", () => {
    const skillMatrix = [
      {
        skillId: "coding",
        skillName: "Coding",
        capability: "delivery",
        type: "primary",
        proficiency: "working",
      },
    ];
    const capabilities = makeCapabilities();
    const discipline = makeManagementDiscipline();

    const result = deriveResponsibilities({
      skillMatrix,
      capabilities,
      discipline,
    });

    const delivery = result.find((r) => r.capability === "delivery");
    assert.strictEqual(delivery.responsibility, "Manages delivery");
  });

  test("uses max proficiency per capability", () => {
    const skillMatrix = [
      {
        skillId: "coding",
        skillName: "Coding",
        capability: "delivery",
        type: "primary",
        proficiency: "practitioner",
      },
      {
        skillId: "testing",
        skillName: "Testing",
        capability: "delivery",
        type: "primary",
        proficiency: "working",
      },
    ];
    const capabilities = makeCapabilities();
    const discipline = makeDiscipline();

    const result = deriveResponsibilities({
      skillMatrix,
      capabilities,
      discipline,
    });

    const delivery = result.find((r) => r.capability === "delivery");
    assert.strictEqual(delivery.proficiency, "practitioner");
    assert.strictEqual(delivery.responsibility, "Leads delivery across teams");
  });

  test("sorts by proficiency descending", () => {
    const skillMatrix = [
      {
        skillId: "coding",
        skillName: "Coding",
        capability: "delivery",
        type: "primary",
        proficiency: "working",
      },
      {
        skillId: "capacity_planning",
        skillName: "Capacity Planning",
        capability: "scale",
        type: "secondary",
        proficiency: "practitioner",
      },
    ];
    const capabilities = makeCapabilities();
    const discipline = makeDiscipline();

    const result = deriveResponsibilities({
      skillMatrix,
      capabilities,
      discipline,
    });

    // practitioner(3) should come before working(2)
    assert.strictEqual(result[0].capability, "scale");
    assert.strictEqual(result[1].capability, "delivery");
  });

  test("includes emojiIcon and ordinalRank in output", () => {
    const skillMatrix = [
      {
        skillId: "coding",
        skillName: "Coding",
        capability: "delivery",
        type: "primary",
        proficiency: "working",
      },
    ];
    const capabilities = makeCapabilities();
    const discipline = makeDiscipline();

    const result = deriveResponsibilities({
      skillMatrix,
      capabilities,
      discipline,
    });

    assert.strictEqual(result[0].emojiIcon, "🚀");
    assert.strictEqual(result[0].ordinalRank, 1);
  });

  test("does not include internal proficiencyIndex and skillCount fields", () => {
    const skillMatrix = [
      {
        skillId: "coding",
        skillName: "Coding",
        capability: "delivery",
        type: "primary",
        proficiency: "working",
      },
    ];
    const capabilities = makeCapabilities();
    const discipline = makeDiscipline();

    const result = deriveResponsibilities({
      skillMatrix,
      capabilities,
      discipline,
    });

    assert.strictEqual(result[0].proficiencyIndex, undefined);
    assert.strictEqual(result[0].skillCount, undefined);
  });
});

// =============================================================================
// deriveJob
// =============================================================================

describe("deriveJob", () => {
  test("returns null for invalid combination", () => {
    const discipline = makeDiscipline({ validTracks: ["data"] });
    const level = makeLevel();
    const track = makeTrack({ id: "platform" });
    const skills = makeSkills();
    const behaviours = makeBehaviours();

    const job = deriveJob({ discipline, level, track, skills, behaviours });
    assert.strictEqual(job, null);
  });

  test("returns complete job definition for valid combination", () => {
    const discipline = makeDiscipline();
    const level = makeLevel();
    const skills = makeSkills();
    const behaviours = makeBehaviours();

    const job = deriveJob({ discipline, level, skills, behaviours });

    assert.strictEqual(job.id, "software_engineering_level_3");
    assert.strictEqual(job.title, "Software Engineer Level III");
    assert.strictEqual(job.discipline, discipline);
    assert.strictEqual(job.level, level);
    assert.strictEqual(job.track, null);
    assert.ok(Array.isArray(job.skillMatrix));
    assert.ok(Array.isArray(job.behaviourProfile));
    assert.ok(job.skillMatrix.length > 0);
    assert.ok(job.behaviourProfile.length > 0);
  });

  test("generates correct ID with track", () => {
    const discipline = makeDiscipline({ validTracks: ["platform"] });
    const level = makeLevel();
    const track = makeTrack({ id: "platform" });
    const skills = makeSkills();
    const behaviours = makeBehaviours();

    const job = deriveJob({ discipline, level, track, skills, behaviours });

    assert.strictEqual(job.id, "software_engineering_level_3_platform");
  });

  test("includes expectations from level", () => {
    const discipline = makeDiscipline();
    const level = makeLevel();
    const skills = makeSkills();
    const behaviours = makeBehaviours();

    const job = deriveJob({ discipline, level, skills, behaviours });

    assert.strictEqual(job.expectations.impactScope, "team");
    assert.strictEqual(job.expectations.autonomyExpectation, "independently");
  });

  test("includes derived responsibilities when capabilities provided", () => {
    const discipline = makeDiscipline();
    const level = makeLevel();
    const skills = makeSkills();
    const behaviours = makeBehaviours();
    const capabilities = makeCapabilities();

    const job = deriveJob({
      discipline,
      level,
      skills,
      behaviours,
      capabilities,
    });

    assert.ok(Array.isArray(job.derivedResponsibilities));
    assert.ok(job.derivedResponsibilities.length > 0);
  });

  test("returns empty responsibilities when no capabilities", () => {
    const discipline = makeDiscipline();
    const level = makeLevel();
    const skills = makeSkills();
    const behaviours = makeBehaviours();

    const job = deriveJob({ discipline, level, skills, behaviours });

    assert.deepStrictEqual(job.derivedResponsibilities, []);
  });

  test("validates via validationRules", () => {
    const discipline = makeDiscipline({ validTracks: ["platform"] });
    const level = makeLevel();
    const track = makeTrack({ id: "platform" });
    const skills = makeSkills();
    const behaviours = makeBehaviours();
    const validationRules = {
      invalidCombinations: [
        {
          discipline: "software_engineering",
          track: "platform",
          level: "level_3",
        },
      ],
    };

    const job = deriveJob({
      discipline,
      level,
      track,
      skills,
      behaviours,
      validationRules,
    });
    assert.strictEqual(job, null);
  });
});

// =============================================================================
// calculateDriverCoverage
// =============================================================================

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
