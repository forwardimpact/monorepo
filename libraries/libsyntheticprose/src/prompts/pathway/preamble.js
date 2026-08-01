/**
 * Shared system preamble for all pathway prompt builders.
 *
 * This preamble gives all 8 entity prompt builders the same voice, the
 * same terminology, and the same naming conventions.
 */

import {
  PROFICIENCY_LEVELS,
  MATURITY_LEVELS,
} from "@forwardimpact/libsyntheticgen/vocabulary.js";

/**
 * Build a shared system preamble for pathway prompt builders.
 * @param {string} standardName - Name of the agent-aligned engineering standard (or domain fallback)
 * @returns {string}
 */
export function buildPreamble(standardName) {
  return [
    `You write content for the "${standardName}" agent-aligned engineering standard.`,
    `Use these exact proficiency level names: ${PROFICIENCY_LEVELS.join(", ")}.`,
    `Use these exact maturity level names: ${MATURITY_LEVELS.join(", ")}.`,
    `Write in professional, concise, third-person voice.`,
    `Use consistent terminology across all entities. Prefer precise terms over synonyms.`,
  ].join("\n");
}
