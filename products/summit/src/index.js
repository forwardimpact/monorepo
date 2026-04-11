/**
 * @forwardimpact/summit
 *
 * Team capability planning from skill data. Public API re-exports.
 * Grown across parts — downstream consumers (currently Landmark) import
 * from here.
 */

export {
  loadRoster,
  loadRosterFromMap,
  parseRosterYaml,
  validateRosterAgainstFramework,
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
