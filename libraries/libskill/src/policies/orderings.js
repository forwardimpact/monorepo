/**
 * Orderings and Comparator Functions
 *
 * Canonical orderings for entity types and comparator functions for sorting.
 *
 * Naming conventions:
 * - ORDER_* - canonical ordering arrays
 * - compareBy* - comparator functions for Array.sort()
 */

import {
  getSkillProficiencyIndex,
  getBehaviourMaturityIndex,
  getCapabilityOrder,
  getStageOrder,
} from "@forwardimpact/map/levels";

// Re-export getStageOrder for consumers
export { getStageOrder };

// =============================================================================
// Canonical Orderings
// =============================================================================

/**
 * Skill type ordering (T-shaped profile: core → broad)
 * Primary skills first, then secondary, broad, and track-added skills.
 */
export const ORDER_SKILL_TYPE = ["primary", "secondary", "broad", "track"];

// =============================================================================
// Stage Comparators
// =============================================================================

/**
 * Create a comparator for sorting by stage lifecycle order
 *
 * The returned comparator uses the canonical order from loaded stage data,
 * making the ordering data-driven rather than hardcoded.
 *
 * @param {Object[]} stages - Loaded stages array from stages.yaml
 * @returns {(a: Object, b: Object) => number} Comparator function
 */
export function compareByStageOrder(stages) {
  const order = getStageOrder(stages);
  return (a, b) => {
    const stageA = a.stageId || a.id || "";
    const stageB = b.stageId || b.id || "";
    return order.indexOf(stageA) - order.indexOf(stageB);
  };
}

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
 * Compare skills by type (primary first)
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
 * Standard priority ordering for skill display:
 * - Higher levels first
 * - Within same level, primary before secondary before broad
 * - Within same type, alphabetical by name
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

  // Type ascending (primary first)
  const typeA = ORDER_SKILL_TYPE.indexOf(a.type);
  const typeB = ORDER_SKILL_TYPE.indexOf(b.type);
  if (typeA !== typeB) return typeA - typeB;

  // Name ascending (alphabetical)
  const nameA = a.skillName || a.name;
  const nameB = b.skillName || b.name;
  return nameA.localeCompare(nameB);
}

/**
 * Compare skills by type (asc), then name (asc)
 *
 * Standard ordering for job skill matrix display:
 * - Primary skills first, then secondary, then broad, then track
 * - Within same type, alphabetical by name
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
 * Standard priority ordering for behaviour display:
 * - Higher maturity first
 * - Within same maturity, alphabetical by name
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
 * Create a comparator for sorting by capability ordinal rank
 *
 * The returned comparator uses ordinalRank from loaded capability data,
 * making the ordering data-driven rather than hardcoded.
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
 * Create comparator from an ordering array
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
 * Returns first non-zero result, or 0 if all comparators return 0.
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
 * Compare skill changes by change magnitude (largest first), then type, then name
 *
 * Used for career progression analysis where biggest changes are most important.
 *
 * @param {Object} a - First skill change
 * @param {Object} b - Second skill change
 * @returns {number} Comparison result
 */
export function compareBySkillChange(a, b) {
  // Change descending (largest improvement first)
  if (b.change !== a.change) return b.change - a.change;

  // Type ascending (primary first)
  const typeA = ORDER_SKILL_TYPE.indexOf(a.type);
  const typeB = ORDER_SKILL_TYPE.indexOf(b.type);
  if (typeA !== typeB) return typeA - typeB;

  // Name ascending
  return a.name.localeCompare(b.name);
}

/**
 * Compare behaviour changes by change magnitude (largest first), then name
 *
 * Used for career progression analysis.
 *
 * @param {Object} a - First behaviour change
 * @param {Object} b - Second behaviour change
 * @returns {number} Comparison result
 */
export function compareByBehaviourChange(a, b) {
  if (b.change !== a.change) return b.change - a.change;
  return a.name.localeCompare(b.name);
}
