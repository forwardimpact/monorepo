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
} from "../policies/composed.js";

import {
  THRESHOLD_MATCH_STRONG,
  SCORE_GAP,
  WEIGHT_SKILL_TYPE,
  LIMIT_AGENT_PROFILE_SKILLS,
} from "../policies/thresholds.js";

function skill(overrides = {}) {
  return {
    skillId: "testing",
    skillName: "Testing",
    capability: "delivery",
    type: "primary",
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
    test("sorts by level descending without mutating input", () => {
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
    test("sorts by maturity descending without mutating input", () => {
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
        skill({ skillName: "A", type: "primary" }),
        skill({ skillName: "M", type: "secondary" }),
      ];
      const sorted = sortJobSkills(matrix);
      assert.deepStrictEqual(
        sorted.map((e) => e.skillName),
        ["A", "M", "Z"],
      );
    });

    test("does not mutate input", () => {
      const matrix = [skill({ type: "broad" }), skill({ type: "primary" })];
      const original = [...matrix];
      sortJobSkills(matrix);
      assert.deepStrictEqual(matrix, original);
    });
  });

  describe("focusAgentSkills", () => {
    test("returns top N skills by priority", () => {
      // Create more than LIMIT_AGENT_PROFILE_SKILLS entries
      const matrix = [
        skill({ skillName: "A", type: "primary", proficiency: "expert" }),
        skill({ skillName: "B", type: "secondary", proficiency: "expert" }),
        skill({ skillName: "C", type: "broad", proficiency: "expert" }),
        skill({ skillName: "D", type: "primary", proficiency: "working" }),
        skill({ skillName: "E", type: "secondary", proficiency: "working" }),
        skill({ skillName: "F", type: "broad", proficiency: "working" }),
        skill({
          skillName: "G",
          type: "primary",
          proficiency: "practitioner",
        }),
      ];
      const result = focusAgentSkills(matrix);
      assert.strictEqual(result.length, LIMIT_AGENT_PROFILE_SKILLS);
      // First should be expert primary (highest priority)
      assert.strictEqual(result[0].skillName, "A");
    });

    test("returns all if fewer than limit", () => {
      const matrix = [
        skill({ skillName: "A", type: "primary", proficiency: "expert" }),
        skill({ skillName: "B", type: "secondary", proficiency: "working" }),
      ];
      const result = focusAgentSkills(matrix);
      assert.strictEqual(result.length, 2);
    });

    test("does not mutate input", () => {
      const matrix = [
        skill({ skillName: "Z", type: "broad", proficiency: "awareness" }),
        skill({ skillName: "A", type: "primary", proficiency: "expert" }),
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
          type: "primary",
          proficiency: "expert",
          isHumanOnly: false,
        }),
        skill({
          skillName: "Human Only Expert",
          type: "primary",
          proficiency: "expert",
          isHumanOnly: true,
        }),
        skill({
          skillName: "Low Level",
          type: "secondary",
          proficiency: "awareness",
          isHumanOnly: false,
        }),
        skill({
          skillName: "Secondary Expert",
          type: "secondary",
          proficiency: "expert",
          isHumanOnly: false,
        }),
      ];
      const result = prepareAgentSkillMatrix(matrix);
      // Exclude human-only and below-max-level
      assert.strictEqual(result.length, 2);
      // Both at expert, sorted by level desc (same level, so stable)
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

  test("WEIGHT_SKILL_TYPE has all four types", () => {
    assert.ok("primary" in WEIGHT_SKILL_TYPE);
    assert.ok("secondary" in WEIGHT_SKILL_TYPE);
    assert.ok("broad" in WEIGHT_SKILL_TYPE);
    assert.ok("track" in WEIGHT_SKILL_TYPE);
    assert.ok(WEIGHT_SKILL_TYPE.primary > WEIGHT_SKILL_TYPE.secondary);
    assert.ok(WEIGHT_SKILL_TYPE.secondary > WEIGHT_SKILL_TYPE.broad);
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
