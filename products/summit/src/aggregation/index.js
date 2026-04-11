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
export { applyScenario, diffCoverage, diffRisks } from "./what-if.js";
export {
  parseJobExpression,
  parseScenario,
  ScenarioError,
  ScenarioType,
} from "./scenarios.js";
export {
  computeGrowthAlignment,
  GrowthContractError,
  rankCandidates,
} from "./growth.js";
export { bucketCommitsByQuarter, computeTrajectory } from "./trajectory.js";
