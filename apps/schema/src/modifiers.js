/**
 * Skill Modifier Helpers for Validation
 *
 * Contains only the isCapability function needed for schema validation.
 * Full modifier logic is in @forwardimpact/model.
 */

import { CAPABILITY_ORDER } from "./levels.js";

/**
 * Valid skill capability names
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
