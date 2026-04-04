import { describe, it } from "node:test";
import assert from "node:assert";

import {
  calculateJobMatch,
  findMatchingJobs,
  deriveDevelopmentPath,
  findNextStepJob,
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
        skillProficiencies: {
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
        skillProficiencies: {
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
        skillProficiencies: { skill_a: "awareness" }, // Much lower than expert
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

    it("includes expectations score for senior levels", () => {
      const seniorLevel = {
        ...testLevel,
        ordinalRank: 5, // Senior level (Principal level)
        baseSkillProficiencies: {
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

    it("does not include expectations score for non-senior levels", () => {
      const nonSeniorAssessment = {
        skillProficiencies: {
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
          skillProficiencies: { skill_a: "working" },
          behaviourMaturities: { behaviour_x: "developing" },
        },
        disciplines: [testDiscipline],
        levels: [testLevel],
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
        selfAssessment: { skillProficiencies: {}, behaviourMaturities: {} },
        disciplines: [testDiscipline],
        levels: [testLevel, { ...testLevel, id: "level2", ordinalRank: 2 }],
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
        selfAssessment: { skillProficiencies: {}, behaviourMaturities: {} },
        disciplines: [disciplineWithValidTracks],
        levels: [testLevel],
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
        selfAssessment: { skillProficiencies: {}, behaviourMaturities: {} },
        disciplines: [disciplineWithValidTracks],
        levels: [testLevel],
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
        skillProficiencies: { skill_a: "foundational" },
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
        skillProficiencies: {
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
        skillProficiencies: {
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
});
