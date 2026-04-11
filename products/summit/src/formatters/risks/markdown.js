/**
 * Minimal markdown formatter for the `risks` command.
 */

/**
 * @param {object} params
 * @param {import("../../aggregation/coverage.js").TeamCoverage} params.coverage
 * @param {import("../../aggregation/risks.js").TeamRisks} params.risks
 * @returns {string}
 */
export function risksToMarkdown({ coverage, risks }) {
  const lines = [];
  lines.push(`# ${coverage.teamId} structural risks`);
  lines.push("");

  lines.push("## Single points of failure");
  if (risks.singlePointsOfFailure.length === 0) {
    lines.push("- (none detected)");
  } else {
    for (const spof of risks.singlePointsOfFailure) {
      const holder = spof.holder.name ?? spof.holder.email ?? "one engineer";
      lines.push(`- **${spof.skillId}** — ${holder} (${spof.severity})`);
    }
  }
  lines.push("");

  lines.push("## Critical gaps");
  if (risks.criticalGaps.length === 0) {
    lines.push("- (none detected)");
  } else {
    for (const gap of risks.criticalGaps) {
      lines.push(`- **${gap.skillId}** — ${gap.reason}`);
    }
  }
  lines.push("");

  lines.push("## Concentration risks");
  if (risks.concentrationRisks.length === 0) {
    lines.push("- (none detected)");
  } else {
    for (const risk of risks.concentrationRisks) {
      lines.push(
        `- **${risk.capabilityId}** — ${risk.count}/${risk.totalMembers} engineers at ${risk.level} ${risk.proficiency}`,
      );
    }
  }

  return lines.join("\n") + "\n";
}
