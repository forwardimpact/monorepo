/**
 * Entry-Level Predicate Functions
 *
 * Pure predicates that operate on single skill/behaviour matrix entries.
 * Each predicate takes one entry and returns boolean.
 *
 * Naming conventions:
 * - is* - checks a boolean condition
 * - has* - checks presence of a value
 * - allOf/anyOf/not - combinators
 */

import { getSkillProficiencyIndex } from "../levels.js";

// =============================================================================
// Identity Predicates
// =============================================================================

/** Always returns true (identity predicate for optional filtering) */
export const isAny = () => true;

/** Always returns false (null predicate) */
export const isNone = () => false;

// =============================================================================
// Human-Only Predicates
// =============================================================================

/**
 * Returns true if skill is marked as human-only
 * @param {Object} entry - Skill matrix entry
 * @returns {boolean}
 */
export const isHumanOnly = (entry) => entry.isHumanOnly === true;

/**
 * Returns true if skill is NOT human-only (agent-eligible)
 * @param {Object} entry - Skill matrix entry
 * @returns {boolean}
 */
export const isAgentEligible = (entry) => !entry.isHumanOnly;

// =============================================================================
// Skill Tier Predicates
// =============================================================================

/**
 * Returns true if skill tier is core
 * @param {Object} entry - Skill matrix entry
 * @returns {boolean}
 */
export const isCore = (entry) => entry.type === "core";

/**
 * Returns true if skill tier is supporting
 * @param {Object} entry - Skill matrix entry
 * @returns {boolean}
 */
export const isSupporting = (entry) => entry.type === "supporting";

/**
 * Returns true if skill tier is broad
 * @param {Object} entry - Skill matrix entry
 * @returns {boolean}
 */
export const isBroad = (entry) => entry.type === "broad";

/**
 * Returns true if skill tier is track
 * @param {Object} entry - Skill matrix entry
 * @returns {boolean}
 */
export const isTrack = (entry) => entry.type === "track";

/**
 * Returns true if skill is in the deep tier (core or supporting)
 * @param {Object} entry - Skill matrix entry
 * @returns {boolean}
 */
export const isDeep = (entry) =>
  entry.type === "core" || entry.type === "supporting";

/**
 * Returns true if skill is in the breadth tier (broad or track)
 * @param {Object} entry - Skill matrix entry
 * @returns {boolean}
 */
export const isBreadth = (entry) =>
  entry.type === "broad" || entry.type === "track";

// =============================================================================
// Skill Proficiency Predicates
// =============================================================================

/**
 * Create predicate for skills at or above a minimum level
 * @param {string} minLevel - Minimum skill proficiency
 * @returns {(entry: Object) => boolean}
 */
export function hasMinLevel(minLevel) {
  const minIndex = getSkillProficiencyIndex(minLevel);
  return (entry) => getSkillProficiencyIndex(entry.proficiency) >= minIndex;
}

/**
 * Create predicate for skills at exactly a specific level
 * @param {string} level - Exact skill proficiency to match
 * @returns {(entry: Object) => boolean}
 */
export function hasLevel(level) {
  const targetIndex = getSkillProficiencyIndex(level);
  return (entry) => getSkillProficiencyIndex(entry.proficiency) === targetIndex;
}

/**
 * Create predicate for skills below a level threshold
 * @param {string} maxLevel - Level that must NOT be reached
 * @returns {(entry: Object) => boolean}
 */
export function hasBelowLevel(maxLevel) {
  const maxIndex = getSkillProficiencyIndex(maxLevel);
  return (entry) => getSkillProficiencyIndex(entry.proficiency) < maxIndex;
}

// =============================================================================
// Capability Predicates
// =============================================================================

/**
 * Create predicate for skills in a specific capability
 * @param {string} capability - Capability to match
 * @returns {(entry: Object) => boolean}
 */
export function isInCapability(capability) {
  return (entry) => entry.capability === capability;
}

/**
 * Create predicate for skills in any of the specified capabilities
 * @param {string[]} capabilities - Capabilities to match
 * @returns {(entry: Object) => boolean}
 */
export function isInAnyCapability(capabilities) {
  const set = new Set(capabilities);
  return (entry) => set.has(entry.capability);
}

// =============================================================================
// Combinators
// =============================================================================

/**
 * Compose predicates with AND logic (all must pass)
 * @param {...Function} predicates - Predicates to combine
 * @returns {(entry: Object) => boolean}
 */
export function allOf(...predicates) {
  return (entry) => predicates.every((p) => p(entry));
}

/**
 * Compose predicates with OR logic (any must pass)
 * @param {...Function} predicates - Predicates to combine
 * @returns {(entry: Object) => boolean}
 */
export function anyOf(...predicates) {
  return (entry) => predicates.some((p) => p(entry));
}

/**
 * Negate a predicate
 * @param {Function} predicate - Predicate to negate
 * @returns {(entry: Object) => boolean}
 */
export function not(predicate) {
  return (entry) => !predicate(entry);
}
