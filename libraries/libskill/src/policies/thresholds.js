/**
 * Policy Thresholds, Scores, and Weights
 *
 * Named constants for filter thresholds, scores, and priority weights.
 * Grep for THRESHOLD_, SCORE_, WEIGHT_ to find all policy values.
 */

// =============================================================================
// Match Tier Thresholds
// =============================================================================

/**
 * Match tier score thresholds
 *
 * These thresholds classify the candidate match scores.
 * Adjust them to make the match tiers more lenient or more strict.
 *
 * @see matching.js:classifyMatch
 */
export const THRESHOLD_MATCH_STRONG = 0.85;
export const THRESHOLD_MATCH_GOOD = 0.7;
export const THRESHOLD_MATCH_STRETCH = 0.55;
export const THRESHOLD_MATCH_ASPIRATIONAL = 0;

// =============================================================================
// Gap Score Decay
// =============================================================================

/**
 * Gap score decay values
 *
 * When a candidate has a gap between their level and the job requirement,
 * these scores penalize larger gaps more heavily.
 *
 * @see matching.js:calculateGapScore
 */
export const SCORE_GAP_MEETS = 1.0;
export const SCORE_GAP_MINOR = 0.7;
export const SCORE_GAP_SIGNIFICANT = 0.4;
export const SCORE_GAP_MAJOR = 0.15;
export const SCORE_GAP_ASPIRATIONAL = 0.05;

/** Gap scores indexed by gap size (0-4+) */
export const SCORE_GAP = {
  0: SCORE_GAP_MEETS,
  1: SCORE_GAP_MINOR,
  2: SCORE_GAP_SIGNIFICANT,
  3: SCORE_GAP_MAJOR,
  4: SCORE_GAP_ASPIRATIONAL,
};

// =============================================================================
// Skill Priority Weights
// =============================================================================

/**
 * Skill priority weights by tier
 *
 * Core skills are deep competencies. They get the highest priority.
 * Use these weights to select interview questions and prioritize development.
 *
 * @see interview.js:calculateSkillPriority
 */
export const WEIGHT_SKILL_TYPE_CORE = 30;
export const WEIGHT_SKILL_TYPE_SUPPORTING = 20;
export const WEIGHT_SKILL_TYPE_BROAD = 10;
export const WEIGHT_SKILL_TYPE_TRACK = 5;

/** Skill tier weights as object for lookup */
export const WEIGHT_SKILL_TYPE = {
  core: WEIGHT_SKILL_TYPE_CORE,
  supporting: WEIGHT_SKILL_TYPE_SUPPORTING,
  broad: WEIGHT_SKILL_TYPE_BROAD,
  track: WEIGHT_SKILL_TYPE_TRACK,
};

// =============================================================================
// Capability Priority Boosts
// =============================================================================

/**
 * Capability priority boosts
 *
 * Certain capabilities get additional priority in the AI-era engineering model.
 *
 * @see interview.js:calculateSkillPriority
 */
export const WEIGHT_CAPABILITY_AI = 15;
export const WEIGHT_CAPABILITY_DELIVERY = 5;

/** Capability boosts as object for lookup */
export const WEIGHT_CAPABILITY_BOOST = {
  ai: WEIGHT_CAPABILITY_AI,
  delivery: WEIGHT_CAPABILITY_DELIVERY,
};

// =============================================================================
// Behaviour Priority Weights
// =============================================================================

/**
 * Base behaviour priority weight
 *
 * @see interview.js:calculateBehaviourPriority
 */
export const WEIGHT_BEHAVIOUR_BASE = 15;

/**
 * Behaviour maturity multiplier
 *
 * Each maturity level adds this amount to the priority.
 */
export const WEIGHT_BEHAVIOUR_MATURITY = 3;

// =============================================================================
// Interview Ratios
// =============================================================================

/**
 * Default ratio of interview time allocated to skills vs behaviours
 *
 * 0.6 = 60% skills, 40% behaviours
 */
export const RATIO_SKILL_BEHAVIOUR = 0.6;

// =============================================================================
// Skill Proficiency Multipliers
// =============================================================================

/**
 * Skill proficiency multiplier for priority calculation
 *
 * Higher skill proficiencies get proportionally more priority.
 */
export const WEIGHT_SKILL_PROFICIENCY = 2;

/**
 * Priority penalty for below-level questions
 */
export const WEIGHT_BELOW_LEVEL_PENALTY = -5;

// =============================================================================
// Development Path Weights
// =============================================================================

/**
 * Tier multipliers for development path prioritization
 *
 * Core skills are more critical to develop first.
 */
export const WEIGHT_DEV_TYPE_CORE = 3;
export const WEIGHT_DEV_TYPE_SUPPORTING = 2;
export const WEIGHT_DEV_TYPE_BROAD = 1;

/**
 * AI capability boost for development paths
 *
 * AI skills get extra emphasis in development planning.
 */
export const WEIGHT_DEV_AI_BOOST = 1.5;

// =============================================================================
// Agent Profile Limits
// =============================================================================

/**
 * Maximum number of skills shown in agent profile body
 *
 * The limit applies to the skill index table and the before-handoff
 * checklist. It keeps the agent context focused. All skills are still
 * exported as SKILL.md files. The --skills flag still lists them all.
 *
 * @see agent.js:buildStageProfileBodyData
 */
export const LIMIT_AGENT_PROFILE_SKILLS = 7;

/**
 * Maximum number of working style entries from top behaviours
 * in agent profiles.
 *
 * @see agent.js:buildWorkingStyleFromBehaviours
 */
export const LIMIT_AGENT_WORKING_STYLES = 3;

// =============================================================================
// Interview Time Defaults
// =============================================================================

/**
 * Default expected duration for a standard interview question (minutes)
 */
export const DEFAULT_INTERVIEW_QUESTION_MINUTES = 5;

/**
 * Default expected duration for a decomposition question (minutes)
 */
export const DEFAULT_DECOMPOSITION_QUESTION_MINUTES = 15;

/**
 * Default expected duration for a stakeholder simulation question (minutes)
 */
export const DEFAULT_SIMULATION_QUESTION_MINUTES = 20;

/**
 * Tolerance above the target interview budget before selection stops (minutes)
 *
 * Question selection can go over the time budget by this amount. This
 * keeps interviews from having too few questions.
 */
export const TOLERANCE_INTERVIEW_BUDGET_MINUTES = 5;

// =============================================================================
// Decomposition Capability Weights
// =============================================================================

/**
 * Capability priority weights for decomposition interviews
 *
 * Delivery and scale capabilities are typically more important for
 * system decomposition questions.
 *
 * @see interview.js:calculateCapabilityPriority
 */
export const WEIGHT_CAPABILITY_DECOMP_DELIVERY = 10;
export const WEIGHT_CAPABILITY_DECOMP_SCALE = 8;
export const WEIGHT_CAPABILITY_DECOMP_RELIABILITY = 6;

/**
 * Priority boost for focus-area questions in focused interviews
 *
 * @see interview.js:deriveFocusedInterview
 */
export const WEIGHT_FOCUS_BOOST = 10;

// =============================================================================
// Senior Level Threshold
// =============================================================================

/**
 * Minimum ordinalRank that makes a level "senior" (Staff+)
 *
 * Job matching uses this threshold to decide when the additional
 * expectations score applies.
 *
 * @see derivation.js:isSeniorLevel
 */
export const THRESHOLD_SENIOR_LEVEL = 5;

// =============================================================================
// Assessment Weights
// =============================================================================

/**
 * Default skill weight when the track does not specify assessment weights
 */
export const WEIGHT_ASSESSMENT_SKILL_DEFAULT = 0.5;

/**
 * Default behaviour weight when the track does not specify assessment weights
 */
export const WEIGHT_ASSESSMENT_BEHAVIOUR_DEFAULT = 0.5;

/**
 * Base weight for the overall score in senior role matching
 * (non-expectations portion)
 */
export const WEIGHT_SENIOR_BASE = 0.9;

/**
 * Weight for expectations score bonus in senior role matching
 */
export const WEIGHT_SENIOR_EXPECTATIONS = 0.1;

// =============================================================================
// Match Result Limits
// =============================================================================

/**
 * Number of top-priority gaps to surface in match analysis
 */
export const LIMIT_PRIORITY_GAPS = 3;

/**
 * Score bonus for same-track candidates in next-step job matching
 */
export const WEIGHT_SAME_TRACK_BONUS = 0.1;

// =============================================================================
// Realistic Match Filtering
// =============================================================================

/**
 * Level offset (±) from best-fit level for realistic match filtering
 */
export const RANGE_LEVEL_OFFSET = 1;

/**
 * Level offset below highest strong/good match for ready-tier filtering
 *
 * The output shows Strong and Good matches up to this many levels below
 * the highest matched level. It shows Stretch and Aspirational matches
 * only at or above the highest matched level.
 */
export const RANGE_READY_LEVEL_OFFSET = 2;

// =============================================================================
// Driver Coverage Thresholds
// =============================================================================

/**
 * Minimum skill proficiency for a skill to count as "covered" in driver
 * analysis
 */
export const THRESHOLD_DRIVER_SKILL_PROFICIENCY = "working";

/**
 * Minimum behaviour maturity for a behaviour to count as "covered" in
 * driver analysis
 */
export const THRESHOLD_DRIVER_BEHAVIOUR_MATURITY = "practicing";
