/**
 * Policy Module Index
 *
 * Re-exports all policy constants, predicates, filters, and orderings.
 *
 * Usage:
 *   import { THRESHOLD_MATCH_STRONG, isAgentEligible, filterHighestLevel }
 *     from "@forwardimpact/libpathway/policies";
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
  WEIGHT_SKILL_PROFICIENCY,
  WEIGHT_BELOW_LEVEL_PENALTY,
  // Development path weights
  WEIGHT_DEV_TYPE_PRIMARY,
  WEIGHT_DEV_TYPE_SECONDARY,
  WEIGHT_DEV_TYPE_BROAD,
  WEIGHT_DEV_AI_BOOST,
  // Agent profile limits
  LIMIT_AGENT_PROFILE_SKILLS,
  LIMIT_AGENT_WORKING_STYLES,
  // Interview time defaults
  DEFAULT_INTERVIEW_QUESTION_MINUTES,
  DEFAULT_DECOMPOSITION_QUESTION_MINUTES,
  DEFAULT_SIMULATION_QUESTION_MINUTES,
  TOLERANCE_INTERVIEW_BUDGET_MINUTES,
  // Decomposition capability weights
  WEIGHT_CAPABILITY_DECOMP_DELIVERY,
  WEIGHT_CAPABILITY_DECOMP_SCALE,
  WEIGHT_CAPABILITY_DECOMP_RELIABILITY,
  WEIGHT_FOCUS_BOOST,
  // Senior level threshold
  THRESHOLD_SENIOR_LEVEL,
  // Assessment weights
  WEIGHT_ASSESSMENT_SKILL_DEFAULT,
  WEIGHT_ASSESSMENT_BEHAVIOUR_DEFAULT,
  WEIGHT_SENIOR_BASE,
  WEIGHT_SENIOR_EXPECTATIONS,
  // Match result limits
  LIMIT_PRIORITY_GAPS,
  WEIGHT_SAME_TRACK_BONUS,
  // Realistic match filtering
  RANGE_LEVEL_OFFSET,
  RANGE_READY_LEVEL_OFFSET,
  // Driver coverage thresholds
  THRESHOLD_DRIVER_SKILL_PROFICIENCY,
  THRESHOLD_DRIVER_BEHAVIOUR_MATURITY,
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
  // Skill proficiencies
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
  // Data-driven stage ordering
  getStageOrder,
  compareByStageOrder,
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
  // Agent profile focus
  focusAgentSkills,
  // Sorting
  sortAgentSkills,
  sortAgentBehaviours,
  sortJobSkills,
  // Combined filter + sort
  prepareAgentSkillMatrix,
  prepareAgentBehaviourProfile,
} from "./composed.js";
