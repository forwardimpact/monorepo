/**
 * Text formatter for the `risks` command.
 */

import { Audience } from "../../lib/audience.js";

/**
 * Render a TeamRisks object as plain text.
 *
 * @param {object} params
 * @param {import("../../aggregation/coverage.js").TeamCoverage} params.coverage
 * @param {import("../../aggregation/risks.js").TeamRisks} params.risks
 * @param {object} params.data
 * @param {string} params.audience
 * @returns {string}
 */
export function risksToText({ coverage, risks, data, audience }) {
  const lines = [];
  lines.push(`  ${coverage.teamId} team — structural risks`);
  lines.push("");

  lines.push("  Single points of failure:");
  if (risks.singlePointsOfFailure.length === 0) {
    lines.push("    (none detected)");
  } else {
    for (const spof of risks.singlePointsOfFailure) {
      lines.push(formatSpof(spof, audience));
    }
  }
  lines.push("");

  lines.push("  Critical gaps:");
  if (risks.criticalGaps.length === 0) {
    lines.push("    (none detected)");
  } else {
    for (const gap of risks.criticalGaps) {
      lines.push(`    ${gap.skillId} — no engineer at working level`);
      lines.push(`      ${gap.reason}.`);
    }
  }
  lines.push("");

  lines.push("  Concentration risks:");
  if (risks.concentrationRisks.length === 0) {
    lines.push("    (none detected)");
  } else {
    for (const risk of risks.concentrationRisks) {
      const capabilityName =
        (data.capabilities ?? []).find((c) => c.id === risk.capabilityId)
          ?.name ?? risk.capabilityId;
      lines.push(
        `    ${capabilityName.toLowerCase()} skills — ${risk.count} of ${risk.totalMembers} engineers at ${risk.level} ${risk.proficiency} level`,
      );
    }
  }
  lines.push("");

  return lines.join("\n");
}

function formatSpof(spof, audience) {
  const who =
    audience === Audience.DIRECTOR
      ? "one engineer"
      : (spof.holder.name ?? spof.holder.email ?? "one engineer");
  return `    ${spof.skillId} — only ${who} holds ${spof.holder.proficiency} level [${spof.severity}]`;
}
