/**
 * JSON formatter for the `compare` command.
 */

/**
 * @param {object} params
 * @param {import("../../aggregation/coverage.js").TeamCoverage} params.left
 * @param {import("../../aggregation/coverage.js").TeamCoverage} params.right
 * @param {object} params.coverageDiff
 * @param {object} params.riskDiff
 * @returns {object}
 */
export function compareToJson({ left, right, coverageDiff, riskDiff }) {
  return {
    left: {
      team: left.teamId,
      members: left.memberCount,
      effectiveFte: left.effectiveFte,
    },
    right: {
      team: right.teamId,
      members: right.memberCount,
      effectiveFte: right.effectiveFte,
    },
    coverage: coverageDiff,
    risks: riskDiff,
  };
}
