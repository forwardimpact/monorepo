/**
 * @forwardimpact/summit
 *
 * Team capability planning from skill data. Public API re-exports.
 * This package grew across parts. Downstream consumers (currently
 * Landmark) import from here.
 */

export {
  loadRoster,
  loadRosterFromMap,
  parseRosterYaml,
  validateRosterAgainstStandard,
} from "./roster/index.js";
export {
  createSummitClient,
  SupabaseUnavailableError,
} from "./lib/supabase.js";
export {
  applyScenario,
  bucketCommitsByQuarter,
  computeCoverage,
  computeEffectiveDepth,
  computeGrowthAlignment,
  computeTrajectory,
  CONCENTRATION_THRESHOLD,
  derivePersonMatrix,
  detectConcentrationRisks,
  detectCriticalGaps,
  detectRisks,
  detectSinglePointsOfFailure,
  diffCoverage,
  diffRisks,
  EmptyTeamError,
  GrowthContractError,
  meetsWorking,
  parseJobExpression,
  parseScenario,
  rankCandidates,
  resolveTeam,
  ScenarioError,
  ScenarioType,
  TeamNotFoundError,
  UnknownJobFieldError,
} from "./aggregation/index.js";
export { GitUnavailableError, listCommits, showFileAt } from "./git/history.js";
export {
  Audience,
  resolveAudience,
  withAudienceFilter,
} from "./lib/audience.js";
export {
  decorateCoverageWithEvidence,
  decorateRisksWithEvidence,
  EvidenceUnavailableError,
  loadEvidence,
} from "./evidence/index.js";
export {
  decorateRecommendationsWithOutcomes,
  loadDriverScores,
  mapSkillsToDrivers,
} from "./outcomes/index.js";
