/**
 * Public barrel for Summit's aggregation surface.
 *
 * Exports grow across parts — see plan-a.md "Data Model" for the
 * complete shape list.
 */

export {
  computeCoverage,
  derivePersonMatrix,
  resolveTeam,
} from "./coverage.js";
export { computeEffectiveDepth, meetsWorking } from "./depth.js";
export {
  EmptyTeamError,
  TeamNotFoundError,
  UnknownJobFieldError,
} from "./errors.js";
export {
  CONCENTRATION_THRESHOLD,
  detectConcentrationRisks,
  detectCriticalGaps,
  detectRisks,
  detectSinglePointsOfFailure,
} from "./risks.js";
