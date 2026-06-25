import { describe, it } from "node:test";
import assert from "node:assert";

import {
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

    it("prioritizes core skills", () => {
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
          behaviour_x: "role-modeling",
          behaviour_y: "role-modeling",
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
