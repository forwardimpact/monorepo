import { describe, it } from "node:test";
import assert from "node:assert";

import {
  deriveSkillProficiency,
  deriveBehaviourMaturity,
  deriveSkillMatrix,
  deriveBehaviourProfile,
  getSkillTypeForDiscipline,
  getDisciplineSkillIds,
  getLevelRank,
} from "@forwardimpact/libskill/derivation";

import {
  testSkills,
  testBehaviours,
  testDiscipline,
  testTrack,
  testLevel,
} from "./model-fixtures.js";

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

  describe("deriveSkillProficiency", () => {
    it("derives correct level for primary skill with modifier capped at level max", () => {
      // Primary skill (practitioner) + modifier (+1 from scale capability)
      // Cap: max base level for level is practitioner, so capped at practitioner
      const level = deriveSkillProficiency({
        discipline: testDiscipline,
        level: testLevel,
        track: testTrack,
        skillId: "skill_a",
        skills: testSkills,
      });
      assert.strictEqual(level, "practitioner");
    });

    it("derives correct level for secondary skill with negative modifier", () => {
      // Secondary skill (working) + modifier (-1 from ai capability) = foundational
      const level = deriveSkillProficiency({
        discipline: testDiscipline,
        level: testLevel,
        track: testTrack,
        skillId: "skill_b",
        skills: testSkills,
      });
      assert.strictEqual(level, "foundational");
    });

    it("derives correct level for broad skill without modifier", () => {
      // Broad skill (foundational) + no modifier = foundational
      const level = deriveSkillProficiency({
        discipline: testDiscipline,
        level: testLevel,
        track: testTrack,
        skillId: "skill_c",
        skills: testSkills,
      });
      assert.strictEqual(level, "foundational");
    });

    it("returns null for skills not in discipline", () => {
      const level = deriveSkillProficiency({
        discipline: testDiscipline,
        level: testLevel,
        track: testTrack,
        skillId: "nonexistent",
        skills: testSkills,
      });
      assert.strictEqual(level, null);
    });

    it("clamps to maximum level", () => {
      const expertLevel = {
        ...testLevel,
        baseSkillProficiencies: {
          primary: "expert",
          secondary: "expert",
          broad: "expert",
        },
      };
      // Expert + 1 should clamp to expert
      const level = deriveSkillProficiency({
        discipline: testDiscipline,
        level: expertLevel,
        track: testTrack,
        skillId: "skill_a",
        skills: testSkills,
      });
      assert.strictEqual(level, "expert");
    });

    it("allows positive modifier up to level max when base is lower", () => {
      // Create a level where expert is the max, but secondary is lower
      const mixedLevel = {
        ...testLevel,
        baseSkillProficiencies: {
          primary: "expert",
          secondary: "practitioner",
          broad: "working",
        },
      };
      // Secondary skill (practitioner) + modifier (+1) = expert
      // This is allowed because expert is the level's max base level
      const trackWithAiBoost = {
        ...testTrack,
        skillModifiers: { ai: 1 },
      };
      const level = deriveSkillProficiency({
        discipline: testDiscipline,
        level: mixedLevel,
        track: trackWithAiBoost,
        skillId: "skill_b", // secondary skill with AI capability
        skills: testSkills,
      });
      assert.strictEqual(level, "expert");
    });

    it("caps positive modifier at level max even when would exceed", () => {
      // Secondary skill (working) would be practitioner with +1
      // But max base is practitioner, so it's capped there
      const capLevel = {
        ...testLevel,
        baseSkillProficiencies: {
          primary: "practitioner",
          secondary: "working",
          broad: "awareness",
        },
      };
      const trackWithAiBoost = {
        ...testTrack,
        skillModifiers: { ai: 2 }, // Would push working +2 = expert
      };
      const level = deriveSkillProficiency({
        discipline: testDiscipline,
        level: capLevel,
        track: trackWithAiBoost,
        skillId: "skill_b", // secondary skill with AI capability
        skills: testSkills,
      });
      // working (2) + 2 = expert (4), but capped at practitioner (3)
      assert.strictEqual(level, "practitioner");
    });

    it("allows negative modifier to go below level base", () => {
      // Negative modifiers should not be capped - they create emphasis
      const level = deriveSkillProficiency({
        discipline: testDiscipline,
        level: testLevel,
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
        level: testLevel,
        track: { ...testTrack, behaviourModifiers: {} },
        behaviourId: "behaviour_x",
      });
      assert.strictEqual(maturity, "role_modeling");
    });

    it("elevates maturity for behaviour with track modifier", () => {
      // Base (practicing) + elevation (+1) = role_modeling
      const maturity = deriveBehaviourMaturity({
        discipline: { ...testDiscipline, behaviourModifiers: {} },
        level: testLevel,
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
        level: testLevel,
        track: trackWithBothModified,
        behaviourId: "behaviour_x",
      });
      // practicing (2) + 2 = 4, which is now exemplifying (index 4)
      assert.strictEqual(maturity, "exemplifying");
    });

    it("uses base maturity when no modifiers apply", () => {
      const maturity = deriveBehaviourMaturity({
        discipline: { ...testDiscipline, behaviourModifiers: {} },
        level: testLevel,
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
        level: testLevel,
        track: testTrack,
        skills: testSkills,
      });

      assert.strictEqual(matrix.length, 3); // All 3 skills in discipline

      const skillA = matrix.find((s) => s.skillId === "skill_a");
      assert.strictEqual(skillA.type, "primary");
      // Primary skill with +1 modifier capped at level max (practitioner)
      assert.strictEqual(skillA.proficiency, "practitioner");
    });

    it("only includes skills in the discipline", () => {
      const extraSkill = {
        id: "extra",
        name: "Extra",
        capability: "technical",
      };
      const matrix = deriveSkillMatrix({
        discipline: testDiscipline,
        level: testLevel,
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
        level: testLevel,
        track: testTrack,
        behaviours: testBehaviours,
      });

      assert.strictEqual(profile.length, 2); // All behaviours
      assert.ok(profile.every((b) => b.behaviourId && b.maturity));
    });

    it("sorts behaviours alphabetically by name", () => {
      const profile = deriveBehaviourProfile({
        discipline: { ...testDiscipline, behaviourModifiers: {} },
        level: testLevel,
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

  describe("getLevelRank", () => {
    it("returns the level level number", () => {
      assert.strictEqual(getLevelRank(testLevel), 3);
      assert.strictEqual(getLevelRank({ ...testLevel, ordinalRank: 5 }), 5);
    });
  });
});
