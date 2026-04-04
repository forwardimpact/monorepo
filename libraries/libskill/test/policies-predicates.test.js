import { test, describe } from "node:test";
import assert from "node:assert";

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
