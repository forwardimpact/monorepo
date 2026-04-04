import { test, describe } from "node:test";
import assert from "node:assert";

import {
  MatchTier,
  CONFIG_MATCH_TIER,
  classifyMatch,
  calculateGapScore,
  GAP_SCORES,
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
