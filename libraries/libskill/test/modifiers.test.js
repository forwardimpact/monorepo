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
} from "../src/modifiers.js";

import { Capability } from "../src/levels.js";

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
  // Property: every value in the Capability enum is a recognised capability.
  // Single path (`VALID_CAPABILITIES.has(key)`); the per-value delivery/scale/ai
  // blocks asserted the same shape and collapse into this loop.
  test("returns true for every Capability enum value (property)", () => {
    for (const cap of Object.values(Capability)) {
      assert.strictEqual(isCapability(cap), true, `${cap} should be valid`);
    }
  });

  // Boundary cases for the false branch — each is a distinct kind of non-key.
  test("returns false for a skill ID, empty string, and arbitrary strings", () => {
    assert.strictEqual(isCapability("coding"), false); // skill ID
    assert.strictEqual(isCapability(""), false); // empty string
    assert.strictEqual(isCapability("not_a_capability"), false); // unknown
    assert.strictEqual(isCapability("DELIVERY"), false); // wrong case
  });
});

// =============================================================================
// getSkillsByCapability
// =============================================================================

describe("getSkillsByCapability", () => {
  test("returns skills matching the capability", () => {
    const result = getSkillsByCapability({
      skills: SKILLS,
      capability: "delivery",
    });
    assert.strictEqual(result.length, 2);
    assert.ok(result.some((s) => s.id === "coding"));
    assert.ok(result.some((s) => s.id === "testing"));
  });

  test("returns single skill when only one matches", () => {
    const result = getSkillsByCapability({
      skills: SKILLS,
      capability: "scale",
    });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, "architecture");
  });

  test("returns empty array when no skills match", () => {
    const result = getSkillsByCapability({
      skills: SKILLS,
      capability: "people",
    });
    assert.strictEqual(result.length, 0);
  });

  test("returns empty array for empty skills array", () => {
    const result = getSkillsByCapability({
      skills: [],
      capability: "delivery",
    });
    assert.strictEqual(result.length, 0);
  });

  test("returns empty array for invalid capability", () => {
    const result = getSkillsByCapability({
      skills: SKILLS,
      capability: "nonexistent",
    });
    assert.strictEqual(result.length, 0);
  });
});

// =============================================================================
// buildCapabilityToSkillsMap
// =============================================================================

describe("buildCapabilityToSkillsMap", () => {
  // Property: the map's key set is exactly the Capability enum, regardless of
  // input — every enum value is present (seeded with `[]`) and nothing else is.
  // Single path (the `for (const capability of VALID_CAPABILITIES)` seed loop).
  test("keys are exactly the Capability enum for any input (property)", () => {
    for (const skills of [SKILLS, []]) {
      const result = buildCapabilityToSkillsMap(skills);
      const keys = Object.keys(result).sort();
      const caps = Object.values(Capability).sort();
      assert.deepStrictEqual(keys, caps);
    }
  });

  // Boundary: a capability with multiple skills, one with a single skill, and
  // capabilities with no skills (empty arrays).
  test("groups skill IDs by capability; unmatched capabilities stay empty", () => {
    const result = buildCapabilityToSkillsMap(SKILLS);
    assert.deepStrictEqual(result.delivery, ["coding", "testing"]); // many
    assert.deepStrictEqual(result.scale, ["architecture"]); // one
    assert.deepStrictEqual(result.reliability, ["monitoring"]); // one
    assert.deepStrictEqual(result.people, []); // none
    assert.deepStrictEqual(result.business, []); // none
  });

  // Boundary: empty input — every key maps to an empty array.
  test("handles empty skills array", () => {
    const result = buildCapabilityToSkillsMap([]);
    for (const cap of Object.values(Capability)) {
      assert.deepStrictEqual(result[cap], []);
    }
  });

  // Boundary: an unrecognized capability key is dropped entirely.
  test("ignores skills with unrecognized capability", () => {
    const skills = [{ id: "x", name: "X", capability: "unknown_cap" }];
    const result = buildCapabilityToSkillsMap(skills);
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
    const result = expandModifiersToSkills({
      skillModifiers: { delivery: 1 },
      skills: SKILLS,
    });
    assert.strictEqual(result.coding, 1);
    assert.strictEqual(result.testing, 1);
  });

  test("expands multiple capabilities", () => {
    const result = expandModifiersToSkills({
      skillModifiers: { delivery: 1, scale: -1 },
      skills: SKILLS,
    });
    assert.strictEqual(result.coding, 1);
    assert.strictEqual(result.testing, 1);
    assert.strictEqual(result.architecture, -1);
  });

  test("ignores non-capability keys", () => {
    const result = expandModifiersToSkills({
      skillModifiers: { delivery: 1, some_skill_id: 2 },
      skills: SKILLS,
    });
    assert.strictEqual(result.coding, 1);
    assert.strictEqual(result.testing, 1);
    assert.ok(!("some_skill_id" in result));
  });

  test("returns empty object for null input", () => {
    const result = expandModifiersToSkills({
      skillModifiers: null,
      skills: SKILLS,
    });
    assert.deepStrictEqual(result, {});
  });

  test("returns empty object for undefined input", () => {
    const result = expandModifiersToSkills({
      skillModifiers: undefined,
      skills: SKILLS,
    });
    assert.deepStrictEqual(result, {});
  });

  test("returns empty object for empty modifiers", () => {
    const result = expandModifiersToSkills({
      skillModifiers: {},
      skills: SKILLS,
    });
    assert.deepStrictEqual(result, {});
  });

  test("capability with no matching skills produces no entries", () => {
    const result = expandModifiersToSkills({
      skillModifiers: { people: 1 },
      skills: SKILLS,
    });
    assert.deepStrictEqual(result, {});
  });

  test("preserves negative modifiers", () => {
    const result = expandModifiersToSkills({
      skillModifiers: { reliability: -2 },
      skills: SKILLS,
    });
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
    const result = resolveSkillModifier({
      skillId: "coding",
      skillModifiers: modifiers,
      skills: SKILLS,
    });
    assert.strictEqual(result, 1);
  });

  test("returns modifier for different capability", () => {
    const modifiers = { delivery: 1, scale: -1 };
    const result = resolveSkillModifier({
      skillId: "architecture",
      skillModifiers: modifiers,
      skills: SKILLS,
    });
    assert.strictEqual(result, -1);
  });

  test("returns 0 when skill capability has no modifier", () => {
    const modifiers = { delivery: 1 };
    const result = resolveSkillModifier({
      skillId: "architecture",
      skillModifiers: modifiers,
      skills: SKILLS,
    });
    assert.strictEqual(result, 0);
  });

  test("returns 0 when skill ID is not found", () => {
    const modifiers = { delivery: 1 };
    const result = resolveSkillModifier({
      skillId: "nonexistent",
      skillModifiers: modifiers,
      skills: SKILLS,
    });
    assert.strictEqual(result, 0);
  });

  test("returns 0 for null modifiers", () => {
    const result = resolveSkillModifier({
      skillId: "coding",
      skillModifiers: null,
      skills: SKILLS,
    });
    assert.strictEqual(result, 0);
  });

  test("returns 0 for undefined modifiers", () => {
    const result = resolveSkillModifier({
      skillId: "coding",
      skillModifiers: undefined,
      skills: SKILLS,
    });
    assert.strictEqual(result, 0);
  });

  test("returns 0 for empty modifiers", () => {
    const result = resolveSkillModifier({
      skillId: "coding",
      skillModifiers: {},
      skills: SKILLS,
    });
    assert.strictEqual(result, 0);
  });

  test("returns 0 for skill without capability", () => {
    const skills = [{ id: "orphan", name: "Orphan" }];
    const modifiers = { delivery: 1 };
    const result = resolveSkillModifier({
      skillId: "orphan",
      skillModifiers: modifiers,
      skills,
    });
    assert.strictEqual(result, 0);
  });
});
