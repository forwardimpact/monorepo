import { describe, it } from "node:test";
import assert from "node:assert";

import {
  deriveJob,
  isValidJobCombination,
  generateJobTitle,
  isSeniorLevel,
  calculateDriverCoverage,
} from "@forwardimpact/libskill/derivation";

import {
  testSkills,
  testBehaviours,
  testDiscipline,
  testTrack,
  testLevel,
  testDrivers,
} from "./model-fixtures.js";

describe("Derivation", () => {
  describe("deriveJob", () => {
    it("creates complete job definition", () => {
      const job = deriveJob({
        discipline: testDiscipline,
        level: testLevel,
        track: testTrack,
        skills: testSkills,
        behaviours: testBehaviours,
      });

      assert.ok(job);
      assert.strictEqual(job.id, "test_discipline_test_level_test_track");
      assert.ok(job.title.includes("Test"));
      assert.strictEqual(job.skillMatrix.length, 3);
      assert.strictEqual(job.behaviourProfile.length, 2);
    });

    it("returns null for invalid combinations", () => {
      const validationRules = {
        invalidCombinations: [
          { discipline: "test_discipline", level: "test_level" },
        ],
      };

      const job = deriveJob({
        discipline: testDiscipline,
        level: testLevel,
        track: testTrack,
        skills: testSkills,
        behaviours: testBehaviours,
        validationRules,
      });

      assert.strictEqual(job, null);
    });

    it("creates trackless job definition", () => {
      const job = deriveJob({
        discipline: testDiscipline,
        level: testLevel,
        track: null,
        skills: testSkills,
        behaviours: testBehaviours,
      });

      assert.ok(job);
      assert.strictEqual(job.id, "test_discipline_test_level");
      assert.strictEqual(job.track, null);
      assert.ok(job.title.includes("Test"));
      assert.strictEqual(job.skillMatrix.length, 3);
      assert.strictEqual(job.behaviourProfile.length, 2);
    });
  });

  describe("isValidJobCombination", () => {
    it("returns true when no rules defined", () => {
      assert.strictEqual(
        isValidJobCombination({
          discipline: testDiscipline,
          level: testLevel,
          track: testTrack,
          levels: [],
        }),
        true,
      );
    });

    it("respects invalid combinations", () => {
      const rules = {
        invalidCombinations: [
          { discipline: "test_discipline", track: "test_track" },
        ],
      };

      assert.strictEqual(
        isValidJobCombination({
          discipline: testDiscipline,
          level: testLevel,
          track: testTrack,
          validationRules: rules,
          levels: [],
        }),
        false,
      );
    });

    it("respects discipline validTracks constraint", () => {
      const disciplineWithValidTracks = {
        ...testDiscipline,
        validTracks: ["other_track"],
      };

      assert.strictEqual(
        isValidJobCombination({
          discipline: disciplineWithValidTracks,
          level: testLevel,
          track: testTrack,
          levels: [],
        }),
        false,
      );
    });

    it("allows combination when track is in validTracks", () => {
      const disciplineWithValidTracks = {
        ...testDiscipline,
        validTracks: ["test_track", "other_track"],
      };

      assert.strictEqual(
        isValidJobCombination({
          discipline: disciplineWithValidTracks,
          level: testLevel,
          track: testTrack,
          levels: [],
        }),
        true,
      );
    });

    it("allows all tracks when validTracks is empty (legacy behavior)", () => {
      const disciplineWithEmptyValidTracks = {
        ...testDiscipline,
        validTracks: [],
      };

      // Legacy behavior: empty array allows all tracks
      assert.strictEqual(
        isValidJobCombination({
          discipline: disciplineWithEmptyValidTracks,
          level: testLevel,
          track: testTrack,
          levels: [],
        }),
        true,
      );
    });

    it("allows trackless when null is in validTracks", () => {
      const disciplineWithNullInValidTracks = {
        ...testDiscipline,
        validTracks: [null, "dx"],
      };

      assert.strictEqual(
        isValidJobCombination({
          discipline: disciplineWithNullInValidTracks,
          level: testLevel,
          track: null,
          levels: [],
        }),
        true,
      );
    });

    it("rejects trackless when null is not in validTracks", () => {
      const disciplineWithOnlyTrackIds = {
        ...testDiscipline,
        validTracks: ["dx", "platform"],
      };

      assert.strictEqual(
        isValidJobCombination({
          discipline: disciplineWithOnlyTrackIds,
          level: testLevel,
          track: null,
          levels: [],
        }),
        false,
      );
    });

    it("allows track when track ID is in validTracks with null", () => {
      const disciplineWithNullAndTrack = {
        ...testDiscipline,
        validTracks: [null, "test_track"],
      };

      assert.strictEqual(
        isValidJobCombination({
          discipline: disciplineWithNullAndTrack,
          level: testLevel,
          track: testTrack,
          levels: [],
        }),
        true,
      );
    });

    it("rejects track when validTracks only contains null", () => {
      const disciplineWithOnlyNull = {
        ...testDiscipline,
        validTracks: [null],
      };

      assert.strictEqual(
        isValidJobCombination({
          discipline: disciplineWithOnlyNull,
          level: testLevel,
          track: testTrack,
          levels: [],
        }),
        false,
      );
    });

    it("respects discipline minLevel constraint", () => {
      const juniorLevel = { id: "junior", ordinalRank: 1 };
      const seniorLevel = { id: "senior", ordinalRank: 5 };
      const levels = [juniorLevel, seniorLevel];

      const disciplineWithMinLevel = {
        ...testDiscipline,
        minLevel: "senior",
      };

      // Junior level should be invalid
      assert.strictEqual(
        isValidJobCombination({
          discipline: disciplineWithMinLevel,
          level: juniorLevel,
          track: testTrack,
          levels,
        }),
        false,
      );

      // Senior level should be valid
      assert.strictEqual(
        isValidJobCombination({
          discipline: disciplineWithMinLevel,
          level: seniorLevel,
          track: testTrack,
          levels,
        }),
        true,
      );
    });

    it("allows all levels when minLevel is not set", () => {
      const juniorLevel = { id: "junior", ordinalRank: 1 };
      const levels = [juniorLevel];

      const disciplineWithoutMinLevel = {
        ...testDiscipline,
      };
      delete disciplineWithoutMinLevel.minLevel;

      assert.strictEqual(
        isValidJobCombination({
          discipline: disciplineWithoutMinLevel,
          level: juniorLevel,
          track: testTrack,
          levels,
        }),
        true,
      );
    });

    it("allows trackless job combination", () => {
      assert.strictEqual(
        isValidJobCombination({
          discipline: testDiscipline,
          level: testLevel,
          track: null,
          levels: [],
        }),
        true,
      );
    });
  });

  describe("generateJobTitle", () => {
    it("generates title for professional track with Level level", () => {
      const title = generateJobTitle(testDiscipline, testLevel, testTrack);
      // Level is "Level III", so format is: "Test Engineer Level III - Test Track"
      assert.strictEqual(title, "Test Engineer Level III - Test Track");
    });

    it("generates title for professional track with non-Level level", () => {
      const staffLevel = {
        ...testLevel,
        professionalTitle: "Staff",
        managementTitle: "Senior Manager",
      };
      const title = generateJobTitle(testDiscipline, staffLevel, testTrack);
      // Level is "Staff", so format is: "Staff Test Engineer - Test Track"
      assert.strictEqual(title, "Staff Test Engineer - Test Track");
    });

    it("generates title for management discipline", () => {
      const managementDiscipline = {
        ...testDiscipline,
        isProfessional: false,
        isManagement: true,
      };
      const title = generateJobTitle(
        managementDiscipline,
        testLevel,
        testTrack,
      );
      // Management discipline format: "Manager, Role Title – Track Name"
      assert.strictEqual(title, "Manager, Test Engineer – Test Track");
    });

    it("generates title for trackless management discipline", () => {
      const managementDiscipline = {
        ...testDiscipline,
        isProfessional: false,
        isManagement: true,
      };
      const title = generateJobTitle(managementDiscipline, testLevel, null);
      // Trackless management format: "Manager, Role Title"
      assert.strictEqual(title, "Manager, Test Engineer");
    });

    it("generates title for trackless professional discipline", () => {
      const title = generateJobTitle(testDiscipline, testLevel, null);
      // Trackless professional format: "Test Engineer Level III"
      assert.strictEqual(title, "Test Engineer Level III");
    });
  });

  describe("isSeniorLevel", () => {
    it("returns false for levels below level 5", () => {
      assert.strictEqual(isSeniorLevel(testLevel), false); // level 3
      assert.strictEqual(
        isSeniorLevel({ ...testLevel, ordinalRank: 4 }),
        false,
      );
    });

    it("returns true for levels at level 5 or above", () => {
      assert.strictEqual(isSeniorLevel({ ...testLevel, ordinalRank: 5 }), true);
      assert.strictEqual(isSeniorLevel({ ...testLevel, ordinalRank: 6 }), true);
      assert.strictEqual(isSeniorLevel({ ...testLevel, ordinalRank: 7 }), true);
    });
  });

  describe("calculateDriverCoverage", () => {
    it("calculates coverage for drivers", () => {
      const job = deriveJob({
        discipline: testDiscipline,
        level: testLevel,
        track: testTrack,
        skills: testSkills,
        behaviours: testBehaviours,
      });

      const coverage = calculateDriverCoverage({ job, drivers: testDrivers });

      assert.strictEqual(coverage.length, 1);
      assert.strictEqual(coverage[0].driverId, "driver_1");
      assert.ok(
        coverage[0].skillCoverage >= 0 && coverage[0].skillCoverage <= 1,
      );
      assert.ok(coverage[0].overallScore >= 0 && coverage[0].overallScore <= 1);
    });
  });
});
