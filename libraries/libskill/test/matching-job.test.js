import { test, describe } from "node:test";
import assert from "node:assert";

import { MatchTier, calculateJobMatch } from "../matching.js";

describe("calculateJobMatch", () => {
  test("perfect match returns score of 1.0 with no gaps", () => {
    const selfAssessment = {
      skillProficiencies: { s1: "working", s2: "foundational" },
      behaviourMaturities: { b1: "practicing" },
    };
    const job = {
      level: { ordinalRank: 3 },
      track: null,
      skillMatrix: [
        {
          skillId: "s1",
          skillName: "Skill 1",
          capability: "delivery",
          type: "primary",
          proficiency: "working",
        },
        {
          skillId: "s2",
          skillName: "Skill 2",
          capability: "scale",
          type: "secondary",
          proficiency: "foundational",
        },
      ],
      behaviourProfile: [
        {
          behaviourId: "b1",
          behaviourName: "Behaviour 1",
          maturity: "practicing",
        },
      ],
    };

    const result = calculateJobMatch(selfAssessment, job);
    assert.strictEqual(result.overallScore, 1.0);
    assert.strictEqual(result.skillScore, 1.0);
    assert.strictEqual(result.behaviourScore, 1.0);
    assert.strictEqual(result.gaps.length, 0);
    assert.strictEqual(result.tier.tier, MatchTier.STRONG);
  });

  test("exceeding requirements returns score of 1.0", () => {
    const selfAssessment = {
      skillProficiencies: { s1: "expert" },
      behaviourMaturities: { b1: "exemplifying" },
    };
    const job = {
      level: { ordinalRank: 2 },
      track: null,
      skillMatrix: [
        {
          skillId: "s1",
          skillName: "Skill 1",
          capability: "delivery",
          type: "primary",
          proficiency: "awareness",
        },
      ],
      behaviourProfile: [
        {
          behaviourId: "b1",
          behaviourName: "Behaviour 1",
          maturity: "emerging",
        },
      ],
    };

    const result = calculateJobMatch(selfAssessment, job);
    assert.strictEqual(result.overallScore, 1.0);
    assert.strictEqual(result.gaps.length, 0);
  });

  test("skill gap produces correct gap entry", () => {
    const selfAssessment = {
      skillProficiencies: { s1: "awareness" },
      behaviourMaturities: {},
    };
    const job = {
      level: { ordinalRank: 3 },
      track: null,
      skillMatrix: [
        {
          skillId: "s1",
          skillName: "Skill 1",
          capability: "delivery",
          type: "primary",
          proficiency: "working",
        },
      ],
      behaviourProfile: [],
    };

    const result = calculateJobMatch(selfAssessment, job);
    assert.ok(result.skillScore < 1.0);
    assert.strictEqual(result.gaps.length, 1);
    assert.strictEqual(result.gaps[0].id, "s1");
    assert.strictEqual(result.gaps[0].type, "skill");
    assert.strictEqual(result.gaps[0].current, "awareness");
    assert.strictEqual(result.gaps[0].required, "working");
    assert.strictEqual(result.gaps[0].gap, 2);
  });

  test("missing skill in self-assessment counts as max gap", () => {
    const selfAssessment = {
      skillProficiencies: {},
      behaviourMaturities: {},
    };
    const job = {
      level: { ordinalRank: 3 },
      track: null,
      skillMatrix: [
        {
          skillId: "s1",
          skillName: "Skill 1",
          capability: "delivery",
          type: "primary",
          proficiency: "working",
        },
      ],
      behaviourProfile: [],
    };

    const result = calculateJobMatch(selfAssessment, job);
    assert.strictEqual(result.gaps.length, 1);
    assert.strictEqual(result.gaps[0].current, "none");
    // gap should be requiredIndex + 1 = 2 + 1 = 3
    assert.strictEqual(result.gaps[0].gap, 3);
  });

  test("uses default 50/50 weights when track has no assessmentWeights", () => {
    const selfAssessment = {
      skillProficiencies: { s1: "working" },
      behaviourMaturities: { b1: "practicing" },
    };
    const job = {
      level: { ordinalRank: 3 },
      track: null,
      skillMatrix: [
        {
          skillId: "s1",
          skillName: "Skill 1",
          capability: "delivery",
          type: "primary",
          proficiency: "working",
        },
      ],
      behaviourProfile: [
        {
          behaviourId: "b1",
          behaviourName: "Behaviour 1",
          maturity: "practicing",
        },
      ],
    };

    const result = calculateJobMatch(selfAssessment, job);
    assert.deepStrictEqual(result.weightsUsed, {
      skillWeight: 0.5,
      behaviourWeight: 0.5,
    });
  });

  test("uses track assessmentWeights when provided", () => {
    const selfAssessment = {
      skillProficiencies: { s1: "working" },
      behaviourMaturities: { b1: "practicing" },
    };
    const job = {
      level: { ordinalRank: 3 },
      track: {
        assessmentWeights: { skillWeight: 0.7, behaviourWeight: 0.3 },
      },
      skillMatrix: [
        {
          skillId: "s1",
          skillName: "Skill 1",
          capability: "delivery",
          type: "primary",
          proficiency: "working",
        },
      ],
      behaviourProfile: [
        {
          behaviourId: "b1",
          behaviourName: "Behaviour 1",
          maturity: "practicing",
        },
      ],
    };

    const result = calculateJobMatch(selfAssessment, job);
    assert.deepStrictEqual(result.weightsUsed, {
      skillWeight: 0.7,
      behaviourWeight: 0.3,
    });
  });

  test("empty skill matrix and behaviour profile returns 1.0", () => {
    const selfAssessment = {
      skillProficiencies: {},
      behaviourMaturities: {},
    };
    const job = {
      level: { ordinalRank: 1 },
      track: null,
      skillMatrix: [],
      behaviourProfile: [],
    };

    const result = calculateJobMatch(selfAssessment, job);
    assert.strictEqual(result.overallScore, 1.0);
  });

  test("priorityGaps limited to 3 items", () => {
    const selfAssessment = {
      skillProficiencies: {},
      behaviourMaturities: {},
    };
    const job = {
      level: { ordinalRank: 3 },
      track: null,
      skillMatrix: [
        {
          skillId: "s1",
          skillName: "S1",
          capability: "delivery",
          type: "primary",
          proficiency: "working",
        },
        {
          skillId: "s2",
          skillName: "S2",
          capability: "scale",
          type: "primary",
          proficiency: "practitioner",
        },
        {
          skillId: "s3",
          skillName: "S3",
          capability: "data",
          type: "primary",
          proficiency: "expert",
        },
        {
          skillId: "s4",
          skillName: "S4",
          capability: "ai",
          type: "primary",
          proficiency: "foundational",
        },
      ],
      behaviourProfile: [],
    };

    const result = calculateJobMatch(selfAssessment, job);
    assert.ok(result.gaps.length > 3);
    assert.strictEqual(result.priorityGaps.length, 3);
  });

  test("gaps are sorted by gap size descending", () => {
    const selfAssessment = {
      skillProficiencies: {
        s1: "awareness",
        s2: "awareness",
      },
      behaviourMaturities: {},
    };
    const job = {
      level: { ordinalRank: 3 },
      track: null,
      skillMatrix: [
        {
          skillId: "s1",
          skillName: "S1",
          capability: "delivery",
          type: "primary",
          proficiency: "foundational",
        },
        {
          skillId: "s2",
          skillName: "S2",
          capability: "scale",
          type: "primary",
          proficiency: "expert",
        },
      ],
      behaviourProfile: [],
    };

    const result = calculateJobMatch(selfAssessment, job);
    assert.strictEqual(result.gaps.length, 2);
    assert.ok(result.gaps[0].gap >= result.gaps[1].gap);
  });
});

// =============================================================================
// estimateBestFitLevel
// =============================================================================
