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
  computeCoverage,
  computeEffectiveDepth,
  CONCENTRATION_THRESHOLD,
  derivePersonMatrix,
  detectConcentrationRisks,
  detectCriticalGaps,
  detectRisks,
  detectSinglePointsOfFailure,
  diffCoverage,
  diffRisks,
  EmptyTeamError,
  meetsWorking,
  parseJobExpression,
  parseScenario,
  resolveTeam,
  ScenarioError,
  ScenarioType,
  TeamNotFoundError,
  UnknownJobFieldError,
} from "./aggregation/index.js";
export {
  Audience,
  resolveAudience,
  withAudienceFilter,
} from "./lib/audience.js";
