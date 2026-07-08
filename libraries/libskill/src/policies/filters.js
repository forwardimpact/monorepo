/**
 * Matrix-Level Filter Functions
 *
 * Filters that operate on entire arrays of skill/behaviour entries.
 * Unlike predicates (single entry → boolean), these transform arrays.
 *
 * Naming convention: filter* for functions that reduce/transform arrays.
 * Matrix filters are tagged with matrixFilter() so applyFilters can
 * distinguish them from predicates without runtime probing.
 */

import { getSkillProficiencyIndex } from "../levels.js";

// =============================================================================
// Matrix filter tagging
// =============================================================================

const MATRIX_FILTER = Symbol("matrix-filter");

/**
 * Tag a function as a matrix filter (array → array).
 * @param {Function} fn
 * @returns {Function} Tagged function
 */
export function matrixFilter(fn) {
  fn[MATRIX_FILTER] = true;
  return fn;
}

// =============================================================================
// Level-Based Filters
// =============================================================================

/**
 * Filter matrix to keep only skills at the highest derived level
 *
 * After track modifiers are applied, some skills will be at higher levels
 * than others. This filter keeps only the skills at the maximum level.
 *
 * @param {Array} matrix - Skill matrix entries with derived levels
 * @returns {Array} Filtered matrix with only max-level skills
 */
export const filterHighestLevel = matrixFilter(
  function filterHighestLevel(matrix) {
    if (matrix.length === 0) return [];

    const maxIndex = Math.max(
      ...matrix.map((entry) => getSkillProficiencyIndex(entry.proficiency)),
    );

    return matrix.filter(
      (entry) => getSkillProficiencyIndex(entry.proficiency) === maxIndex,
    );
  },
);

/**
 * Filter matrix to exclude skills at awareness level
 *
 * Skills at awareness level are typically too basic for certain outputs
 * like responsibilities derivation.
 *
 * @param {Array} matrix - Skill matrix entries
 * @returns {Array} Filtered matrix excluding awareness skills
 */
export const filterAboveAwareness = matrixFilter(
  function filterAboveAwareness(matrix) {
    return matrix.filter((entry) => entry.proficiency !== "awareness");
  },
);

// =============================================================================
// Predicate Application
// =============================================================================

/**
 * Apply a predicate to filter a matrix
 *
 * Convenience wrapper around Array.filter() for consistency with
 * the policy API.
 *
 * @param {Function} predicate - Predicate function (entry → boolean)
 * @returns {(matrix: Array) => Array} Curried filter function
 */
export function filterBy(predicate) {
  return matrixFilter((matrix) => matrix.filter(predicate));
}

// =============================================================================
// Pipeline Application
// =============================================================================

/**
 * Apply multiple filter operations in sequence
 *
 * Each operation can be either:
 * - A predicate function (entry → boolean): used with Array.filter()
 * - A matrix filter tagged with matrixFilter(): applied directly
 *
 * @param {Array} matrix - Initial items
 * @param {...Function} operations - Predicates or matrix filters
 * @returns {Array} Transformed items
 */
export function applyFilters(matrix, ...operations) {
  return operations.reduce((acc, op) => {
    if (op[MATRIX_FILTER]) {
      return op(acc);
    }
    return acc.filter(op);
  }, matrix);
}

/**
 * Compose filter operations into a single filter function
 *
 * Useful for creating reusable composed policies.
 *
 * @param {...Function} operations - Predicates or matrix filters
 * @returns {(matrix: Array) => Array} Composed filter function
 */
export function composeFilters(...operations) {
  return matrixFilter((matrix) => applyFilters(matrix, ...operations));
}
