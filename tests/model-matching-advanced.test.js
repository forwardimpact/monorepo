import { describe, it } from "node:test";
import assert from "node:assert";

import {
  classifyMatch,
  calculateGapScore,
  MatchTier,
  GAP_SCORES,
  findNextStepJob,
  estimateBestFitLevel,
} from "@forwardimpact/libskill/matching";

import { deriveJob } from "@forwardimpact/libskill/derivation";

import {
  testSkills,
  testBehaviours,
  testDiscipline,
  testTrack,
  testLevel,
} from "./model-fixtures.js";

describe("Matching", () => {
  describe("findNextStepJob", () => {
    it("finds next level rank job", () => {
      const level2 = { ...testLevel, id: "level2", ordinalRank: 2 };
      const level3 = { ...testLevel, id: "level3", ordinalRank: 3 };
      const level4 = {
        ...testLevel,
        id: "level4",
        ordinalRank: 4,
        professionalTitle: "Staff",
        managementTitle: "Senior Manager",
      };

      const currentJob = deriveJob({
        discipline: testDiscipline,
        level: level3,
        track: testTrack,
        skills: testSkills,
        behaviours: testBehaviours,
      });

      const result = findNextStepJob({
        selfAssessment: {
          skillProficiencies: { skill_a: "practitioner" },
          behaviourMaturities: {},
        },
        currentJob,
        _disciplines: [testDiscipline],
        levels: [level2, level3, level4],
        tracks: [testTrack],
        skills: testSkills,
        behaviours: testBehaviours,
      });

      assert.ok(result);
      assert.strictEqual(result.job.level.ordinalRank, 4);
    });

    it("returns null when at top level", () => {
      const topLevel = { ...testLevel, id: "top_level", ordinalRank: 7 };

      const currentJob = deriveJob({
        discipline: testDiscipline,
        level: topLevel,
        track: testTrack,
        skills: testSkills,
        behaviours: testBehaviours,
      });

      const result = findNextStepJob({
        selfAssessment: { skillProficiencies: {}, behaviourMaturities: {} },
        currentJob,
        _disciplines: [testDiscipline],
        levels: [topLevel],
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

  describe("estimateBestFitLevel", () => {
    const levels = [
      {
        ...testLevel,
        id: "junior",
        ordinalRank: 1,
        baseSkillProficiencies: {
          primary: "awareness",
          secondary: "awareness",
          broad: "awareness",
        },
      },
      {
        ...testLevel,
        id: "mid",
        ordinalRank: 2,
        baseSkillProficiencies: {
          primary: "foundational",
          secondary: "awareness",
          broad: "awareness",
        },
      },
      {
        ...testLevel,
        id: "senior",
        ordinalRank: 3,
        baseSkillProficiencies: {
          primary: "working",
          secondary: "foundational",
          broad: "awareness",
        },
      },
      {
        ...testLevel,
        id: "staff",
        ordinalRank: 4,
        baseSkillProficiencies: {
          primary: "practitioner",
          secondary: "working",
          broad: "foundational",
        },
      },
      {
        ...testLevel,
        id: "principal",
        ordinalRank: 5,
        baseSkillProficiencies: {
          primary: "expert",
          secondary: "practitioner",
          broad: "working",
        },
      },
    ];

    it("estimates lowest level for awareness-level skills", () => {
      const result = estimateBestFitLevel({
        selfAssessment: {
          skillProficiencies: { skill_a: "awareness", skill_b: "awareness" },
        },
        levels,
        skills: testSkills,
      });

      assert.strictEqual(result.level.id, "junior");
    });

    it("estimates mid-level level for working-level skills", () => {
      const result = estimateBestFitLevel({
        selfAssessment: {
          skillProficiencies: { skill_a: "working", skill_b: "working" },
        },
        levels,
        skills: testSkills,
      });

      assert.strictEqual(result.level.id, "senior");
    });

    it("estimates top level for expert-level skills", () => {
      const result = estimateBestFitLevel({
        selfAssessment: {
          skillProficiencies: { skill_a: "expert", skill_b: "expert" },
        },
        levels,
        skills: testSkills,
      });

      assert.strictEqual(result.level.id, "principal");
    });

    it("returns lowest level with 0 confidence for empty assessment", () => {
      const result = estimateBestFitLevel({
        selfAssessment: { skillProficiencies: {} },
        levels,
        skills: testSkills,
      });

      assert.strictEqual(result.level.id, "junior");
      assert.strictEqual(result.confidence, 0);
    });

    it("includes confidence level", () => {
      const result = estimateBestFitLevel({
        selfAssessment: {
          skillProficiencies: {
            skill_a: "practitioner",
            skill_b: "practitioner",
          },
        },
        levels,
        skills: testSkills,
      });

      assert.ok(result.confidence >= 0 && result.confidence <= 1);
    });
  });
});
