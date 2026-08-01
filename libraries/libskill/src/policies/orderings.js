/**
 * Orderings and Comparator Functions
 *
 * This module defines canonical orderings for entity types. It also
 * defines comparator functions that sort them.
 *
 * Conventions for names:
 * - ORDER_* - arrays that hold a canonical order
 * - compareBy* - comparator functions for Array.sort()
 */

import {
  getSkillProficiencyIndex,
  getBehaviourMaturityIndex,
  getCapabilityOrder,
} from "../levels.js";

// =============================================================================
// Canonical Orderings
// =============================================================================

/**
 * Skill tier order (T-shaped profile: core → broad)
 * This order puts core skills first, then supporting, broad, and
 * track-added skills.
 */
export const ORDER_SKILL_TYPE = ["core", "supporting", "broad", "track"];

// =============================================================================
// Skill Comparators
// =============================================================================

/**
 * Compare skills by level descending (higher level first)
 * @param {Object} a - First skill entry
 * @param {Object} b - Second skill entry
 * @returns {number} Comparison result
 */
export function compareByLevelDesc(a, b) {
  return (
    getSkillProficiencyIndex(b.proficiency) -
    getSkillProficiencyIndex(a.proficiency)
  );
}

/**
 * Compare skills by level ascending (lower level first)
 * @param {Object} a - First skill entry
 * @param {Object} b - Second skill entry
 * @returns {number} Comparison result
 */
export function compareByLevelAsc(a, b) {
  return (
    getSkillProficiencyIndex(a.proficiency) -
    getSkillProficiencyIndex(b.proficiency)
  );
}

/**
 * Compare skills by tier (core first)
 * @param {Object} a - First skill entry
 * @param {Object} b - Second skill entry
 * @returns {number} Comparison result
 */
export function compareByType(a, b) {
  return ORDER_SKILL_TYPE.indexOf(a.type) - ORDER_SKILL_TYPE.indexOf(b.type);
}

/**
 * Compare skills by name alphabetically
 * @param {Object} a - First skill entry
 * @param {Object} b - Second skill entry
 * @returns {number} Comparison result
 */
export function compareByName(a, b) {
  const nameA = a.skillName || a.name;
  const nameB = b.skillName || b.name;
  return nameA.localeCompare(nameB);
}

/**
 * Compare skills by level (desc), then type (asc), then name (asc)
 *
 * This comparator gives the standard priority order to display skills:
 * - Higher levels first
 * - Within the same level, core first, then supporting, then broad
 * - Within the same tier, alphabetical by name
 *
 * @param {Object} a - First skill entry
 * @param {Object} b - Second skill entry
 * @returns {number} Comparison result
 */
export function compareBySkillPriority(a, b) {
  // Level descending (higher level first)
  const levelDiff =
    getSkillProficiencyIndex(b.proficiency) -
    getSkillProficiencyIndex(a.proficiency);
  if (levelDiff !== 0) return levelDiff;

  // Tier ascending (core first)
  const typeA = ORDER_SKILL_TYPE.indexOf(a.type);
  const typeB = ORDER_SKILL_TYPE.indexOf(b.type);
  if (typeA !== typeB) return typeA - typeB;

  // Name ascending (alphabetical)
  const nameA = a.skillName || a.name;
  const nameB = b.skillName || b.name;
  return nameA.localeCompare(nameB);
}

/**
 * Compare skills by level (desc), then type (asc), then capabilityRank (asc)
 *
 * Use this comparator when you focus the skills in an agent profile. The
 * capability ordinalRank breaks a tie instead of the alphabetical name.
 * Each skill matrix entry needs capabilityRank. deriveSkillMatrix sets it.
 *
 * @param {Object} a - First skill entry (with capabilityRank)
 * @param {Object} b - Second skill entry (with capabilityRank)
 * @returns {number} Comparison result
 */
export function compareBySkillFocusPriority(a, b) {
  // Level descending (higher level first)
  const levelDiff =
    getSkillProficiencyIndex(b.proficiency) -
    getSkillProficiencyIndex(a.proficiency);
  if (levelDiff !== 0) return levelDiff;

  // Tier ascending (core first)
  const typeA = ORDER_SKILL_TYPE.indexOf(a.type);
  const typeB = ORDER_SKILL_TYPE.indexOf(b.type);
  if (typeA !== typeB) return typeA - typeB;

  // Capability ordinalRank ascending (higher-ranked capabilities first)
  return (a.capabilityRank || 0) - (b.capabilityRank || 0);
}

/**
 * Compare skills by type (asc), then name (asc)
 *
 * This comparator gives the standard order to display the job skill matrix:
 * - Core skills first, then supporting, then broad, then track
 * - Within the same tier, alphabetical by name
 *
 * @param {Object} a - First skill entry
 * @param {Object} b - Second skill entry
 * @returns {number} Comparison result
 */
export function compareByTypeAndName(a, b) {
  const typeCompare = compareByType(a, b);
  if (typeCompare !== 0) return typeCompare;
  return compareByName(a, b);
}

// =============================================================================
// Behaviour Comparators
// =============================================================================

/**
 * Compare behaviours by maturity descending (higher maturity first)
 * @param {Object} a - First behaviour entry
 * @param {Object} b - Second behaviour entry
 * @returns {number} Comparison result
 */
export function compareByMaturityDesc(a, b) {
  return (
    getBehaviourMaturityIndex(b.maturity) -
    getBehaviourMaturityIndex(a.maturity)
  );
}

/**
 * Compare behaviours by maturity ascending (lower maturity first)
 * @param {Object} a - First behaviour entry
 * @param {Object} b - Second behaviour entry
 * @returns {number} Comparison result
 */
export function compareByMaturityAsc(a, b) {
  return (
    getBehaviourMaturityIndex(a.maturity) -
    getBehaviourMaturityIndex(b.maturity)
  );
}

/**
 * Compare behaviours by name alphabetically
 * @param {Object} a - First behaviour entry
 * @param {Object} b - Second behaviour entry
 * @returns {number} Comparison result
 */
export function compareByBehaviourName(a, b) {
  const nameA = a.behaviourName || a.name;
  const nameB = b.behaviourName || b.name;
  return nameA.localeCompare(nameB);
}

/**
 * Compare behaviours by maturity (desc), then name (asc)
 *
 * This comparator gives the standard priority order to display behaviours:
 * - Higher maturity first
 * - Within the same maturity, alphabetical by name
 *
 * @param {Object} a - First behaviour entry
 * @param {Object} b - Second behaviour entry
 * @returns {number} Comparison result
 */
export function compareByBehaviourPriority(a, b) {
  const maturityDiff =
    getBehaviourMaturityIndex(b.maturity) -
    getBehaviourMaturityIndex(a.maturity);
  if (maturityDiff !== 0) return maturityDiff;
  return compareByBehaviourName(a, b);
}

// =============================================================================
// Capability Comparators
// =============================================================================

/**
 * Create a comparator that sorts by capability ordinal rank
 *
 * The returned comparator uses ordinalRank from the loaded capability
 * data. The order is data-driven. The code does not hardcode it.
 *
 * @param {Object[]} capabilities - Loaded capabilities array
 * @returns {(a: Object, b: Object) => number} Comparator function
 */
export function compareByCapability(capabilities) {
  const order = getCapabilityOrder(capabilities);
  return (a, b) => {
    const capA = a.capability || "";
    const capB = b.capability || "";
    return order.indexOf(capA) - order.indexOf(capB);
  };
}

/**
 * Sort skills by capability (display order), then by name
 *
 * @param {Object[]} skills - Array of skills to sort
 * @param {Object[]} capabilities - Loaded capabilities array
 * @returns {Object[]} Sorted array (new array, does not mutate input)
 */
export function sortSkillsByCapability(skills, capabilities) {
  const capabilityComparator = compareByCapability(capabilities);
  return [...skills].sort((a, b) => {
    const capCompare = capabilityComparator(a, b);
    if (capCompare !== 0) return capCompare;
    const nameA = a.skillName || a.name;
    const nameB = b.skillName || b.name;
    return nameA.localeCompare(nameB);
  });
}

// =============================================================================
// Generic Comparator Factory
// =============================================================================

/**
 * Create a comparator from an order array
 *
 * @param {string[]} order - Canonical order
 * @param {(item: Object) => string} accessor - Extract value to compare
 * @returns {(a: Object, b: Object) => number}
 */
export function compareByOrder(order, accessor) {
  return (a, b) => order.indexOf(accessor(a)) - order.indexOf(accessor(b));
}

/**
 * Chain multiple comparators together
 *
 * The chained comparator returns the first non-zero result. If all
 * comparators return 0, it returns 0.
 *
 * @param {...Function} comparators - Comparator functions
 * @returns {(a: Object, b: Object) => number}
 */
export function chainComparators(...comparators) {
  return (a, b) => {
    for (const comparator of comparators) {
      const result = comparator(a, b);
      if (result !== 0) return result;
    }
    return 0;
  };
}

// =============================================================================
// Skill Change Comparators (for progression)
// =============================================================================

/**
 * Compare skill changes by change magnitude (largest first), then type,
 * then name
 *
 * Use this comparator for career progression analysis. The biggest changes
 * matter most.
 *
 * @param {Object} a - First skill change
 * @param {Object} b - Second skill change
 * @returns {number} Comparison result
 */
export function compareBySkillChange(a, b) {
  // Change descending (largest improvement first)
  if (b.change !== a.change) return b.change - a.change;

  // Tier ascending (core first)
  const typeA = ORDER_SKILL_TYPE.indexOf(a.type);
  const typeB = ORDER_SKILL_TYPE.indexOf(b.type);
  if (typeA !== typeB) return typeA - typeB;

  // Name ascending
  return a.name.localeCompare(b.name);
}

/**
 * Compare behaviour changes by change magnitude (largest first), then name
 *
 * Use this comparator for career progression analysis.
 *
 * @param {Object} a - First behaviour change
 * @param {Object} b - Second behaviour change
 * @returns {number} Comparison result
 */
export function compareByBehaviourChange(a, b) {
  if (b.change !== a.change) return b.change - a.change;
  return a.name.localeCompare(b.name);
}
