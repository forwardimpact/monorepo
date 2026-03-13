import { test, describe } from "node:test";
import assert from "node:assert";

// Predicates
import {
  isAny,
  isNone,
  isHumanOnly,
  isAgentEligible,
  isPrimary,
  isSecondary,
  isBroad,
  isTrack,
  isCore,
  isSupporting,
  hasMinLevel,
  hasLevel,
  hasBelowLevel,
  isInCapability,
  isInAnyCapability,
  allOf,
  anyOf,
  not,
} from "../policies/predicates.js";

// Filters
import {
  filterHighestLevel,
  filterAboveAwareness,
  filterBy,
  applyFilters,
  composeFilters,
} from "../policies/filters.js";

// Orderings
import {
  ORDER_SKILL_TYPE,
  compareByLevelDesc,
  compareByLevelAsc,
  compareByType,
  compareByName,
  compareBySkillPriority,
  compareByTypeAndName,
  compareByMaturityDesc,
  compareByMaturityAsc,
  compareByBehaviourName,
  compareByBehaviourPriority,
  compareByCapability,
  sortSkillsByCapability,
  compareByStageOrder,
  compareByOrder,
  chainComparators,
  compareBySkillChange,
  compareByBehaviourChange,
} from "../policies/orderings.js";

// Composed
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

// Thresholds (spot check)
import {
  THRESHOLD_MATCH_STRONG,
  SCORE_GAP,
  WEIGHT_SKILL_TYPE,
  LIMIT_AGENT_PROFILE_SKILLS,
} from "../policies/thresholds.js";

// =============================================================================
// Test Fixtures
// =============================================================================

/** @returns {Object} A skill matrix entry */
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

/** @returns {Object} A behaviour profile entry */
function behaviour(overrides = {}) {
  return {
    behaviourId: "collaboration",
    behaviourName: "Collaboration",
    maturity: "practicing",
    ...overrides,
  };
}

// =============================================================================
// Predicates
// =============================================================================

describe("predicates", () => {
  describe("isAny", () => {
    test("returns true for any entry", () => {
      assert.strictEqual(isAny(skill()), true);
      assert.strictEqual(isAny({}), true);
    });
  });

  describe("isNone", () => {
    test("returns false for any entry", () => {
      assert.strictEqual(isNone(skill()), false);
      assert.strictEqual(isNone({}), false);
    });
  });

  describe("isHumanOnly", () => {
    test("returns true when isHumanOnly is true", () => {
      assert.strictEqual(isHumanOnly(skill({ isHumanOnly: true })), true);
    });

    test("returns false when isHumanOnly is false", () => {
      assert.strictEqual(isHumanOnly(skill({ isHumanOnly: false })), false);
    });

    test("returns false when isHumanOnly is undefined", () => {
      const entry = { skillId: "x", skillName: "X" };
      assert.strictEqual(isHumanOnly(entry), false);
    });
  });

  describe("isAgentEligible", () => {
    test("returns true when not human-only", () => {
      assert.strictEqual(isAgentEligible(skill({ isHumanOnly: false })), true);
    });

    test("returns false when human-only", () => {
      assert.strictEqual(isAgentEligible(skill({ isHumanOnly: true })), false);
    });

    test("returns true when isHumanOnly is undefined", () => {
      assert.strictEqual(isAgentEligible({ skillId: "x" }), true);
    });
  });

  describe("isPrimary", () => {
    test("returns true for primary type", () => {
      assert.strictEqual(isPrimary(skill({ type: "primary" })), true);
    });

    test("returns false for other types", () => {
      assert.strictEqual(isPrimary(skill({ type: "secondary" })), false);
      assert.strictEqual(isPrimary(skill({ type: "broad" })), false);
      assert.strictEqual(isPrimary(skill({ type: "track" })), false);
    });
  });

  describe("isSecondary", () => {
    test("returns true for secondary type", () => {
      assert.strictEqual(isSecondary(skill({ type: "secondary" })), true);
    });

    test("returns false for other types", () => {
      assert.strictEqual(isSecondary(skill({ type: "primary" })), false);
    });
  });

  describe("isBroad", () => {
    test("returns true for broad type", () => {
      assert.strictEqual(isBroad(skill({ type: "broad" })), true);
    });

    test("returns false for other types", () => {
      assert.strictEqual(isBroad(skill({ type: "primary" })), false);
    });
  });

  describe("isTrack", () => {
    test("returns true for track type", () => {
      assert.strictEqual(isTrack(skill({ type: "track" })), true);
    });

    test("returns false for other types", () => {
      assert.strictEqual(isTrack(skill({ type: "primary" })), false);
    });
  });

  describe("isCore", () => {
    test("returns true for primary", () => {
      assert.strictEqual(isCore(skill({ type: "primary" })), true);
    });

    test("returns true for secondary", () => {
      assert.strictEqual(isCore(skill({ type: "secondary" })), true);
    });

    test("returns false for broad", () => {
      assert.strictEqual(isCore(skill({ type: "broad" })), false);
    });

    test("returns false for track", () => {
      assert.strictEqual(isCore(skill({ type: "track" })), false);
    });
  });

  describe("isSupporting", () => {
    test("returns true for broad", () => {
      assert.strictEqual(isSupporting(skill({ type: "broad" })), true);
    });

    test("returns true for track", () => {
      assert.strictEqual(isSupporting(skill({ type: "track" })), true);
    });

    test("returns false for primary", () => {
      assert.strictEqual(isSupporting(skill({ type: "primary" })), false);
    });

    test("returns false for secondary", () => {
      assert.strictEqual(isSupporting(skill({ type: "secondary" })), false);
    });
  });

  describe("hasMinLevel", () => {
    test("returns true for skills at or above minimum", () => {
      const atWorking = hasMinLevel("working");
      assert.strictEqual(atWorking(skill({ proficiency: "working" })), true);
      assert.strictEqual(
        atWorking(skill({ proficiency: "practitioner" })),
        true,
      );
      assert.strictEqual(atWorking(skill({ proficiency: "expert" })), true);
    });

    test("returns false for skills below minimum", () => {
      const atWorking = hasMinLevel("working");
      assert.strictEqual(atWorking(skill({ proficiency: "awareness" })), false);
      assert.strictEqual(
        atWorking(skill({ proficiency: "foundational" })),
        false,
      );
    });

    test("awareness minimum accepts all levels", () => {
      const atAwareness = hasMinLevel("awareness");
      assert.strictEqual(
        atAwareness(skill({ proficiency: "awareness" })),
        true,
      );
      assert.strictEqual(atAwareness(skill({ proficiency: "expert" })), true);
    });

    test("expert minimum accepts only expert", () => {
      const atExpert = hasMinLevel("expert");
      assert.strictEqual(
        atExpert(skill({ proficiency: "practitioner" })),
        false,
      );
      assert.strictEqual(atExpert(skill({ proficiency: "expert" })), true);
    });
  });

  describe("hasLevel", () => {
    test("returns true for exact level match", () => {
      const exactlyWorking = hasLevel("working");
      assert.strictEqual(
        exactlyWorking(skill({ proficiency: "working" })),
        true,
      );
    });

    test("returns false for different levels", () => {
      const exactlyWorking = hasLevel("working");
      assert.strictEqual(
        exactlyWorking(skill({ proficiency: "foundational" })),
        false,
      );
      assert.strictEqual(
        exactlyWorking(skill({ proficiency: "practitioner" })),
        false,
      );
    });
  });

  describe("hasBelowLevel", () => {
    test("returns true for skills below threshold", () => {
      const belowWorking = hasBelowLevel("working");
      assert.strictEqual(
        belowWorking(skill({ proficiency: "awareness" })),
        true,
      );
      assert.strictEqual(
        belowWorking(skill({ proficiency: "foundational" })),
        true,
      );
    });

    test("returns false for skills at or above threshold", () => {
      const belowWorking = hasBelowLevel("working");
      assert.strictEqual(
        belowWorking(skill({ proficiency: "working" })),
        false,
      );
      assert.strictEqual(belowWorking(skill({ proficiency: "expert" })), false);
    });

    test("below awareness returns false for everything", () => {
      const belowAwareness = hasBelowLevel("awareness");
      assert.strictEqual(
        belowAwareness(skill({ proficiency: "awareness" })),
        false,
      );
    });
  });

  describe("isInCapability", () => {
    test("returns true for matching capability", () => {
      const inDelivery = isInCapability("delivery");
      assert.strictEqual(inDelivery(skill({ capability: "delivery" })), true);
    });

    test("returns false for non-matching capability", () => {
      const inDelivery = isInCapability("delivery");
      assert.strictEqual(inDelivery(skill({ capability: "scale" })), false);
    });
  });

  describe("isInAnyCapability", () => {
    test("returns true if entry matches any listed capability", () => {
      const inDeliveryOrScale = isInAnyCapability(["delivery", "scale"]);
      assert.strictEqual(
        inDeliveryOrScale(skill({ capability: "delivery" })),
        true,
      );
      assert.strictEqual(
        inDeliveryOrScale(skill({ capability: "scale" })),
        true,
      );
    });

    test("returns false if entry matches none", () => {
      const inDeliveryOrScale = isInAnyCapability(["delivery", "scale"]);
      assert.strictEqual(inDeliveryOrScale(skill({ capability: "ai" })), false);
    });

    test("handles empty capabilities list", () => {
      const inNone = isInAnyCapability([]);
      assert.strictEqual(inNone(skill({ capability: "delivery" })), false);
    });
  });

  describe("allOf", () => {
    test("returns true when all predicates pass", () => {
      const combined = allOf(isPrimary, isAgentEligible);
      assert.strictEqual(
        combined(skill({ type: "primary", isHumanOnly: false })),
        true,
      );
    });

    test("returns false when any predicate fails", () => {
      const combined = allOf(isPrimary, isAgentEligible);
      assert.strictEqual(
        combined(skill({ type: "primary", isHumanOnly: true })),
        false,
      );
      assert.strictEqual(
        combined(skill({ type: "secondary", isHumanOnly: false })),
        false,
      );
    });

    test("returns true with no predicates (vacuous truth)", () => {
      const combined = allOf();
      assert.strictEqual(combined(skill()), true);
    });
  });

  describe("anyOf", () => {
    test("returns true when any predicate passes", () => {
      const combined = anyOf(isPrimary, isSecondary);
      assert.strictEqual(combined(skill({ type: "primary" })), true);
      assert.strictEqual(combined(skill({ type: "secondary" })), true);
    });

    test("returns false when no predicates pass", () => {
      const combined = anyOf(isPrimary, isSecondary);
      assert.strictEqual(combined(skill({ type: "broad" })), false);
    });

    test("returns false with no predicates", () => {
      const combined = anyOf();
      assert.strictEqual(combined(skill()), false);
    });
  });

  describe("not", () => {
    test("negates a predicate", () => {
      const notPrimary = not(isPrimary);
      assert.strictEqual(notPrimary(skill({ type: "primary" })), false);
      assert.strictEqual(notPrimary(skill({ type: "secondary" })), true);
    });

    test("double negation restores original", () => {
      const notNotPrimary = not(not(isPrimary));
      assert.strictEqual(notNotPrimary(skill({ type: "primary" })), true);
      assert.strictEqual(notNotPrimary(skill({ type: "secondary" })), false);
    });
  });
});

// =============================================================================
// Filters
// =============================================================================

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

describe("orderings", () => {
  describe("ORDER_SKILL_TYPE", () => {
    test("has correct order", () => {
      assert.deepStrictEqual(ORDER_SKILL_TYPE, [
        "primary",
        "secondary",
        "broad",
        "track",
      ]);
    });
  });

  describe("compareByLevelDesc", () => {
    test("sorts higher proficiency first", () => {
      const items = [
        skill({ proficiency: "awareness" }),
        skill({ proficiency: "expert" }),
        skill({ proficiency: "working" }),
      ];
      items.sort(compareByLevelDesc);
      assert.deepStrictEqual(
        items.map((e) => e.proficiency),
        ["expert", "working", "awareness"],
      );
    });

    test("returns 0 for equal proficiencies", () => {
      assert.strictEqual(
        compareByLevelDesc(
          skill({ proficiency: "working" }),
          skill({ proficiency: "working" }),
        ),
        0,
      );
    });
  });

  describe("compareByLevelAsc", () => {
    test("sorts lower proficiency first", () => {
      const items = [
        skill({ proficiency: "expert" }),
        skill({ proficiency: "awareness" }),
        skill({ proficiency: "working" }),
      ];
      items.sort(compareByLevelAsc);
      assert.deepStrictEqual(
        items.map((e) => e.proficiency),
        ["awareness", "working", "expert"],
      );
    });
  });

  describe("compareByType", () => {
    test("sorts by canonical type order", () => {
      const items = [
        skill({ type: "track" }),
        skill({ type: "primary" }),
        skill({ type: "broad" }),
        skill({ type: "secondary" }),
      ];
      items.sort(compareByType);
      assert.deepStrictEqual(
        items.map((e) => e.type),
        ["primary", "secondary", "broad", "track"],
      );
    });
  });

  describe("compareByName", () => {
    test("sorts alphabetically by skillName", () => {
      const items = [
        skill({ skillName: "Zephyr" }),
        skill({ skillName: "Alpha" }),
        skill({ skillName: "Middle" }),
      ];
      items.sort(compareByName);
      assert.deepStrictEqual(
        items.map((e) => e.skillName),
        ["Alpha", "Middle", "Zephyr"],
      );
    });

    test("falls back to name property", () => {
      const items = [{ name: "Beta" }, { name: "Alpha" }];
      items.sort(compareByName);
      assert.deepStrictEqual(
        items.map((e) => e.name),
        ["Alpha", "Beta"],
      );
    });
  });

  describe("compareBySkillPriority", () => {
    test("sorts by level desc, then type asc, then name asc", () => {
      const items = [
        skill({
          skillName: "B",
          type: "primary",
          proficiency: "working",
        }),
        skill({
          skillName: "A",
          type: "secondary",
          proficiency: "expert",
        }),
        skill({
          skillName: "C",
          type: "primary",
          proficiency: "expert",
        }),
        skill({
          skillName: "D",
          type: "primary",
          proficiency: "expert",
        }),
      ];
      items.sort(compareBySkillPriority);
      // Expert primary first (alphabetical: C then D), then expert secondary (A), then working primary (B)
      assert.deepStrictEqual(
        items.map((e) => e.skillName),
        ["C", "D", "A", "B"],
      );
    });

    test("equal entries return 0", () => {
      const a = skill({
        skillName: "Same",
        type: "primary",
        proficiency: "working",
      });
      const b = skill({
        skillName: "Same",
        type: "primary",
        proficiency: "working",
      });
      assert.strictEqual(compareBySkillPriority(a, b), 0);
    });
  });

  describe("compareByTypeAndName", () => {
    test("sorts by type first, then name", () => {
      const items = [
        skill({ skillName: "Z", type: "broad" }),
        skill({ skillName: "A", type: "primary" }),
        skill({ skillName: "B", type: "primary" }),
        skill({ skillName: "M", type: "secondary" }),
      ];
      items.sort(compareByTypeAndName);
      assert.deepStrictEqual(
        items.map((e) => e.skillName),
        ["A", "B", "M", "Z"],
      );
      assert.deepStrictEqual(
        items.map((e) => e.type),
        ["primary", "primary", "secondary", "broad"],
      );
    });
  });

  describe("compareByMaturityDesc", () => {
    test("sorts higher maturity first", () => {
      const items = [
        behaviour({ maturity: "emerging" }),
        behaviour({ maturity: "exemplifying" }),
        behaviour({ maturity: "practicing" }),
      ];
      items.sort(compareByMaturityDesc);
      assert.deepStrictEqual(
        items.map((e) => e.maturity),
        ["exemplifying", "practicing", "emerging"],
      );
    });
  });

  describe("compareByMaturityAsc", () => {
    test("sorts lower maturity first", () => {
      const items = [
        behaviour({ maturity: "exemplifying" }),
        behaviour({ maturity: "emerging" }),
        behaviour({ maturity: "practicing" }),
      ];
      items.sort(compareByMaturityAsc);
      assert.deepStrictEqual(
        items.map((e) => e.maturity),
        ["emerging", "practicing", "exemplifying"],
      );
    });
  });

  describe("compareByBehaviourName", () => {
    test("sorts alphabetically by behaviourName", () => {
      const items = [
        behaviour({ behaviourName: "Zeal" }),
        behaviour({ behaviourName: "Autonomy" }),
      ];
      items.sort(compareByBehaviourName);
      assert.deepStrictEqual(
        items.map((e) => e.behaviourName),
        ["Autonomy", "Zeal"],
      );
    });

    test("falls back to name property", () => {
      const items = [{ name: "Beta" }, { name: "Alpha" }];
      items.sort(compareByBehaviourName);
      assert.deepStrictEqual(
        items.map((e) => e.name),
        ["Alpha", "Beta"],
      );
    });
  });

  describe("compareByBehaviourPriority", () => {
    test("sorts by maturity desc then name asc", () => {
      const items = [
        behaviour({ behaviourName: "Beta", maturity: "practicing" }),
        behaviour({ behaviourName: "Alpha", maturity: "exemplifying" }),
        behaviour({ behaviourName: "Alpha", maturity: "practicing" }),
      ];
      items.sort(compareByBehaviourPriority);
      assert.deepStrictEqual(
        items.map((e) => e.behaviourName),
        ["Alpha", "Alpha", "Beta"],
      );
      assert.deepStrictEqual(
        items.map((e) => e.maturity),
        ["exemplifying", "practicing", "practicing"],
      );
    });
  });

  describe("compareByStageOrder", () => {
    test("sorts by stage lifecycle order from loaded data", () => {
      const stages = [{ id: "plan" }, { id: "build" }, { id: "operate" }];
      const comparator = compareByStageOrder(stages);
      const items = [
        { stageId: "operate" },
        { stageId: "plan" },
        { stageId: "build" },
      ];
      items.sort(comparator);
      assert.deepStrictEqual(
        items.map((e) => e.stageId),
        ["plan", "build", "operate"],
      );
    });

    test("falls back to id property", () => {
      const stages = [{ id: "alpha" }, { id: "beta" }];
      const comparator = compareByStageOrder(stages);
      const items = [{ id: "beta" }, { id: "alpha" }];
      items.sort(comparator);
      assert.deepStrictEqual(
        items.map((e) => e.id),
        ["alpha", "beta"],
      );
    });
  });

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
    test("sorts by capability then name without mutating input", () => {
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

      // Original is not mutated
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
    test("creates comparator from an ordering array and accessor", () => {
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
        skill({ type: "secondary", skillName: "A" }),
        skill({ type: "primary", skillName: "B" }),
        skill({ type: "primary", skillName: "A" }),
      ];
      items.sort(chained);
      assert.deepStrictEqual(
        items.map((e) => `${e.type}:${e.skillName}`),
        ["primary:A", "primary:B", "secondary:A"],
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
        { name: "B", type: "primary", change: 1 },
        { name: "A", type: "primary", change: 2 },
        { name: "C", type: "secondary", change: 2 },
        { name: "A", type: "secondary", change: 1 },
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

  describe("sort stability", () => {
    test("equal elements preserve original order", () => {
      // All same proficiency, should preserve insertion order
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
