/**
 * JSON formatter for the `what-if` command.
 */

/**
 * @param {object} params
 * @param {import("../../aggregation/what-if.js").WhatIfReport} params.report
 * @returns {object}
 */
export function whatIfToJson({ report }) {
  const { scenario, teamDiffs } = report;
  if (scenario.type === "move") {
    return {
      scenario,
      diff: {
        teams: teamDiffs.map((td) => ({
          teamId: td.teamId,
          role: td.role,
          capabilityChanges: td.coverageDiff.capabilityChanges,
          riskChanges: td.riskDiff,
        })),
      },
    };
  }
  const td = teamDiffs[0];
  return {
    scenario,
    diff: {
      capabilityChanges: td.coverageDiff.capabilityChanges,
      riskChanges: td.riskDiff,
    },
  };
}
