/**
 * Formatters for the `sources` command.
 */

import { renderHeader } from "./shared.js";

/** Render the per-class source inventory as plain text. */
export function toText(view) {
  const lines = [renderHeader(`Sources retained about ${view.email}`), ""];
  for (const item of view.items) {
    lines.push(`  ${item.label} (${item.id})`);
    lines.push(`    count:   ${item.count}`);
    lines.push(`    oldest:  ${item.oldest ?? "—"}`);
    lines.push(`    newest:  ${item.newest ?? "—"}`);
    lines.push(`    window:  ${item.window ?? "while employed"}`);
    if (item.falloff) lines.push(`    falloff: ${item.falloff}`);
    lines.push("");
  }
  return lines.join("\n");
}

/** Serialize the source inventory and metadata as formatted JSON. */
export function toJson(view, meta) {
  return JSON.stringify({ ...view, meta }, null, 2);
}

/** Render the source inventory as a markdown table. */
export function toMarkdown(view) {
  const lines = [
    `# Sources retained about ${view.email}`,
    "",
    "| Class | Count | Oldest | Newest | Window | Falloff |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const item of view.items) {
    lines.push(
      `| ${item.label} | ${item.count} | ${item.oldest ?? "—"} | ${
        item.newest ?? "—"
      } | ${item.window ?? "while employed"} | ${item.falloff ?? "—"} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}
