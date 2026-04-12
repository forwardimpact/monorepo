/**
 * Formatters for the `evidence` command.
 */

import { renderHeader } from "./shared.js";

export function toText(view) {
  const lines = [renderHeader("Evidence"), ""];

  for (const [skillId, group] of Object.entries(view.evidence)) {
    lines.push(
      `    ${skillId}: ${group.matched} matched, ${group.unmatched} unmatched`,
    );
    for (const row of group.rows.slice(0, 5)) {
      const marker = row.marker_text ?? "(no marker)";
      const status = row.matched ? "[matched]" : "[unmatched]";
      lines.push(`      ${status} ${marker}`);
      if (row.rationale) lines.push(`        rationale: ${row.rationale}`);
    }
    if (group.rows.length > 5) {
      lines.push(`      ... and ${group.rows.length - 5} more`);
    }
    lines.push("");
  }

  if (view.coverage) {
    lines.push(
      `    Evidence covers ${view.coverage.scored}/${view.coverage.total} artifacts.`,
    );
    lines.push("");
  }

  return lines.join("\n");
}

export function toJson(view, meta) {
  return JSON.stringify({ ...view, meta }, null, 2);
}

export function toMarkdown(view) {
  const lines = ["# Evidence", ""];

  for (const [skillId, group] of Object.entries(view.evidence)) {
    lines.push(`## ${skillId}`);
    lines.push(`${group.matched} matched, ${group.unmatched} unmatched`);
    lines.push("");
    for (const row of group.rows) {
      const status = row.matched ? "✓" : "✗";
      lines.push(`- ${status} ${row.marker_text ?? "(no marker)"}`);
    }
    lines.push("");
  }

  if (view.coverage) {
    lines.push(
      `Evidence covers ${view.coverage.scored}/${view.coverage.total} artifacts.`,
    );
  }

  return lines.join("\n");
}
