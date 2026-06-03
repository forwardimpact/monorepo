import { test, describe } from "node:test";
import assert from "node:assert";

import {
  isAny,
  isNone,
  isHumanOnly,
  isAgentEligible,
  isCore,
  isSupporting,
  isBroad,
  isTrack,
  isDeep,
  isBreadth,
  hasMinLevel,
  hasLevel,
  hasBelowLevel,
  isInCapability,
  isInAnyCapability,
  allOf,
  anyOf,
  not,
} from "../src/policies/predicates.js";

function skill(overrides = {}) {
  return {
    skillId: "testing",
    skillName: "Testing",
    capability: "delivery",
    type: "core",
    proficiency: "working",
    isHumanOnly: false,
    ...overrides,
  };
}

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

  describe("isCore", () => {
    test("returns true for core tier", () => {
      assert.strictEqual(isCore(skill({ type: "core" })), true);
    });

    test("returns false for other tiers", () => {
      assert.strictEqual(isCore(skill({ type: "supporting" })), false);
      assert.strictEqual(isCore(skill({ type: "broad" })), false);
      assert.strictEqual(isCore(skill({ type: "track" })), false);
    });
  });

  describe("isSupporting", () => {
    test("returns true for supporting tier", () => {
      assert.strictEqual(isSupporting(skill({ type: "supporting" })), true);
    });

    test("returns false for other tiers", () => {
      assert.strictEqual(isSupporting(skill({ type: "core" })), false);
    });
  });

  describe("isBroad", () => {
    test("returns true for broad tier", () => {
      assert.strictEqual(isBroad(skill({ type: "broad" })), true);
    });

    test("returns false for other tiers", () => {
      assert.strictEqual(isBroad(skill({ type: "core" })), false);
    });
  });

  describe("isTrack", () => {
    test("returns true for track tier", () => {
      assert.strictEqual(isTrack(skill({ type: "track" })), true);
    });

    test("returns false for other tiers", () => {
      assert.strictEqual(isTrack(skill({ type: "core" })), false);
    });
  });

  describe("isDeep", () => {
    test("returns true for core", () => {
      assert.strictEqual(isDeep(skill({ type: "core" })), true);
    });

    test("returns true for supporting", () => {
      assert.strictEqual(isDeep(skill({ type: "supporting" })), true);
    });

    test("returns false for broad", () => {
      assert.strictEqual(isDeep(skill({ type: "broad" })), false);
    });

    test("returns false for track", () => {
      assert.strictEqual(isDeep(skill({ type: "track" })), false);
    });
  });

  describe("isBreadth", () => {
    test("returns true for broad", () => {
      assert.strictEqual(isBreadth(skill({ type: "broad" })), true);
    });

    test("returns true for track", () => {
      assert.strictEqual(isBreadth(skill({ type: "track" })), true);
    });

    test("returns false for core", () => {
      assert.strictEqual(isBreadth(skill({ type: "core" })), false);
    });

    test("returns false for supporting", () => {
      assert.strictEqual(isBreadth(skill({ type: "supporting" })), false);
    });
  });

  // The three level-ordered predicates each cross-multiplied a threshold against
  // the ordered proficiency set, all flowing through a single
  // `getSkillProficiencyIndex(...)` comparison (>=, ===, <). Per Decision 6 this
  // is a single implementation path, so each collapses to boundary cases
  // (at-threshold, one-below, one-above, and the floor/ceiling) plus one
  // monotonicity property loop over the full ordered axis.
  const PROFICIENCY_ORDER = [
    "awareness",
    "foundational",
    "working",
    "practitioner",
    "expert",
  ];

  describe("hasMinLevel", () => {
    test("boundary cases around a mid threshold and at the extremes", () => {
      const atWorking = hasMinLevel("working");
      assert.strictEqual(
        atWorking(skill({ proficiency: "foundational" })),
        false,
      ); // one-below
      assert.strictEqual(atWorking(skill({ proficiency: "working" })), true); // at-threshold
      assert.strictEqual(
        atWorking(skill({ proficiency: "practitioner" })),
        true,
      ); // one-above

      // awareness floor accepts everything; expert ceiling accepts only expert.
      const atAwareness = hasMinLevel("awareness");
      assert.strictEqual(
        atAwareness(skill({ proficiency: "awareness" })),
        true,
      );
      assert.strictEqual(atAwareness(skill({ proficiency: "expert" })), true);
      const atExpert = hasMinLevel("expert");
      assert.strictEqual(
        atExpert(skill({ proficiency: "practitioner" })),
        false,
      );
      assert.strictEqual(atExpert(skill({ proficiency: "expert" })), true);
    });

    test("monotonicity: true iff proficiency index >= threshold index (property)", () => {
      for (let t = 0; t < PROFICIENCY_ORDER.length; t++) {
        const pred = hasMinLevel(PROFICIENCY_ORDER[t]);
        for (let i = 0; i < PROFICIENCY_ORDER.length; i++) {
          assert.strictEqual(
            pred(skill({ proficiency: PROFICIENCY_ORDER[i] })),
            i >= t,
            `hasMinLevel(${PROFICIENCY_ORDER[t]})(${PROFICIENCY_ORDER[i]})`,
          );
        }
      }
    });
  });

  describe("hasLevel", () => {
    test("boundary cases: matches only the exact level", () => {
      const exactlyWorking = hasLevel("working");
      assert.strictEqual(
        exactlyWorking(skill({ proficiency: "foundational" })),
        false,
      ); // one-below
      assert.strictEqual(
        exactlyWorking(skill({ proficiency: "working" })),
        true,
      ); // exact
      assert.strictEqual(
        exactlyWorking(skill({ proficiency: "practitioner" })),
        false,
      ); // one-above
    });

    test("true iff proficiency index === threshold index (property)", () => {
      for (let t = 0; t < PROFICIENCY_ORDER.length; t++) {
        const pred = hasLevel(PROFICIENCY_ORDER[t]);
        for (let i = 0; i < PROFICIENCY_ORDER.length; i++) {
          assert.strictEqual(
            pred(skill({ proficiency: PROFICIENCY_ORDER[i] })),
            i === t,
            `hasLevel(${PROFICIENCY_ORDER[t]})(${PROFICIENCY_ORDER[i]})`,
          );
        }
      }
    });
  });

  describe("hasBelowLevel", () => {
    test("boundary cases around a mid threshold and at the floor", () => {
      const belowWorking = hasBelowLevel("working");
      assert.strictEqual(
        belowWorking(skill({ proficiency: "foundational" })),
        true,
      ); // one-below
      assert.strictEqual(
        belowWorking(skill({ proficiency: "working" })),
        false,
      ); // at-threshold
      assert.strictEqual(belowWorking(skill({ proficiency: "expert" })), false); // one-above

      // below awareness (the floor) returns false for everything.
      const belowAwareness = hasBelowLevel("awareness");
      assert.strictEqual(
        belowAwareness(skill({ proficiency: "awareness" })),
        false,
      );
    });

    test("true iff proficiency index < threshold index (property)", () => {
      for (let t = 0; t < PROFICIENCY_ORDER.length; t++) {
        const pred = hasBelowLevel(PROFICIENCY_ORDER[t]);
        for (let i = 0; i < PROFICIENCY_ORDER.length; i++) {
          assert.strictEqual(
            pred(skill({ proficiency: PROFICIENCY_ORDER[i] })),
            i < t,
            `hasBelowLevel(${PROFICIENCY_ORDER[t]})(${PROFICIENCY_ORDER[i]})`,
          );
        }
      }
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
      const combined = allOf(isCore, isAgentEligible);
      assert.strictEqual(
        combined(skill({ type: "core", isHumanOnly: false })),
        true,
      );
    });

    test("returns false when any predicate fails", () => {
      const combined = allOf(isCore, isAgentEligible);
      assert.strictEqual(
        combined(skill({ type: "core", isHumanOnly: true })),
        false,
      );
      assert.strictEqual(
        combined(skill({ type: "supporting", isHumanOnly: false })),
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
      const combined = anyOf(isCore, isSupporting);
      assert.strictEqual(combined(skill({ type: "core" })), true);
      assert.strictEqual(combined(skill({ type: "supporting" })), true);
    });

    test("returns false when no predicates pass", () => {
      const combined = anyOf(isCore, isSupporting);
      assert.strictEqual(combined(skill({ type: "broad" })), false);
    });

    test("returns false with no predicates", () => {
      const combined = anyOf();
      assert.strictEqual(combined(skill()), false);
    });
  });

  describe("not", () => {
    test("negates a predicate", () => {
      const notCore = not(isCore);
      assert.strictEqual(notCore(skill({ type: "core" })), false);
      assert.strictEqual(notCore(skill({ type: "supporting" })), true);
    });

    test("double negation restores original", () => {
      const notNotCore = not(not(isCore));
      assert.strictEqual(notNotCore(skill({ type: "core" })), true);
      assert.strictEqual(notNotCore(skill({ type: "supporting" })), false);
    });
  });
});

// =============================================================================
// Filters
// =============================================================================
