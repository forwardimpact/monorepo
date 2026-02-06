/**
 * Policy Module Index
 *
 * Re-exports all policy constants, predicates, filters, and orderings.
 *
 * Usage:
 *   import { THRESHOLD_MATCH_STRONG, isAgentEligible, filterHighestLevel }
 *     from "@forwardimpact/model/policies";
 */

// Thresholds, scores, and weights
export {
  // Match tier thresholds
  THRESHOLD_MATCH_STRONG,
  THRESHOLD_MATCH_GOOD,
  THRESHOLD_MATCH_STRETCH,
  THRESHOLD_MATCH_ASPIRATIONAL,
  // Gap scores
  SCORE_GAP_MEETS,
  SCORE_GAP_MINOR,
  SCORE_GAP_SIGNIFICANT,
  SCORE_GAP_MAJOR,
  SCORE_GAP_ASPIRATIONAL,
  SCORE_GAP,
  // Skill type weights
  WEIGHT_SKILL_TYPE_PRIMARY,
  WEIGHT_SKILL_TYPE_SECONDARY,
  WEIGHT_SKILL_TYPE_BROAD,
  WEIGHT_SKILL_TYPE_TRACK,
  WEIGHT_SKILL_TYPE,
  // Capability boosts
  WEIGHT_CAPABILITY_AI,
  WEIGHT_CAPABILITY_DELIVERY,
  WEIGHT_CAPABILITY_BOOST,
  // Behaviour weights
  WEIGHT_BEHAVIOUR_BASE,
  WEIGHT_BEHAVIOUR_MATURITY,
  // Interview ratios
  RATIO_SKILL_BEHAVIOUR,
  // Level multipliers
  WEIGHT_SKILL_LEVEL,
  WEIGHT_BELOW_LEVEL_PENALTY,
  // Development path weights
  WEIGHT_DEV_TYPE_PRIMARY,
  WEIGHT_DEV_TYPE_SECONDARY,
  WEIGHT_DEV_TYPE_BROAD,
  WEIGHT_DEV_AI_BOOST,
} from "./thresholds.js";

// Predicates
export {
  // Identity
  isAny,
  isNone,
  // Human-only
  isHumanOnly,
  isAgentEligible,
  // Skill types
  isPrimary,
  isSecondary,
  isBroad,
  isTrack,
  isCore,
  isSupporting,
  // Skill levels
  hasMinLevel,
  hasLevel,
  hasBelowLevel,
  // Capabilities
  isInCapability,
  isInAnyCapability,
  // Combinators
  allOf,
  anyOf,
  not,
} from "./predicates.js";

// Filters
export {
  filterHighestLevel,
  filterAboveAwareness,
  filterBy,
  applyFilters,
  composeFilters,
} from "./filters.js";

// Orderings
export {
  // Canonical orders
  ORDER_SKILL_TYPE,
  ORDER_STAGE,
  ORDER_AGENT_STAGE,
  // Skill comparators
  compareByLevelDesc,
  compareByLevelAsc,
  compareByType,
  compareByName,
  compareBySkillPriority,
  compareByTypeAndName,
  // Capability comparators
  compareByCapability,
  sortSkillsByCapability,
  // Behaviour comparators
  compareByMaturityDesc,
  compareByMaturityAsc,
  compareByBehaviourName,
  compareByBehaviourPriority,
  // Generic comparators
  compareByOrder,
  chainComparators,
  // Change comparators
  compareBySkillChange,
  compareByBehaviourChange,
} from "./orderings.js";

// Composed policies
export {
  // Agent skill filtering
  filterAgentSkills,
  filterToolkitSkills,
  // Sorting
  sortAgentSkills,
  sortAgentBehaviours,
  sortJobSkills,
  // Combined filter + sort
  prepareAgentSkillMatrix,
  prepareAgentBehaviourProfile,
} from "./composed.js";
