/**
 * Composed Policy Definitions
 *
 * This module composes named policies for specific use cases.
 * Each POLICY_* export defines a complete strategy to filter and sort.
 *
 * The code that consumes this module uses these high-level policies.
 */

import { isAgentEligible } from "./predicates.js";
import { filterHighestLevel, composeFilters } from "./filters.js";
import {
  compareByLevelDesc,
  compareByMaturityDesc,
  compareByTypeAndName,
  compareBySkillFocusPriority,
} from "./orderings.js";
import { LIMIT_AGENT_PROFILE_SKILLS } from "./thresholds.js";

// =============================================================================
// Agent Skill Policies
// =============================================================================

/**
 * Filter for agent-eligible skills at highest derived level
 *
 * Agents receive skills after these steps:
 * 1. Exclude human-only skills (isAgentEligible)
 * 2. Keep only skills at the highest derived level
 *
 * This makes sure agents focus on their peak competencies. It also
 * respects track modifiers. The filter includes a broad skill that a
 * modifier boosts to the same level as core skills.
 */
export const filterAgentSkills = composeFilters(
  isAgentEligible,
  filterHighestLevel,
);

// =============================================================================
// Toolkit Extraction Policy
// =============================================================================

/**
 * Filter for toolkit extraction
 *
 * Tools are extracted only from highest-level skills.
 * This keeps the toolkit focused on core competencies.
 */
export const filterToolkitSkills = composeFilters(filterHighestLevel);

// =============================================================================
// Sort Policies
// =============================================================================

/**
 * Sort skills for agent profiles (level descending)
 * @param {Array} skills - Skill matrix entries
 * @returns {Array} Sorted skills (new array)
 */
export function sortAgentSkills(skills) {
  return [...skills].sort(compareByLevelDesc);
}

/**
 * Sort behaviours for agent profiles (maturity descending)
 * @param {Array} behaviours - Behaviour profile entries
 * @returns {Array} Sorted behaviours (new array)
 */
export function sortAgentBehaviours(behaviours) {
  return [...behaviours].sort(compareByMaturityDesc);
}

/**
 * Sort skills for job display (type ascending, then name)
 * @param {Array} skills - Skill matrix entries
 * @returns {Array} Sorted skills (new array)
 */
export function sortJobSkills(skills) {
  return [...skills].sort(compareByTypeAndName);
}

// =============================================================================
// Agent Profile Focus Policy
// =============================================================================

/**
 * Select the focused subset of agent skills for the profile body
 *
 * Agent profiles include a limited skill index to avoid context bloat.
 * This function ranks skills by priority (level desc, type asc,
 * capability ordinalRank asc). It returns the top N skills, where
 * N = LIMIT_AGENT_PROFILE_SKILLS.
 *
 * All skills are still exported as SKILL.md files. The --skills flag
 * lists them.
 *
 * @param {Array} skills - Agent-eligible skills (already filtered and sorted)
 * @returns {Array} Top N skills by priority
 */
export function focusAgentSkills(skills) {
  return [...skills]
    .sort(compareBySkillFocusPriority)
    .slice(0, LIMIT_AGENT_PROFILE_SKILLS);
}

// =============================================================================
// Combined Filter + Sort Policies
// =============================================================================

/**
 * Prepare skills for agent profile generation
 *
 * Complete pipeline:
 * 1. Filter to agent-eligible skills
 * 2. Keep only highest-level skills
 * 3. Sort by level descending
 *
 * @param {Array} skillMatrix - Full skill matrix
 * @returns {Array} Filtered and sorted skills
 */
export function prepareAgentSkillMatrix(skillMatrix) {
  const filtered = filterAgentSkills(skillMatrix);
  return sortAgentSkills(filtered);
}

/**
 * Prepare behaviours for agent profile generation
 *
 * Sorts by maturity descending (highest first).
 *
 * @param {Array} behaviourProfile - Full behaviour profile
 * @returns {Array} Sorted behaviours
 */
export function prepareAgentBehaviourProfile(behaviourProfile) {
  return sortAgentBehaviours(behaviourProfile);
}
