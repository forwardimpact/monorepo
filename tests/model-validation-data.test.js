import { describe, it } from "node:test";
import assert from "node:assert";

import { validateAllData } from "@forwardimpact/map/validation";

import {
  testSkills,
  testBehaviours,
  testDiscipline,
  testTrack,
  testLevel,
  testCategories,
  testDrivers,
} from "./model-fixtures.js";

describe("Validation", () => {
  describe("validateAllData", () => {
    it("validates complete valid data", () => {
      const result = validateAllData({
        skills: testSkills,
        behaviours: testBehaviours,
        disciplines: [testDiscipline],
        tracks: [testTrack],
        levels: [testLevel],
        drivers: testDrivers,
        capabilities: testCategories,
      });

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    it("detects missing required fields", () => {
      const result = validateAllData({
        skills: [{ name: "No ID" }],
        behaviours: testBehaviours,
        disciplines: [testDiscipline],
        tracks: [testTrack],
        levels: [testLevel],
      });

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.type === "MISSING_REQUIRED"));
    });

    it("detects invalid references in disciplines", () => {
      const result = validateAllData({
        skills: testSkills,
        behaviours: testBehaviours,
        disciplines: [
          {
            ...testDiscipline,
            coreSkills: ["nonexistent_skill"],
          },
        ],
        tracks: [testTrack],
        levels: [testLevel],
      });

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.type === "INVALID_REFERENCE"));
    });

    it("detects invalid matching weights", () => {
      const result = validateAllData({
        skills: testSkills,
        behaviours: testBehaviours,
        disciplines: [testDiscipline],
        tracks: [
          {
            ...testTrack,
            assessmentWeights: { skillWeight: 0.7, behaviourWeight: 0.5 }, // Sums to 1.2
          },
        ],
        levels: [testLevel],
      });

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.message.includes("sum to 1.0")));
    });

    it("detects duplicate IDs", () => {
      const result = validateAllData({
        skills: [testSkills[0], testSkills[0]], // Duplicate
        behaviours: testBehaviours,
        disciplines: [testDiscipline],
        tracks: [testTrack],
        levels: [testLevel],
      });

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.type === "DUPLICATE_ID"));
    });

    it("validates discipline with specialization and roleTitle", () => {
      const result = validateAllData({
        skills: testSkills,
        behaviours: testBehaviours,
        disciplines: [testDiscipline], // Uses specialization/roleTitle
        tracks: [testTrack],
        levels: [testLevel],
        drivers: testDrivers,
        capabilities: testCategories,
      });

      assert.strictEqual(result.valid, true);
    });

    it("validates level with professionalTitle and managementTitle", () => {
      const result = validateAllData({
        skills: testSkills,
        behaviours: testBehaviours,
        disciplines: [testDiscipline],
        tracks: [testTrack],
        levels: [testLevel], // Uses professionalTitle/managementTitle
        drivers: testDrivers,
        capabilities: testCategories,
      });

      assert.strictEqual(result.valid, true);
    });

    it("validates discipline with validTracks constraint", () => {
      const disciplineWithValidTracks = {
        ...testDiscipline,
        validTracks: ["test_track"],
      };

      const result = validateAllData({
        skills: testSkills,
        behaviours: testBehaviours,
        disciplines: [disciplineWithValidTracks],
        tracks: [testTrack],
        levels: [testLevel],
        drivers: testDrivers,
        capabilities: testCategories,
      });

      assert.strictEqual(result.valid, true);
    });

    it("detects invalid validTracks references", () => {
      const disciplineWithInvalidTracks = {
        ...testDiscipline,
        validTracks: ["nonexistent_track"],
      };

      const result = validateAllData({
        skills: testSkills,
        behaviours: testBehaviours,
        disciplines: [disciplineWithInvalidTracks],
        tracks: [testTrack],
        levels: [testLevel],
      });

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.type === "INVALID_REFERENCE"));
    });

    it("allows null in validTracks array", () => {
      const disciplineWithNull = {
        ...testDiscipline,
        validTracks: [null, "test_track"],
      };

      const result = validateAllData({
        skills: testSkills,
        behaviours: testBehaviours,
        disciplines: [disciplineWithNull],
        tracks: [testTrack],
        levels: [testLevel],
        drivers: testDrivers,
        capabilities: testCategories,
      });

      assert.strictEqual(result.valid, true);
    });

    it("validates discipline with professional/management flags", () => {
      const managementDiscipline = {
        ...testDiscipline,
        id: "management_discipline",
        isProfessional: false,
        isManagement: true,
      };

      const result = validateAllData({
        skills: testSkills,
        behaviours: testBehaviours,
        disciplines: [managementDiscipline],
        tracks: [testTrack],
        levels: [testLevel],
        drivers: testDrivers,
        capabilities: testCategories,
      });

      assert.strictEqual(result.valid, true);
    });

    it("detects invalid professional/management flag types", () => {
      const invalidDiscipline = {
        ...testDiscipline,
        isProfessional: "yes", // Should be boolean
      };

      const result = validateAllData({
        skills: testSkills,
        behaviours: testBehaviours,
        disciplines: [invalidDiscipline],
        tracks: [testTrack],
        levels: [testLevel],
      });

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.type === "INVALID_VALUE"));
    });

    it("detects invalid skillModifier keys (non-capability keys)", () => {
      const trackWithInvalidModifiers = {
        ...testTrack,
        id: "invalid_modifiers_track",
        skillModifiers: {
          delivery: 1, // Valid capability
          invalid_key: -1, // Invalid - not a capability
          coding: 1, // Invalid - skill ID, not a capability
        },
      };

      const result = validateAllData({
        skills: testSkills,
        behaviours: testBehaviours,
        disciplines: [testDiscipline],
        tracks: [trackWithInvalidModifiers],
        levels: [testLevel],
      });

      assert.strictEqual(result.valid, false);
      assert.ok(
        result.errors.some((e) => e.type === "INVALID_SKILL_MODIFIER_KEY"),
      );
      assert.ok(result.errors.some((e) => e.message.includes("invalid_key")));
    });

    it("accepts valid capability keys in skillModifiers", () => {
      const trackWithValidModifiers = {
        ...testTrack,
        id: "valid_modifiers_track",
        skillModifiers: {
          scale: 1,
          ai: -1,
          people: 1,
        },
      };

      // Update discipline to reference the new track
      const disciplineForTest = {
        ...testDiscipline,
        validTracks: ["valid_modifiers_track"],
      };

      const result = validateAllData({
        skills: testSkills,
        behaviours: testBehaviours,
        disciplines: [disciplineForTest],
        tracks: [trackWithValidModifiers],
        levels: [testLevel],
        drivers: testDrivers,
        capabilities: testCategories,
      });

      assert.strictEqual(result.valid, true);
    });

    it("validates level with breadthRequirements", () => {
      const seniorLevel = {
        ...testLevel,
        id: "senior_level",
        ordinalRank: 5,
        breadthRequirements: {
          practitioner: 4,
          expert: 2,
        },
      };

      const result = validateAllData({
        skills: testSkills,
        behaviours: testBehaviours,
        disciplines: [testDiscipline],
        tracks: [testTrack],
        levels: [seniorLevel],
        drivers: testDrivers,
        capabilities: testCategories,
      });

      assert.strictEqual(result.valid, true);
    });

    it("validates level with typicalExperienceRange", () => {
      const levelWithExperience = {
        ...testLevel,
        typicalExperienceRange: "5-8",
      };

      const result = validateAllData({
        skills: testSkills,
        behaviours: testBehaviours,
        disciplines: [testDiscipline],
        tracks: [testTrack],
        levels: [levelWithExperience],
        drivers: testDrivers,
        capabilities: testCategories,
      });

      assert.strictEqual(result.valid, true);
    });

    it("validates categories when provided", () => {
      const result = validateAllData({
        skills: testSkills,
        behaviours: testBehaviours,
        disciplines: [testDiscipline],
        tracks: [testTrack],
        levels: [testLevel],
        capabilities: testCategories,
        drivers: testDrivers,
      });

      assert.strictEqual(result.valid, true);
    });

    it("detects missing capability id", () => {
      const result = validateAllData({
        skills: testSkills,
        behaviours: testBehaviours,
        disciplines: [testDiscipline],
        tracks: [testTrack],
        levels: [testLevel],
        capabilities: [{ name: "No ID", emojiIcon: "🚀" }],
      });

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.type === "MISSING_REQUIRED"));
    });

    it("detects duplicate capability IDs", () => {
      const result = validateAllData({
        skills: testSkills,
        behaviours: testBehaviours,
        disciplines: [testDiscipline],
        tracks: [testTrack],
        levels: [testLevel],
        capabilities: [testCategories[0], testCategories[0]], // Duplicate
      });

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.type === "DUPLICATE_ID"));
    });

    it("detects invalid skill capability references when capabilities provided", () => {
      const skillsWithInvalidCapability = [
        { ...testSkills[0], capability: "nonexistent_capability" },
      ];

      const result = validateAllData({
        skills: skillsWithInvalidCapability,
        behaviours: testBehaviours,
        disciplines: [
          {
            ...testDiscipline,
            coreSkills: [skillsWithInvalidCapability[0].id],
          },
        ],
        tracks: [testTrack],
        levels: [testLevel],
        capabilities: testCategories,
      });

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.type === "INVALID_REFERENCE"));
      assert.ok(
        result.errors.some((e) => e.message.includes("unknown capability")),
      );
    });

    it("warns on missing capability responsibilities", () => {
      // Provide categories for all skill categories used in testSkills
      const minimalCategories = [
        { id: "scale", name: "Scale" }, // No responsibilities
        { id: "ai", name: "AI", professionalResponsibilities: {} },
        { id: "people", name: "People", managementResponsibilities: {} },
      ];

      const result = validateAllData({
        skills: testSkills,
        behaviours: testBehaviours,
        disciplines: [testDiscipline],
        tracks: [testTrack],
        levels: [testLevel],
        capabilities: minimalCategories,
        drivers: testDrivers,
      });

      assert.strictEqual(result.valid, true);
      assert.ok(
        result.warnings.some((w) => w.message.includes("Responsibilities")),
      );
    });
  });
});
