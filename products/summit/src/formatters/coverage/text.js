/**
 * Text formatter for the `coverage` command.
 *
 * The output layout mirrors spec.md:179–189 for reporting teams and
 * spec.md:211–221 for project teams with allocation.
 */

import { formatFte, padRight, renderBar } from "../shared.js";

/**
 * Render a TeamCoverage object as plain text.
 *
 * @param {import("../../aggregation/coverage.js").TeamCoverage} coverage
 * @param {object} data - Map data for the capability order.
 * @returns {string}
 */
export function coverageToText(coverage, data) {
  const lines = [];
  const heading = formatHeading(coverage);
  lines.push(`  ${heading}`);
  lines.push("");

  if (coverage.skills.size === 0) {
    lines.push("  (no skills defined in standard data)");
    return lines.join("\n") + "\n";
  }

  const maxDepth = Math.max(
    1,
    ...[...coverage.skills.values()].map((s) => s.headcountDepth),
  );
  const nameWidth = Math.max(
    20,
    ...[...coverage.skills.values()].map((s) => s.skillName.length),
  );

  const capabilityOrder = orderCapabilities(data);
  const capabilityById = new Map(
    (data.capabilities ?? []).map((c) => [c.id, c]),
  );

  for (const capabilityId of capabilityOrder) {
    const capSkills = [...coverage.skills.values()].filter(
      (s) => s.capabilityId === capabilityId,
    );
    if (capSkills.length === 0) continue;

    const capDisplayName =
      capabilityById.get(capabilityId)?.name ?? capabilityId;
    lines.push(`  Capability: ${capDisplayName}`);
    capSkills.sort((a, b) => a.skillId.localeCompare(b.skillId));
    for (const skill of capSkills) {
      const bar = renderBar(skill.headcountDepth, maxDepth);
      const name = padRight(skill.skillName, nameWidth);
      const depthLabel = formatDepth(skill, coverage.teamType);
      lines.push(`    ${name}  ${bar}  ${depthLabel}`);
    }
    lines.push("");
  }

  const hasGaps = [...coverage.skills.values()].some(
    (s) => s.headcountDepth === 0,
  );
  if (hasGaps) {
    lines.push(
      `  Run 'fit-summit growth ${coverage.teamId}' to see which development opportunities address these gaps.`,
    );
    lines.push("");
  }

  return lines.join("\n");
}

function formatHeading(coverage) {
  const typeLabel = coverage.teamType === "project" ? "project" : "team";
  if (coverage.teamType === "project") {
    return `${coverage.teamId} ${typeLabel} — ${coverage.memberCount} members (${formatFte(coverage.effectiveFte)} FTE)`;
  }
  return `${coverage.teamId} team — ${coverage.memberCount} members`;
}

function formatDepth(skill, teamType) {
  if (teamType === "project") {
    return `effective depth: ${skill.effectiveDepth.toFixed(1)} at working+`;
  }
  if (skill.headcountDepth === 0) {
    return `gap — no engineers at working+`;
  }
  const plural = skill.headcountDepth === 1 ? "engineer" : "engineers";
  return `depth: ${skill.headcountDepth} ${plural} at working+`;
}

function orderCapabilities(data) {
  const capabilities = data.capabilities ?? [];
  return [...capabilities]
    .sort((a, b) => (a.ordinalRank ?? 0) - (b.ordinalRank ?? 0))
    .map((c) => c.id);
}
