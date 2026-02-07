/**
 * Engineering Pathway Tests
 *
 * Unit tests for all model functions.
 * Run with: node --test tests/model.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";

import {
  // Types and constants
  Capability,
  getSkillLevelIndex,
  getBehaviourMaturityIndex,
  clampSkillLevel,
  clampBehaviourMaturity,
  skillLevelMeetsRequirement,
  behaviourMaturityMeetsRequirement,
  groupSkillsByCapability,
  // Data-driven capability functions
  getCapabilityById,
  getCapabilityOrder,
  getCapabilityEmoji,
  getCapabilityResponsibility,
  // Framework emoji function
  getConceptEmoji,
} from "@forwardimpact/schema/levels";

import {
  compareByCapability,
  sortSkillsByCapability,
} from "@forwardimpact/model/policies";

import {
  classifyMatch,
  calculateGapScore,
  MatchTier,
  GAP_SCORES,
  calculateJobMatch,
  findMatchingJobs,
  findRealisticMatches,
  estimateBestFitGrade,
  deriveDevelopmentPath,
  findNextStepJob,
} from "@forwardimpact/model/matching";

import {
  validateAllData,
  validateSelfAssessment,
  validateQuestionBank,
} from "@forwardimpact/schema/validation";

import {
  deriveSkillLevel,
  deriveBehaviourMaturity,
  deriveSkillMatrix,
  deriveBehaviourProfile,
  deriveResponsibilities,
  deriveJob,
  isValidJobCombination,
  calculateDriverCoverage,
  getSkillTypeForDiscipline,
  generateJobTitle,
  isSeniorGrade,
  getDisciplineSkillIds,
  getGradeLevel,
} from "@forwardimpact/model/derivation";

import {
  deriveInterviewQuestions,
  deriveShortInterview,
  deriveBehaviourQuestions,
  deriveFocusedInterview,
  deriveMissionFitInterview,
  deriveDecompositionInterview,
  deriveStakeholderInterview,
} from "@forwardimpact/model/interview";

import {
  deriveChecklist,
  formatChecklistMarkdown,
} from "@forwardimpact/model/checklist";

// ============================================================================
// Test Data Fixtures
// ============================================================================

const testSkills = [
  {
    id: "skill_a",
    name: "Skill A",
    capability: Capability.SCALE,
    description: "A scale skill",
    levelDescriptions: {
      awareness: "Basic awareness",
      foundational: "Can apply basics",
      working: "Works independently",
      practitioner: "Guides others",
      expert: "Industry expert",
    },
  },
  {
    id: "skill_b",
    name: "Skill B",
    capability: Capability.AI,
    description: "An AI skill",
    levelDescriptions: {},
  },
  {
    id: "skill_c",
    name: "Skill C",
    capability: Capability.PEOPLE,
    description: "A people skill",
    levelDescriptions: {},
  },
];

const testBehaviours = [
  {
    id: "behaviour_x",
    name: "Behaviour X",
    description: "First behaviour",
    maturityDescriptions: {
      emerging: "Just starting",
      developing: "Growing",
      practicing: "Consistent",
      role_modeling: "Exemplary",
    },
  },
  {
    id: "behaviour_y",
    name: "Behaviour Y",
    description: "Second behaviour",
    maturityDescriptions: {},
  },
];

const testDiscipline = {
  id: "test_discipline",
  specialization: "Test Engineering",
  roleTitle: "Test Engineer",
  description: "A test discipline",
  coreSkills: ["skill_a"],
  supportingSkills: ["skill_b"],
  broadSkills: ["skill_c"],
  behaviourModifiers: { behaviour_x: 1 },
  isProfessional: true,
  isManagement: false,
  validTracks: [null, "test_track"], // null allows trackless, "test_track" allows that track
};

const testTrack = {
  id: "test_track",
  name: "Test Track",
  description: "A test track",
  skillModifiers: {
    scale: 1,
    ai: -1,
  },
  behaviourModifiers: { behaviour_y: 1 },
  assessmentWeights: {
    skillWeight: 0.6,
    behaviourWeight: 0.4,
  },
};

const testGrade = {
  id: "test_grade",
  professionalTitle: "Level III",
  managementTitle: "Manager",
  typicalExperienceRange: "5-8",
  ordinalRank: 3,
  baseSkillLevels: {
    primary: "practitioner",
    secondary: "working",
    broad: "foundational",
  },
  baseBehaviourMaturity: "practicing",
  expectations: {
    impactScope: "Team level",
    autonomyExpectation: "High",
    influenceScope: "Team",
    complexityHandled: "Moderate",
  },
};

const testDrivers = [
  {
    id: "driver_1",
    name: "Test Driver",
    description: "A test driver",
    contributingSkills: ["skill_a", "skill_b"],
    contributingBehaviours: ["behaviour_x"],
  },
];

const testCategories = [
  {
    id: "scale",
    name: "Scale",
    emojiIcon: "📐",
    order: 1,
    description: "Building systems that grow gracefully",
    professionalResponsibilities: {
      awareness: "Follow established patterns",
      foundational: "Contribute to scalable designs",
      working: "Design scalable components",
      practitioner: "Lead architectural decisions",
      expert: "Define organizational standards",
    },
    managementResponsibilities: {
      awareness: "Understand technical patterns",
      foundational: "Support scalable designs",
      working: "Facilitate scalable solutions",
      practitioner: "Lead architectural strategy",
      expert: "Define organizational standards",
    },
  },
  {
    id: "ai",
    name: "AI",
    emojiIcon: "🤖",
    order: 2,
    description: "Leveraging artificial intelligence",
    professionalResponsibilities: {
      awareness: "Use AI tools as directed",
      foundational: "Apply AI tools effectively",
      working: "Integrate AI capabilities",
      practitioner: "Design AI-augmented workflows",
      expert: "Shape organizational AI strategy",
    },
    managementResponsibilities: {
      awareness: "Understand AI capabilities",
      foundational: "Enable AI tool adoption",
      working: "Champion AI workflows",
      practitioner: "Drive AI strategy",
      expert: "Shape organizational AI strategy",
    },
  },
  {
    id: "people",
    name: "People",
    emojiIcon: "👥",
    order: 3,
    description: "Growing individuals and teams",
    professionalResponsibilities: {
      awareness: "Contribute positively to team dynamics",
      foundational: "Support teammates",
      working: "Mentor junior team members",
      practitioner: "Coach and develop team members",
      expert: "Develop leaders",
    },
    managementResponsibilities: {
      awareness: "Support team dynamics",
      foundational: "Build team cohesion",
      working: "Develop team members",
      practitioner: "Lead team development",
      expert: "Develop leaders",
    },
  },
];

// ============================================================================
// Type Helper Tests
// ============================================================================

describe("Type Helpers", () => {
  describe("getSkillLevelIndex", () => {
    it("returns correct indices for all levels", () => {
      assert.strictEqual(getSkillLevelIndex("awareness"), 0);
      assert.strictEqual(getSkillLevelIndex("foundational"), 1);
      assert.strictEqual(getSkillLevelIndex("working"), 2);
      assert.strictEqual(getSkillLevelIndex("practitioner"), 3);
      assert.strictEqual(getSkillLevelIndex("expert"), 4);
    });

    it("returns -1 for invalid levels", () => {
      assert.strictEqual(getSkillLevelIndex("invalid"), -1);
      assert.strictEqual(getSkillLevelIndex(""), -1);
    });
  });

  describe("getBehaviourMaturityIndex", () => {
    it("returns correct indices for all maturities", () => {
      assert.strictEqual(getBehaviourMaturityIndex("emerging"), 0);
      assert.strictEqual(getBehaviourMaturityIndex("developing"), 1);
      assert.strictEqual(getBehaviourMaturityIndex("practicing"), 2);
      assert.strictEqual(getBehaviourMaturityIndex("role_modeling"), 3);
    });
  });

  describe("clampSkillLevel", () => {
    it("clamps to valid range", () => {
      assert.strictEqual(clampSkillLevel(-1), "awareness");
      assert.strictEqual(clampSkillLevel(0), "awareness");
      assert.strictEqual(clampSkillLevel(2), "working");
      assert.strictEqual(clampSkillLevel(4), "expert");
      assert.strictEqual(clampSkillLevel(10), "expert");
    });
  });

  describe("clampBehaviourMaturity", () => {
    it("clamps to valid range", () => {
      assert.strictEqual(clampBehaviourMaturity(-1), "emerging");
      assert.strictEqual(clampBehaviourMaturity(0), "emerging");
      assert.strictEqual(clampBehaviourMaturity(3), "role_modeling");
      assert.strictEqual(clampBehaviourMaturity(4), "exemplifying");
      assert.strictEqual(clampBehaviourMaturity(10), "exemplifying");
    });
  });

  describe("skillLevelMeetsRequirement", () => {
    it("correctly compares skill levels", () => {
      assert.strictEqual(
        skillLevelMeetsRequirement("expert", "practitioner"),
        true,
      );
      assert.strictEqual(
        skillLevelMeetsRequirement("practitioner", "practitioner"),
        true,
      );
      assert.strictEqual(
        skillLevelMeetsRequirement("working", "practitioner"),
        false,
      );
    });
  });

  describe("behaviourMaturityMeetsRequirement", () => {
    it("correctly compares behaviour maturity levels", () => {
      assert.strictEqual(
        behaviourMaturityMeetsRequirement("role_modeling", "practicing"),
        true,
      );
      assert.strictEqual(
        behaviourMaturityMeetsRequirement("practicing", "practicing"),
        true,
      );
      assert.strictEqual(
        behaviourMaturityMeetsRequirement("developing", "practicing"),
        false,
      );
      assert.strictEqual(
        behaviourMaturityMeetsRequirement("emerging", "role_modeling"),
        false,
      );
    });
  });

  describe("compareByCapability", () => {
    it("correctly compares capabilities using data-driven order", () => {
      const capabilities = [
        { id: "delivery", ordinalRank: 1 },
        { id: "ai", ordinalRank: 2 },
        { id: "scale", ordinalRank: 3 },
        { id: "documentation", ordinalRank: 4 },
      ];
      const compare = compareByCapability(capabilities);
      assert.ok(
        compare({ capability: "delivery" }, { capability: "scale" }) < 0,
      );
      assert.ok(
        compare({ capability: "scale" }, { capability: "delivery" }) > 0,
      );
      assert.strictEqual(
        compare({ capability: "ai" }, { capability: "ai" }),
        0,
      );
      assert.ok(
        compare({ capability: "delivery" }, { capability: "documentation" }) <
          0,
      );
    });
  });

  describe("sortSkillsByCapability", () => {
    const testCapabilities = [
      { id: "delivery", ordinalRank: 1 },
      { id: "ai", ordinalRank: 2 },
      { id: "documentation", ordinalRank: 3 },
    ];

    it("sorts skills by capability order then name", () => {
      const unsorted = [
        { id: "s3", name: "Zebra", capability: "ai" },
        { id: "s1", name: "Alpha", capability: "documentation" },
        { id: "s2", name: "Beta", capability: "delivery" },
        { id: "s4", name: "Gamma", capability: "ai" },
      ];
      const sorted = sortSkillsByCapability(unsorted, testCapabilities);
      assert.strictEqual(sorted[0].id, "s2"); // delivery first
      assert.strictEqual(sorted[1].id, "s4"); // ai - Gamma before Zebra
      assert.strictEqual(sorted[2].id, "s3"); // ai - Zebra
      assert.strictEqual(sorted[3].id, "s1"); // documentation last
    });

    it("does not mutate original array", () => {
      const original = [
        { id: "s1", name: "Z", capability: "ai" },
        { id: "s2", name: "A", capability: "delivery" },
      ];
      const sorted = sortSkillsByCapability(original, testCapabilities);
      assert.strictEqual(original[0].id, "s1");
      assert.notStrictEqual(original, sorted);
    });
  });

  describe("groupSkillsByCapability", () => {
    const testCapabilities = [
      { id: "delivery", ordinalRank: 1 },
      { id: "ai", ordinalRank: 2 },
      { id: "scale", ordinalRank: 3 },
    ];

    it("groups skills by capability in order", () => {
      const skills = [
        { id: "s1", name: "B", capability: "ai" },
        { id: "s2", name: "A", capability: "delivery" },
        { id: "s3", name: "C", capability: "ai" },
      ];
      const grouped = groupSkillsByCapability(skills, testCapabilities);
      const keys = Object.keys(grouped);
      assert.strictEqual(keys[0], "delivery");
      assert.strictEqual(keys[1], "ai");
      assert.strictEqual(grouped.delivery.length, 1);
      assert.strictEqual(grouped.ai.length, 2);
      // Skills within capability should be sorted by name
      assert.strictEqual(grouped.ai[0].name, "B");
      assert.strictEqual(grouped.ai[1].name, "C");
    });

    it("excludes empty capabilities", () => {
      const skills = [{ id: "s1", name: "A", capability: "delivery" }];
      const grouped = groupSkillsByCapability(skills, testCapabilities);
      assert.ok(!grouped.scale);
      assert.ok(!grouped.ai);
      assert.strictEqual(Object.keys(grouped).length, 1);
    });
  });
});

// ============================================================================
// Capability Function Tests
// ============================================================================

describe("Capability Functions", () => {
  describe("getCapabilityById", () => {
    it("returns capability by ID", () => {
      const capability = getCapabilityById(testCategories, "scale");
      assert.ok(capability);
      assert.strictEqual(capability.id, "scale");
      assert.strictEqual(capability.name, "Scale");
    });

    it("returns undefined for unknown ID", () => {
      const capability = getCapabilityById(testCategories, "unknown");
      assert.strictEqual(capability, undefined);
    });
  });

  describe("getCapabilityOrder", () => {
    it("returns capabilities sorted by order", () => {
      const ordered = getCapabilityOrder(testCategories);
      assert.strictEqual(ordered[0], "scale");
      assert.strictEqual(ordered[1], "ai");
      assert.strictEqual(ordered[2], "people");
    });

    it("handles empty array", () => {
      const ordered = getCapabilityOrder([]);
      assert.strictEqual(ordered.length, 0);
    });
  });

  describe("getCapabilityEmoji", () => {
    it("returns emoji for capability", () => {
      const emoji = getCapabilityEmoji(testCategories, "scale");
      assert.strictEqual(emoji, "📐");
    });

    it("returns default for unknown capability", () => {
      const emoji = getCapabilityEmoji(testCategories, "unknown");
      assert.strictEqual(emoji, "💡");
    });
  });

  describe("getCapabilityResponsibility", () => {
    it("returns responsibility for capability and level", () => {
      const responsibility = getCapabilityResponsibility(
        testCategories,
        "scale",
        "working",
      );
      assert.strictEqual(responsibility, "Design scalable components");
    });

    it("returns undefined for unknown capability", () => {
      const responsibility = getCapabilityResponsibility(
        testCategories,
        "unknown",
        "working",
      );
      assert.strictEqual(responsibility, undefined);
    });

    it("returns undefined for unknown level", () => {
      const responsibility = getCapabilityResponsibility(
        testCategories,
        "scale",
        "mythical",
      );
      assert.strictEqual(responsibility, undefined);
    });
  });
});

describe("Framework emoji function", () => {
  describe("getConceptEmoji", () => {
    const testFramework = {
      entityDefinitions: {
        driver: { emojiIcon: "🎯" },
        skill: { emojiIcon: "💼" },
        behaviour: { emojiIcon: "🧠" },
        discipline: { emojiIcon: "🔧" },
        grade: { emojiIcon: "📊" },
        track: { emojiIcon: "🛤️" },
      },
    };

    it("returns emoji for valid concept", () => {
      assert.strictEqual(getConceptEmoji(testFramework, "driver"), "🎯");
      assert.strictEqual(getConceptEmoji(testFramework, "skill"), "💼");
      assert.strictEqual(getConceptEmoji(testFramework, "behaviour"), "🧠");
      assert.strictEqual(getConceptEmoji(testFramework, "discipline"), "🔧");
      assert.strictEqual(getConceptEmoji(testFramework, "grade"), "📊");
      assert.strictEqual(getConceptEmoji(testFramework, "track"), "🛤️");
    });

    it("returns default emoji for unknown concept", () => {
      const emoji = getConceptEmoji(testFramework, "unknown");
      assert.strictEqual(emoji, "💡");
    });

    it("returns default emoji when framework is null", () => {
      const emoji = getConceptEmoji(null, "driver");
      assert.strictEqual(emoji, "💡");
    });

    it("returns default emoji when concept has no emoji", () => {
      const framework = { entityDefinitions: { driver: { name: "Drivers" } } };
      const emoji = getConceptEmoji(framework, "driver");
      assert.strictEqual(emoji, "💡");
    });
  });
});

describe("deriveResponsibilities", () => {
  it("returns empty array when no capabilities provided", () => {
    const skillMatrix = [
      { skillId: "skill_a", capability: "scale", level: "working" },
    ];
    const result = deriveResponsibilities({
      skillMatrix,
      capabilities: [],
    });
    assert.strictEqual(result.length, 0);
  });

  it("excludes awareness-only capabilities", () => {
    const skillMatrix = [
      { skillId: "skill_a", capability: "scale", level: "awareness" },
    ];
    const result = deriveResponsibilities({
      skillMatrix,
      capabilities: testCategories,
    });
    assert.strictEqual(result.length, 0);
  });

  it("includes capabilities based on skill level", () => {
    // skill_a is in testDiscipline.coreSkills and has capability "scale"
    const skillMatrix = [
      { skillId: "skill_a", capability: "scale", level: "working" },
    ];
    const result = deriveResponsibilities({
      skillMatrix,
      capabilities: testCategories,
    });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].capability, "scale");
    assert.strictEqual(result[0].level, "working");
  });

  it("uses highest skill level in each capability", () => {
    const skillMatrix = [
      { skillId: "skill_a", capability: "scale", level: "working" },
      { skillId: "skill_extra", capability: "scale", level: "practitioner" },
    ];
    const result = deriveResponsibilities({
      skillMatrix,
      capabilities: testCategories,
    });
    // Should use practitioner level for scale capability
    const scaleResp = result.find((r) => r.capability === "scale");
    assert.ok(scaleResp);
    assert.strictEqual(scaleResp.level, "practitioner");
    assert.strictEqual(
      scaleResp.responsibility,
      "Lead architectural decisions",
    );
  });

  it("includes responsibility from capability definition", () => {
    const skillMatrix = [
      { skillId: "skill_b", capability: "ai", level: "working" },
    ];
    const result = deriveResponsibilities({
      skillMatrix,
      capabilities: testCategories,
    });
    const aiResp = result.find((r) => r.capability === "ai");
    assert.ok(aiResp);
    assert.strictEqual(aiResp.responsibility, "Integrate AI capabilities");
    assert.strictEqual(aiResp.level, "working");
  });

  it("includes emoji from capability", () => {
    const skillMatrix = [
      { skillId: "skill_a", capability: "scale", level: "working" },
    ];
    const result = deriveResponsibilities({
      skillMatrix,
      capabilities: testCategories,
    });
    assert.strictEqual(result[0].emojiIcon, "📐");
  });
});

describe("deriveJob with capabilities", () => {
  it("includes derived responsibilities when capabilities provided", () => {
    const job = deriveJob({
      discipline: testDiscipline,
      grade: testGrade,
      track: testTrack,
      skills: testSkills,
      behaviours: testBehaviours,
      capabilities: testCategories,
    });

    assert.ok(job);
    assert.ok(job.derivedResponsibilities);
    assert.ok(Array.isArray(job.derivedResponsibilities));
    assert.ok(job.derivedResponsibilities.length > 0);
  });

  it("returns empty responsibilities when no capabilities provided", () => {
    const job = deriveJob({
      discipline: testDiscipline,
      grade: testGrade,
      track: testTrack,
      skills: testSkills,
      behaviours: testBehaviours,
    });

    assert.ok(job);
    assert.ok(Array.isArray(job.derivedResponsibilities));
    assert.strictEqual(job.derivedResponsibilities.length, 0);
  });
});

// ============================================================================
// Validation Tests
// ============================================================================

describe("Validation", () => {
  describe("validateAllData", () => {
    it("validates complete valid data", () => {
      const result = validateAllData({
        skills: testSkills,
        behaviours: testBehaviours,
        disciplines: [testDiscipline],
        tracks: [testTrack],
        grades: [testGrade],
        drivers: testDrivers,
        capabilities: testCategories,
      });

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    it("detects missing required fields", () => {
      const result = validateAllData({
        skills: [{ name: "No ID" }],
        behaviours: testBehaviours,
        disciplines: [testDiscipline],
        tracks: [testTrack],
        grades: [testGrade],
      });

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.type === "MISSING_REQUIRED"));
    });

    it("detects invalid references in disciplines", () => {
      const result = validateAllData({
        skills: testSkills,
        behaviours: testBehaviours,
        disciplines: [
          {
            ...testDiscipline,
            coreSkills: ["nonexistent_skill"],
          },
        ],
        tracks: [testTrack],
        grades: [testGrade],
      });

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.type === "INVALID_REFERENCE"));
    });

    it("detects invalid matching weights", () => {
      const result = validateAllData({
        skills: testSkills,
        behaviours: testBehaviours,
        disciplines: [testDiscipline],
        tracks: [
          {
            ...testTrack,
            assessmentWeights: { skillWeight: 0.7, behaviourWeight: 0.5 }, // Sums to 1.2
          },
        ],
        grades: [testGrade],
      });

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.message.includes("sum to 1.0")));
    });

    it("detects duplicate IDs", () => {
      const result = validateAllData({
        skills: [testSkills[0], testSkills[0]], // Duplicate
        behaviours: testBehaviours,
        disciplines: [testDiscipline],
        tracks: [testTrack],
        grades: [testGrade],
      });

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.type === "DUPLICATE_ID"));
    });

    it("validates discipline with specialization and roleTitle", () => {
      const result = validateAllData({
        skills: testSkills,
        behaviours: testBehaviours,
        disciplines: [testDiscipline], // Uses specialization/roleTitle
        tracks: [testTrack],
        grades: [testGrade],
        drivers: testDrivers,
        capabilities: testCategories,
      });

      assert.strictEqual(result.valid, true);
    });

    it("validates grade with professionalTitle and managementTitle", () => {
      const result = validateAllData({
        skills: testSkills,
        behaviours: testBehaviours,
        disciplines: [testDiscipline],
        tracks: [testTrack],
        grades: [testGrade], // Uses professionalTitle/managementTitle
        drivers: testDrivers,
        capabilities: testCategories,
      });

      assert.strictEqual(result.valid, true);
    });

    it("validates discipline with validTracks constraint", () => {
      const disciplineWithValidTracks = {
        ...testDiscipline,
        validTracks: ["test_track"],
      };

      const result = validateAllData({
        skills: testSkills,
        behaviours: testBehaviours,
        disciplines: [disciplineWithValidTracks],
        tracks: [testTrack],
        grades: [testGrade],
        drivers: testDrivers,
        capabilities: testCategories,
      });

      assert.strictEqual(result.valid, true);
    });

    it("detects invalid validTracks references", () => {
      const disciplineWithInvalidTracks = {
        ...testDiscipline,
        validTracks: ["nonexistent_track"],
      };

      const result = validateAllData({
        skills: testSkills,
        behaviours: testBehaviours,
        disciplines: [disciplineWithInvalidTracks],
        tracks: [testTrack],
        grades: [testGrade],
      });

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.type === "INVALID_REFERENCE"));
    });

    it("allows null in validTracks array", () => {
      const disciplineWithNull = {
        ...testDiscipline,
        validTracks: [null, "test_track"],
      };

      const result = validateAllData({
        skills: testSkills,
        behaviours: testBehaviours,
        disciplines: [disciplineWithNull],
        tracks: [testTrack],
        grades: [testGrade],
        drivers: testDrivers,
        capabilities: testCategories,
      });

      assert.strictEqual(result.valid, true);
    });

    it("validates discipline with professional/management flags", () => {
      const managementDiscipline = {
        ...testDiscipline,
        id: "management_discipline",
        isProfessional: false,
        isManagement: true,
      };

      const result = validateAllData({
        skills: testSkills,
        behaviours: testBehaviours,
        disciplines: [managementDiscipline],
        tracks: [testTrack],
        grades: [testGrade],
        drivers: testDrivers,
        capabilities: testCategories,
      });

      assert.strictEqual(result.valid, true);
    });

    it("detects invalid professional/management flag types", () => {
      const invalidDiscipline = {
        ...testDiscipline,
        isProfessional: "yes", // Should be boolean
      };

      const result = validateAllData({
        skills: testSkills,
        behaviours: testBehaviours,
        disciplines: [invalidDiscipline],
        tracks: [testTrack],
        grades: [testGrade],
      });

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.type === "INVALID_VALUE"));
    });

    it("detects invalid skillModifier keys (non-capability keys)", () => {
      const trackWithInvalidModifiers = {
        ...testTrack,
        id: "invalid_modifiers_track",
        skillModifiers: {
          delivery: 1, // Valid capability
          invalid_key: -1, // Invalid - not a capability
          coding: 1, // Invalid - skill ID, not a capability
        },
      };

      const result = validateAllData({
        skills: testSkills,
        behaviours: testBehaviours,
        disciplines: [testDiscipline],
        tracks: [trackWithInvalidModifiers],
        grades: [testGrade],
      });

      assert.strictEqual(result.valid, false);
      assert.ok(
        result.errors.some((e) => e.type === "INVALID_SKILL_MODIFIER_KEY"),
      );
      assert.ok(result.errors.some((e) => e.message.includes("invalid_key")));
    });

    it("accepts valid capability keys in skillModifiers", () => {
      const trackWithValidModifiers = {
        ...testTrack,
        id: "valid_modifiers_track",
        skillModifiers: {
          scale: 1,
          ai: -1,
          people: 1,
        },
      };

      // Update discipline to reference the new track
      const disciplineForTest = {
        ...testDiscipline,
        validTracks: ["valid_modifiers_track"],
      };

      const result = validateAllData({
        skills: testSkills,
        behaviours: testBehaviours,
        disciplines: [disciplineForTest],
        tracks: [trackWithValidModifiers],
        grades: [testGrade],
        drivers: testDrivers,
        capabilities: testCategories,
      });

      assert.strictEqual(result.valid, true);
    });

    it("validates grade with breadthRequirements", () => {
      const seniorGrade = {
        ...testGrade,
        id: "senior_grade",
        ordinalRank: 5,
        breadthRequirements: {
          practitioner: 4,
          expert: 2,
        },
      };

      const result = validateAllData({
        skills: testSkills,
        behaviours: testBehaviours,
        disciplines: [testDiscipline],
        tracks: [testTrack],
        grades: [seniorGrade],
        drivers: testDrivers,
        capabilities: testCategories,
      });

      assert.strictEqual(result.valid, true);
    });

    it("validates grade with typicalExperienceRange", () => {
      const gradeWithExperience = {
        ...testGrade,
        typicalExperienceRange: "5-8",
      };

      const result = validateAllData({
        skills: testSkills,
        behaviours: testBehaviours,
        disciplines: [testDiscipline],
        tracks: [testTrack],
        grades: [gradeWithExperience],
        drivers: testDrivers,
        capabilities: testCategories,
      });

      assert.strictEqual(result.valid, true);
    });

    it("validates categories when provided", () => {
      const result = validateAllData({
        skills: testSkills,
        behaviours: testBehaviours,
        disciplines: [testDiscipline],
        tracks: [testTrack],
        grades: [testGrade],
        capabilities: testCategories,
        drivers: testDrivers,
      });

      assert.strictEqual(result.valid, true);
    });

    it("detects missing capability id", () => {
      const result = validateAllData({
        skills: testSkills,
        behaviours: testBehaviours,
        disciplines: [testDiscipline],
        tracks: [testTrack],
        grades: [testGrade],
        capabilities: [{ name: "No ID", emojiIcon: "🚀" }],
      });

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.type === "MISSING_REQUIRED"));
    });

    it("detects duplicate capability IDs", () => {
      const result = validateAllData({
        skills: testSkills,
        behaviours: testBehaviours,
        disciplines: [testDiscipline],
        tracks: [testTrack],
        grades: [testGrade],
        capabilities: [testCategories[0], testCategories[0]], // Duplicate
      });

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.type === "DUPLICATE_ID"));
    });

    it("detects invalid skill capability references when capabilities provided", () => {
      const skillsWithInvalidCapability = [
        { ...testSkills[0], capability: "nonexistent_capability" },
      ];

      const result = validateAllData({
        skills: skillsWithInvalidCapability,
        behaviours: testBehaviours,
        disciplines: [
          {
            ...testDiscipline,
            coreSkills: [skillsWithInvalidCapability[0].id],
          },
        ],
        tracks: [testTrack],
        grades: [testGrade],
        capabilities: testCategories,
      });

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.type === "INVALID_REFERENCE"));
      assert.ok(
        result.errors.some((e) => e.message.includes("unknown capability")),
      );
    });

    it("warns on missing capability responsibilities", () => {
      // Provide categories for all skill categories used in testSkills
      const minimalCategories = [
        { id: "scale", name: "Scale" }, // No responsibilities
        { id: "ai", name: "AI", professionalResponsibilities: {} },
        { id: "people", name: "People", managementResponsibilities: {} },
      ];

      const result = validateAllData({
        skills: testSkills,
        behaviours: testBehaviours,
        disciplines: [testDiscipline],
        tracks: [testTrack],
        grades: [testGrade],
        capabilities: minimalCategories,
        drivers: testDrivers,
      });

      assert.strictEqual(result.valid, true);
      assert.ok(
        result.warnings.some((w) => w.message.includes("Responsibilities")),
      );
    });
  });

  describe("validateSelfAssessment", () => {
    it("validates valid self-assessment", () => {
      const result = validateSelfAssessment(
        {
          skillLevels: { skill_a: "working", skill_b: "foundational" },
          behaviourMaturities: { behaviour_x: "practicing" },
        },
        testSkills,
        testBehaviours,
      );

      assert.strictEqual(result.valid, true);
    });

    it("detects invalid skill references", () => {
      const result = validateSelfAssessment(
        {
          skillLevels: { nonexistent: "working" },
          behaviourMaturities: {},
        },
        testSkills,
        testBehaviours,
      );

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.type === "INVALID_REFERENCE"));
    });

    it("detects invalid skill levels", () => {
      const result = validateSelfAssessment(
        {
          skillLevels: { skill_a: "master" }, // Invalid level
          behaviourMaturities: {},
        },
        testSkills,
        testBehaviours,
      );

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.type === "INVALID_VALUE"));
    });
  });

  describe("validateQuestionBank", () => {
    it("validates valid question bank", () => {
      const result = validateQuestionBank(
        {
          skillLevels: {
            skill_a: {
              professionalQuestions: {
                practitioner: [
                  { id: "q1", text: "Question 1", type: "technical" },
                ],
              },
            },
          },
          behaviourMaturities: {
            behaviour_x: {
              professionalQuestions: {
                practicing: [
                  { id: "q2", text: "Question 2", type: "behavioural" },
                ],
              },
            },
          },
        },
        testSkills,
        testBehaviours,
      );

      assert.strictEqual(result.valid, true);
    });

    it("detects invalid skill references in question bank", () => {
      const result = validateQuestionBank(
        {
          skillLevels: {
            nonexistent_skill: {
              professionalQuestions: {
                practitioner: [
                  { id: "q1", text: "Question 1", type: "technical" },
                ],
              },
            },
          },
          behaviourMaturities: {},
        },
        testSkills,
        testBehaviours,
      );

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.type === "INVALID_REFERENCE"));
    });

    it("detects invalid skill levels in question bank", () => {
      const result = validateQuestionBank(
        {
          skillLevels: {
            skill_a: {
              professionalQuestions: {
                master: [{ id: "q1", text: "Question 1", type: "technical" }],
              },
            },
          },
          behaviourMaturities: {},
        },
        testSkills,
        testBehaviours,
      );

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.type === "INVALID_VALUE"));
    });
  });
});

// ============================================================================
// Derivation Tests
// ============================================================================

describe("Derivation", () => {
  describe("getSkillTypeForDiscipline", () => {
    it("identifies primary skills", () => {
      assert.strictEqual(
        getSkillTypeForDiscipline(testDiscipline, "skill_a"),
        "primary",
      );
    });

    it("identifies secondary skills", () => {
      assert.strictEqual(
        getSkillTypeForDiscipline(testDiscipline, "skill_b"),
        "secondary",
      );
    });

    it("identifies broad skills", () => {
      assert.strictEqual(
        getSkillTypeForDiscipline(testDiscipline, "skill_c"),
        "broad",
      );
    });

    it("returns null for skills not in discipline", () => {
      assert.strictEqual(
        getSkillTypeForDiscipline(testDiscipline, "unknown"),
        null,
      );
    });
  });

  describe("deriveSkillLevel", () => {
    it("derives correct level for primary skill with modifier capped at grade max", () => {
      // Primary skill (practitioner) + modifier (+1 from scale capability)
      // Cap: max base level for grade is practitioner, so capped at practitioner
      const level = deriveSkillLevel({
        discipline: testDiscipline,
        grade: testGrade,
        track: testTrack,
        skillId: "skill_a",
        skills: testSkills,
      });
      assert.strictEqual(level, "practitioner");
    });

    it("derives correct level for secondary skill with negative modifier", () => {
      // Secondary skill (working) + modifier (-1 from ai capability) = foundational
      const level = deriveSkillLevel({
        discipline: testDiscipline,
        grade: testGrade,
        track: testTrack,
        skillId: "skill_b",
        skills: testSkills,
      });
      assert.strictEqual(level, "foundational");
    });

    it("derives correct level for broad skill without modifier", () => {
      // Broad skill (foundational) + no modifier = foundational
      const level = deriveSkillLevel({
        discipline: testDiscipline,
        grade: testGrade,
        track: testTrack,
        skillId: "skill_c",
        skills: testSkills,
      });
      assert.strictEqual(level, "foundational");
    });

    it("returns null for skills not in discipline", () => {
      const level = deriveSkillLevel({
        discipline: testDiscipline,
        grade: testGrade,
        track: testTrack,
        skillId: "nonexistent",
        skills: testSkills,
      });
      assert.strictEqual(level, null);
    });

    it("clamps to maximum level", () => {
      const expertGrade = {
        ...testGrade,
        baseSkillLevels: {
          primary: "expert",
          secondary: "expert",
          broad: "expert",
        },
      };
      // Expert + 1 should clamp to expert
      const level = deriveSkillLevel({
        discipline: testDiscipline,
        grade: expertGrade,
        track: testTrack,
        skillId: "skill_a",
        skills: testSkills,
      });
      assert.strictEqual(level, "expert");
    });

    it("allows positive modifier up to grade max when base is lower", () => {
      // Create a grade where expert is the max, but secondary is lower
      const mixedGrade = {
        ...testGrade,
        baseSkillLevels: {
          primary: "expert",
          secondary: "practitioner",
          broad: "working",
        },
      };
      // Secondary skill (practitioner) + modifier (+1) = expert
      // This is allowed because expert is the grade's max base level
      const trackWithAiBoost = {
        ...testTrack,
        skillModifiers: { ai: 1 },
      };
      const level = deriveSkillLevel({
        discipline: testDiscipline,
        grade: mixedGrade,
        track: trackWithAiBoost,
        skillId: "skill_b", // secondary skill with AI capability
        skills: testSkills,
      });
      assert.strictEqual(level, "expert");
    });

    it("caps positive modifier at grade max even when would exceed", () => {
      // Secondary skill (working) would be practitioner with +1
      // But max base is practitioner, so it's capped there
      const capGrade = {
        ...testGrade,
        baseSkillLevels: {
          primary: "practitioner",
          secondary: "working",
          broad: "awareness",
        },
      };
      const trackWithAiBoost = {
        ...testTrack,
        skillModifiers: { ai: 2 }, // Would push working +2 = expert
      };
      const level = deriveSkillLevel({
        discipline: testDiscipline,
        grade: capGrade,
        track: trackWithAiBoost,
        skillId: "skill_b", // secondary skill with AI capability
        skills: testSkills,
      });
      // working (2) + 2 = expert (4), but capped at practitioner (3)
      assert.strictEqual(level, "practitioner");
    });

    it("allows negative modifier to go below grade base", () => {
      // Negative modifiers should not be capped - they create emphasis
      const level = deriveSkillLevel({
        discipline: testDiscipline,
        grade: testGrade,
        track: testTrack,
        skillId: "skill_b", // AI skill with -1 modifier
        skills: testSkills,
      });
      // Secondary (working) - 1 = foundational
      assert.strictEqual(level, "foundational");
    });
  });

  describe("deriveBehaviourMaturity", () => {
    it("elevates maturity for behaviour with discipline modifier", () => {
      // Base (practicing) + modifier (+1) = role_modeling
      const maturity = deriveBehaviourMaturity({
        discipline: testDiscipline,
        grade: testGrade,
        track: { ...testTrack, behaviourModifiers: {} },
        behaviourId: "behaviour_x",
      });
      assert.strictEqual(maturity, "role_modeling");
    });

    it("elevates maturity for behaviour with track modifier", () => {
      // Base (practicing) + elevation (+1) = role_modeling
      const maturity = deriveBehaviourMaturity({
        discipline: { ...testDiscipline, behaviourModifiers: {} },
        grade: testGrade,
        track: testTrack,
        behaviourId: "behaviour_y",
      });
      assert.strictEqual(maturity, "role_modeling");
    });

    it("additively combines modifiers from both sources (clamped)", () => {
      // Both discipline and track modify behaviour_x by +1 each
      // Should be base + 2, clamped to exemplifying (max)
      const trackWithBothModified = {
        ...testTrack,
        behaviourModifiers: { behaviour_x: 1 }, // Also modified by discipline (+1)
      };
      const maturity = deriveBehaviourMaturity({
        discipline: testDiscipline,
        grade: testGrade,
        track: trackWithBothModified,
        behaviourId: "behaviour_x",
      });
      // practicing (2) + 2 = 4, which is now exemplifying (index 4)
      assert.strictEqual(maturity, "exemplifying");
    });

    it("uses base maturity when no modifiers apply", () => {
      const maturity = deriveBehaviourMaturity({
        discipline: { ...testDiscipline, behaviourModifiers: {} },
        grade: testGrade,
        track: { ...testTrack, behaviourModifiers: {} },
        behaviourId: "behaviour_x",
      });
      assert.strictEqual(maturity, "practicing");
    });
  });

  describe("deriveSkillMatrix", () => {
    it("creates complete skill matrix with capped levels", () => {
      const matrix = deriveSkillMatrix({
        discipline: testDiscipline,
        grade: testGrade,
        track: testTrack,
        skills: testSkills,
      });

      assert.strictEqual(matrix.length, 3); // All 3 skills in discipline

      const skillA = matrix.find((s) => s.skillId === "skill_a");
      assert.strictEqual(skillA.type, "primary");
      // Primary skill with +1 modifier capped at grade max (practitioner)
      assert.strictEqual(skillA.level, "practitioner");
    });

    it("only includes skills in the discipline", () => {
      const extraSkill = {
        id: "extra",
        name: "Extra",
        capability: "technical",
      };
      const matrix = deriveSkillMatrix({
        discipline: testDiscipline,
        grade: testGrade,
        track: testTrack,
        skills: [...testSkills, extraSkill],
      });

      assert.strictEqual(matrix.length, 3);
      assert.ok(!matrix.some((s) => s.skillId === "extra"));
    });
  });

  describe("deriveBehaviourProfile", () => {
    it("creates complete behaviour profile", () => {
      const profile = deriveBehaviourProfile({
        discipline: testDiscipline,
        grade: testGrade,
        track: testTrack,
        behaviours: testBehaviours,
      });

      assert.strictEqual(profile.length, 2); // All behaviours
      assert.ok(profile.every((b) => b.behaviourId && b.maturity));
    });

    it("sorts behaviours alphabetically by name", () => {
      const profile = deriveBehaviourProfile({
        discipline: { ...testDiscipline, behaviourModifiers: {} },
        grade: testGrade,
        track: { ...testTrack, behaviourModifiers: {} },
        behaviours: [
          { id: "behaviour_z", name: "Zebra Behaviour", description: "Third" },
          { id: "behaviour_a", name: "Alpha Behaviour", description: "First" },
          {
            id: "behaviour_m",
            name: "Middle Behaviour",
            description: "Second",
          },
        ],
      });

      assert.strictEqual(profile[0].behaviourName, "Alpha Behaviour");
      assert.strictEqual(profile[1].behaviourName, "Middle Behaviour");
      assert.strictEqual(profile[2].behaviourName, "Zebra Behaviour");
    });
  });

  describe("getDisciplineSkillIds", () => {
    it("returns all skill IDs from a discipline", () => {
      const skillIds = getDisciplineSkillIds(testDiscipline);

      assert.strictEqual(skillIds.length, 3);
      assert.ok(skillIds.includes("skill_a")); // core
      assert.ok(skillIds.includes("skill_b")); // secondary
      assert.ok(skillIds.includes("skill_c")); // broad
    });

    it("handles disciplines with missing skill arrays", () => {
      const minimalDiscipline = {
        id: "minimal",
        specialization: "Minimal",
        roleTitle: "Minimalist",
        coreSkills: ["skill_a"],
      };

      const skillIds = getDisciplineSkillIds(minimalDiscipline);

      assert.strictEqual(skillIds.length, 1);
      assert.ok(skillIds.includes("skill_a"));
    });
  });

  describe("getGradeLevel", () => {
    it("returns the grade level number", () => {
      assert.strictEqual(getGradeLevel(testGrade), 3);
      assert.strictEqual(getGradeLevel({ ...testGrade, ordinalRank: 5 }), 5);
    });
  });

  describe("deriveJob", () => {
    it("creates complete job definition", () => {
      const job = deriveJob({
        discipline: testDiscipline,
        grade: testGrade,
        track: testTrack,
        skills: testSkills,
        behaviours: testBehaviours,
      });

      assert.ok(job);
      assert.strictEqual(job.id, "test_discipline_test_grade_test_track");
      assert.ok(job.title.includes("Test"));
      assert.strictEqual(job.skillMatrix.length, 3);
      assert.strictEqual(job.behaviourProfile.length, 2);
    });

    it("returns null for invalid combinations", () => {
      const validationRules = {
        invalidCombinations: [
          { discipline: "test_discipline", grade: "test_grade" },
        ],
      };

      const job = deriveJob({
        discipline: testDiscipline,
        grade: testGrade,
        track: testTrack,
        skills: testSkills,
        behaviours: testBehaviours,
        validationRules,
      });

      assert.strictEqual(job, null);
    });

    it("creates trackless job definition", () => {
      const job = deriveJob({
        discipline: testDiscipline,
        grade: testGrade,
        track: null,
        skills: testSkills,
        behaviours: testBehaviours,
      });

      assert.ok(job);
      assert.strictEqual(job.id, "test_discipline_test_grade");
      assert.strictEqual(job.track, null);
      assert.ok(job.title.includes("Test"));
      assert.strictEqual(job.skillMatrix.length, 3);
      assert.strictEqual(job.behaviourProfile.length, 2);
    });
  });

  describe("isValidJobCombination", () => {
    it("returns true when no rules defined", () => {
      assert.strictEqual(
        isValidJobCombination({
          discipline: testDiscipline,
          grade: testGrade,
          track: testTrack,
          grades: [],
        }),
        true,
      );
    });

    it("respects invalid combinations", () => {
      const rules = {
        invalidCombinations: [
          { discipline: "test_discipline", track: "test_track" },
        ],
      };

      assert.strictEqual(
        isValidJobCombination({
          discipline: testDiscipline,
          grade: testGrade,
          track: testTrack,
          validationRules: rules,
          grades: [],
        }),
        false,
      );
    });

    it("respects discipline validTracks constraint", () => {
      const disciplineWithValidTracks = {
        ...testDiscipline,
        validTracks: ["other_track"],
      };

      assert.strictEqual(
        isValidJobCombination({
          discipline: disciplineWithValidTracks,
          grade: testGrade,
          track: testTrack,
          grades: [],
        }),
        false,
      );
    });

    it("allows combination when track is in validTracks", () => {
      const disciplineWithValidTracks = {
        ...testDiscipline,
        validTracks: ["test_track", "other_track"],
      };

      assert.strictEqual(
        isValidJobCombination({
          discipline: disciplineWithValidTracks,
          grade: testGrade,
          track: testTrack,
          grades: [],
        }),
        true,
      );
    });

    it("allows all tracks when validTracks is empty (legacy behavior)", () => {
      const disciplineWithEmptyValidTracks = {
        ...testDiscipline,
        validTracks: [],
      };

      // Legacy behavior: empty array allows all tracks
      assert.strictEqual(
        isValidJobCombination({
          discipline: disciplineWithEmptyValidTracks,
          grade: testGrade,
          track: testTrack,
          grades: [],
        }),
        true,
      );
    });

    it("allows trackless when null is in validTracks", () => {
      const disciplineWithNullInValidTracks = {
        ...testDiscipline,
        validTracks: [null, "dx"],
      };

      assert.strictEqual(
        isValidJobCombination({
          discipline: disciplineWithNullInValidTracks,
          grade: testGrade,
          track: null,
          grades: [],
        }),
        true,
      );
    });

    it("rejects trackless when null is not in validTracks", () => {
      const disciplineWithOnlyTrackIds = {
        ...testDiscipline,
        validTracks: ["dx", "platform"],
      };

      assert.strictEqual(
        isValidJobCombination({
          discipline: disciplineWithOnlyTrackIds,
          grade: testGrade,
          track: null,
          grades: [],
        }),
        false,
      );
    });

    it("allows track when track ID is in validTracks with null", () => {
      const disciplineWithNullAndTrack = {
        ...testDiscipline,
        validTracks: [null, "test_track"],
      };

      assert.strictEqual(
        isValidJobCombination({
          discipline: disciplineWithNullAndTrack,
          grade: testGrade,
          track: testTrack,
          grades: [],
        }),
        true,
      );
    });

    it("rejects track when validTracks only contains null", () => {
      const disciplineWithOnlyNull = {
        ...testDiscipline,
        validTracks: [null],
      };

      assert.strictEqual(
        isValidJobCombination({
          discipline: disciplineWithOnlyNull,
          grade: testGrade,
          track: testTrack,
          grades: [],
        }),
        false,
      );
    });

    it("respects discipline minGrade constraint", () => {
      const juniorGrade = { id: "junior", ordinalRank: 1 };
      const seniorGrade = { id: "senior", ordinalRank: 5 };
      const grades = [juniorGrade, seniorGrade];

      const disciplineWithMinGrade = {
        ...testDiscipline,
        minGrade: "senior",
      };

      // Junior grade should be invalid
      assert.strictEqual(
        isValidJobCombination({
          discipline: disciplineWithMinGrade,
          grade: juniorGrade,
          track: testTrack,
          grades,
        }),
        false,
      );

      // Senior grade should be valid
      assert.strictEqual(
        isValidJobCombination({
          discipline: disciplineWithMinGrade,
          grade: seniorGrade,
          track: testTrack,
          grades,
        }),
        true,
      );
    });

    it("allows all grades when minGrade is not set", () => {
      const juniorGrade = { id: "junior", ordinalRank: 1 };
      const grades = [juniorGrade];

      const disciplineWithoutMinGrade = {
        ...testDiscipline,
      };
      delete disciplineWithoutMinGrade.minGrade;

      assert.strictEqual(
        isValidJobCombination({
          discipline: disciplineWithoutMinGrade,
          grade: juniorGrade,
          track: testTrack,
          grades,
        }),
        true,
      );
    });

    it("allows trackless job combination", () => {
      assert.strictEqual(
        isValidJobCombination({
          discipline: testDiscipline,
          grade: testGrade,
          track: null,
          grades: [],
        }),
        true,
      );
    });
  });

  describe("generateJobTitle", () => {
    it("generates title for professional track with Level grade", () => {
      const title = generateJobTitle(testDiscipline, testGrade, testTrack);
      // Grade is "Level III", so format is: "Test Engineer Level III - Test Track"
      assert.strictEqual(title, "Test Engineer Level III - Test Track");
    });

    it("generates title for professional track with non-Level grade", () => {
      const staffGrade = {
        ...testGrade,
        professionalTitle: "Staff",
        managementTitle: "Senior Manager",
      };
      const title = generateJobTitle(testDiscipline, staffGrade, testTrack);
      // Grade is "Staff", so format is: "Staff Test Engineer - Test Track"
      assert.strictEqual(title, "Staff Test Engineer - Test Track");
    });

    it("generates title for management discipline", () => {
      const managementDiscipline = {
        ...testDiscipline,
        isProfessional: false,
        isManagement: true,
      };
      const title = generateJobTitle(
        managementDiscipline,
        testGrade,
        testTrack,
      );
      // Management discipline format: "Manager, Role Title – Track Name"
      assert.strictEqual(title, "Manager, Test Engineer – Test Track");
    });

    it("generates title for trackless management discipline", () => {
      const managementDiscipline = {
        ...testDiscipline,
        isProfessional: false,
        isManagement: true,
      };
      const title = generateJobTitle(managementDiscipline, testGrade, null);
      // Trackless management format: "Manager, Role Title"
      assert.strictEqual(title, "Manager, Test Engineer");
    });

    it("generates title for trackless professional discipline", () => {
      const title = generateJobTitle(testDiscipline, testGrade, null);
      // Trackless professional format: "Test Engineer Level III"
      assert.strictEqual(title, "Test Engineer Level III");
    });
  });

  describe("isSeniorGrade", () => {
    it("returns false for grades below level 5", () => {
      assert.strictEqual(isSeniorGrade(testGrade), false); // level 3
      assert.strictEqual(
        isSeniorGrade({ ...testGrade, ordinalRank: 4 }),
        false,
      );
    });

    it("returns true for grades at level 5 or above", () => {
      assert.strictEqual(isSeniorGrade({ ...testGrade, ordinalRank: 5 }), true);
      assert.strictEqual(isSeniorGrade({ ...testGrade, ordinalRank: 6 }), true);
      assert.strictEqual(isSeniorGrade({ ...testGrade, ordinalRank: 7 }), true);
    });
  });

  describe("calculateDriverCoverage", () => {
    it("calculates coverage for drivers", () => {
      const job = deriveJob({
        discipline: testDiscipline,
        grade: testGrade,
        track: testTrack,
        skills: testSkills,
        behaviours: testBehaviours,
      });

      const coverage = calculateDriverCoverage({ job, drivers: testDrivers });

      assert.strictEqual(coverage.length, 1);
      assert.strictEqual(coverage[0].driverId, "driver_1");
      assert.ok(
        coverage[0].skillCoverage >= 0 && coverage[0].skillCoverage <= 1,
      );
      assert.ok(coverage[0].overallScore >= 0 && coverage[0].overallScore <= 1);
    });
  });
});

// ============================================================================
// Matching Tests
// ============================================================================

describe("Matching", () => {
  const job = deriveJob({
    discipline: testDiscipline,
    grade: testGrade,
    track: testTrack,
    skills: testSkills,
    behaviours: testBehaviours,
  });

  describe("calculateJobMatch", () => {
    it("calculates perfect match score", () => {
      const perfectAssessment = {
        skillLevels: {
          skill_a: "expert",
          skill_b: "foundational",
          skill_c: "foundational",
        },
        behaviourMaturities: {
          behaviour_x: "role_modeling",
          behaviour_y: "role_modeling",
        },
      };

      const match = calculateJobMatch(perfectAssessment, job);

      assert.strictEqual(match.overallScore, 1);
      assert.strictEqual(match.skillScore, 1);
      assert.strictEqual(match.behaviourScore, 1);
      assert.strictEqual(match.gaps.length, 0);
    });

    it("uses track matching weights", () => {
      const match = calculateJobMatch(
        {
          skillLevels: {
            skill_a: "expert",
            skill_b: "foundational",
            skill_c: "foundational",
          },
          behaviourMaturities: {
            behaviour_x: "emerging",
            behaviour_y: "emerging",
          },
        },
        job,
      );

      // Track has 0.6 skills, 0.4 behaviours
      assert.deepStrictEqual(match.weightsUsed, {
        skillWeight: 0.6,
        behaviourWeight: 0.4,
      });
    });

    it("identifies gaps correctly", () => {
      const weakAssessment = {
        skillLevels: { skill_a: "awareness" }, // Much lower than expert
        behaviourMaturities: { behaviour_x: "emerging" }, // Much lower than role_modeling
      };

      const match = calculateJobMatch(weakAssessment, job);

      assert.ok(match.gaps.length > 0);
      assert.ok(match.gaps.some((g) => g.type === "skill"));
      assert.ok(match.gaps.some((g) => g.type === "behaviour"));
    });

    it("gives partial credit for close levels with smooth decay", () => {
      // One level below should give 0.7 credit (smooth decay scoring)
      // Job requires: skill_a=practitioner, skill_b=foundational, skill_c=foundational
      // Job requires: behaviour_x=role_modeling, behaviour_y=role_modeling
      const closeAssessment = {
        skillLevels: {
          skill_a: "working", // One below practitioner
          skill_b: "awareness", // One below foundational
          skill_c: "awareness", // One below foundational
        },
        behaviourMaturities: {
          behaviour_x: "practicing", // One below role_modeling
          behaviour_y: "practicing", // One below role_modeling
        },
      };

      const match = calculateJobMatch(closeAssessment, job);

      // Each item one level below gives 0.7 credit (smooth decay)
      assert.ok(Math.abs(match.skillScore - 0.7) < 0.001);
      assert.ok(Math.abs(match.behaviourScore - 0.7) < 0.001);
    });

    it("includes tier classification", () => {
      const perfectAssessment = {
        skillLevels: {
          skill_a: "expert",
          skill_b: "foundational",
          skill_c: "foundational",
        },
        behaviourMaturities: {
          behaviour_x: "role_modeling",
          behaviour_y: "role_modeling",
        },
      };

      const match = calculateJobMatch(perfectAssessment, job);

      // Perfect match should be tier 1 (Strong Match)
      assert.ok(match.tier);
      assert.strictEqual(match.tier.tier, 1);
      assert.strictEqual(match.tier.label, "Strong Match");
      assert.strictEqual(match.tier.color, "green");
    });

    it("includes priority gaps (top 3)", () => {
      const weakAssessment = {
        skillLevels: { skill_a: "awareness" }, // Much lower than expert
        behaviourMaturities: { behaviour_x: "emerging" }, // Much lower than role_modeling
      };

      const match = calculateJobMatch(weakAssessment, job);

      assert.ok(match.priorityGaps);
      assert.ok(match.priorityGaps.length <= 3);
      // Priority gaps should be the largest gaps
      for (let i = 1; i < match.priorityGaps.length; i++) {
        assert.ok(match.priorityGaps[i - 1].gap >= match.priorityGaps[i].gap);
      }
    });

    it("includes expectations score for senior grades", () => {
      const seniorGrade = {
        ...testGrade,
        ordinalRank: 5, // Senior grade (Principal level)
        baseSkillLevels: {
          core: "expert",
          secondary: "practitioner",
          broad: "working",
        },
        baseBehaviourMaturity: "role_modeling",
        expectations: {
          impactScope: "Organization-wide",
          autonomyExpectation: "Strategic direction",
          influenceScope: "Cross-team",
          complexityHandled: "High",
        },
      };

      const seniorJob = deriveJob({
        discipline: testDiscipline,
        grade: seniorGrade,
        track: testTrack,
        skills: testSkills,
        behaviours: testBehaviours,
      });

      const assessmentWithExpectations = {
        skillLevels: {
          skill_a: "expert",
          skill_b: "practitioner",
          skill_c: "working",
        },
        behaviourMaturities: {
          behaviour_x: "role_modeling",
          behaviour_y: "role_modeling",
        },
        expectations: {
          impactScope: "Organization-wide",
          autonomyExpectation: "Strategic direction",
          influenceScope: "Cross-team",
        },
      };

      const match = calculateJobMatch(assessmentWithExpectations, seniorJob);

      // Should have expectations score for senior roles
      assert.ok(match.expectationsScore !== undefined);
      assert.ok(match.expectationsScore >= 0 && match.expectationsScore <= 1);
    });

    it("does not include expectations score for non-senior grades", () => {
      const nonSeniorAssessment = {
        skillLevels: {
          skill_a: "expert",
          skill_b: "foundational",
          skill_c: "foundational",
        },
        behaviourMaturities: {
          behaviour_x: "role_modeling",
          behaviour_y: "role_modeling",
        },
        expectations: {
          impactScope: "Team level",
        },
      };

      const match = calculateJobMatch(nonSeniorAssessment, job);

      // Should NOT have expectations score for non-senior roles
      assert.strictEqual(match.expectationsScore, undefined);
    });
  });

  describe("findMatchingJobs", () => {
    it("returns ranked job matches", () => {
      const matches = findMatchingJobs({
        selfAssessment: {
          skillLevels: { skill_a: "working" },
          behaviourMaturities: { behaviour_x: "developing" },
        },
        disciplines: [testDiscipline],
        grades: [testGrade],
        tracks: [testTrack],
        skills: testSkills,
        behaviours: testBehaviours,
        topN: 5,
      });

      assert.ok(matches.length > 0);
      assert.ok(matches.every((m) => m.job && m.analysis));
    });

    it("respects topN limit", () => {
      const matches = findMatchingJobs({
        selfAssessment: { skillLevels: {}, behaviourMaturities: {} },
        disciplines: [testDiscipline],
        grades: [testGrade, { ...testGrade, id: "grade2", ordinalRank: 2 }],
        tracks: [testTrack],
        skills: testSkills,
        behaviours: testBehaviours,
        topN: 1,
      });

      assert.strictEqual(matches.length, 1);
    });

    it("filters out jobs with invalid validTracks constraints", () => {
      const disciplineWithValidTracks = {
        ...testDiscipline,
        id: "restricted_discipline",
        validTracks: [null, "other_track"], // null allows trackless, test_track not allowed
      };

      const matches = findMatchingJobs({
        selfAssessment: { skillLevels: {}, behaviourMaturities: {} },
        disciplines: [disciplineWithValidTracks],
        grades: [testGrade],
        tracks: [testTrack],
        skills: testSkills,
        behaviours: testBehaviours,
        topN: 10,
      });

      // Should return only the trackless job since test_track isn't in validTracks
      assert.strictEqual(matches.length, 1);
      assert.strictEqual(matches[0].job.track, null);
    });

    it("includes jobs when track matches validTracks", () => {
      const disciplineWithValidTracks = {
        ...testDiscipline,
        id: "restricted_discipline",
        validTracks: [null, "test_track"], // null allows trackless, test_track allowed
      };

      const matches = findMatchingJobs({
        selfAssessment: { skillLevels: {}, behaviourMaturities: {} },
        disciplines: [disciplineWithValidTracks],
        grades: [testGrade],
        tracks: [testTrack],
        skills: testSkills,
        behaviours: testBehaviours,
        topN: 10,
      });

      // Should return both the trackless job and the tracked job
      assert.strictEqual(matches.length, 2);
    });
  });

  describe("deriveDevelopmentPath", () => {
    it("identifies development items", () => {
      const weakAssessment = {
        skillLevels: { skill_a: "foundational" },
        behaviourMaturities: { behaviour_x: "emerging" },
      };

      const path = deriveDevelopmentPath({
        selfAssessment: weakAssessment,
        targetJob: job,
      });

      assert.ok(path.items.length > 0);
      assert.ok(path.estimatedReadiness >= 0 && path.estimatedReadiness <= 1);
    });

    it("prioritizes primary skills", () => {
      const weakAssessment = {
        skillLevels: {
          skill_a: "awareness", // Primary skill, big gap
          skill_c: "awareness", // Broad skill, same gap
        },
        behaviourMaturities: {},
      };

      const path = deriveDevelopmentPath({
        selfAssessment: weakAssessment,
        targetJob: job,
      });

      // Primary skill should have higher priority
      const coreItem = path.items.find((i) => i.id === "skill_a");
      const broadItem = path.items.find((i) => i.id === "skill_c");

      assert.ok(coreItem.priority > broadItem.priority);
    });

    it("returns empty items when fully qualified", () => {
      const perfectAssessment = {
        skillLevels: {
          skill_a: "expert",
          skill_b: "practitioner",
          skill_c: "working",
        },
        behaviourMaturities: {
          behaviour_x: "role_modeling",
          behaviour_y: "role_modeling",
        },
      };

      const path = deriveDevelopmentPath({
        selfAssessment: perfectAssessment,
        targetJob: job,
      });

      assert.strictEqual(path.items.length, 0);
    });
  });

  describe("findNextStepJob", () => {
    it("finds next grade level job", () => {
      const grade2 = { ...testGrade, id: "grade2", ordinalRank: 2 };
      const grade3 = { ...testGrade, id: "grade3", ordinalRank: 3 };
      const grade4 = {
        ...testGrade,
        id: "grade4",
        ordinalRank: 4,
        professionalTitle: "Staff",
        managementTitle: "Senior Manager",
      };

      const currentJob = deriveJob({
        discipline: testDiscipline,
        grade: grade3,
        track: testTrack,
        skills: testSkills,
        behaviours: testBehaviours,
      });

      const result = findNextStepJob({
        selfAssessment: {
          skillLevels: { skill_a: "practitioner" },
          behaviourMaturities: {},
        },
        currentJob,
        _disciplines: [testDiscipline],
        grades: [grade2, grade3, grade4],
        tracks: [testTrack],
        skills: testSkills,
        behaviours: testBehaviours,
      });

      assert.ok(result);
      assert.strictEqual(result.job.grade.ordinalRank, 4);
    });

    it("returns null when at top grade", () => {
      const topGrade = { ...testGrade, id: "top_grade", ordinalRank: 7 };

      const currentJob = deriveJob({
        discipline: testDiscipline,
        grade: topGrade,
        track: testTrack,
        skills: testSkills,
        behaviours: testBehaviours,
      });

      const result = findNextStepJob({
        selfAssessment: { skillLevels: {}, behaviourMaturities: {} },
        currentJob,
        _disciplines: [testDiscipline],
        grades: [topGrade],
        tracks: [testTrack],
        skills: testSkills,
        behaviours: testBehaviours,
      });

      assert.strictEqual(result, null);
    });
  });

  describe("classifyMatch", () => {
    it("classifies scores >= 0.85 as Strong Match (tier 1)", () => {
      const tier = classifyMatch(0.9);
      assert.strictEqual(tier.tier, MatchTier.STRONG);
      assert.strictEqual(tier.label, "Strong Match");
      assert.strictEqual(tier.color, "green");
    });

    it("classifies scores 0.70-0.84 as Good Match (tier 2)", () => {
      const tier = classifyMatch(0.75);
      assert.strictEqual(tier.tier, MatchTier.GOOD);
      assert.strictEqual(tier.label, "Good Match");
      assert.strictEqual(tier.color, "blue");
    });

    it("classifies scores 0.55-0.69 as Stretch Role (tier 3)", () => {
      const tier = classifyMatch(0.6);
      assert.strictEqual(tier.tier, MatchTier.STRETCH);
      assert.strictEqual(tier.label, "Stretch Role");
      assert.strictEqual(tier.color, "amber");
    });

    it("classifies scores < 0.55 as Aspirational (tier 4)", () => {
      const tier = classifyMatch(0.4);
      assert.strictEqual(tier.tier, MatchTier.ASPIRATIONAL);
      assert.strictEqual(tier.label, "Aspirational");
      assert.strictEqual(tier.color, "gray");
    });

    it("handles boundary values correctly", () => {
      assert.strictEqual(classifyMatch(0.85).tier, MatchTier.STRONG);
      assert.strictEqual(classifyMatch(0.7).tier, MatchTier.GOOD);
      assert.strictEqual(classifyMatch(0.55).tier, MatchTier.STRETCH);
      assert.strictEqual(classifyMatch(0.54).tier, MatchTier.ASPIRATIONAL);
    });
  });

  describe("calculateGapScore", () => {
    it("returns 1.0 for no gap or exceeds", () => {
      assert.strictEqual(calculateGapScore(0), GAP_SCORES[0]);
      assert.strictEqual(calculateGapScore(-1), GAP_SCORES[0]);
      assert.strictEqual(calculateGapScore(-2), GAP_SCORES[0]);
    });

    it("returns 0.7 for 1 level gap", () => {
      assert.strictEqual(calculateGapScore(1), GAP_SCORES[1]);
    });

    it("returns 0.4 for 2 level gap", () => {
      assert.strictEqual(calculateGapScore(2), GAP_SCORES[2]);
    });

    it("returns 0.15 for 3 level gap", () => {
      assert.strictEqual(calculateGapScore(3), GAP_SCORES[3]);
    });

    it("returns 0.05 for 4+ level gap", () => {
      assert.strictEqual(calculateGapScore(4), GAP_SCORES[4]);
      assert.strictEqual(calculateGapScore(5), GAP_SCORES[4]);
      assert.strictEqual(calculateGapScore(10), GAP_SCORES[4]);
    });
  });

  describe("estimateBestFitGrade", () => {
    const grades = [
      {
        ...testGrade,
        id: "junior",
        ordinalRank: 1,
        baseSkillLevels: {
          primary: "awareness",
          secondary: "awareness",
          broad: "awareness",
        },
      },
      {
        ...testGrade,
        id: "mid",
        ordinalRank: 2,
        baseSkillLevels: {
          primary: "foundational",
          secondary: "awareness",
          broad: "awareness",
        },
      },
      {
        ...testGrade,
        id: "senior",
        ordinalRank: 3,
        baseSkillLevels: {
          primary: "working",
          secondary: "foundational",
          broad: "awareness",
        },
      },
      {
        ...testGrade,
        id: "staff",
        ordinalRank: 4,
        baseSkillLevels: {
          primary: "practitioner",
          secondary: "working",
          broad: "foundational",
        },
      },
      {
        ...testGrade,
        id: "principal",
        ordinalRank: 5,
        baseSkillLevels: {
          primary: "expert",
          secondary: "practitioner",
          broad: "working",
        },
      },
    ];

    it("estimates lowest grade for awareness-level skills", () => {
      const result = estimateBestFitGrade({
        selfAssessment: {
          skillLevels: { skill_a: "awareness", skill_b: "awareness" },
        },
        grades,
        skills: testSkills,
      });

      assert.strictEqual(result.grade.id, "junior");
    });

    it("estimates mid-level grade for working-level skills", () => {
      const result = estimateBestFitGrade({
        selfAssessment: {
          skillLevels: { skill_a: "working", skill_b: "working" },
        },
        grades,
        skills: testSkills,
      });

      assert.strictEqual(result.grade.id, "senior");
    });

    it("estimates top grade for expert-level skills", () => {
      const result = estimateBestFitGrade({
        selfAssessment: {
          skillLevels: { skill_a: "expert", skill_b: "expert" },
        },
        grades,
        skills: testSkills,
      });

      assert.strictEqual(result.grade.id, "principal");
    });

    it("returns lowest grade with 0 confidence for empty assessment", () => {
      const result = estimateBestFitGrade({
        selfAssessment: { skillLevels: {} },
        grades,
        skills: testSkills,
      });

      assert.strictEqual(result.grade.id, "junior");
      assert.strictEqual(result.confidence, 0);
    });

    it("includes confidence level", () => {
      const result = estimateBestFitGrade({
        selfAssessment: {
          skillLevels: { skill_a: "practitioner", skill_b: "practitioner" },
        },
        grades,
        skills: testSkills,
      });

      assert.ok(result.confidence >= 0 && result.confidence <= 1);
    });
  });

  describe("findRealisticMatches", () => {
    const grades = [
      {
        ...testGrade,
        id: "junior",
        ordinalRank: 1,
        baseSkillLevels: {
          primary: "awareness",
          secondary: "awareness",
          broad: "awareness",
        },
      },
      {
        ...testGrade,
        id: "mid",
        ordinalRank: 2,
        baseSkillLevels: {
          primary: "foundational",
          secondary: "awareness",
          broad: "awareness",
        },
      },
      {
        ...testGrade,
        id: "senior",
        ordinalRank: 3,
        baseSkillLevels: {
          primary: "working",
          secondary: "foundational",
          broad: "awareness",
        },
      },
    ];

    it("returns matches grouped by tier", () => {
      const result = findRealisticMatches({
        selfAssessment: {
          skillLevels: { skill_a: "working" },
          behaviourMaturities: {},
        },
        disciplines: [testDiscipline],
        grades,
        tracks: [testTrack],
        skills: testSkills,
        behaviours: testBehaviours,
      });

      assert.ok(result.matchesByTier);
      assert.ok(result.matchesByTier[1] !== undefined);
      assert.ok(result.matchesByTier[2] !== undefined);
      assert.ok(result.matchesByTier[3] !== undefined);
      assert.ok(result.matchesByTier[4] !== undefined);
    });

    it("returns estimated grade", () => {
      const result = findRealisticMatches({
        selfAssessment: {
          skillLevels: { skill_a: "working" },
          behaviourMaturities: {},
        },
        disciplines: [testDiscipline],
        grades,
        tracks: [testTrack],
        skills: testSkills,
        behaviours: testBehaviours,
      });

      assert.ok(result.estimatedGrade);
      assert.ok(result.estimatedGrade.grade);
      assert.ok(result.estimatedGrade.confidence !== undefined);
    });

    it("filters by grade range when enabled", () => {
      const result = findRealisticMatches({
        selfAssessment: {
          skillLevels: { skill_a: "foundational" },
          behaviourMaturities: {},
        },
        disciplines: [testDiscipline],
        grades,
        tracks: [testTrack],
        skills: testSkills,
        behaviours: testBehaviours,
        filterByGrade: true,
      });

      // All matches should be within ±1 of estimated grade
      const estimatedLevel = result.estimatedGrade.grade.ordinalRank;
      for (const match of result.matches) {
        assert.ok(Math.abs(match.job.grade.ordinalRank - estimatedLevel) <= 1);
      }
    });

    it("includes grade range info", () => {
      const result = findRealisticMatches({
        selfAssessment: {
          skillLevels: { skill_a: "working" },
          behaviourMaturities: {},
        },
        disciplines: [testDiscipline],
        grades,
        tracks: [testTrack],
        skills: testSkills,
        behaviours: testBehaviours,
      });

      assert.ok(result.gradeRange);
      assert.ok(result.gradeRange.min !== undefined);
      assert.ok(result.gradeRange.max !== undefined);
    });

    it("sorts matches by grade level descending within each tier", () => {
      const result = findRealisticMatches({
        selfAssessment: {
          skillLevels: { skill_a: "working" },
          behaviourMaturities: {},
        },
        disciplines: [testDiscipline],
        grades,
        tracks: [testTrack],
        skills: testSkills,
        behaviours: testBehaviours,
        filterByGrade: false,
      });

      // Check that each tier is sorted by grade level descending
      for (const tierNum of [1, 2, 3, 4]) {
        const tierMatches = result.matchesByTier[tierNum];
        for (let i = 1; i < tierMatches.length; i++) {
          const prevLevel = tierMatches[i - 1].job.grade.ordinalRank;
          const currLevel = tierMatches[i].job.grade.ordinalRank;
          // Should be descending or equal
          assert.ok(
            prevLevel >= currLevel,
            `Tier ${tierNum} not sorted by grade descending`,
          );
        }
      }
    });

    it("filters out lower grades when strong matches exist at higher levels", () => {
      // Create a self-assessment that strongly matches senior grade
      const seniorAssessment = {
        skillLevels: {
          skill_a: "practitioner",
          skill_b: "working",
          skill_c: "foundational",
        },
        behaviourMaturities: {
          behaviour_x: "practicing",
          behaviour_y: "practicing",
        },
      };

      const result = findRealisticMatches({
        selfAssessment: seniorAssessment,
        disciplines: [testDiscipline],
        grades,
        tracks: [testTrack],
        skills: testSkills,
        behaviours: testBehaviours,
        filterByGrade: false, // Disable initial grade filtering to test the intelligent filter
      });

      // Find highest grade level with strong/good match
      const strongGoodMatches = [
        ...result.matchesByTier[1],
        ...result.matchesByTier[2],
      ];
      if (strongGoodMatches.length > 0) {
        const highestLevel = Math.max(
          ...strongGoodMatches.map((m) => m.job.grade.ordinalRank),
        );

        // Stretch/aspirational roles should only be at or above highest match level
        for (const match of result.matchesByTier[3]) {
          assert.ok(
            match.job.grade.ordinalRank >= highestLevel,
            "Stretch role should be at or above highest match",
          );
        }
        for (const match of result.matchesByTier[4]) {
          assert.ok(
            match.job.grade.ordinalRank >= highestLevel,
            "Aspirational role should be at or above highest match",
          );
        }
      }
    });
  });
});

// ============================================================================
// Interview Tests
// ============================================================================

describe("Interview", () => {
  const job = deriveJob({
    discipline: testDiscipline,
    grade: testGrade,
    track: testTrack,
    skills: testSkills,
    behaviours: testBehaviours,
  });

  const questionBank = {
    skillLevels: {
      skill_a: {
        professionalQuestions: {
          practitioner: [
            {
              id: "q1",
              text: "Question about skill A",
              type: "technical",
              expectedDurationMinutes: 5,
            },
          ],
          expert: [
            {
              id: "q2",
              text: "Expert question",
              type: "technical",
              expectedDurationMinutes: 10,
            },
          ],
        },
        managementQuestions: {
          practitioner: [
            {
              id: "q1_mgmt",
              text: "Management question about skill A",
              type: "technical",
              expectedDurationMinutes: 5,
            },
          ],
        },
      },
    },
    behaviourMaturities: {
      behaviour_x: {
        professionalQuestions: {
          role_modeling: [
            {
              id: "q3",
              text: "Behaviour question",
              type: "behavioural",
              expectedDurationMinutes: 8,
            },
          ],
        },
        managementQuestions: {
          role_modeling: [
            {
              id: "q3_mgmt",
              text: "Management behaviour question",
              type: "behavioural",
              expectedDurationMinutes: 8,
            },
          ],
        },
      },
    },
  };

  describe("deriveInterviewQuestions", () => {
    it("generates interview questions", () => {
      const interview = deriveInterviewQuestions({
        job,
        questionBank,
        options: { includeBelowLevel: false },
      });

      assert.ok(interview.questions.length > 0);
      assert.ok(interview.expectedDurationMinutes > 0);
      assert.ok(
        interview.coverage.skills.length > 0 ||
          interview.coverage.behaviours.length > 0,
      );
    });

    it("includes below-level questions when requested", () => {
      const interview = deriveInterviewQuestions({
        job,
        questionBank,
        options: { includeBelowLevel: true },
      });

      // Should include questions from practitioner level for skill_a (which requires expert)
      const belowLevelQ = interview.questions.find(
        (q) => q.targetId === "skill_a" && q.targetLevel === "practitioner",
      );
      assert.ok(belowLevelQ);
    });
  });

  describe("deriveShortInterview", () => {
    it("respects time budget", () => {
      const interview = deriveShortInterview({
        job,
        questionBank,
        targetMinutes: 15,
      });

      // Should be within reasonable range of target
      assert.ok(interview.expectedDurationMinutes <= 20);
    });
  });

  describe("deriveBehaviourQuestions", () => {
    it("only includes behaviour questions", () => {
      const interview = deriveBehaviourQuestions({
        job,
        questionBank,
      });

      assert.ok(interview.questions.every((q) => q.targetType === "behaviour"));
      assert.strictEqual(interview.coverage.skills.length, 0);
    });
  });

  describe("deriveFocusedInterview", () => {
    it("generates questions only for focused skills", () => {
      const interview = deriveFocusedInterview({
        job,
        questionBank,
        focusSkills: ["skill_a"],
        focusBehaviours: [],
      });

      // Should only have skill questions for skill_a
      assert.ok(interview.questions.length > 0);
      assert.ok(interview.questions.every((q) => q.targetType === "skill"));
      assert.ok(interview.questions.every((q) => q.targetId === "skill_a"));
    });

    it("generates questions only for focused behaviours", () => {
      const interview = deriveFocusedInterview({
        job,
        questionBank,
        focusSkills: [],
        focusBehaviours: ["behaviour_x"],
      });

      // Should only have behaviour questions for behaviour_x
      assert.ok(interview.questions.length > 0);
      assert.ok(interview.questions.every((q) => q.targetType === "behaviour"));
      assert.ok(interview.questions.every((q) => q.targetId === "behaviour_x"));
    });

    it("generates questions for both focused skills and behaviours", () => {
      const interview = deriveFocusedInterview({
        job,
        questionBank,
        focusSkills: ["skill_a"],
        focusBehaviours: ["behaviour_x"],
      });

      const skillQuestions = interview.questions.filter(
        (q) => q.targetType === "skill",
      );
      const behaviourQuestions = interview.questions.filter(
        (q) => q.targetType === "behaviour",
      );

      assert.ok(skillQuestions.length > 0);
      assert.ok(behaviourQuestions.length > 0);
    });

    it("returns empty questions when no focus specified", () => {
      const interview = deriveFocusedInterview({
        job,
        questionBank,
        focusSkills: [],
        focusBehaviours: [],
      });

      assert.strictEqual(interview.questions.length, 0);
    });
  });

  describe("deriveMissionFitInterview", () => {
    it("only includes skill questions", () => {
      const interview = deriveMissionFitInterview({
        job,
        questionBank,
      });

      assert.ok(interview.questions.length > 0);
      assert.ok(interview.questions.every((q) => q.targetType === "skill"));
      assert.strictEqual(interview.coverage.behaviours.length, 0);
    });
  });

  describe("deriveDecompositionInterview", () => {
    it("only includes capability questions", () => {
      const bankWithCapabilities = {
        ...questionBank,
        capabilityLevels: {
          scale: {
            professionalQuestions: {
              practitioner: [
                {
                  id: "cap_q1",
                  text: "Decomposition question",
                  type: "decomposition",
                  expectedDurationMinutes: 15,
                },
              ],
            },
          },
        },
      };

      const interview = deriveDecompositionInterview({
        job,
        questionBank: bankWithCapabilities,
      });

      assert.ok(interview.questions.length > 0);
      assert.ok(
        interview.questions.every((q) => q.targetType === "capability"),
      );
      assert.strictEqual(interview.coverage.skills.length, 0);
      assert.strictEqual(interview.coverage.behaviours.length, 0);
    });
  });

  describe("deriveStakeholderInterview", () => {
    it("only includes behaviour questions", () => {
      const interview = deriveStakeholderInterview({
        job,
        questionBank,
      });

      assert.ok(interview.questions.length > 0);
      assert.ok(interview.questions.every((q) => q.targetType === "behaviour"));
      assert.strictEqual(interview.coverage.skills.length, 0);
    });

    it("respects time budget", () => {
      const interview = deriveStakeholderInterview({
        job,
        questionBank,
        targetMinutes: 60,
      });

      assert.ok(interview.expectedDurationMinutes <= 65);
    });
  });
});

// ============================================================================
// Skill Modifier Tests
// ============================================================================

import {
  isCapability,
  getSkillsByCapability,
  buildCapabilityToSkillsMap,
  expandModifiersToSkills,
  extractCapabilityModifiers,
  extractSkillModifiers,
  resolveSkillModifier,
} from "@forwardimpact/model/modifiers";

describe("Skill Modifiers", () => {
  describe("isCapability", () => {
    it("returns true for valid skill capabilities", () => {
      assert.strictEqual(isCapability("delivery"), true);
      assert.strictEqual(isCapability("scale"), true);
      assert.strictEqual(isCapability("reliability"), true);
      assert.strictEqual(isCapability("data"), true);
      assert.strictEqual(isCapability("ai"), true);
      assert.strictEqual(isCapability("process"), true);
      assert.strictEqual(isCapability("business"), true);
      assert.strictEqual(isCapability("people"), true);
      assert.strictEqual(isCapability("documentation"), true);
    });

    it("returns false for skill IDs", () => {
      assert.strictEqual(isCapability("architecture_design"), false);
      assert.strictEqual(isCapability("skill_a"), false);
      assert.strictEqual(isCapability("devops"), false);
    });
  });

  describe("getSkillsByCapability", () => {
    it("returns skills matching the capability", () => {
      const scaleSkills = getSkillsByCapability(testSkills, "scale");
      assert.strictEqual(scaleSkills.length, 1);
      assert.strictEqual(scaleSkills[0].id, "skill_a");
    });

    it("returns empty array for non-existent capability", () => {
      const skills = getSkillsByCapability(testSkills, "nonexistent");
      assert.strictEqual(skills.length, 0);
    });
  });

  describe("buildCapabilityToSkillsMap", () => {
    it("builds a map of capabilities to skill IDs", () => {
      const map = buildCapabilityToSkillsMap(testSkills);
      assert.deepStrictEqual(map.scale, ["skill_a"]);
      assert.deepStrictEqual(map.ai, ["skill_b"]);
      assert.deepStrictEqual(map.people, ["skill_c"]);
      assert.deepStrictEqual(map.data, []);
    });
  });

  describe("expandModifiersToSkills", () => {
    it("expands capability modifiers to individual skills", () => {
      const modifiers = { scale: 1 };
      const expanded = expandModifiersToSkills(modifiers, testSkills);
      assert.strictEqual(expanded.skill_a, 1);
    });

    it("ignores non-capability keys (validation should catch these)", () => {
      const modifiers = { scale: 1, skill_a: 2 };
      const expanded = expandModifiersToSkills(modifiers, testSkills);
      // Individual skill modifiers are ignored - only capability modifiers are expanded
      // skill_a gets value from scale capability (1), not from individual modifier
      assert.strictEqual(expanded.skill_a, 1);
    });

    it("expands multiple capabilities", () => {
      const modifiers = { ai: -1, scale: 1 };
      const expanded = expandModifiersToSkills(modifiers, testSkills);
      assert.strictEqual(expanded.skill_a, 1); // scale capability
      assert.strictEqual(expanded.skill_b, -1); // ai capability
    });

    it("returns empty object for null input", () => {
      const expanded = expandModifiersToSkills(null, testSkills);
      assert.deepStrictEqual(expanded, {});
    });
  });

  describe("extractCapabilityModifiers", () => {
    it("extracts only capability-based modifiers", () => {
      const modifiers = { scale: 1, skill_a: 2, data: -1 };
      const capabilities = extractCapabilityModifiers(modifiers);
      assert.deepStrictEqual(capabilities, { scale: 1, data: -1 });
    });

    it("returns empty object for null input", () => {
      const capabilities = extractCapabilityModifiers(null);
      assert.deepStrictEqual(capabilities, {});
    });
  });

  describe("extractSkillModifiers", () => {
    it("extracts only individual skill modifiers", () => {
      const modifiers = { scale: 1, skill_a: 2, data: -1 };
      const individual = extractSkillModifiers(modifiers);
      assert.deepStrictEqual(individual, { skill_a: 2 });
    });

    it("returns empty object for null input", () => {
      const individual = extractSkillModifiers(null);
      assert.deepStrictEqual(individual, {});
    });
  });

  describe("resolveSkillModifier", () => {
    it("returns capability modifier for skill in that capability", () => {
      const modifiers = { scale: 1 };
      const modifier = resolveSkillModifier("skill_a", modifiers, testSkills);
      assert.strictEqual(modifier, 1);
    });

    it("returns 0 when no modifier applies", () => {
      const modifiers = { data: 1 };
      const modifier = resolveSkillModifier("skill_a", modifiers, testSkills);
      assert.strictEqual(modifier, 0);
    });

    it("returns 0 for null modifiers", () => {
      const modifier = resolveSkillModifier("skill_a", null, testSkills);
      assert.strictEqual(modifier, 0);
    });
  });

  describe("deriveSkillLevel with capability modifiers", () => {
    it("applies capability modifier when skills array is provided (capped at grade max)", () => {
      const trackWithCapabilityModifier = {
        ...testTrack,
        skillModifiers: { scale: 1 },
      };
      const level = deriveSkillLevel({
        discipline: testDiscipline,
        grade: testGrade,
        track: trackWithCapabilityModifier,
        skillId: "skill_a",
        skills: testSkills,
      });
      // skill_a is primary, base is practitioner (index 3), +1 would be expert
      // but capped at grade max (practitioner)
      assert.strictEqual(level, "practitioner");
    });

    it("capability modifier applies to all skills in capability", () => {
      const trackWithCapability = {
        ...testTrack,
        skillModifiers: { scale: -1 },
      };
      const level = deriveSkillLevel({
        discipline: testDiscipline,
        grade: testGrade,
        track: trackWithCapability,
        skillId: "skill_a",
        skills: testSkills,
      });
      // skill_a is primary, base is practitioner (index 3), -1 = working
      assert.strictEqual(level, "working");
    });
  });
});

describe("Checklist Derivation", () => {
  // Test skills with agent.stages defined
  const testSkillsWithStages = [
    {
      id: "arch",
      name: "Architecture",
      capability: "scale",
      agent: {
        name: "architecture",
        description: "Architecture skill",
        stages: {
          plan: {
            focus: "Design architecture",
            readChecklist: ["Gather requirements", "Design components"],
            confirmChecklist: [
              "Architecture documented",
              "Trade-offs explicit",
            ],
          },
          code: {
            focus: "Implement architecture",
            readChecklist: ["Build components"],
            confirmChecklist: ["Implementation matches design"],
          },
        },
      },
    },
    {
      id: "devops",
      name: "DevOps",
      capability: "reliability",
      agent: {
        name: "devops",
        description: "DevOps skill",
        stages: {
          code: {
            focus: "Build pipelines",
            readChecklist: ["Set up CI/CD"],
            confirmChecklist: ["Pipeline working", "Tests green"],
          },
        },
      },
    },
    {
      id: "collab",
      name: "Collaboration",
      capability: "people",
      // No agent section - human-only skill
    },
  ];

  const testCapabilities = [
    { id: "scale", name: "Scale", emojiIcon: "📐" },
    { id: "reliability", name: "Reliability", emojiIcon: "🛡️" },
    { id: "people", name: "People", emojiIcon: "👥" },
  ];

  const testSkillMatrix = [
    { skillId: "arch", level: "working", capability: "scale" },
    { skillId: "devops", level: "foundational", capability: "reliability" },
    { skillId: "collab", level: "working", capability: "people" },
  ];

  describe("deriveChecklist", () => {
    it("returns ready items for skills with stage data", () => {
      const checklist = deriveChecklist({
        stageId: "plan",
        skillMatrix: testSkillMatrix,
        skills: testSkillsWithStages,
        capabilities: testCapabilities,
      });

      // Should include arch skill's plan.confirmChecklist items
      const archChecklist = checklist.find((c) => c.skill.id === "arch");
      assert.ok(archChecklist);
      assert.deepStrictEqual(archChecklist.items, [
        "Architecture documented",
        "Trade-offs explicit",
      ]);
      assert.strictEqual(archChecklist.capability.emojiIcon, "📐");
    });

    it("excludes skills without agent.stages", () => {
      const checklist = deriveChecklist({
        stageId: "code",
        skillMatrix: testSkillMatrix,
        skills: testSkillsWithStages,
        capabilities: testCapabilities,
      });

      // collab skill has no agent section
      const collabChecklist = checklist.find((c) => c.skill.id === "collab");
      assert.strictEqual(collabChecklist, undefined);
    });

    it("excludes skills without data for the requested stage", () => {
      const checklist = deriveChecklist({
        stageId: "plan",
        skillMatrix: testSkillMatrix,
        skills: testSkillsWithStages,
        capabilities: testCapabilities,
      });

      // devops skill only has code stage
      const devopsChecklist = checklist.find((c) => c.skill.id === "devops");
      assert.strictEqual(devopsChecklist, undefined);
    });

    it("returns empty array for unknown stage", () => {
      const checklist = deriveChecklist({
        stageId: "unknown",
        skillMatrix: testSkillMatrix,
        skills: testSkillsWithStages,
        capabilities: testCapabilities,
      });

      assert.deepStrictEqual(checklist, []);
    });

    it("returns empty array for review stage", () => {
      // Review stage shows completion criteria, not handoff criteria
      const checklist = deriveChecklist({
        stageId: "review",
        skillMatrix: testSkillMatrix,
        skills: testSkillsWithStages,
        capabilities: testCapabilities,
      });

      // arch and devops don't have review stage defined
      assert.deepStrictEqual(checklist, []);
    });
  });

  describe("formatChecklistMarkdown", () => {
    it("formats checklist as markdown grouped by skill", () => {
      const checklist = [
        {
          skill: { id: "arch", name: "Architecture" },
          capability: { id: "scale", name: "Scale", emojiIcon: "📐" },
          items: ["Item 1", "Item 2"],
        },
      ];

      const markdown = formatChecklistMarkdown(checklist);
      assert.ok(markdown.includes("**📐 Architecture**"));
      assert.ok(markdown.includes("- [ ] Item 1"));
      assert.ok(markdown.includes("- [ ] Item 2"));
    });

    it("returns empty string for empty checklist", () => {
      const markdown = formatChecklistMarkdown([]);
      assert.strictEqual(markdown, "");
    });
  });
});

// ============================================================================
// Profile Module Tests
// ============================================================================

import {
  getPositiveTrackCapabilities,
  prepareBaseProfile,
  prepareAgentProfile,
} from "@forwardimpact/model/profile";

import {
  isAgentEligible,
  filterHighestLevel,
  filterAgentSkills,
  compareByLevelDesc,
  compareByMaturityDesc,
} from "@forwardimpact/model/policies";

describe("Profile Module", () => {
  describe("getPositiveTrackCapabilities", () => {
    it("returns set of capabilities with positive modifiers", () => {
      const track = {
        skillModifiers: { scale: 1, ai: -1, delivery: 0, people: 2 },
      };
      const result = getPositiveTrackCapabilities(track);
      assert.ok(result.has("scale"));
      assert.ok(result.has("people"));
      assert.ok(!result.has("ai"));
      assert.ok(!result.has("delivery"));
    });

    it("returns empty set for track without modifiers", () => {
      const track = {};
      const result = getPositiveTrackCapabilities(track);
      assert.strictEqual(result.size, 0);
    });
  });

  describe("isAgentEligible (from policies)", () => {
    it("rejects skills marked as isHumanOnly", () => {
      const skillMatrix = [
        { skillId: "a", isHumanOnly: true },
        { skillId: "b", isHumanOnly: false },
        { skillId: "c" },
      ];
      const result = skillMatrix.filter(isAgentEligible);
      assert.strictEqual(result.length, 2);
      assert.ok(result.some((s) => s.skillId === "b"));
      assert.ok(result.some((s) => s.skillId === "c"));
    });
  });

  describe("filterHighestLevel (from policies)", () => {
    it("keeps only skills at the highest level", () => {
      const skillMatrix = [
        { skillId: "a", type: "primary", level: "practitioner" },
        { skillId: "b", type: "broad", level: "practitioner" },
        { skillId: "c", type: "secondary", level: "working" },
        { skillId: "d", type: "broad", level: "foundational" },
      ];
      const result = filterHighestLevel(skillMatrix);
      assert.strictEqual(result.length, 2);
      assert.ok(result.some((s) => s.skillId === "a")); // practitioner
      assert.ok(result.some((s) => s.skillId === "b")); // practitioner
    });

    it("returns empty array for empty input", () => {
      const result = filterHighestLevel([]);
      assert.strictEqual(result.length, 0);
    });
  });

  describe("filterAgentSkills (from policies)", () => {
    it("excludes humanOnly skills and keeps only highest level", () => {
      const skillMatrix = [
        {
          skillId: "a",
          type: "primary",
          isHumanOnly: false,
          level: "practitioner",
        },
        {
          skillId: "b",
          type: "broad",
          isHumanOnly: false,
          level: "practitioner",
        },
        {
          skillId: "c",
          type: "secondary",
          isHumanOnly: true,
          level: "practitioner",
        },
        { skillId: "d", type: "broad", isHumanOnly: false, level: "working" },
      ];
      const result = filterAgentSkills(skillMatrix);
      // Should include: a (practitioner), b (practitioner broad, same level)
      // Should exclude: c (humanOnly), d (lower level)
      assert.strictEqual(result.length, 2);
      assert.ok(result.some((s) => s.skillId === "a"));
      assert.ok(result.some((s) => s.skillId === "b"));
    });
  });

  describe("compareByLevelDesc (from policies)", () => {
    it("sorts skills by level from expert to awareness", () => {
      const skillMatrix = [
        { skillId: "a", level: "awareness" },
        { skillId: "b", level: "expert" },
        { skillId: "c", level: "working" },
      ];
      const result = [...skillMatrix].sort(compareByLevelDesc);
      assert.strictEqual(result[0].skillId, "b"); // expert
      assert.strictEqual(result[1].skillId, "c"); // working
      assert.strictEqual(result[2].skillId, "a"); // awareness
    });

    it("does not mutate original array when used with spread", () => {
      const original = [
        { skillId: "a", level: "awareness" },
        { skillId: "b", level: "expert" },
      ];
      [...original].sort(compareByLevelDesc);
      assert.strictEqual(original[0].skillId, "a");
    });
  });

  describe("compareByMaturityDesc (from policies)", () => {
    it("sorts behaviours by maturity from exemplifying to emerging", () => {
      const behaviourProfile = [
        { behaviourId: "a", maturity: "emerging" },
        { behaviourId: "b", maturity: "exemplifying" },
        { behaviourId: "c", maturity: "practicing" },
      ];
      const result = [...behaviourProfile].sort(compareByMaturityDesc);
      assert.strictEqual(result[0].behaviourId, "b"); // exemplifying
      assert.strictEqual(result[1].behaviourId, "c"); // practicing
      assert.strictEqual(result[2].behaviourId, "a"); // emerging
    });
  });

  describe("prepareBaseProfile", () => {
    it("derives skills and behaviours", () => {
      const result = prepareBaseProfile({
        discipline: testDiscipline,
        track: testTrack,
        grade: testGrade,
        skills: testSkills,
        behaviours: testBehaviours,
      });
      assert.ok(result.skillMatrix.length > 0);
      assert.ok(result.behaviourProfile.length > 0);
      assert.strictEqual(result.discipline, testDiscipline);
      assert.strictEqual(result.track, testTrack);
      assert.strictEqual(result.grade, testGrade);
    });

    it("includes human-only skills in raw derivation", () => {
      // prepareBaseProfile returns raw derivation without filtering
      const skillsWithHumanOnly = [
        ...testSkills,
        {
          id: "human_skill",
          name: "Human Skill",
          capability: "scale",
          isHumanOnly: true,
        },
      ];
      const disciplineWithHumanSkill = {
        ...testDiscipline,
        coreSkills: [...testDiscipline.coreSkills, "human_skill"],
      };

      const result = prepareBaseProfile({
        discipline: disciplineWithHumanSkill,
        track: testTrack,
        grade: testGrade,
        skills: skillsWithHumanOnly,
        behaviours: testBehaviours,
      });

      // Raw derivation includes human-only skills
      assert.ok(result.skillMatrix.some((s) => s.skillId === "human_skill"));
    });

    it("derives responsibilities when capabilities provided", () => {
      const result = prepareBaseProfile({
        discipline: testDiscipline,
        track: testTrack,
        grade: testGrade,
        skills: testSkills,
        behaviours: testBehaviours,
        capabilities: testCategories,
      });
      assert.ok(result.derivedResponsibilities.length > 0);
    });
  });

  describe("prepareAgentProfile", () => {
    it("applies agent-specific filtering and sorting via composed policies", () => {
      const result = prepareAgentProfile({
        discipline: testDiscipline,
        track: testTrack,
        grade: testGrade,
        skills: testSkills,
        behaviours: testBehaviours,
      });

      // Skills should be sorted by level descending
      if (result.skillMatrix.length > 1) {
        const firstLevel = result.skillMatrix[0].level;
        const lastLevel =
          result.skillMatrix[result.skillMatrix.length - 1].level;
        assert.ok(
          getSkillLevelIndex(firstLevel) >= getSkillLevelIndex(lastLevel),
        );
      }
    });

    it("excludes human-only skills", () => {
      const skillsWithHumanOnly = [
        ...testSkills,
        {
          id: "human_skill",
          name: "Human Skill",
          capability: "scale",
          isHumanOnly: true,
        },
      ];
      const disciplineWithHumanSkill = {
        ...testDiscipline,
        coreSkills: [...testDiscipline.coreSkills, "human_skill"],
      };

      const result = prepareAgentProfile({
        discipline: disciplineWithHumanSkill,
        track: testTrack,
        grade: testGrade,
        skills: skillsWithHumanOnly,
        behaviours: testBehaviours,
      });

      assert.ok(!result.skillMatrix.some((s) => s.skillId === "human_skill"));
    });
  });
});

// ============================================================================
// Agent Module Tests
// ============================================================================

import { deriveReferenceGrade } from "@forwardimpact/model/agent";

describe("Agent Module", () => {
  describe("deriveReferenceGrade", () => {
    it("selects first grade with practitioner-level primary skills", () => {
      const grades = [
        {
          id: "junior",
          ordinalRank: 1,
          baseSkillLevels: { primary: "foundational" },
        },
        { id: "mid", ordinalRank: 2, baseSkillLevels: { primary: "working" } },
        {
          id: "senior",
          ordinalRank: 3,
          baseSkillLevels: { primary: "practitioner" },
        },
        { id: "staff", ordinalRank: 4, baseSkillLevels: { primary: "expert" } },
      ];
      const result = deriveReferenceGrade(grades);
      assert.strictEqual(result.id, "senior");
    });

    it("falls back to first working-level grade when no practitioner exists", () => {
      const grades = [
        {
          id: "junior",
          ordinalRank: 1,
          baseSkillLevels: { primary: "awareness" },
        },
        { id: "mid", ordinalRank: 2, baseSkillLevels: { primary: "working" } },
        {
          id: "senior",
          ordinalRank: 3,
          baseSkillLevels: { primary: "working" },
        },
      ];
      const result = deriveReferenceGrade(grades);
      assert.strictEqual(result.id, "mid");
    });

    it("falls back to middle grade when no practitioner or working exists", () => {
      const grades = [
        { id: "G1", ordinalRank: 1, baseSkillLevels: { primary: "awareness" } },
        {
          id: "G2",
          ordinalRank: 2,
          baseSkillLevels: { primary: "foundational" },
        },
        {
          id: "G3",
          ordinalRank: 3,
          baseSkillLevels: { primary: "foundational" },
        },
        {
          id: "G4",
          ordinalRank: 4,
          baseSkillLevels: { primary: "foundational" },
        },
        {
          id: "G5",
          ordinalRank: 5,
          baseSkillLevels: { primary: "foundational" },
        },
      ];
      const result = deriveReferenceGrade(grades);
      assert.strictEqual(result.id, "G3"); // index 2 = floor(5/2)
    });

    it("handles unsorted grade input", () => {
      const grades = [
        { id: "staff", ordinalRank: 4, baseSkillLevels: { primary: "expert" } },
        {
          id: "junior",
          ordinalRank: 1,
          baseSkillLevels: { primary: "foundational" },
        },
        {
          id: "senior",
          ordinalRank: 3,
          baseSkillLevels: { primary: "practitioner" },
        },
        { id: "mid", ordinalRank: 2, baseSkillLevels: { primary: "working" } },
      ];
      const result = deriveReferenceGrade(grades);
      assert.strictEqual(result.id, "senior");
    });

    it("throws when no grades provided", () => {
      assert.throws(() => deriveReferenceGrade([]), /No grades configured/);
      assert.throws(() => deriveReferenceGrade(null), /No grades configured/);
    });

    it("works with single grade", () => {
      const grades = [
        {
          id: "only",
          ordinalRank: 1,
          baseSkillLevels: { primary: "awareness" },
        },
      ];
      const result = deriveReferenceGrade(grades);
      assert.strictEqual(result.id, "only");
    });

    it("works with different grade ID naming conventions", () => {
      // Customer might use L1/L2/L3 or Grade1/Grade2 or anything
      const grades = [
        {
          id: "Band-A",
          ordinalRank: 1,
          baseSkillLevels: { primary: "foundational" },
        },
        {
          id: "Band-B",
          ordinalRank: 2,
          baseSkillLevels: { primary: "working" },
        },
        {
          id: "Band-C",
          ordinalRank: 3,
          baseSkillLevels: { primary: "practitioner" },
        },
      ];
      const result = deriveReferenceGrade(grades);
      assert.strictEqual(result.id, "Band-C");
    });
  });
});

console.log("Running tests...");
