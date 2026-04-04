import { describe, it } from "node:test";
import assert from "node:assert";

import { findRealisticMatches } from "@forwardimpact/libskill/matching";

import {
  testSkills,
  testBehaviours,
  testDiscipline,
  testTrack,
  testLevel,
} from "./model-fixtures.js";

describe("Matching", () => {
  describe("findRealisticMatches", () => {
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
    ];

    it("returns matches grouped by tier", () => {
      const result = findRealisticMatches({
        selfAssessment: {
          skillProficiencies: { skill_a: "working" },
          behaviourMaturities: {},
        },
        disciplines: [testDiscipline],
        levels,
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

    it("returns estimated level", () => {
      const result = findRealisticMatches({
        selfAssessment: {
          skillProficiencies: { skill_a: "working" },
          behaviourMaturities: {},
        },
        disciplines: [testDiscipline],
        levels,
        tracks: [testTrack],
        skills: testSkills,
        behaviours: testBehaviours,
      });

      assert.ok(result.estimatedLevel);
      assert.ok(result.estimatedLevel.level);
      assert.ok(result.estimatedLevel.confidence !== undefined);
    });

    it("filters by level range when enabled", () => {
      const result = findRealisticMatches({
        selfAssessment: {
          skillProficiencies: { skill_a: "foundational" },
          behaviourMaturities: {},
        },
        disciplines: [testDiscipline],
        levels,
        tracks: [testTrack],
        skills: testSkills,
        behaviours: testBehaviours,
        filterByLevel: true,
      });

      // All matches should be within ±1 of estimated level
      const estimatedLevel = result.estimatedLevel.level.ordinalRank;
      for (const match of result.matches) {
        assert.ok(Math.abs(match.job.level.ordinalRank - estimatedLevel) <= 1);
      }
    });

    it("includes level range info", () => {
      const result = findRealisticMatches({
        selfAssessment: {
          skillProficiencies: { skill_a: "working" },
          behaviourMaturities: {},
        },
        disciplines: [testDiscipline],
        levels,
        tracks: [testTrack],
        skills: testSkills,
        behaviours: testBehaviours,
      });

      assert.ok(result.levelRange);
      assert.ok(result.levelRange.min !== undefined);
      assert.ok(result.levelRange.max !== undefined);
    });

    it("sorts matches by level rank descending within each tier", () => {
      const result = findRealisticMatches({
        selfAssessment: {
          skillProficiencies: { skill_a: "working" },
          behaviourMaturities: {},
        },
        disciplines: [testDiscipline],
        levels,
        tracks: [testTrack],
        skills: testSkills,
        behaviours: testBehaviours,
        filterByLevel: false,
      });

      // Check that each tier is sorted by level rank descending
      for (const tierNum of [1, 2, 3, 4]) {
        const tierMatches = result.matchesByTier[tierNum];
        for (let i = 1; i < tierMatches.length; i++) {
          const prevLevel = tierMatches[i - 1].job.level.ordinalRank;
          const currLevel = tierMatches[i].job.level.ordinalRank;
          // Should be descending or equal
          assert.ok(
            prevLevel >= currLevel,
            `Tier ${tierNum} not sorted by level descending`,
          );
        }
      }
    });

    it("filters out lower levels when strong matches exist at higher levels", () => {
      // Create a self-assessment that strongly matches senior level
      const seniorAssessment = {
        skillProficiencies: {
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
        levels,
        tracks: [testTrack],
        skills: testSkills,
        behaviours: testBehaviours,
        filterByLevel: false, // Disable initial level filtering to test the intelligent filter
      });

      // Find highest level rank with strong/good match
      const strongGoodMatches = [
        ...result.matchesByTier[1],
        ...result.matchesByTier[2],
      ];
      if (strongGoodMatches.length > 0) {
        const highestLevel = Math.max(
          ...strongGoodMatches.map((m) => m.job.level.ordinalRank),
        );

        // Stretch/aspirational roles should only be at or above highest match level
        for (const match of result.matchesByTier[3]) {
          assert.ok(
            match.job.level.ordinalRank >= highestLevel,
            "Stretch role should be at or above highest match",
          );
        }
        for (const match of result.matchesByTier[4]) {
          assert.ok(
            match.job.level.ordinalRank >= highestLevel,
            "Aspirational role should be at or above highest match",
          );
        }
      }
    });
  });
});
