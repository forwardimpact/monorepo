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
} from "@forwardimpact/libskill/levels";

import {
  compareByCapability,
  sortSkillsByCapability,
} from "@forwardimpact/libskill/policies";

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
      assert.strictEqual(getBehaviourMaturityIndex("role-modeling"), 3);
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
      assert.strictEqual(clampBehaviourMaturity(3), "role-modeling");
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
        behaviourMaturityMeetsRequirement("role-modeling", "practicing"),
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
        behaviourMaturityMeetsRequirement("emerging", "role-modeling"),
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
