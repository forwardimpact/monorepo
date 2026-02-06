/**
 * Skill Modifier Expansion Functions
 *
 * This module provides pure functions for expanding capability-based skill modifiers
 * to individual skill modifiers. Tracks define modifiers by capability only
 * (e.g., "delivery: 1", "scale: -1") - individual skill modifiers are not allowed.
 */

import { CAPABILITY_ORDER } from "@forwardimpact/schema/levels";

/**
 * Valid skill capability names for modifier expansion
 * @type {Set<string>}
 */
const VALID_CAPABILITIES = new Set(CAPABILITY_ORDER);

/**
 * Check if a key is a skill capability
 * @param {string} key - The key to check
 * @returns {boolean} True if the key is a valid skill capability
 */
export function isCapability(key) {
  return VALID_CAPABILITIES.has(key);
}

/**
 * Get skills by capability from a skills array
 * @param {import('./levels.js').Skill[]} skills - Array of all skills
 * @param {string} capability - The capability to filter by
 * @returns {import('./levels.js').Skill[]} Skills in the specified capability
 */
export function getSkillsByCapability(skills, capability) {
  return skills.filter((skill) => skill.capability === capability);
}

/**
 * Build a map of capability to skill IDs
 * @param {import('./levels.js').Skill[]} skills - Array of all skills
 * @returns {Object<string, string[]>} Map of capability to array of skill IDs
 */
export function buildCapabilityToSkillsMap(skills) {
  const capabilityMap = {};

  for (const capability of VALID_CAPABILITIES) {
    capabilityMap[capability] = [];
  }

  for (const skill of skills) {
    if (skill.capability && capabilityMap[skill.capability]) {
      capabilityMap[skill.capability].push(skill.id);
    }
  }

  return capabilityMap;
}

/**
 * Expand capability-based skill modifiers to individual skill modifiers
 *
 * Takes a skillModifiers object containing capability-based modifiers only
 * (e.g., { delivery: 1, scale: -1 }). Individual skill modifiers are not allowed.
 *
 * Returns an object with individual skill modifiers expanded from capabilities.
 *
 * @param {Object<string, number>} skillModifiers - The capability skill modifiers
 * @param {import('./levels.js').Skill[]} skills - Array of all skills (for capability lookup)
 * @returns {Object<string, number>} Expanded skill modifiers with individual skill IDs
 */
export function expandSkillModifiers(skillModifiers, skills) {
  if (!skillModifiers) {
    return {};
  }

  const capabilityMap = buildCapabilityToSkillsMap(skills);
  const expanded = {};

  // Expand capability modifiers to individual skills
  for (const [key, modifier] of Object.entries(skillModifiers)) {
    if (isCapability(key)) {
      // This is a capability - expand to all skills in that capability
      const skillIds = capabilityMap[key] || [];
      for (const skillId of skillIds) {
        expanded[skillId] = modifier;
      }
    }
    // Non-capability keys are ignored (validation should catch these)
  }

  return expanded;
}

/**
 * Extract capability modifiers from a skillModifiers object
 * @param {Object<string, number>} skillModifiers - The skill modifiers
 * @returns {Object<string, number>} Only the capability-based modifiers
 */
export function extractCapabilityModifiers(skillModifiers) {
  if (!skillModifiers) {
    return {};
  }

  const result = {};
  for (const [key, modifier] of Object.entries(skillModifiers)) {
    if (isCapability(key)) {
      result[key] = modifier;
    }
  }
  return result;
}

/**
 * Extract individual skill modifiers from a skillModifiers object
 * @param {Object<string, number>} skillModifiers - The skill modifiers
 * @returns {Object<string, number>} Only the individual skill modifiers
 */
export function extractIndividualModifiers(skillModifiers) {
  if (!skillModifiers) {
    return {};
  }

  const result = {};
  for (const [key, modifier] of Object.entries(skillModifiers)) {
    if (!isCapability(key)) {
      result[key] = modifier;
    }
  }
  return result;
}

/**
 * Get the effective skill modifier for a specific skill
 *
 * Looks up the capability modifier for the skill's capability.
 * Returns 0 if no modifier applies.
 *
 * @param {string} skillId - The skill ID to get modifier for
 * @param {Object<string, number>} skillModifiers - The capability skill modifiers
 * @param {import('./levels.js').Skill[]} skills - Array of all skills
 * @returns {number} The effective modifier for this skill
 */
export function resolveSkillModifier(skillId, skillModifiers, skills) {
  if (!skillModifiers) {
    return 0;
  }

  // Find the skill's capability
  const skill = skills.find((s) => s.id === skillId);
  if (!skill || !skill.capability) {
    return 0;
  }

  // Check for capability modifier
  if (skill.capability in skillModifiers) {
    return skillModifiers[skill.capability];
  }

  return 0;
}
