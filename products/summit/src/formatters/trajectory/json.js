/**
 * JSON formatter for the `trajectory` command.
 */

/**
 * @param {import("../../aggregation/trajectory.js").TeamTrajectory} trajectory
 * @returns {object}
 */
export function trajectoryToJson(trajectory) {
  return {
    team: trajectory.teamId,
    quarters: trajectory.quarters.map((q) => ({
      quarter: q.quarter,
      members: q.memberCount,
      rosterChanges: q.rosterChanges,
      coverage: Object.fromEntries(
        Object.entries(q.coverage).map(([skillId, depth]) => [
          skillId,
          { depth },
        ]),
      ),
    })),
    persistentGaps: trajectory.persistentGaps,
    trends: trajectory.trends,
  };
}
