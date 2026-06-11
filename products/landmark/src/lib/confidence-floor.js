/**
 * Coverage confidence floor for Landmark commands.
 *
 * Single source of truth for the floor value. Imported by readiness +
 * timeline + coverage formatters, the CLI documentation interpolation,
 * and the criterion-1 ratio-target test.
 */

export const COVERAGE_CONFIDENCE_FLOOR = 0.3;

/** @param {number} ratio */
export function isBelowFloor(ratio) {
  return ratio < COVERAGE_CONFIDENCE_FLOOR;
}

/** Format the floor for display, e.g. "30%". */
export function floorPercentText() {
  return `${Math.round(COVERAGE_CONFIDENCE_FLOOR * 100)}%`;
}
