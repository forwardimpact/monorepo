import { describe, it } from "node:test";
import assert from "node:assert";

import { getSkillProficiencyIndex } from "@forwardimpact/map/levels";

import {
  getPositiveTrackCapabilities,
  prepareBaseProfile,
  prepareAgentProfile,
} from "@forwardimpact/libskill/profile";

import {
  isAgentEligible,
  filterHighestLevel,
  filterAgentSkills,
  compareByLevelDesc,
  compareByMaturityDesc,
} from "@forwardimpact/libskill/policies";

import {
  testSkills,
  testBehaviours,
  testDiscipline,
  testTrack,
  testLevel,
  testCategories,
} from "./model-fixtures.js";

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
        { skillId: "a", type: "primary", proficiency: "practitioner" },
        { skillId: "b", type: "broad", proficiency: "practitioner" },
        { skillId: "c", type: "secondary", proficiency: "working" },
        { skillId: "d", type: "broad", proficiency: "foundational" },
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
          proficiency: "practitioner",
        },
        {
          skillId: "b",
          type: "broad",
          isHumanOnly: false,
          proficiency: "practitioner",
        },
        {
          skillId: "c",
          type: "secondary",
          isHumanOnly: true,
          proficiency: "practitioner",
        },
        {
          skillId: "d",
          type: "broad",
          isHumanOnly: false,
          proficiency: "working",
        },
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
        { skillId: "a", proficiency: "awareness" },
        { skillId: "b", proficiency: "expert" },
        { skillId: "c", proficiency: "working" },
      ];
      const result = [...skillMatrix].sort(compareByLevelDesc);
      assert.strictEqual(result[0].skillId, "b"); // expert
      assert.strictEqual(result[1].skillId, "c"); // working
      assert.strictEqual(result[2].skillId, "a"); // awareness
    });

    it("does not mutate original array when used with spread", () => {
      const original = [
        { skillId: "a", proficiency: "awareness" },
        { skillId: "b", proficiency: "expert" },
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
        level: testLevel,
        skills: testSkills,
        behaviours: testBehaviours,
      });
      assert.ok(result.skillMatrix.length > 0);
      assert.ok(result.behaviourProfile.length > 0);
      assert.strictEqual(result.discipline, testDiscipline);
      assert.strictEqual(result.track, testTrack);
      assert.strictEqual(result.level, testLevel);
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
        level: testLevel,
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
        level: testLevel,
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
        level: testLevel,
        skills: testSkills,
        behaviours: testBehaviours,
      });

      // Skills should be sorted by level descending
      if (result.skillMatrix.length > 1) {
        const firstLevel = result.skillMatrix[0].proficiency;
        const lastLevel =
          result.skillMatrix[result.skillMatrix.length - 1].proficiency;
        assert.ok(
          getSkillProficiencyIndex(firstLevel) >=
            getSkillProficiencyIndex(lastLevel),
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
        level: testLevel,
        skills: skillsWithHumanOnly,
        behaviours: testBehaviours,
      });

      assert.ok(!result.skillMatrix.some((s) => s.skillId === "human_skill"));
    });
  });
});
