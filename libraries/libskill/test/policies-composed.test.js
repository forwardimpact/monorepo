import { test, describe } from "node:test";
import assert from "node:assert";

import {
  filterAgentSkills,
  filterToolkitSkills,
  sortAgentSkills,
  sortAgentBehaviours,
  sortJobSkills,
  focusAgentSkills,
  prepareAgentSkillMatrix,
  prepareAgentBehaviourProfile,
} from "../src/policies/composed.js";

import {
  THRESHOLD_MATCH_STRONG,
  SCORE_GAP,
  WEIGHT_SKILL_TYPE,
  LIMIT_AGENT_PROFILE_SKILLS,
} from "../src/policies/thresholds.js";

function skill(overrides = {}) {
  return {
    skillId: "testing",
    skillName: "Testing",
    capability: "delivery",
    capabilityRank: 1,
    type: "core",
    proficiency: "working",
    isHumanOnly: false,
    ...overrides,
  };
}

function behaviour(overrides = {}) {
  return {
    behaviourId: "collaboration",
    behaviourName: "Collaboration",
    maturity: "practicing",
    ...overrides,
  };
}

describe("composed", () => {
  describe("filterAgentSkills", () => {
    test("excludes human-only and keeps only highest level", () => {
      const matrix = [
        skill({
          skillName: "A",
          proficiency: "expert",
          isHumanOnly: false,
        }),
        skill({
          skillName: "B",
          proficiency: "expert",
          isHumanOnly: true,
        }),
        skill({
          skillName: "C",
          proficiency: "working",
          isHumanOnly: false,
        }),
        skill({
          skillName: "D",
          proficiency: "expert",
          isHumanOnly: false,
        }),
      ];
      const result = filterAgentSkills(matrix);
      assert.strictEqual(result.length, 2);
      assert.deepStrictEqual(result.map((e) => e.skillName).sort(), ["A", "D"]);
    });

    test("returns empty for all human-only", () => {
      const matrix = [
        skill({ isHumanOnly: true, proficiency: "expert" }),
        skill({ isHumanOnly: true, proficiency: "working" }),
      ];
      assert.strictEqual(filterAgentSkills(matrix).length, 0);
    });

    test("returns empty for empty input", () => {
      assert.deepStrictEqual(filterAgentSkills([]), []);
    });
  });

  describe("filterToolkitSkills", () => {
    test("keeps only highest-level skills (regardless of humanOnly)", () => {
      const matrix = [
        skill({
          skillName: "A",
          proficiency: "practitioner",
          isHumanOnly: true,
        }),
        skill({
          skillName: "B",
          proficiency: "working",
          isHumanOnly: false,
        }),
        skill({
          skillName: "C",
          proficiency: "practitioner",
          isHumanOnly: false,
        }),
      ];
      const result = filterToolkitSkills(matrix);
      assert.strictEqual(result.length, 2);
      assert.deepStrictEqual(result.map((e) => e.skillName).sort(), ["A", "C"]);
    });
  });

  describe("sortAgentSkills", () => {
    test("sorts by level descending and does not mutate input", () => {
      const matrix = [
        skill({ skillName: "A", proficiency: "awareness" }),
        skill({ skillName: "B", proficiency: "expert" }),
        skill({ skillName: "C", proficiency: "working" }),
      ];
      const original = [...matrix];
      const sorted = sortAgentSkills(matrix);

      assert.deepStrictEqual(matrix, original);
      assert.deepStrictEqual(
        sorted.map((e) => e.proficiency),
        ["expert", "working", "awareness"],
      );
    });
  });

  describe("sortAgentBehaviours", () => {
    test("sorts by maturity descending and does not mutate input", () => {
      const items = [
        behaviour({ behaviourName: "A", maturity: "emerging" }),
        behaviour({ behaviourName: "B", maturity: "exemplifying" }),
        behaviour({ behaviourName: "C", maturity: "practicing" }),
      ];
      const original = [...items];
      const sorted = sortAgentBehaviours(items);

      assert.deepStrictEqual(items, original);
      assert.deepStrictEqual(
        sorted.map((e) => e.maturity),
        ["exemplifying", "practicing", "emerging"],
      );
    });
  });

  describe("sortJobSkills", () => {
    test("sorts by type then name", () => {
      const matrix = [
        skill({ skillName: "Z", type: "broad" }),
        skill({ skillName: "A", type: "core" }),
        skill({ skillName: "M", type: "supporting" }),
      ];
      const sorted = sortJobSkills(matrix);
      assert.deepStrictEqual(
        sorted.map((e) => e.skillName),
        ["A", "M", "Z"],
      );
    });

    test("does not mutate input", () => {
      const matrix = [skill({ type: "broad" }), skill({ type: "core" })];
      const original = [...matrix];
      sortJobSkills(matrix);
      assert.deepStrictEqual(matrix, original);
    });
  });

  describe("focusAgentSkills", () => {
    test("returns top N skills by priority", () => {
      // Create more than LIMIT_AGENT_PROFILE_SKILLS entries
      const matrix = [
        skill({
          skillName: "A",
          type: "core",
          proficiency: "expert",
          capabilityRank: 1,
        }),
        skill({
          skillName: "B",
          type: "supporting",
          proficiency: "expert",
          capabilityRank: 2,
        }),
        skill({
          skillName: "C",
          type: "broad",
          proficiency: "expert",
          capabilityRank: 3,
        }),
        skill({
          skillName: "D",
          type: "core",
          proficiency: "working",
          capabilityRank: 1,
        }),
        skill({
          skillName: "E",
          type: "supporting",
          proficiency: "working",
          capabilityRank: 2,
        }),
        skill({
          skillName: "F",
          type: "broad",
          proficiency: "working",
          capabilityRank: 3,
        }),
        skill({
          skillName: "G",
          type: "core",
          proficiency: "practitioner",
          capabilityRank: 1,
        }),
        skill({
          skillName: "H",
          type: "supporting",
          proficiency: "practitioner",
          capabilityRank: 2,
        }),
        skill({
          skillName: "I",
          type: "broad",
          proficiency: "practitioner",
          capabilityRank: 4,
        }),
      ];
      const result = focusAgentSkills(matrix);
      assert.strictEqual(result.length, LIMIT_AGENT_PROFILE_SKILLS);
      // The first entry should be expert core (highest priority)
      assert.strictEqual(result[0].skillName, "A");
    });

    test("uses capabilityRank to break ties within same level and type", () => {
      const matrix = [
        skill({
          skillName: "Z-Reliability",
          type: "core",
          proficiency: "expert",
          capabilityRank: 3,
        }),
        skill({
          skillName: "A-AI",
          type: "core",
          proficiency: "expert",
          capabilityRank: 4,
        }),
        skill({
          skillName: "M-Delivery",
          type: "core",
          proficiency: "expert",
          capabilityRank: 1,
        }),
        skill({
          skillName: "B-Scale",
          type: "core",
          proficiency: "expert",
          capabilityRank: 2,
        }),
      ];
      const result = focusAgentSkills(matrix);
      // The result orders entries by capabilityRank. It ignores alphabetical
      // order.
      assert.deepStrictEqual(
        result.map((e) => e.capabilityRank),
        [1, 2, 3, 4],
      );
    });

    test("returns all if fewer than limit", () => {
      const matrix = [
        skill({ skillName: "A", type: "core", proficiency: "expert" }),
        skill({ skillName: "B", type: "supporting", proficiency: "working" }),
      ];
      const result = focusAgentSkills(matrix);
      assert.strictEqual(result.length, 2);
    });

    test("does not mutate input", () => {
      const matrix = [
        skill({ skillName: "Z", type: "broad", proficiency: "awareness" }),
        skill({ skillName: "A", type: "core", proficiency: "expert" }),
      ];
      const original = [...matrix];
      focusAgentSkills(matrix);
      assert.deepStrictEqual(matrix, original);
    });
  });

  describe("prepareAgentSkillMatrix", () => {
    test("filters and sorts: agent-eligible, highest level, sorted desc", () => {
      const matrix = [
        skill({
          skillName: "Primary Expert",
          type: "core",
          proficiency: "expert",
          isHumanOnly: false,
        }),
        skill({
          skillName: "Human Only Expert",
          type: "core",
          proficiency: "expert",
          isHumanOnly: true,
        }),
        skill({
          skillName: "Low Level",
          type: "supporting",
          proficiency: "awareness",
          isHumanOnly: false,
        }),
        skill({
          skillName: "Secondary Expert",
          type: "supporting",
          proficiency: "expert",
          isHumanOnly: false,
        }),
      ];
      const result = prepareAgentSkillMatrix(matrix);
      // Exclude human-only and below-max-level
      assert.strictEqual(result.length, 2);
      // Both entries are at expert, so the level-desc sort keeps them stable
      assert.ok(result.every((e) => e.proficiency === "expert"));
      assert.ok(result.every((e) => e.isHumanOnly === false));
    });

    test("handles empty matrix", () => {
      assert.deepStrictEqual(prepareAgentSkillMatrix([]), []);
    });
  });

  describe("prepareAgentBehaviourProfile", () => {
    test("sorts behaviours by maturity descending", () => {
      const profile = [
        behaviour({ behaviourName: "A", maturity: "developing" }),
        behaviour({ behaviourName: "B", maturity: "exemplifying" }),
        behaviour({ behaviourName: "C", maturity: "practicing" }),
      ];
      const result = prepareAgentBehaviourProfile(profile);
      assert.deepStrictEqual(
        result.map((e) => e.maturity),
        ["exemplifying", "practicing", "developing"],
      );
    });

    test("does not mutate input", () => {
      const profile = [
        behaviour({ maturity: "exemplifying" }),
        behaviour({ maturity: "emerging" }),
      ];
      const original = [...profile];
      prepareAgentBehaviourProfile(profile);
      assert.deepStrictEqual(profile, original);
    });
  });
});

// =============================================================================
// Thresholds (spot checks)
// =============================================================================

describe("thresholds", () => {
  test("THRESHOLD_MATCH_STRONG is a number between 0 and 1", () => {
    assert.strictEqual(typeof THRESHOLD_MATCH_STRONG, "number");
    assert.ok(THRESHOLD_MATCH_STRONG > 0 && THRESHOLD_MATCH_STRONG <= 1);
  });

  test("SCORE_GAP has entries for gaps 0 through 4", () => {
    assert.strictEqual(SCORE_GAP[0], 1.0);
    assert.ok(SCORE_GAP[1] < SCORE_GAP[0]);
    assert.ok(SCORE_GAP[2] < SCORE_GAP[1]);
    assert.ok(SCORE_GAP[3] < SCORE_GAP[2]);
    assert.ok(SCORE_GAP[4] < SCORE_GAP[3]);
  });

  test("WEIGHT_SKILL_TYPE has all four tiers", () => {
    assert.ok("core" in WEIGHT_SKILL_TYPE);
    assert.ok("supporting" in WEIGHT_SKILL_TYPE);
    assert.ok("broad" in WEIGHT_SKILL_TYPE);
    assert.ok("track" in WEIGHT_SKILL_TYPE);
    assert.ok(WEIGHT_SKILL_TYPE.core > WEIGHT_SKILL_TYPE.supporting);
    assert.ok(WEIGHT_SKILL_TYPE.supporting > WEIGHT_SKILL_TYPE.broad);
    assert.ok(WEIGHT_SKILL_TYPE.broad > WEIGHT_SKILL_TYPE.track);
  });

  test("LIMIT_AGENT_PROFILE_SKILLS is a positive integer", () => {
    assert.strictEqual(typeof LIMIT_AGENT_PROFILE_SKILLS, "number");
    assert.ok(LIMIT_AGENT_PROFILE_SKILLS > 0);
    assert.strictEqual(
      LIMIT_AGENT_PROFILE_SKILLS,
      Math.floor(LIMIT_AGENT_PROFILE_SKILLS),
    );
  });
});
