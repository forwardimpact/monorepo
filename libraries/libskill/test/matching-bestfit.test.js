import { test, describe } from "node:test";
import assert from "node:assert";

import { estimateBestFitLevel } from "../matching.js";

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
