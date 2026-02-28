import { test, describe } from "node:test";
import assert from "node:assert";

import {
  SkillProficiency,
  SKILL_PROFICIENCY_ORDER,
  BehaviourMaturity,
  BEHAVIOUR_MATURITY_ORDER,
  Capability,
  getStageOrder,
  getCapabilityById,
  getCapabilityOrder,
  groupSkillsByCapability,
  getCapabilityEmoji,
  getCapabilityResponsibility,
  getSkillProficiencyIndex,
  getBehaviourMaturityIndex,
  clampSkillProficiency,
  clampBehaviourMaturity,
  skillProficiencyMeetsRequirement,
  behaviourMaturityMeetsRequirement,
  getConceptEmoji,
} from "../src/levels.js";

describe("levels", () => {
  describe("SkillProficiency enum", () => {
    test("has all five proficiency levels", () => {
      assert.strictEqual(SkillProficiency.AWARENESS, "awareness");
      assert.strictEqual(SkillProficiency.FOUNDATIONAL, "foundational");
      assert.strictEqual(SkillProficiency.WORKING, "working");
      assert.strictEqual(SkillProficiency.PRACTITIONER, "practitioner");
      assert.strictEqual(SkillProficiency.EXPERT, "expert");
    });
  });

  describe("SKILL_PROFICIENCY_ORDER", () => {
    test("has correct length and order", () => {
      assert.strictEqual(SKILL_PROFICIENCY_ORDER.length, 5);
      assert.strictEqual(SKILL_PROFICIENCY_ORDER[0], "awareness");
      assert.strictEqual(SKILL_PROFICIENCY_ORDER[4], "expert");
    });
  });

  describe("BehaviourMaturity enum", () => {
    test("has all five maturity levels", () => {
      assert.strictEqual(BehaviourMaturity.EMERGING, "emerging");
      assert.strictEqual(BehaviourMaturity.DEVELOPING, "developing");
      assert.strictEqual(BehaviourMaturity.PRACTICING, "practicing");
      assert.strictEqual(BehaviourMaturity.ROLE_MODELING, "role_modeling");
      assert.strictEqual(BehaviourMaturity.EXEMPLIFYING, "exemplifying");
    });
  });

  describe("BEHAVIOUR_MATURITY_ORDER", () => {
    test("has correct length and order", () => {
      assert.strictEqual(BEHAVIOUR_MATURITY_ORDER.length, 5);
      assert.strictEqual(BEHAVIOUR_MATURITY_ORDER[0], "emerging");
      assert.strictEqual(BEHAVIOUR_MATURITY_ORDER[4], "exemplifying");
    });
  });

  describe("Capability enum", () => {
    test("includes core capability values", () => {
      assert.strictEqual(Capability.DELIVERY, "delivery");
      assert.strictEqual(Capability.SCALE, "scale");
      assert.strictEqual(Capability.RELIABILITY, "reliability");
      assert.strictEqual(Capability.PEOPLE, "people");
    });
  });

  describe("getStageOrder", () => {
    test("extracts stage IDs in order", () => {
      const stages = [
        { id: "specify" },
        { id: "plan" },
        { id: "code" },
        { id: "review" },
      ];
      assert.deepStrictEqual(getStageOrder(stages), [
        "specify",
        "plan",
        "code",
        "review",
      ]);
    });

    test("returns empty array for empty input", () => {
      assert.deepStrictEqual(getStageOrder([]), []);
    });
  });

  describe("getCapabilityById", () => {
    const capabilities = [
      { id: "delivery", name: "Delivery" },
      { id: "scale", name: "Scale" },
    ];

    test("finds capability by ID", () => {
      const result = getCapabilityById(capabilities, "delivery");
      assert.strictEqual(result.name, "Delivery");
    });

    test("returns undefined for unknown ID", () => {
      assert.strictEqual(getCapabilityById(capabilities, "unknown"), undefined);
    });
  });

  describe("getCapabilityOrder", () => {
    test("sorts by ordinalRank", () => {
      const capabilities = [
        { id: "scale", ordinalRank: 2 },
        { id: "delivery", ordinalRank: 1 },
        { id: "people", ordinalRank: 3 },
      ];
      assert.deepStrictEqual(getCapabilityOrder(capabilities), [
        "delivery",
        "scale",
        "people",
      ]);
    });

    test("treats missing ordinalRank as 0", () => {
      const capabilities = [{ id: "b", ordinalRank: 1 }, { id: "a" }];
      assert.deepStrictEqual(getCapabilityOrder(capabilities), ["a", "b"]);
    });
  });

  describe("groupSkillsByCapability", () => {
    const capabilities = [
      { id: "delivery", ordinalRank: 1 },
      { id: "scale", ordinalRank: 2 },
    ];

    test("groups skills and sorts by name within each capability", () => {
      const skills = [
        { id: "s2", name: "Zeta", capability: "delivery" },
        { id: "s1", name: "Alpha", capability: "delivery" },
        { id: "s3", name: "Beta", capability: "scale" },
      ];
      const result = groupSkillsByCapability(skills, capabilities);
      assert.strictEqual(result.delivery.length, 2);
      assert.strictEqual(result.delivery[0].name, "Alpha");
      assert.strictEqual(result.delivery[1].name, "Zeta");
      assert.strictEqual(result.scale.length, 1);
    });

    test("excludes empty capability groups", () => {
      const skills = [{ id: "s1", name: "A", capability: "delivery" }];
      const result = groupSkillsByCapability(skills, capabilities);
      assert.strictEqual(result.scale, undefined);
    });
  });

  describe("getCapabilityEmoji", () => {
    test("returns emoji from capability", () => {
      const capabilities = [{ id: "delivery", emojiIcon: "🚀" }];
      assert.strictEqual(getCapabilityEmoji(capabilities, "delivery"), "🚀");
    });

    test("returns default emoji for unknown capability", () => {
      assert.strictEqual(getCapabilityEmoji([], "unknown"), "💡");
    });

    test("returns default when emojiIcon is missing", () => {
      const capabilities = [{ id: "delivery" }];
      assert.strictEqual(getCapabilityEmoji(capabilities, "delivery"), "💡");
    });
  });

  describe("getCapabilityResponsibility", () => {
    const capabilities = [
      {
        id: "delivery",
        professionalResponsibilities: { working: "Delivers independently" },
        managementResponsibilities: { working: "Manages delivery" },
      },
    ];

    test("returns professional responsibility by default", () => {
      const result = getCapabilityResponsibility(
        capabilities,
        "delivery",
        "working",
      );
      assert.strictEqual(result, "Delivers independently");
    });

    test("returns management responsibility for management discipline", () => {
      const result = getCapabilityResponsibility(
        capabilities,
        "delivery",
        "working",
        { isManagement: true },
      );
      assert.strictEqual(result, "Manages delivery");
    });

    test("returns undefined for unknown capability", () => {
      const result = getCapabilityResponsibility(
        capabilities,
        "unknown",
        "working",
      );
      assert.strictEqual(result, undefined);
    });
  });

  describe("getSkillProficiencyIndex", () => {
    test("returns correct indices", () => {
      assert.strictEqual(getSkillProficiencyIndex("awareness"), 0);
      assert.strictEqual(getSkillProficiencyIndex("expert"), 4);
    });

    test("returns -1 for invalid level", () => {
      assert.strictEqual(getSkillProficiencyIndex("invalid"), -1);
    });
  });

  describe("getBehaviourMaturityIndex", () => {
    test("returns correct indices", () => {
      assert.strictEqual(getBehaviourMaturityIndex("emerging"), 0);
      assert.strictEqual(getBehaviourMaturityIndex("exemplifying"), 4);
    });

    test("returns -1 for invalid maturity", () => {
      assert.strictEqual(getBehaviourMaturityIndex("invalid"), -1);
    });
  });

  describe("clampSkillProficiency", () => {
    test("clamps to awareness for negative index", () => {
      assert.strictEqual(clampSkillProficiency(-1), "awareness");
    });

    test("clamps to expert for high index", () => {
      assert.strictEqual(clampSkillProficiency(10), "expert");
    });

    test("returns correct level for valid index", () => {
      assert.strictEqual(clampSkillProficiency(2), "working");
    });
  });

  describe("clampBehaviourMaturity", () => {
    test("clamps to emerging for negative index", () => {
      assert.strictEqual(clampBehaviourMaturity(-1), "emerging");
    });

    test("clamps to exemplifying for high index", () => {
      assert.strictEqual(clampBehaviourMaturity(10), "exemplifying");
    });

    test("returns correct maturity for valid index", () => {
      assert.strictEqual(clampBehaviourMaturity(2), "practicing");
    });
  });

  describe("skillProficiencyMeetsRequirement", () => {
    test("returns true when actual equals required", () => {
      assert.strictEqual(
        skillProficiencyMeetsRequirement("working", "working"),
        true,
      );
    });

    test("returns true when actual exceeds required", () => {
      assert.strictEqual(
        skillProficiencyMeetsRequirement("expert", "awareness"),
        true,
      );
    });

    test("returns false when actual is below required", () => {
      assert.strictEqual(
        skillProficiencyMeetsRequirement("awareness", "expert"),
        false,
      );
    });
  });

  describe("behaviourMaturityMeetsRequirement", () => {
    test("returns true when actual meets required", () => {
      assert.strictEqual(
        behaviourMaturityMeetsRequirement("practicing", "practicing"),
        true,
      );
    });

    test("returns true when actual exceeds required", () => {
      assert.strictEqual(
        behaviourMaturityMeetsRequirement("exemplifying", "emerging"),
        true,
      );
    });

    test("returns false when actual is below required", () => {
      assert.strictEqual(
        behaviourMaturityMeetsRequirement("emerging", "exemplifying"),
        false,
      );
    });
  });

  describe("getConceptEmoji", () => {
    test("returns emoji from framework", () => {
      const framework = {
        entityDefinitions: { skill: { emojiIcon: "🎯" } },
      };
      assert.strictEqual(getConceptEmoji(framework, "skill"), "🎯");
    });

    test("returns default for missing concept", () => {
      assert.strictEqual(getConceptEmoji({}, "skill"), "💡");
    });

    test("returns default for null framework", () => {
      assert.strictEqual(getConceptEmoji(null, "skill"), "💡");
    });
  });
});
