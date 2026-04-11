/**
 * Text formatter for the `compare` command.
 */

/**
 * @param {object} params
 * @param {import("../../aggregation/coverage.js").TeamCoverage} params.left
 * @param {import("../../aggregation/coverage.js").TeamCoverage} params.right
 * @param {object} params.coverageDiff
 * @param {object} params.riskDiff
 * @returns {string}
 */
export function compareToText({ left, right, coverageDiff, riskDiff }) {
  const lines = [];
  lines.push(
    `  Comparing ${left.teamId} (${left.memberCount} members) vs ${right.teamId} (${right.memberCount} members)`,
  );
  lines.push("");

  if (left.teamId === right.teamId) {
    lines.push("  Teams are identical.");
    return lines.join("\n") + "\n";
  }

  lines.push("  Skill coverage (left → right):");
  const diffed = coverageDiff.capabilityChanges.filter(
    (c) => c.direction !== "same",
  );
  if (diffed.length === 0) {
    lines.push("    (no differences)");
  } else {
    for (const c of diffed) {
      const arrow =
        c.direction === "up" ? "→ up" : c.direction === "down" ? "→ down" : "=";
      lines.push(
        `    ${c.skillId}  ${c.before.headcountDepth} → ${c.after.headcountDepth}  ${arrow}`,
      );
    }
  }
  lines.push("");

  lines.push("  Risk changes:");
  const anyRisk =
    riskDiff.added.singlePoints.length +
      riskDiff.added.criticalGaps.length +
      riskDiff.removed.singlePoints.length +
      riskDiff.removed.criticalGaps.length >
    0;
  if (!anyRisk) {
    lines.push("    (no risk differences)");
  } else {
    for (const r of riskDiff.added.singlePoints) {
      lines.push(`    + SPOF ${r.skillId} appears on right`);
    }
    for (const r of riskDiff.added.criticalGaps) {
      lines.push(`    + critical gap ${r.skillId} appears on right`);
    }
    for (const r of riskDiff.removed.singlePoints) {
      lines.push(`    - SPOF ${r.skillId} only on left`);
    }
    for (const r of riskDiff.removed.criticalGaps) {
      lines.push(`    - critical gap ${r.skillId} only on left`);
    }
  }

  return lines.join("\n") + "\n";
}
