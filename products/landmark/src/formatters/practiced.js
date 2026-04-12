/**
 * Formatters for the `practiced` command.
 */

import { padRight, renderHeader } from "./shared.js";

export function toText(view) {
  const lines = [
    renderHeader(
      `Practiced capability — ${view.managerEmail} (${view.teamSize} members)`,
    ),
    "",
  ];

  const nameWidth = Math.max(20, ...view.skills.map((s) => s.skillName.length));

  for (const skill of view.skills) {
    const name = padRight(skill.skillName, nameWidth);
    const derived = skill.derivedDepth ?? "(none)";
    const evidenced =
      skill.evidencedCount > 0 ? `${skill.evidencedCount} evidence rows` : "0";
    const flag = skill.flag ? ` ← ${skill.flag}` : "";
    lines.push(
      `    ${name}  derived: ${padRight(derived, 15)}  evidenced: ${evidenced}${flag}`,
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
    `# Practiced capability — ${view.managerEmail}`,
    "",
    "| Skill | Derived | Evidenced | Flag |",
    "| --- | --- | --- | --- |",
  ];

  for (const skill of view.skills) {
    const flag = skill.flag ?? "";
    lines.push(
      `| ${skill.skillName} | ${skill.derivedDepth ?? "(none)"} | ${skill.evidencedCount} | ${flag} |`,
    );
  }

  return lines.join("\n");
}
