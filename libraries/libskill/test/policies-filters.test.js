import { test, describe } from "node:test";
import assert from "node:assert";

import {
  filterHighestLevel,
  filterAboveAwareness,
  filterBy,
  applyFilters,
  composeFilters,
} from "../policies/filters.js";

import { isPrimary, isAgentEligible } from "../policies/predicates.js";

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

describe("filters", () => {
  describe("filterHighestLevel", () => {
    test("keeps only entries at the maximum proficiency", () => {
      const matrix = [
        skill({ skillName: "A", proficiency: "expert" }),
        skill({ skillName: "B", proficiency: "working" }),
        skill({ skillName: "C", proficiency: "expert" }),
        skill({ skillName: "D", proficiency: "practitioner" }),
      ];
      const result = filterHighestLevel(matrix);
      assert.strictEqual(result.length, 2);
      assert.deepStrictEqual(
        result.map((e) => e.skillName),
        ["A", "C"],
      );
    });

    test("returns all entries when all at same level", () => {
      const matrix = [
        skill({ skillName: "A", proficiency: "working" }),
        skill({ skillName: "B", proficiency: "working" }),
      ];
      const result = filterHighestLevel(matrix);
      assert.strictEqual(result.length, 2);
    });

    test("returns empty array for empty input", () => {
      assert.deepStrictEqual(filterHighestLevel([]), []);
    });

    test("returns single entry when it is the only one", () => {
      const matrix = [skill({ skillName: "A", proficiency: "awareness" })];
      const result = filterHighestLevel(matrix);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].skillName, "A");
    });
  });

  describe("filterAboveAwareness", () => {
    test("excludes awareness-level entries", () => {
      const matrix = [
        skill({ skillName: "A", proficiency: "awareness" }),
        skill({ skillName: "B", proficiency: "foundational" }),
        skill({ skillName: "C", proficiency: "working" }),
      ];
      const result = filterAboveAwareness(matrix);
      assert.strictEqual(result.length, 2);
      assert.deepStrictEqual(
        result.map((e) => e.skillName),
        ["B", "C"],
      );
    });

    test("returns all entries when none at awareness", () => {
      const matrix = [
        skill({ proficiency: "working" }),
        skill({ proficiency: "expert" }),
      ];
      assert.strictEqual(filterAboveAwareness(matrix).length, 2);
    });

    test("returns empty for all-awareness matrix", () => {
      const matrix = [
        skill({ proficiency: "awareness" }),
        skill({ proficiency: "awareness" }),
      ];
      assert.strictEqual(filterAboveAwareness(matrix).length, 0);
    });
  });

  describe("filterBy", () => {
    test("creates a curried filter from a predicate", () => {
      const filterPrimary = filterBy(isPrimary);
      const matrix = [
        skill({ type: "primary" }),
        skill({ type: "secondary" }),
        skill({ type: "primary" }),
      ];
      const result = filterPrimary(matrix);
      assert.strictEqual(result.length, 2);
      assert.ok(result.every((e) => e.type === "primary"));
    });
  });

  describe("applyFilters", () => {
    test("applies predicates as entry-level filters", () => {
      const matrix = [
        skill({ type: "primary", isHumanOnly: false }),
        skill({ type: "secondary", isHumanOnly: true }),
        skill({ type: "primary", isHumanOnly: true }),
      ];
      const result = applyFilters(matrix, isPrimary, isAgentEligible);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].type, "primary");
      assert.strictEqual(result[0].isHumanOnly, false);
    });

    test("applies matrix filters directly", () => {
      const matrix = [
        skill({ proficiency: "expert" }),
        skill({ proficiency: "working" }),
        skill({ proficiency: "expert" }),
      ];
      const result = applyFilters(matrix, filterHighestLevel);
      assert.strictEqual(result.length, 2);
    });

    test("mixes predicates and matrix filters in sequence", () => {
      const matrix = [
        skill({
          skillName: "A",
          proficiency: "expert",
          isHumanOnly: false,
        }),
        skill({
          skillName: "B",
          proficiency: "working",
          isHumanOnly: false,
        }),
        skill({
          skillName: "C",
          proficiency: "expert",
          isHumanOnly: true,
        }),
      ];
      // First filter by agent-eligible (predicate), then keep highest level (matrix filter)
      const result = applyFilters(matrix, isAgentEligible, filterHighestLevel);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].skillName, "A");
    });

    test("returns original array with no operations", () => {
      const matrix = [skill(), skill()];
      const result = applyFilters(matrix);
      assert.strictEqual(result.length, 2);
    });
  });

  describe("composeFilters", () => {
    test("creates a reusable composed filter", () => {
      const agentHighest = composeFilters(isAgentEligible, filterHighestLevel);
      const matrix = [
        skill({
          skillName: "A",
          proficiency: "expert",
          isHumanOnly: false,
        }),
        skill({
          skillName: "B",
          proficiency: "working",
          isHumanOnly: false,
        }),
        skill({
          skillName: "C",
          proficiency: "expert",
          isHumanOnly: true,
        }),
      ];
      const result = agentHighest(matrix);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].skillName, "A");
    });

    test("composed filter can be reused on different inputs", () => {
      const onlyPrimary = composeFilters(isPrimary);

      const matrix1 = [skill({ type: "primary" }), skill({ type: "broad" })];
      const matrix2 = [
        skill({ type: "secondary" }),
        skill({ type: "primary" }),
      ];

      assert.strictEqual(onlyPrimary(matrix1).length, 1);
      assert.strictEqual(onlyPrimary(matrix2).length, 1);
    });
  });
});

// =============================================================================
// Orderings
// =============================================================================
