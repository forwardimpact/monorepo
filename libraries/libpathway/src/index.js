/**
 * @forwardimpact/libpathway
 *
 * Pure business logic for Engineering Pathway framework.
 */

// Core derivation
export {
  buildSkillTypeMap,
  getSkillTypeForDiscipline,
  findMaxBaseSkillProficiency,
  deriveSkillProficiency,
  deriveBehaviourMaturity,
  deriveSkillMatrix,
  deriveBehaviourProfile,
  isValidJobCombination,
  generateJobTitle,
  deriveResponsibilities,
  deriveJob,
  calculateDriverCoverage,
  getDisciplineSkillIds,
  getLevelRank,
  isSeniorLevel,
  generateAllJobs,
} from "./derivation.js";

// Job operations
export {
  prepareJobDetail,
  prepareJobSummary,
  prepareJobBuilderPreview,
} from "./job.js";

// Job caching
export {
  buildJobKey,
  getOrCreateJob,
  clearCache,
  invalidateCachedJob,
  getCachedJobCount,
} from "./job-cache.js";

// Modifiers
export {
  isCapability,
  getSkillsByCapability,
  buildCapabilityToSkillsMap,
  expandModifiersToSkills,
  extractCapabilityModifiers,
  extractSkillModifiers,
  resolveSkillModifier,
} from "./modifiers.js";

// Matching
export {
  MatchTier,
  CONFIG_MATCH_TIER,
  classifyMatch,
  GAP_SCORES,
  calculateGapScore,
  calculateJobMatch,
  findMatchingJobs,
  estimateBestFitLevel,
  findRealisticMatches,
  deriveDevelopmentPath,
  findNextStepJob,
  analyzeCandidate,
} from "./matching.js";

// Progression
export {
  calculateSkillChanges,
  calculateBehaviourChanges,
  analyzeProgression,
  analyzeLevelProgression,
  analyzeTrackComparison,
  getValidTracksForComparison,
  getNextLevel,
  getPreviousLevel,
  analyzeCustomProgression,
  getValidLevelTrackCombinations,
} from "./progression.js";

// Interview
export {
  deriveInterviewQuestions,
  deriveShortInterview,
  deriveBehaviourQuestions,
  deriveFocusedInterview,
  deriveMissionFitInterview,
  deriveDecompositionInterview,
  deriveStakeholderInterview,
} from "./interview.js";

// Agent generation
export {
  deriveReferenceLevel,
  getDisciplineAbbreviation,
  toKebabCase,
  deriveAgentSkills,
  deriveAgentBehaviours,
  generateSkillMarkdown,
  validateAgentProfile,
  validateAgentSkill,
  deriveHandoffs,
  deriveStageAgent,
  generateStageAgentProfile,
  buildAgentIndex,
} from "./agent.js";

// Checklists
export { deriveChecklist, formatChecklistMarkdown } from "./checklist.js";

// Toolkit
export { deriveToolkit } from "./toolkit.js";

// Profile derivation
export {
  getPositiveTrackCapabilities,
  prepareBaseProfile,
  prepareAgentProfile,
} from "./profile.js";

// Policies - re-export key items for convenience
export {
  // Thresholds
  THRESHOLD_MATCH_STRONG,
  THRESHOLD_MATCH_GOOD,
  THRESHOLD_MATCH_STRETCH,
  THRESHOLD_MATCH_ASPIRATIONAL,
  SCORE_GAP,
  WEIGHT_SKILL_TYPE,
  WEIGHT_CAPABILITY_BOOST,
  // Interview thresholds
  DEFAULT_INTERVIEW_QUESTION_MINUTES,
  DEFAULT_DECOMPOSITION_QUESTION_MINUTES,
  DEFAULT_SIMULATION_QUESTION_MINUTES,
  TOLERANCE_INTERVIEW_BUDGET_MINUTES,
  WEIGHT_CAPABILITY_DECOMP_DELIVERY,
  WEIGHT_CAPABILITY_DECOMP_SCALE,
  WEIGHT_CAPABILITY_DECOMP_RELIABILITY,
  WEIGHT_FOCUS_BOOST,
  // Senior level
  THRESHOLD_SENIOR_LEVEL,
  // Assessment weights
  WEIGHT_ASSESSMENT_SKILL_DEFAULT,
  WEIGHT_ASSESSMENT_BEHAVIOUR_DEFAULT,
  WEIGHT_SENIOR_BASE,
  WEIGHT_SENIOR_EXPECTATIONS,
  // Match limits
  LIMIT_PRIORITY_GAPS,
  WEIGHT_SAME_TRACK_BONUS,
  RANGE_LEVEL_OFFSET,
  RANGE_READY_LEVEL_OFFSET,
  // Driver coverage
  THRESHOLD_DRIVER_SKILL_PROFICIENCY,
  THRESHOLD_DRIVER_BEHAVIOUR_MATURITY,
  // Agent limits
  LIMIT_AGENT_PROFILE_SKILLS,
  LIMIT_AGENT_WORKING_STYLES,
  // Predicates
  isHumanOnly,
  isAgentEligible,
  isPrimary,
  isSecondary,
  isBroad,
  isTrack,
  isCore,
  isSupporting,
  hasMinLevel,
  allOf,
  anyOf,
  not,
  // Filters
  filterHighestLevel,
  filterAboveAwareness,
  applyFilters,
  composeFilters,
  // Orderings
  ORDER_SKILL_TYPE,
  getStageOrder,
  compareByStageOrder,
  compareByLevelDesc,
  compareByType,
  compareBySkillPriority,
  compareByMaturityDesc,
  compareByBehaviourPriority,
  // Composed policies
  filterAgentSkills,
  filterToolkitSkills,
  focusAgentSkills,
  sortAgentSkills,
  sortAgentBehaviours,
  prepareAgentSkillMatrix,
  prepareAgentBehaviourProfile,
} from "./policies/index.js";
