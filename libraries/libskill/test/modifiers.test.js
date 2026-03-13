import { test, describe } from "node:test";
import assert from "node:assert";

import {
  isCapability,
  getSkillsByCapability,
  buildCapabilityToSkillsMap,
  expandModifiersToSkills,
  extractCapabilityModifiers,
  extractSkillModifiers,
  resolveSkillModifier,
} from "../modifiers.js";

import { Capability } from "@forwardimpact/map/levels";

// =============================================================================
// Test fixtures
// =============================================================================

const SKILLS = [
  { id: "coding", name: "Coding", capability: "delivery" },
  { id: "testing", name: "Testing", capability: "delivery" },
  { id: "architecture", name: "Architecture", capability: "scale" },
  { id: "monitoring", name: "Monitoring", capability: "reliability" },
  { id: "ml_models", name: "ML Models", capability: "ml" },
  { id: "data_analysis", name: "Data Analysis", capability: "data" },
];

// =============================================================================
// isCapability
// =============================================================================

describe("isCapability", () => {
  test("returns true for all valid capability values", () => {
    for (const cap of Object.values(Capability)) {
      assert.strictEqual(isCapability(cap), true, `${cap} should be valid`);
    }
  });

  test("returns true for 'delivery'", () => {
    assert.strictEqual(isCapability("delivery"), true);
  });

  test("returns true for 'scale'", () => {
    assert.strictEqual(isCapability("scale"), true);
  });

  test("returns true for 'ai'", () => {
    assert.strictEqual(isCapability("ai"), true);
  });

  test("returns false for individual skill IDs", () => {
    assert.strictEqual(isCapability("coding"), false);
    assert.strictEqual(isCapability("testing"), false);
    assert.strictEqual(isCapability("architecture"), false);
  });

  test("returns false for empty string", () => {
    assert.strictEqual(isCapability(""), false);
  });

  test("returns false for arbitrary strings", () => {
    assert.strictEqual(isCapability("not_a_capability"), false);
    assert.strictEqual(isCapability("DELIVERY"), false);
  });
});

// =============================================================================
// getSkillsByCapability
// =============================================================================

describe("getSkillsByCapability", () => {
  test("returns skills matching the capability", () => {
    const result = getSkillsByCapability(SKILLS, "delivery");
    assert.strictEqual(result.length, 2);
    assert.ok(result.some((s) => s.id === "coding"));
    assert.ok(result.some((s) => s.id === "testing"));
  });

  test("returns single skill when only one matches", () => {
    const result = getSkillsByCapability(SKILLS, "scale");
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, "architecture");
  });

  test("returns empty array when no skills match", () => {
    const result = getSkillsByCapability(SKILLS, "people");
    assert.strictEqual(result.length, 0);
  });

  test("returns empty array for empty skills array", () => {
    const result = getSkillsByCapability([], "delivery");
    assert.strictEqual(result.length, 0);
  });

  test("returns empty array for invalid capability", () => {
    const result = getSkillsByCapability(SKILLS, "nonexistent");
    assert.strictEqual(result.length, 0);
  });
});

// =============================================================================
// buildCapabilityToSkillsMap
// =============================================================================

describe("buildCapabilityToSkillsMap", () => {
  test("builds map with all valid capabilities as keys", () => {
    const result = buildCapabilityToSkillsMap(SKILLS);
    for (const cap of Object.values(Capability)) {
      assert.ok(
        cap in result,
        `capability '${cap}' should be a key in the map`,
      );
    }
  });

  test("groups skill IDs by capability", () => {
    const result = buildCapabilityToSkillsMap(SKILLS);
    assert.deepStrictEqual(result.delivery, ["coding", "testing"]);
    assert.deepStrictEqual(result.scale, ["architecture"]);
    assert.deepStrictEqual(result.reliability, ["monitoring"]);
  });

  test("capabilities with no skills have empty arrays", () => {
    const result = buildCapabilityToSkillsMap(SKILLS);
    assert.deepStrictEqual(result.people, []);
    assert.deepStrictEqual(result.business, []);
  });

  test("handles empty skills array", () => {
    const result = buildCapabilityToSkillsMap([]);
    for (const cap of Object.values(Capability)) {
      assert.deepStrictEqual(result[cap], []);
    }
  });

  test("ignores skills with unrecognized capability", () => {
    const skills = [{ id: "x", name: "X", capability: "unknown_cap" }];
    const result = buildCapabilityToSkillsMap(skills);
    // No capability key should contain "x"
    for (const ids of Object.values(result)) {
      assert.ok(!ids.includes("x"));
    }
  });
});

// =============================================================================
// expandModifiersToSkills
// =============================================================================

describe("expandModifiersToSkills", () => {
  test("expands capability modifier to all skills in that capability", () => {
    const result = expandModifiersToSkills({ delivery: 1 }, SKILLS);
    assert.strictEqual(result.coding, 1);
    assert.strictEqual(result.testing, 1);
  });

  test("expands multiple capabilities", () => {
    const result = expandModifiersToSkills({ delivery: 1, scale: -1 }, SKILLS);
    assert.strictEqual(result.coding, 1);
    assert.strictEqual(result.testing, 1);
    assert.strictEqual(result.architecture, -1);
  });

  test("ignores non-capability keys", () => {
    const result = expandModifiersToSkills(
      { delivery: 1, some_skill_id: 2 },
      SKILLS,
    );
    assert.strictEqual(result.coding, 1);
    assert.strictEqual(result.testing, 1);
    assert.ok(!("some_skill_id" in result));
  });

  test("returns empty object for null input", () => {
    const result = expandModifiersToSkills(null, SKILLS);
    assert.deepStrictEqual(result, {});
  });

  test("returns empty object for undefined input", () => {
    const result = expandModifiersToSkills(undefined, SKILLS);
    assert.deepStrictEqual(result, {});
  });

  test("returns empty object for empty modifiers", () => {
    const result = expandModifiersToSkills({}, SKILLS);
    assert.deepStrictEqual(result, {});
  });

  test("capability with no matching skills produces no entries", () => {
    const result = expandModifiersToSkills({ people: 1 }, SKILLS);
    assert.deepStrictEqual(result, {});
  });

  test("preserves negative modifiers", () => {
    const result = expandModifiersToSkills({ reliability: -2 }, SKILLS);
    assert.strictEqual(result.monitoring, -2);
  });
});

// =============================================================================
// extractCapabilityModifiers
// =============================================================================

describe("extractCapabilityModifiers", () => {
  test("extracts only capability keys", () => {
    const input = { delivery: 1, coding: 2, scale: -1 };
    const result = extractCapabilityModifiers(input);
    assert.deepStrictEqual(result, { delivery: 1, scale: -1 });
  });

  test("returns empty object when no capabilities present", () => {
    const input = { coding: 1, testing: 2 };
    const result = extractCapabilityModifiers(input);
    assert.deepStrictEqual(result, {});
  });

  test("returns empty object for null input", () => {
    assert.deepStrictEqual(extractCapabilityModifiers(null), {});
  });

  test("returns empty object for undefined input", () => {
    assert.deepStrictEqual(extractCapabilityModifiers(undefined), {});
  });

  test("returns empty object for empty input", () => {
    assert.deepStrictEqual(extractCapabilityModifiers({}), {});
  });
});

// =============================================================================
// extractSkillModifiers
// =============================================================================

describe("extractSkillModifiers", () => {
  test("extracts only non-capability keys", () => {
    const input = { delivery: 1, coding: 2, scale: -1, testing: 3 };
    const result = extractSkillModifiers(input);
    assert.deepStrictEqual(result, { coding: 2, testing: 3 });
  });

  test("returns empty object when all keys are capabilities", () => {
    const input = { delivery: 1, scale: -1 };
    const result = extractSkillModifiers(input);
    assert.deepStrictEqual(result, {});
  });

  test("returns empty object for null input", () => {
    assert.deepStrictEqual(extractSkillModifiers(null), {});
  });

  test("returns empty object for undefined input", () => {
    assert.deepStrictEqual(extractSkillModifiers(undefined), {});
  });

  test("returns empty object for empty input", () => {
    assert.deepStrictEqual(extractSkillModifiers({}), {});
  });

  test("extractCapability + extractSkill covers all keys", () => {
    const input = { delivery: 1, coding: 2, scale: -1, testing: 3 };
    const caps = extractCapabilityModifiers(input);
    const skills = extractSkillModifiers(input);
    const allKeys = [...Object.keys(caps), ...Object.keys(skills)].sort();
    assert.deepStrictEqual(allKeys, Object.keys(input).sort());
  });
});

// =============================================================================
// resolveSkillModifier
// =============================================================================

describe("resolveSkillModifier", () => {
  test("returns capability modifier for a matching skill", () => {
    const modifiers = { delivery: 1, scale: -1 };
    const result = resolveSkillModifier("coding", modifiers, SKILLS);
    assert.strictEqual(result, 1);
  });

  test("returns modifier for different capability", () => {
    const modifiers = { delivery: 1, scale: -1 };
    const result = resolveSkillModifier("architecture", modifiers, SKILLS);
    assert.strictEqual(result, -1);
  });

  test("returns 0 when skill capability has no modifier", () => {
    const modifiers = { delivery: 1 };
    const result = resolveSkillModifier("architecture", modifiers, SKILLS);
    assert.strictEqual(result, 0);
  });

  test("returns 0 when skill ID is not found", () => {
    const modifiers = { delivery: 1 };
    const result = resolveSkillModifier("nonexistent", modifiers, SKILLS);
    assert.strictEqual(result, 0);
  });

  test("returns 0 for null modifiers", () => {
    const result = resolveSkillModifier("coding", null, SKILLS);
    assert.strictEqual(result, 0);
  });

  test("returns 0 for undefined modifiers", () => {
    const result = resolveSkillModifier("coding", undefined, SKILLS);
    assert.strictEqual(result, 0);
  });

  test("returns 0 for empty modifiers", () => {
    const result = resolveSkillModifier("coding", {}, SKILLS);
    assert.strictEqual(result, 0);
  });

  test("returns 0 for skill without capability", () => {
    const skills = [{ id: "orphan", name: "Orphan" }];
    const modifiers = { delivery: 1 };
    const result = resolveSkillModifier("orphan", modifiers, skills);
    assert.strictEqual(result, 0);
  });
});
