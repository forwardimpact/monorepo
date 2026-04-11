/**
 * Text formatter for the `what-if` command.
 */

/**
 * Render a what-if scenario diff as plain text.
 *
 * @param {object} params
 * @param {import("../../aggregation/scenarios.js").Scenario} params.scenario
 * @param {{ capabilityChanges: Array<object> }} params.coverageDiff
 * @param {object} params.riskDiff
 * @param {object} params.data
 * @returns {string}
 */
export function whatIfToText({ scenario, coverageDiff, riskDiff, data }) {
  const lines = [];
  lines.push(`  ${headline(scenario)}`);
  lines.push("");

  lines.push("  Capability changes:");
  const changed = filterFocus(
    coverageDiff.capabilityChanges,
    scenario.focus,
    data,
  );
  const nonSame = changed.filter((c) => c.direction !== "same");
  if (nonSame.length === 0) {
    lines.push("    (no skill-level changes)");
  } else {
    for (const change of nonSame) {
      const symbol =
        change.direction === "up"
          ? "+"
          : change.direction === "down"
            ? "-"
            : "=";
      lines.push(
        `    ${symbol} ${change.skillId}  depth: ${change.before.headcountDepth} → ${change.after.headcountDepth}`,
      );
    }
  }
  lines.push("");

  lines.push("  Risk changes:");
  const riskLines = renderRiskDiff(riskDiff);
  if (riskLines.length === 0) {
    lines.push("    (no risk changes)");
  } else {
    lines.push(...riskLines);
  }
  lines.push("");

  return lines.join("\n");
}

function headline(scenario) {
  const target = scenario.projectId ?? scenario.teamId ?? "(unknown)";
  if (scenario.type === "add") {
    const track = scenario.job.track ? `, ${scenario.job.track}` : "";
    return `Adding ${scenario.job.discipline} ${scenario.job.level}${track} to ${target}:`;
  }
  if (scenario.type === "remove") {
    return `Removing ${scenario.name} from ${target}:`;
  }
  if (scenario.type === "move") {
    return `Moving ${scenario.name} from ${target} to ${scenario.toTeamId}:`;
  }
  if (scenario.type === "promote") {
    return `Promoting ${scenario.name} in ${target}:`;
  }
  return `Scenario:`;
}

function filterFocus(changes, focus, data) {
  if (!focus) return changes;
  const skillsInCapability = new Set(
    (data.skills ?? []).filter((s) => s.capability === focus).map((s) => s.id),
  );
  return changes.filter((c) => skillsInCapability.has(c.skillId));
}

function renderRiskDiff(riskDiff) {
  const lines = [];
  for (const added of riskDiff.added.singlePoints) {
    lines.push(`    + ${added.skillId} became single point of failure`);
  }
  for (const added of riskDiff.added.criticalGaps) {
    lines.push(`    + ${added.skillId} became critical gap`);
  }
  for (const added of riskDiff.added.concentrationRisks) {
    lines.push(
      `    + ${added.capabilityId} concentration at ${added.level} ${added.proficiency}`,
    );
  }
  for (const removed of riskDiff.removed.singlePoints) {
    lines.push(`    - ${removed.skillId} no longer single point of failure`);
  }
  for (const removed of riskDiff.removed.criticalGaps) {
    lines.push(`    - ${removed.skillId} no longer critical gap`);
  }
  for (const removed of riskDiff.removed.concentrationRisks) {
    lines.push(
      `    - ${removed.capabilityId} concentration eased at ${removed.level} ${removed.proficiency}`,
    );
  }
  return lines;
}
