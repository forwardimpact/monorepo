import { test, describe } from "node:test";
import assert from "node:assert";

import {
  MatchTier,
  CONFIG_MATCH_TIER,
  classifyMatch,
  calculateGapScore,
  GAP_SCORES,
  calculateJobMatch,
  estimateBestFitLevel,
} from "../matching.js";

// =============================================================================
// MatchTier enum
// =============================================================================

describe("MatchTier", () => {
  test("has four tiers numbered 1-4", () => {
    assert.strictEqual(MatchTier.STRONG, 1);
    assert.strictEqual(MatchTier.GOOD, 2);
    assert.strictEqual(MatchTier.STRETCH, 3);
    assert.strictEqual(MatchTier.ASPIRATIONAL, 4);
  });

  test("CONFIG_MATCH_TIER has entry for each tier", () => {
    for (const tier of [1, 2, 3, 4]) {
      assert.ok(CONFIG_MATCH_TIER[tier], `missing config for tier ${tier}`);
      assert.ok(CONFIG_MATCH_TIER[tier].label);
      assert.ok(CONFIG_MATCH_TIER[tier].color);
      assert.ok(typeof CONFIG_MATCH_TIER[tier].minScore === "number");
    }
  });

  test("tier thresholds are in descending order", () => {
    assert.ok(
      CONFIG_MATCH_TIER[MatchTier.STRONG].minScore >
        CONFIG_MATCH_TIER[MatchTier.GOOD].minScore,
    );
    assert.ok(
      CONFIG_MATCH_TIER[MatchTier.GOOD].minScore >
        CONFIG_MATCH_TIER[MatchTier.STRETCH].minScore,
    );
    assert.ok(
      CONFIG_MATCH_TIER[MatchTier.STRETCH].minScore >
        CONFIG_MATCH_TIER[MatchTier.ASPIRATIONAL].minScore,
    );
  });
});

// =============================================================================
// classifyMatch
// =============================================================================

describe("classifyMatch", () => {
  test("score at strong threshold returns STRONG", () => {
    const result = classifyMatch(0.85);
    assert.strictEqual(result.tier, MatchTier.STRONG);
    assert.strictEqual(result.label, "Strong Match");
  });

  test("score above strong threshold returns STRONG", () => {
    const result = classifyMatch(0.95);
    assert.strictEqual(result.tier, MatchTier.STRONG);
  });

  test("perfect score returns STRONG", () => {
    const result = classifyMatch(1.0);
    assert.strictEqual(result.tier, MatchTier.STRONG);
  });

  test("score just below strong threshold returns GOOD", () => {
    const result = classifyMatch(0.84);
    assert.strictEqual(result.tier, MatchTier.GOOD);
  });

  test("score at good threshold returns GOOD", () => {
    const result = classifyMatch(0.7);
    assert.strictEqual(result.tier, MatchTier.GOOD);
    assert.strictEqual(result.label, "Good Match");
  });

  test("score just below good threshold returns STRETCH", () => {
    const result = classifyMatch(0.69);
    assert.strictEqual(result.tier, MatchTier.STRETCH);
  });

  test("score at stretch threshold returns STRETCH", () => {
    const result = classifyMatch(0.55);
    assert.strictEqual(result.tier, MatchTier.STRETCH);
    assert.strictEqual(result.label, "Stretch Role");
  });

  test("score just below stretch threshold returns ASPIRATIONAL", () => {
    const result = classifyMatch(0.54);
    assert.strictEqual(result.tier, MatchTier.ASPIRATIONAL);
  });

  test("score of 0 returns ASPIRATIONAL", () => {
    const result = classifyMatch(0);
    assert.strictEqual(result.tier, MatchTier.ASPIRATIONAL);
    assert.strictEqual(result.label, "Aspirational");
  });

  test("result includes color and description", () => {
    const result = classifyMatch(0.9);
    assert.strictEqual(result.color, "green");
    assert.ok(result.description);
  });
});

// =============================================================================
// calculateGapScore
// =============================================================================

describe("calculateGapScore", () => {
  test("gap 0 (meets requirement) returns 1.0", () => {
    assert.strictEqual(calculateGapScore(0), 1.0);
  });

  test("negative gap (exceeds requirement) returns 1.0", () => {
    assert.strictEqual(calculateGapScore(-1), 1.0);
    assert.strictEqual(calculateGapScore(-3), 1.0);
  });

  test("gap 1 returns 0.7", () => {
    assert.strictEqual(calculateGapScore(1), 0.7);
  });

  test("gap 2 returns 0.4", () => {
    assert.strictEqual(calculateGapScore(2), 0.4);
  });

  test("gap 3 returns 0.15", () => {
    assert.strictEqual(calculateGapScore(3), 0.15);
  });

  test("gap 4 returns 0.05", () => {
    assert.strictEqual(calculateGapScore(4), 0.05);
  });

  test("gap 5+ returns 0.05 (same as gap 4)", () => {
    assert.strictEqual(calculateGapScore(5), 0.05);
    assert.strictEqual(calculateGapScore(10), 0.05);
  });

  test("scores decrease monotonically", () => {
    const scores = [0, 1, 2, 3, 4].map(calculateGapScore);
    for (let i = 1; i < scores.length; i++) {
      assert.ok(
        scores[i] < scores[i - 1],
        `score at gap ${i} (${scores[i]}) should be less than gap ${i - 1} (${scores[i - 1]})`,
      );
    }
  });

  test("GAP_SCORES matches calculateGapScore outputs", () => {
    assert.strictEqual(GAP_SCORES[0], calculateGapScore(0));
    assert.strictEqual(GAP_SCORES[1], calculateGapScore(1));
    assert.strictEqual(GAP_SCORES[2], calculateGapScore(2));
    assert.strictEqual(GAP_SCORES[3], calculateGapScore(3));
    assert.strictEqual(GAP_SCORES[4], calculateGapScore(4));
  });
});

// =============================================================================
// calculateJobMatch
// =============================================================================

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

describe("estimateBestFitLevel", () => {
  const levels = [
    {
      id: "l1",
      ordinalRank: 1,
      baseSkillProficiencies: { primary: "awareness" },
    },
    {
      id: "l2",
      ordinalRank: 2,
      baseSkillProficiencies: { primary: "foundational" },
    },
    {
      id: "l3",
      ordinalRank: 3,
      baseSkillProficiencies: { primary: "working" },
    },
    {
      id: "l4",
      ordinalRank: 4,
      baseSkillProficiencies: { primary: "practitioner" },
    },
    {
      id: "l5",
      ordinalRank: 5,
      baseSkillProficiencies: { primary: "expert" },
    },
  ];

  test("no assessed skills returns lowest level with 0 confidence", () => {
    const result = estimateBestFitLevel({
      selfAssessment: { skillProficiencies: {} },
      levels,
      _skills: [],
    });
    assert.strictEqual(result.level.id, "l1");
    assert.strictEqual(result.confidence, 0);
    assert.strictEqual(result.averageSkillIndex, 0);
  });

  test("all awareness skills maps to level 1", () => {
    const result = estimateBestFitLevel({
      selfAssessment: {
        skillProficiencies: { s1: "awareness", s2: "awareness" },
      },
      levels,
      _skills: [],
    });
    assert.strictEqual(result.level.id, "l1");
    assert.strictEqual(result.averageSkillIndex, 0);
  });

  test("all working skills maps to level 3", () => {
    const result = estimateBestFitLevel({
      selfAssessment: {
        skillProficiencies: { s1: "working", s2: "working" },
      },
      levels,
      _skills: [],
    });
    assert.strictEqual(result.level.id, "l3");
    assert.strictEqual(result.averageSkillIndex, 2);
  });

  test("all expert skills maps to level 5", () => {
    const result = estimateBestFitLevel({
      selfAssessment: {
        skillProficiencies: { s1: "expert", s2: "expert" },
      },
      levels,
      _skills: [],
    });
    assert.strictEqual(result.level.id, "l5");
    assert.strictEqual(result.averageSkillIndex, 4);
  });

  test("mixed skills map to closest level", () => {
    // awareness(0) + working(2) = avg 1.0 => foundational level
    const result = estimateBestFitLevel({
      selfAssessment: {
        skillProficiencies: { s1: "awareness", s2: "working" },
      },
      levels,
      _skills: [],
    });
    assert.strictEqual(result.level.id, "l2");
    assert.strictEqual(result.averageSkillIndex, 1);
  });

  test("exact match gives high confidence", () => {
    const result = estimateBestFitLevel({
      selfAssessment: {
        skillProficiencies: { s1: "working" },
      },
      levels,
      _skills: [],
    });
    // exact match => distance 0 => confidence = max(0, 1 - 0/2) = 1
    assert.strictEqual(result.confidence, 1);
  });

  test("between-level average gives lower confidence", () => {
    // awareness(0) + foundational(1) + working(2) = avg 1.0 => exact match to l2
    // practitioner(3) alone => exact match to l4
    // But foundational(1) + practitioner(3) = avg 2.0 => working, exact match
    // foundational(1) + working(2) = avg 1.5 => distance 0.5 from both l2(1) and l3(2)
    const result = estimateBestFitLevel({
      selfAssessment: {
        skillProficiencies: { s1: "foundational", s2: "working" },
      },
      levels,
      _skills: [],
    });
    assert.ok(result.confidence < 1);
    assert.ok(result.confidence > 0);
  });

  test("handles unsorted levels correctly", () => {
    const unsortedLevels = [
      {
        id: "l3",
        ordinalRank: 3,
        baseSkillProficiencies: { primary: "working" },
      },
      {
        id: "l1",
        ordinalRank: 1,
        baseSkillProficiencies: { primary: "awareness" },
      },
      {
        id: "l2",
        ordinalRank: 2,
        baseSkillProficiencies: { primary: "foundational" },
      },
    ];

    const result = estimateBestFitLevel({
      selfAssessment: { skillProficiencies: {} },
      levels: unsortedLevels,
      _skills: [],
    });
    // Should still return lowest ordinalRank
    assert.strictEqual(result.level.id, "l1");
  });

  test("undefined skillProficiencies treated as empty", () => {
    const result = estimateBestFitLevel({
      selfAssessment: {},
      levels,
      _skills: [],
    });
    assert.strictEqual(result.level.id, "l1");
    assert.strictEqual(result.confidence, 0);
  });
});
