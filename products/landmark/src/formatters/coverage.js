/**
 * Formatters for the `coverage` command.
 */

import { padRight, renderHeader } from "./shared.js";

export function toText(view) {
  const lines = [
    renderHeader(`Evidence coverage for ${view.name} (${view.email})`),
    "",
  ];

  const pct = (view.coverage.ratio * 100).toFixed(1);
  lines.push(
    `    ${view.coverage.scored}/${view.coverage.total} artifacts interpreted (${pct}%)`,
  );
  lines.push("");

  const types = Object.keys(view.byType).sort();
  if (types.length > 0) {
    lines.push("    By type:");
    for (const type of types) {
      const total = view.byType[type];
      const uncovered = view.uncoveredByType[type] ?? 0;
      const covered = total - uncovered;
      lines.push(
        `      ${padRight(type, 20)}  ${covered}/${total} interpreted`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function toJson(view, meta) {
  return JSON.stringify({ ...view, meta }, null, 2);
}

export function toMarkdown(view) {
  const pct = (view.coverage.ratio * 100).toFixed(1);
  const lines = [
    `# Evidence coverage for ${view.name} (${view.email})`,
    "",
    `**${view.coverage.scored}/${view.coverage.total}** artifacts interpreted (${pct}%)`,
    "",
    "| Type | Covered | Total |",
    "| --- | --- | --- |",
  ];

  for (const type of Object.keys(view.byType).sort()) {
    const total = view.byType[type];
    const uncovered = view.uncoveredByType[type] ?? 0;
    const covered = total - uncovered;
    lines.push(`| ${type} | ${covered} | ${total} |`);
  }

  return lines.join("\n");
}
