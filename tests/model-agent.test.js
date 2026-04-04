import { describe, it } from "node:test";
import assert from "node:assert";

import {
  deriveReferenceLevel,
  interpolateTeamInstructions,
} from "@forwardimpact/libskill/agent";

describe("Agent Module", () => {
  describe("deriveReferenceLevel", () => {
    it("selects first level with practitioner-level primary skills", () => {
      const levels = [
        {
          id: "junior",
          ordinalRank: 1,
          baseSkillProficiencies: { primary: "foundational" },
        },
        {
          id: "mid",
          ordinalRank: 2,
          baseSkillProficiencies: { primary: "working" },
        },
        {
          id: "senior",
          ordinalRank: 3,
          baseSkillProficiencies: { primary: "practitioner" },
        },
        {
          id: "staff",
          ordinalRank: 4,
          baseSkillProficiencies: { primary: "expert" },
        },
      ];
      const result = deriveReferenceLevel(levels);
      assert.strictEqual(result.id, "senior");
    });

    it("falls back to first working-level level when no practitioner exists", () => {
      const levels = [
        {
          id: "junior",
          ordinalRank: 1,
          baseSkillProficiencies: { primary: "awareness" },
        },
        {
          id: "mid",
          ordinalRank: 2,
          baseSkillProficiencies: { primary: "working" },
        },
        {
          id: "senior",
          ordinalRank: 3,
          baseSkillProficiencies: { primary: "working" },
        },
      ];
      const result = deriveReferenceLevel(levels);
      assert.strictEqual(result.id, "mid");
    });

    it("falls back to middle level when no practitioner or working exists", () => {
      const levels = [
        {
          id: "G1",
          ordinalRank: 1,
          baseSkillProficiencies: { primary: "awareness" },
        },
        {
          id: "G2",
          ordinalRank: 2,
          baseSkillProficiencies: { primary: "foundational" },
        },
        {
          id: "G3",
          ordinalRank: 3,
          baseSkillProficiencies: { primary: "foundational" },
        },
        {
          id: "G4",
          ordinalRank: 4,
          baseSkillProficiencies: { primary: "foundational" },
        },
        {
          id: "G5",
          ordinalRank: 5,
          baseSkillProficiencies: { primary: "foundational" },
        },
      ];
      const result = deriveReferenceLevel(levels);
      assert.strictEqual(result.id, "G3"); // index 2 = floor(5/2)
    });

    it("handles unsorted level input", () => {
      const levels = [
        {
          id: "staff",
          ordinalRank: 4,
          baseSkillProficiencies: { primary: "expert" },
        },
        {
          id: "junior",
          ordinalRank: 1,
          baseSkillProficiencies: { primary: "foundational" },
        },
        {
          id: "senior",
          ordinalRank: 3,
          baseSkillProficiencies: { primary: "practitioner" },
        },
        {
          id: "mid",
          ordinalRank: 2,
          baseSkillProficiencies: { primary: "working" },
        },
      ];
      const result = deriveReferenceLevel(levels);
      assert.strictEqual(result.id, "senior");
    });

    it("throws when no levels provided", () => {
      assert.throws(() => deriveReferenceLevel([]), /No levels configured/);
      assert.throws(() => deriveReferenceLevel(null), /No levels configured/);
    });

    it("works with single level", () => {
      const levels = [
        {
          id: "only",
          ordinalRank: 1,
          baseSkillProficiencies: { primary: "awareness" },
        },
      ];
      const result = deriveReferenceLevel(levels);
      assert.strictEqual(result.id, "only");
    });

    it("works with different level ID naming conventions", () => {
      // Customer might use L1/L2/L3 or Level1/Level2 or anything
      const levels = [
        {
          id: "Band-A",
          ordinalRank: 1,
          baseSkillProficiencies: { primary: "foundational" },
        },
        {
          id: "Band-B",
          ordinalRank: 2,
          baseSkillProficiencies: { primary: "working" },
        },
        {
          id: "Band-C",
          ordinalRank: 3,
          baseSkillProficiencies: { primary: "practitioner" },
        },
      ];
      const result = deriveReferenceLevel(levels);
      assert.strictEqual(result.id, "Band-C");
    });
  });
});

describe("interpolateTeamInstructions", () => {
  const discipline = {
    roleTitle: "Software Engineer",
    specialization: "Backend Engineering",
  };

  it("replaces {roleTitle} and {specialization} placeholders", () => {
    const agentTrack = {
      teamInstructions:
        "This team supports the {roleTitle} track.\nSpecialization: {specialization}.",
    };
    const result = interpolateTeamInstructions(agentTrack, discipline);
    assert.strictEqual(
      result,
      "This team supports the Software Engineer track.\nSpecialization: Backend Engineering.",
    );
  });

  it("returns null when teamInstructions is absent", () => {
    const agentTrack = { identity: "test" };
    const result = interpolateTeamInstructions(agentTrack, discipline);
    assert.strictEqual(result, null);
  });

  it("returns null when agentTrack is null", () => {
    const result = interpolateTeamInstructions(null, discipline);
    assert.strictEqual(result, null);
  });

  it("returns string unchanged when no placeholders present", () => {
    const agentTrack = { teamInstructions: "Static instructions." };
    const result = interpolateTeamInstructions(agentTrack, discipline);
    assert.strictEqual(result, "Static instructions.");
  });
});
