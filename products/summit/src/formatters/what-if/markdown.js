/**
 * Minimal markdown formatter for the `what-if` command.
 */

/**
 * @param {object} params
 * @param {import("../../aggregation/scenarios.js").Scenario} params.scenario
 * @param {object} params.coverageDiff
 * @param {object} params.riskDiff
 * @returns {string}
 */
export function whatIfToMarkdown({ scenario, coverageDiff }) {
  const lines = [];
  lines.push(`# ${scenario.type} scenario`);
  lines.push("");
  lines.push("| Skill | Before | After | Direction |");
  lines.push("| --- | --- | --- | --- |");
  for (const change of coverageDiff.capabilityChanges) {
    lines.push(
      `| ${change.skillId} | ${change.before.headcountDepth} | ${change.after.headcountDepth} | ${change.direction} |`,
    );
  }
  return lines.join("\n") + "\n";
}
