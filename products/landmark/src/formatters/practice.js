/**
 * Formatters for the `practice` command.
 */

import { padRight, renderHeader } from "./shared.js";

export function toText(view) {
  const lines = [renderHeader("Practice patterns"), ""];

  const nameWidth = Math.max(
    20,
    ...view.patterns.map((p) => p.skill_id.length),
  );

  for (const p of view.patterns) {
    const name = padRight(p.skill_id, nameWidth);
    lines.push(
      `    ${name}  matched: ${p.matched}  unmatched: ${p.unmatched}  total: ${p.total}`,
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
    "# Practice patterns",
    "",
    "| Skill | Matched | Unmatched | Total |",
    "| --- | --- | --- | --- |",
  ];

  for (const p of view.patterns) {
    lines.push(
      `| ${p.skill_id} | ${p.matched} | ${p.unmatched} | ${p.total} |`,
    );
  }

  return lines.join("\n");
}
