import { test, describe } from "node:test";
import assert from "node:assert";

import {
  compareByLevelDesc,
  compareByType,
  compareByName,
  compareByCapability,
  compareBySkillFocusPriority,
  sortSkillsByCapability,
  compareByOrder,
  chainComparators,
  compareBySkillChange,
  compareByBehaviourChange,
} from "../src/policies/orderings.js";

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

describe("orderings - advanced", () => {
  describe("compareByCapability", () => {
    test("sorts by capability ordinal rank", () => {
      const capabilities = [
        { id: "delivery", ordinalRank: 1 },
        { id: "scale", ordinalRank: 2 },
        { id: "ai", ordinalRank: 3 },
      ];
      const comparator = compareByCapability(capabilities);
      const items = [
        skill({ capability: "ai" }),
        skill({ capability: "delivery" }),
        skill({ capability: "scale" }),
      ];
      items.sort(comparator);
      assert.deepStrictEqual(
        items.map((e) => e.capability),
        ["delivery", "scale", "ai"],
      );
    });
  });

  describe("sortSkillsByCapability", () => {
    test("sorts by capability then name and does not mutate input", () => {
      const capabilities = [
        { id: "scale", ordinalRank: 2 },
        { id: "delivery", ordinalRank: 1 },
      ];
      const skills = [
        skill({ skillName: "B", capability: "delivery" }),
        skill({ skillName: "A", capability: "scale" }),
        skill({ skillName: "A", capability: "delivery" }),
      ];
      const original = [...skills];
      const sorted = sortSkillsByCapability(skills, capabilities);

      // The sort does not mutate the original
      assert.deepStrictEqual(skills, original);

      assert.deepStrictEqual(
        sorted.map((e) => e.skillName),
        ["A", "B", "A"],
      );
      assert.deepStrictEqual(
        sorted.map((e) => e.capability),
        ["delivery", "delivery", "scale"],
      );
    });
  });

  describe("compareByOrder", () => {
    test("creates comparator from an order array and accessor", () => {
      const order = ["high", "medium", "low"];
      const comparator = compareByOrder(order, (item) => item.priority);
      const items = [
        { priority: "low" },
        { priority: "high" },
        { priority: "medium" },
      ];
      items.sort(comparator);
      assert.deepStrictEqual(
        items.map((e) => e.priority),
        ["high", "medium", "low"],
      );
    });

    test("unknown values sort to end (indexOf returns -1)", () => {
      const order = ["a", "b"];
      const comparator = compareByOrder(order, (item) => item.val);
      const items = [{ val: "b" }, { val: "unknown" }, { val: "a" }];
      items.sort(comparator);
      // -1 sorts before 0, so unknown goes first
      assert.strictEqual(items[0].val, "unknown");
    });
  });

  describe("chainComparators", () => {
    test("uses first non-zero comparator result", () => {
      const byType = compareByType;
      const byName = compareByName;
      const chained = chainComparators(byType, byName);

      const items = [
        skill({ type: "supporting", skillName: "A" }),
        skill({ type: "core", skillName: "B" }),
        skill({ type: "core", skillName: "A" }),
      ];
      items.sort(chained);
      assert.deepStrictEqual(
        items.map((e) => `${e.type}:${e.skillName}`),
        ["core:A", "core:B", "supporting:A"],
      );
    });

    test("returns 0 when all comparators return 0", () => {
      const alwaysZero = () => 0;
      const chained = chainComparators(alwaysZero, alwaysZero);
      assert.strictEqual(chained({}, {}), 0);
    });

    test("short-circuits on first non-zero", () => {
      let secondCalled = false;
      const first = () => -1;
      const second = () => {
        secondCalled = true;
        return 1;
      };
      const chained = chainComparators(first, second);
      assert.strictEqual(chained({}, {}), -1);
      assert.strictEqual(secondCalled, false);
    });
  });

  describe("compareBySkillChange", () => {
    test("sorts by change descending, then type, then name", () => {
      const items = [
        { name: "B", type: "core", change: 1 },
        { name: "A", type: "core", change: 2 },
        { name: "C", type: "supporting", change: 2 },
        { name: "A", type: "supporting", change: 1 },
      ];
      items.sort(compareBySkillChange);
      assert.deepStrictEqual(
        items.map((e) => `${e.name}:${e.change}`),
        ["A:2", "C:2", "B:1", "A:1"],
      );
    });
  });

  describe("compareByBehaviourChange", () => {
    test("sorts by change descending, then name", () => {
      const items = [
        { name: "Beta", change: 1 },
        { name: "Alpha", change: 2 },
        { name: "Alpha", change: 1 },
      ];
      items.sort(compareByBehaviourChange);
      assert.deepStrictEqual(
        items.map((e) => `${e.name}:${e.change}`),
        ["Alpha:2", "Alpha:1", "Beta:1"],
      );
    });
  });

  describe("compareBySkillFocusPriority", () => {
    test("sorts by level desc, then type asc, then capabilityRank asc", () => {
      const items = [
        skill({
          proficiency: "working",
          type: "core",
          capabilityRank: 2,
        }),
        skill({
          proficiency: "expert",
          type: "supporting",
          capabilityRank: 1,
        }),
        skill({
          proficiency: "expert",
          type: "core",
          capabilityRank: 3,
        }),
        skill({
          proficiency: "expert",
          type: "core",
          capabilityRank: 1,
        }),
      ];
      items.sort(compareBySkillFocusPriority);
      assert.deepStrictEqual(
        items.map((e) => `${e.proficiency}:${e.type}:${e.capabilityRank}`),
        [
          "expert:core:1",
          "expert:core:3",
          "expert:supporting:1",
          "working:core:2",
        ],
      );
    });

    test("does not use alphabetical name as tie-breaker", () => {
      const items = [
        skill({
          skillName: "A-Scale",
          type: "core",
          proficiency: "expert",
          capabilityRank: 2,
        }),
        skill({
          skillName: "Z-Delivery",
          type: "core",
          proficiency: "expert",
          capabilityRank: 1,
        }),
      ];
      items.sort(compareBySkillFocusPriority);
      // capabilityRank 1 before 2, despite Z > A alphabetically
      assert.strictEqual(items[0].skillName, "Z-Delivery");
      assert.strictEqual(items[1].skillName, "A-Scale");
    });
  });

  describe("sort stability", () => {
    test("equal elements preserve original order", () => {
      // All entries share one proficiency, so the sort keeps insertion order
      const items = [
        skill({ skillName: "First", proficiency: "working" }),
        skill({ skillName: "Second", proficiency: "working" }),
        skill({ skillName: "Third", proficiency: "working" }),
      ];
      items.sort(compareByLevelDesc);
      assert.deepStrictEqual(
        items.map((e) => e.skillName),
        ["First", "Second", "Third"],
      );
    });
  });
});

// =============================================================================
// Composed Policies
// =============================================================================
