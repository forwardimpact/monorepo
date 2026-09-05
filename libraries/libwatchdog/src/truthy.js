// The killswitch value's one JavaScript home. Four shell readers apply the
// same test. This module agrees with them and adds no fifth shell copy.

const FALSY = new Set(["", "0", "false", "no", "off"]);

/**
 * Test a latch value the way every killswitch reader tests it.
 * @param {*} value - The raw variable value, or `null`/`undefined` when absent.
 * @returns {boolean} `true` when the value reads as engaged.
 */
export function isTruthy(value) {
  if (value === null || value === undefined) return false;
  return !FALSY.has(String(value).trim().toLowerCase());
}
