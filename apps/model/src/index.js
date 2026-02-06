/**
 * @forwardimpact/model
 *
 * Pure business logic for Engineering Pathway framework.
 */

// Core derivation
export {
  buildSkillTypeMap,
  getSkillTypeForDiscipline,
  findMaxBaseSkillLevel,
  deriveSkillLevel,
  deriveBehaviourMaturity,
  deriveSkillMatrix,
  deriveBehaviourProfile,
  isValidJobCombination,
  generateJobTitle,
  deriveResponsibilities,
  deriveJob,
  calculateDriverCoverage,
  getDisciplineSkillIds,
  getGradeLevel,
  isSeniorGrade,
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
  makeJobKey,
  getOrCreateJob,
  clearJobCache,
  invalidateJob,
  getCacheSize,
} from "./job-cache.js";

// Modifiers
export {
  isCapability,
  getSkillsByCapability,
  buildCapabilityToSkillsMap,
  expandSkillModifiers,
  extractCapabilityModifiers,
  extractIndividualModifiers,
  resolveSkillModifier,
} from "./modifiers.js";

// Matching
export {
  MatchTier,
  MATCH_TIER_CONFIG,
  classifyMatchTier,
  GAP_SCORES,
  calculateGapScore,
  calculateJobMatch,
  findMatchingJobs,
  estimateBestFitGrade,
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
  analyzeGradeProgression,
  analyzeTrackComparison,
  getValidTracksForComparison,
  getNextGrade,
  getPreviousGrade,
  analyzeCustomProgression,
  getValidGradeTrackCombinations,
} from "./progression.js";

// Interview
export {
  deriveInterviewQuestions,
  deriveShortInterview,
  deriveBehaviourQuestions,
  deriveFocusedInterview,
} from "./interview.js";

// Agent generation
export {
  deriveReferenceGrade,
  getDisciplineAbbreviation,
  toKebabCase,
  deriveAgentSkills,
  deriveAgentBehaviours,
  generateSkillMd,
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

// Profile filtering (for agents)
export {
  getPositiveTrackCapabilities,
  filterHumanOnlySkills,
  filterByHighestLevel,
  filterSkillsForAgent,
  sortByLevelDescending,
  sortByMaturityDescending,
  prepareBaseProfile,
  AGENT_PROFILE_OPTIONS,
  prepareAgentProfile,
} from "./profile.js";
