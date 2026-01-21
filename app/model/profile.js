/**
 * Unified Profile Derivation
 *
 * Shared functions for deriving skill and behaviour profiles for both
 * human jobs and AI agents. This module provides:
 *
 * 1. Filtering functions - reusable filters for skills and behaviours
 * 2. Sorting functions - sort by level/maturity for display
 * 3. prepareBaseProfile() - shared profile derivation used by both job.js and agent.js
 *
 * The core derivation (deriveSkillMatrix, deriveBehaviourProfile) remains in
 * derivation.js. This module adds post-processing for specific use cases.
 *
 * Agent filtering keeps only skills at the highest derived level. This ensures
 * track modifiers are respected—a broad skill boosted by a +1 track modifier
 * may reach the same level as primary skills and thus be included.
 */

import { SKILL_LEVEL_ORDER, BEHAVIOUR_MATURITY_ORDER } from "./levels.js";
import {
  deriveSkillMatrix,
  deriveBehaviourProfile,
  deriveResponsibilities,
} from "./derivation.js";

// =============================================================================
// Skill Filters
// =============================================================================

/**
 * Build set of capabilities with positive track modifiers
 * @param {Object} track - Track definition
 * @returns {Set<string>} Set of capability IDs with positive modifiers
 */
export function getPositiveTrackCapabilities(track) {
  return new Set(
    Object.entries(track.skillModifiers || {})
      .filter(([_, modifier]) => modifier > 0)
      .map(([capability]) => capability),
  );
}

/**
 * Filter out human-only skills
 * Human-only skills are those requiring human presence/experience
 * @param {Array} skillMatrix - Skill matrix entries
 * @returns {Array} Filtered skill matrix
 */
export function filterHumanOnlySkills(skillMatrix) {
  return skillMatrix.filter((entry) => !entry.isHumanOnly);
}

/**
 * Filter skills to keep only those at the highest derived level
 * After track modifiers are applied, some skills will be at higher levels
 * than others. This filter keeps only the skills at the maximum level.
 * @param {Array} skillMatrix - Skill matrix entries with derived levels
 * @returns {Array} Filtered skill matrix containing only highest-level skills
 */
export function filterByHighestLevel(skillMatrix) {
  if (skillMatrix.length === 0) return [];

  // Find the highest level index in the matrix
  const maxLevelIndex = Math.max(
    ...skillMatrix.map((entry) => SKILL_LEVEL_ORDER.indexOf(entry.level)),
  );

  // Keep only skills at that level
  return skillMatrix.filter(
    (entry) => SKILL_LEVEL_ORDER.indexOf(entry.level) === maxLevelIndex,
  );
}

/**
 * Apply agent-specific skill filters
 * Filters to human-only skills and keeps only skills at the highest derived level.
 * This approach respects track modifiers—a broad skill boosted to the same level
 * as primary skills will be included.
 * @param {Array} skillMatrix - Skill matrix entries with derived levels
 * @returns {Array} Filtered skill matrix
 */
export function filterSkillsForAgent(skillMatrix) {
  // First exclude human-only skills
  const withoutHumanOnly = filterHumanOnlySkills(skillMatrix);

  // Then keep only skills at the highest level
  return filterByHighestLevel(withoutHumanOnly);
}

// =============================================================================
// Sorting Functions
// =============================================================================

/**
 * Sort skills by level (highest first)
 * Used for agent profiles where top skills should appear first
 * @param {Array} skillMatrix - Skill matrix entries
 * @returns {Array} Sorted skill matrix (new array)
 */
export function sortByLevelDescending(skillMatrix) {
  return [...skillMatrix].sort((a, b) => {
    const aIndex = SKILL_LEVEL_ORDER.indexOf(a.level);
    const bIndex = SKILL_LEVEL_ORDER.indexOf(b.level);
    return bIndex - aIndex;
  });
}

/**
 * Sort behaviours by maturity (highest first)
 * Used for agent profiles where top behaviours should appear first
 * @param {Array} behaviourProfile - Behaviour profile entries
 * @returns {Array} Sorted behaviour profile (new array)
 */
export function sortByMaturityDescending(behaviourProfile) {
  return [...behaviourProfile].sort((a, b) => {
    const aIndex = BEHAVIOUR_MATURITY_ORDER.indexOf(a.maturity);
    const bIndex = BEHAVIOUR_MATURITY_ORDER.indexOf(b.maturity);
    return bIndex - aIndex;
  });
}

// =============================================================================
// Profile Derivation
// =============================================================================

/**
 * @typedef {Object} ProfileOptions
 * @property {boolean} [excludeHumanOnly=false] - Filter out human-only skills
 * @property {boolean} [keepHighestLevelOnly=false] - Keep only skills at the highest derived level
 * @property {boolean} [sortByLevel=false] - Sort skills by level descending
 * @property {boolean} [sortByMaturity=false] - Sort behaviours by maturity descending
 */

/**
 * @typedef {Object} BaseProfile
 * @property {Array} skillMatrix - Derived skill matrix
 * @property {Array} behaviourProfile - Derived behaviour profile
 * @property {Array} derivedResponsibilities - Derived responsibilities (if capabilities provided)
 * @property {Object} discipline - The discipline
 * @property {Object} track - The track
 * @property {Object} grade - The grade
 */

/**
 * Prepare a base profile shared by jobs and agents
 *
 * This is the unified entry point for profile derivation. Both human jobs
 * and AI agents use this function, with different options:
 *
 * - Human jobs: No filtering, default sorting by type
 * - AI agents: Filter humanOnly, keep only highest-level skills, sort by level
 *
 * @param {Object} params
 * @param {Object} params.discipline - The discipline
 * @param {Object} params.track - The track
 * @param {Object} params.grade - The grade
 * @param {Array} params.skills - All available skills
 * @param {Array} params.behaviours - All available behaviours
 * @param {Array} [params.capabilities] - Optional capabilities for responsibility derivation
 * @param {ProfileOptions} [params.options={}] - Filtering and sorting options
 * @returns {BaseProfile} The prepared profile
 */
export function prepareBaseProfile({
  discipline,
  track,
  grade,
  skills,
  behaviours,
  capabilities,
  options = {},
}) {
  const {
    excludeHumanOnly = false,
    keepHighestLevelOnly = false,
    sortByLevel = false,
    sortByMaturity = false,
  } = options;

  // Core derivation
  let skillMatrix = deriveSkillMatrix({ discipline, grade, track, skills });
  let behaviourProfile = deriveBehaviourProfile({
    discipline,
    grade,
    track,
    behaviours,
  });

  // Apply skill filters
  if (excludeHumanOnly) {
    skillMatrix = filterHumanOnlySkills(skillMatrix);
  }
  if (keepHighestLevelOnly) {
    skillMatrix = filterByHighestLevel(skillMatrix);
  }

  // Apply sorting
  if (sortByLevel) {
    skillMatrix = sortByLevelDescending(skillMatrix);
  }
  if (sortByMaturity) {
    behaviourProfile = sortByMaturityDescending(behaviourProfile);
  }

  // Derive responsibilities if capabilities provided
  let derivedResponsibilities = [];
  if (capabilities && capabilities.length > 0) {
    derivedResponsibilities = deriveResponsibilities({
      skillMatrix,
      capabilities,
      track,
    });
  }

  return {
    skillMatrix,
    behaviourProfile,
    derivedResponsibilities,
    discipline,
    track,
    grade,
  };
}

/**
 * Preset options for agent profile derivation
 * Excludes human-only skills, keeps only skills at the highest derived level,
 * and sorts by level/maturity descending
 */
export const AGENT_PROFILE_OPTIONS = {
  excludeHumanOnly: true,
  keepHighestLevelOnly: true,
  sortByLevel: true,
  sortByMaturity: true,
};

/**
 * Prepare a profile optimized for agent generation
 * Convenience function that applies AGENT_PROFILE_OPTIONS
 * @param {Object} params - Same as prepareBaseProfile, without options
 * @returns {BaseProfile} The prepared profile
 */
export function prepareAgentProfile({
  discipline,
  track,
  grade,
  skills,
  behaviours,
  capabilities,
}) {
  return prepareBaseProfile({
    discipline,
    track,
    grade,
    skills,
    behaviours,
    capabilities,
    options: AGENT_PROFILE_OPTIONS,
  });
}
