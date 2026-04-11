/**
 * @forwardimpact/libskill
 *
 * Pure business logic for Engineering Pathway framework.
 *
 * The root index exports only symbols consumed outside libskill.
 * Internal helpers and policy items are available via subpath imports:
 *   @forwardimpact/libskill/derivation
 *   @forwardimpact/libskill/matching
 *   @forwardimpact/libskill/progression
 *   @forwardimpact/libskill/interview
 *   @forwardimpact/libskill/policies
 *   @forwardimpact/libskill/agent
 *   @forwardimpact/libskill/job-cache
 *   @forwardimpact/libskill/profile
 */

// Core derivation
export {
  deriveSkillMatrix,
  deriveBehaviourProfile,
  generateJobTitle,
  generateJobId,
  deriveJob,
  getDisciplineSkillIds,
  getSkillTypeForDiscipline,
  generateAllJobs,
} from "./derivation.js";

export { isValidJobCombination } from "./derivation-validation.js";
export { deriveResponsibilities } from "./derivation-responsibilities.js";

// Job operations
export {
  prepareJobDetail,
  prepareJobSummary,
  prepareJobBuilderPreview,
} from "./job.js";

// Job caching
export { buildJobKey, createJobCache } from "./job-cache.js";

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
  calculateJobMatch,
  findMatchingJobs,
  estimateBestFitLevel,
  findRealisticMatches,
} from "./matching.js";

// Development path and candidate analysis
export {
  deriveDevelopmentPath,
  findNextStepJob,
  analyzeCandidate,
} from "./matching-development.js";

// Progression
export {
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
export { deriveInterviewQuestions } from "./interview.js";

export {
  deriveMissionFitInterview,
  deriveDecompositionInterview,
  deriveStakeholderInterview,
} from "./interview-specialized.js";

// Agent generation
export {
  deriveReferenceLevel,
  getDisciplineAbbreviation,
  toKebabCase,
  deriveAgentSkills,
  deriveAgentBehaviours,
  generateSkillMarkdown,
  deriveStageTransitions,
} from "./agent.js";

export {
  validateAgentProfile,
  validateAgentSkill,
} from "./agent-validation.js";

export {
  deriveStageAgent,
  generateStageAgentProfile,
  buildAgentIndex,
  interpolateTeamInstructions,
} from "./agent-stage.js";

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
