/**
 * Formatters for the `timeline` command.
 */

import { padRight, renderHeader } from "./shared.js";

export function toText(view) {
  const lines = [renderHeader(`Growth timeline for ${view.email}`), ""];

  const skillWidth = Math.max(
    15,
    ...view.timeline.map((t) => t.skillId.length),
  );

  for (const entry of view.timeline) {
    lines.push(
      `    ${padRight(entry.quarter, 10)}  ${padRight(entry.skillId, skillWidth)}  ${entry.highestLevel}`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

export function toJson(view, meta) {
  return JSON.stringify({ ...view, meta }, null, 2);
}

export function toMarkdown(view) {
  const lines = [
    `# Growth timeline for ${view.email}`,
    "",
    "| Quarter | Skill | Highest Level |",
    "| --- | --- | --- |",
  ];

  for (const entry of view.timeline) {
    lines.push(
      `| ${entry.quarter} | ${entry.skillId} | ${entry.highestLevel} |`,
    );
  }

  return lines.join("\n");
}
