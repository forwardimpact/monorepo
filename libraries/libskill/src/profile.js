/**
 * Unified Profile Derivation
 *
 * Shared functions that derive skill and behaviour profiles for both
 * human jobs and AI agents.
 *
 * - prepareBaseProfile() - core derivation (skills, behaviours,
 *   responsibilities)
 * - prepareAgentProfile() - agent-specific derivation with composed policies
 *
 * @see policies/composed.js - Policies that filter and sort agent profiles
 */

import {
  deriveSkillMatrix,
  deriveBehaviourProfile,
  deriveResponsibilities,
} from "./derivation.js";

import {
  prepareAgentSkillMatrix,
  prepareAgentBehaviourProfile,
} from "./policies/composed.js";

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Build a set of capabilities with positive track modifiers
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

// =============================================================================
// Profile Derivation
// =============================================================================

/**
 * @typedef {Object} BaseProfile
 * @property {Array} skillMatrix - Derived skill matrix
 * @property {Array} behaviourProfile - Derived behaviour profile
 * @property {Array} derivedResponsibilities - Derived responsibilities
 *   (if you pass capabilities)
 * @property {Object} discipline - The discipline
 * @property {Object} track - The track
 * @property {Object} level - The level
 */

/**
 * Prepare a base profile with raw derivation
 *
 * Jobs and agents share this entry point for core derivation. It
 * produces the raw skill matrix, behaviour profile, and responsibilities.
 * It does not filter or sort them. Consumers apply policies as needed:
 *
 * - Human jobs: use the raw output directly (derivation sorts it by type)
 * - AI agents: use prepareAgentProfile() which applies composed policies
 *
 * @param {Object} params
 * @param {Object} params.discipline - The discipline
 * @param {Object} params.track - The track
 * @param {Object} params.level - The level
 * @param {Array} params.skills - All available skills
 * @param {Array} params.behaviours - All available behaviours
 * @param {Array} [params.capabilities] - Optional capabilities to derive
 *   responsibilities from
 * @returns {BaseProfile} The prepared profile
 */
export function prepareBaseProfile({
  discipline,
  track,
  level,
  skills,
  behaviours,
  capabilities,
}) {
  // Core derivation
  const skillMatrix = deriveSkillMatrix({
    discipline,
    level,
    track,
    skills,
    capabilities,
  });
  const behaviourProfile = deriveBehaviourProfile({
    discipline,
    level,
    track,
    behaviours,
  });

  // Derive responsibilities if the caller passes capabilities
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
    level,
  };
}

/**
 * Prepare a profile optimized for agent generation
 *
 * It applies agent-specific policies from composed.js:
 * - Excludes human-only skills
 * - Keeps only skills at the highest derived level
 * - Sorts skills by level descending
 * - Sorts behaviours by maturity descending
 *
 * @param {Object} params - Same as prepareBaseProfile
 * @returns {BaseProfile} The prepared profile with agent policies applied
 */
export function prepareAgentProfile({
  discipline,
  track,
  level,
  skills,
  behaviours,
  capabilities,
}) {
  const base = prepareBaseProfile({
    discipline,
    track,
    level,
    skills,
    behaviours,
    capabilities,
  });

  return {
    ...base,
    skillMatrix: prepareAgentSkillMatrix(base.skillMatrix),
    behaviourProfile: prepareAgentBehaviourProfile(base.behaviourProfile),
  };
}
