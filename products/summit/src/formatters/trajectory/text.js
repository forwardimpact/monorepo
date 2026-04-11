/**
 * Text formatter for the `trajectory` command.
 */

/**
 * @param {import("../../aggregation/trajectory.js").TeamTrajectory} trajectory
 * @returns {string}
 */
export function trajectoryToText(trajectory) {
  const lines = [];
  lines.push(`  ${trajectory.teamId} team — capability trajectory`);
  lines.push("");

  if (trajectory.quarters.length === 0) {
    lines.push("  (no historical data available)");
    return lines.join("\n") + "\n";
  }

  lines.push("  Roster changes:");
  for (const q of trajectory.quarters) {
    const changeLabel = q.rosterChanges.length
      ? q.rosterChanges.map(formatChange).join(", ")
      : "no changes";
    lines.push(`    ${q.quarter}: ${q.memberCount} engineers (${changeLabel})`);
  }
  lines.push("");

  lines.push("  Coverage evolution:");
  const allSkills = new Set();
  for (const q of trajectory.quarters) {
    for (const skillId of Object.keys(q.coverage)) allSkills.add(skillId);
  }
  const header = ["    ", "skill".padEnd(24)]
    .concat(trajectory.quarters.map((q) => q.quarter.padEnd(8)))
    .concat(["trend"])
    .join("");
  lines.push(header);
  for (const skillId of [...allSkills].sort()) {
    const cells = trajectory.quarters
      .map((q) => String(q.coverage[skillId] ?? 0).padEnd(8))
      .join("");
    const trend = trajectory.trends[skillId] ?? "stable";
    lines.push(`    ${skillId.padEnd(24)}${cells}${trend}`);
  }
  lines.push("");

  if (trajectory.persistentGaps.length > 0) {
    lines.push(`  Persistent gaps: ${trajectory.persistentGaps.join(", ")}`);
  }
  lines.push("");

  return lines.join("\n");
}

function formatChange(change) {
  if (change.type === "join") return `${change.name} joined`;
  if (change.type === "leave") return `${change.name} left`;
  if (change.type === "promote") {
    return `${change.name} promoted ${change.from} → ${change.to}`;
  }
  return change.type;
}
