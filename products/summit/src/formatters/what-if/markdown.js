/**
 * Minimal markdown formatter for the `what-if` command.
 */

/**
 * @param {object} params
 * @param {import("../../aggregation/what-if.js").WhatIfReport} params.report
 * @returns {string}
 */
export function whatIfToMarkdown({ report }) {
  const { scenario, teamDiffs } = report;
  const lines = [];
  lines.push(`# ${scenario.type} scenario`);
  lines.push("");
  if (teamDiffs.length === 1) {
    appendCapabilityTable(lines, teamDiffs[0]);
  } else {
    teamDiffs.forEach((td, i) => {
      if (i > 0) lines.push("");
      const label =
        td.role === "source"
          ? `Source team \`${td.teamId}\``
          : `Destination team \`${td.teamId}\``;
      lines.push(`## ${label}`);
      lines.push("");
      appendCapabilityTable(lines, td);
    });
  }
  return lines.join("\n") + "\n";
}

function appendCapabilityTable(lines, teamDiff) {
  lines.push("| Skill | Before | After | Direction |");
  lines.push("| --- | --- | --- | --- |");
  for (const change of teamDiff.coverageDiff.capabilityChanges) {
    lines.push(
      `| ${change.skillId} | ${change.before.headcountDepth} | ${change.after.headcountDepth} | ${change.direction} |`,
    );
  }
}
