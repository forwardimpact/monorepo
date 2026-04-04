import { describe, it } from "node:test";
import assert from "node:assert";

import {
  getSkillProficiencyIndex,
  getBehaviourMaturityIndex,
  clampSkillProficiency,
  clampBehaviourMaturity,
  skillProficiencyMeetsRequirement,
  behaviourMaturityMeetsRequirement,
  groupSkillsByCapability,
  getCapabilityById,
  getCapabilityOrder,
  getCapabilityEmoji,
  getCapabilityResponsibility,
  getConceptEmoji,
} from "@forwardimpact/map/levels";

import {
  compareByCapability,
  sortSkillsByCapability,
} from "@forwardimpact/libskill/policies";

import {
  deriveResponsibilities,
  deriveJob,
} from "@forwardimpact/libskill/derivation";

import {
  testSkills,
  testBehaviours,
  testDiscipline,
  testTrack,
  testLevel,
  testCategories,
} from "./model-fixtures.js";

describe("Type Helpers", () => {
  describe("getSkillProficiencyIndex", () => {
    it("returns correct indices for all levels", () => {
      assert.strictEqual(getSkillProficiencyIndex("awareness"), 0);
      assert.strictEqual(getSkillProficiencyIndex("foundational"), 1);
      assert.strictEqual(getSkillProficiencyIndex("working"), 2);
      assert.strictEqual(getSkillProficiencyIndex("practitioner"), 3);
      assert.strictEqual(getSkillProficiencyIndex("expert"), 4);
    });

    it("returns -1 for invalid levels", () => {
      assert.strictEqual(getSkillProficiencyIndex("invalid"), -1);
      assert.strictEqual(getSkillProficiencyIndex(""), -1);
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

  describe("clampSkillProficiency", () => {
    it("clamps to valid range", () => {
      assert.strictEqual(clampSkillProficiency(-1), "awareness");
      assert.strictEqual(clampSkillProficiency(0), "awareness");
      assert.strictEqual(clampSkillProficiency(2), "working");
      assert.strictEqual(clampSkillProficiency(4), "expert");
      assert.strictEqual(clampSkillProficiency(10), "expert");
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

  describe("skillProficiencyMeetsRequirement", () => {
    it("correctly compares skill proficiencies", () => {
      assert.strictEqual(
        skillProficiencyMeetsRequirement("expert", "practitioner"),
        true,
      );
      assert.strictEqual(
        skillProficiencyMeetsRequirement("practitioner", "practitioner"),
        true,
      );
      assert.strictEqual(
        skillProficiencyMeetsRequirement("working", "practitioner"),
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
        level: { emojiIcon: "📊" },
        track: { emojiIcon: "🛤️" },
      },
    };

    it("returns emoji for valid concept", () => {
      assert.strictEqual(getConceptEmoji(testFramework, "driver"), "🎯");
      assert.strictEqual(getConceptEmoji(testFramework, "skill"), "💼");
      assert.strictEqual(getConceptEmoji(testFramework, "behaviour"), "🧠");
      assert.strictEqual(getConceptEmoji(testFramework, "discipline"), "🔧");
      assert.strictEqual(getConceptEmoji(testFramework, "level"), "📊");
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
      { skillId: "skill_a", capability: "scale", proficiency: "working" },
    ];
    const result = deriveResponsibilities({
      skillMatrix,
      capabilities: [],
    });
    assert.strictEqual(result.length, 0);
  });

  it("excludes awareness-only capabilities", () => {
    const skillMatrix = [
      { skillId: "skill_a", capability: "scale", proficiency: "awareness" },
    ];
    const result = deriveResponsibilities({
      skillMatrix,
      capabilities: testCategories,
    });
    assert.strictEqual(result.length, 0);
  });

  it("includes capabilities based on skill proficiency", () => {
    // skill_a is in testDiscipline.coreSkills and has capability "scale"
    const skillMatrix = [
      { skillId: "skill_a", capability: "scale", proficiency: "working" },
    ];
    const result = deriveResponsibilities({
      skillMatrix,
      capabilities: testCategories,
    });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].capability, "scale");
    assert.strictEqual(result[0].proficiency, "working");
  });

  it("uses highest skill proficiency in each capability", () => {
    const skillMatrix = [
      { skillId: "skill_a", capability: "scale", proficiency: "working" },
      {
        skillId: "skill_extra",
        capability: "scale",
        proficiency: "practitioner",
      },
    ];
    const result = deriveResponsibilities({
      skillMatrix,
      capabilities: testCategories,
    });
    // Should use practitioner level for scale capability
    const scaleResp = result.find((r) => r.capability === "scale");
    assert.ok(scaleResp);
    assert.strictEqual(scaleResp.proficiency, "practitioner");
    assert.strictEqual(
      scaleResp.responsibility,
      "Lead architectural decisions",
    );
  });

  it("includes responsibility from capability definition", () => {
    const skillMatrix = [
      { skillId: "skill_b", capability: "ai", proficiency: "working" },
    ];
    const result = deriveResponsibilities({
      skillMatrix,
      capabilities: testCategories,
    });
    const aiResp = result.find((r) => r.capability === "ai");
    assert.ok(aiResp);
    assert.strictEqual(aiResp.responsibility, "Integrate AI capabilities");
    assert.strictEqual(aiResp.proficiency, "working");
  });

  it("includes emoji from capability", () => {
    const skillMatrix = [
      { skillId: "skill_a", capability: "scale", proficiency: "working" },
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
      level: testLevel,
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
      level: testLevel,
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
