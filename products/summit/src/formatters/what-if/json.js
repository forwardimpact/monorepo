/**
 * JSON formatter for the `what-if` command.
 */

/**
 * @param {object} params
 * @param {import("../../aggregation/scenarios.js").Scenario} params.scenario
 * @param {object} params.coverageDiff
 * @param {object} params.riskDiff
 * @returns {object}
 */
export function whatIfToJson({ scenario, coverageDiff, riskDiff }) {
  return {
    scenario,
    diff: {
      capabilityChanges: coverageDiff.capabilityChanges,
      riskChanges: riskDiff,
    },
  };
}
