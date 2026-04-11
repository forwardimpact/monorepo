/**
 * JSON formatter for the `risks` command.
 */

import { Audience } from "../../lib/audience.js";

/**
 * Render a TeamRisks object as a plain JSON-serializable object.
 *
 * @param {object} params
 * @param {import("../../aggregation/coverage.js").TeamCoverage} params.coverage
 * @param {import("../../aggregation/risks.js").TeamRisks} params.risks
 * @param {string} params.audience
 * @returns {object}
 */
export function risksToJson({ coverage, risks, audience }) {
  const directorMode = audience === Audience.DIRECTOR;
  return {
    team: coverage.teamId,
    members: coverage.memberCount,
    singlePoints: risks.singlePointsOfFailure.map((spof) => ({
      skill: spof.skillId,
      severity: spof.severity,
      holder: directorMode
        ? {
            proficiency: spof.holder.proficiency,
            allocation: spof.holder.allocation,
          }
        : spof.holder,
    })),
    criticalGaps: risks.criticalGaps.map((gap) => ({
      skill: gap.skillId,
      requiredLevel: "working",
      reason: gap.reason,
    })),
    concentrationRisks: risks.concentrationRisks.map((risk) => ({
      capability: risk.capabilityId,
      level: risk.level,
      proficiency: risk.proficiency,
      count: risk.count,
    })),
  };
}
