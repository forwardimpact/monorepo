import { describe, it } from "node:test";
import assert from "node:assert";

import { calculateJobMatch } from "@forwardimpact/libskill/matching";

import { deriveJob } from "@forwardimpact/libskill/derivation";

import {
  testSkills,
  testBehaviours,
  testDiscipline,
  testTrack,
  testLevel,
} from "./model-fixtures.js";

describe("Matching", () => {
  const job = deriveJob({
    discipline: testDiscipline,
    level: testLevel,
    track: testTrack,
    skills: testSkills,
    behaviours: testBehaviours,
  });

  describe("calculateJobMatch", () => {
    it("calculates perfect match score", () => {
      const perfectAssessment = {
        skillProficiencies: {
          skill_a: "expert",
          skill_b: "foundational",
          skill_c: "foundational",
        },
        behaviourMaturities: {
          behaviour_x: "role-modeling",
          behaviour_y: "role-modeling",
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
          skillProficiencies: {
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
        skillProficiencies: { skill_a: "awareness" }, // Much lower than expert
        behaviourMaturities: { behaviour_x: "emerging" }, // Much lower than role-modeling
      };

      const match = calculateJobMatch(weakAssessment, job);

      assert.ok(match.gaps.length > 0);
      assert.ok(match.gaps.some((g) => g.type === "skill"));
      assert.ok(match.gaps.some((g) => g.type === "behaviour"));
    });

    it("gives partial credit for close levels with smooth decay", () => {
      // One level below should give 0.7 credit (smooth decay scoring)
      // Job requires: skill_a=practitioner, skill_b=foundational, skill_c=foundational
      // Job requires: behaviour_x=role-modeling, behaviour_y=role-modeling
      const closeAssessment = {
        skillProficiencies: {
          skill_a: "working", // One below practitioner
          skill_b: "awareness", // One below foundational
          skill_c: "awareness", // One below foundational
        },
        behaviourMaturities: {
          behaviour_x: "practicing", // One below role-modeling
          behaviour_y: "practicing", // One below role-modeling
        },
      };

      const match = calculateJobMatch(closeAssessment, job);

      // Each item one level below gives 0.7 credit (smooth decay)
      assert.ok(Math.abs(match.skillScore - 0.7) < 0.001);
      assert.ok(Math.abs(match.behaviourScore - 0.7) < 0.001);
    });

    it("includes tier classification", () => {
      const perfectAssessment = {
        skillProficiencies: {
          skill_a: "expert",
          skill_b: "foundational",
          skill_c: "foundational",
        },
        behaviourMaturities: {
          behaviour_x: "role-modeling",
          behaviour_y: "role-modeling",
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
        skillProficiencies: { skill_a: "awareness" }, // Much lower than expert
        behaviourMaturities: { behaviour_x: "emerging" }, // Much lower than role-modeling
      };

      const match = calculateJobMatch(weakAssessment, job);

      assert.ok(match.priorityGaps);
      assert.ok(match.priorityGaps.length <= 3);
      // Priority gaps should be the largest gaps
      for (let i = 1; i < match.priorityGaps.length; i++) {
        assert.ok(match.priorityGaps[i - 1].gap >= match.priorityGaps[i].gap);
      }
    });

    it("includes expectations score for senior levels", () => {
      const seniorLevel = {
        ...testLevel,
        ordinalRank: 5, // Senior level (Principal level)
        baseSkillProficiencies: {
          core: "expert",
          supporting: "practitioner",
          broad: "working",
        },
        baseBehaviourMaturity: "role-modeling",
        expectations: {
          impactScope: "Organization-wide",
          autonomyExpectation: "Strategic direction",
          influenceScope: "Cross-team",
          complexityHandled: "High",
        },
      };

      const seniorJob = deriveJob({
        discipline: testDiscipline,
        level: seniorLevel,
        track: testTrack,
        skills: testSkills,
        behaviours: testBehaviours,
      });

      const assessmentWithExpectations = {
        skillProficiencies: {
          skill_a: "expert",
          skill_b: "practitioner",
          skill_c: "working",
        },
        behaviourMaturities: {
          behaviour_x: "role-modeling",
          behaviour_y: "role-modeling",
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

    it("does not include expectations score for non-senior levels", () => {
      const nonSeniorAssessment = {
        skillProficiencies: {
          skill_a: "expert",
          skill_b: "foundational",
          skill_c: "foundational",
        },
        behaviourMaturities: {
          behaviour_x: "role-modeling",
          behaviour_y: "role-modeling",
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
});
