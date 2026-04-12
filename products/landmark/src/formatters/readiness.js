/**
 * Formatters for the `readiness` command.
 */

import { renderHeader } from "./shared.js";

export function toText(view) {
  const lines = [
    renderHeader(
      `Readiness: ${view.email} (${view.currentLevel} → ${view.targetLevel})`,
    ),
    "",
  ];

  for (const section of view.checklist) {
    lines.push(`    ${section.skillName} (${section.proficiency}):`);
    for (const item of section.items) {
      const check = item.evidenced ? "[x]" : "[ ]";
      const artifact = item.artifactId ? ` (${item.artifactId})` : "";
      lines.push(`      ${check} ${item.marker}${artifact}`);
    }
    lines.push("");
  }

  lines.push(
    `    ${view.summary.evidenced}/${view.summary.total} markers evidenced.`,
  );

  if (view.summary.missing.length > 0) {
    lines.push(`    Missing: ${view.summary.missing.join("; ")}`);
  }

  if (view.skippedSkills.length > 0) {
    lines.push("");
    lines.push("    Skipped skills (no markers at required proficiency):");
    for (const s of view.skippedSkills) {
      lines.push(`      - ${s.skillId}: ${s.reason}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

export function toJson(view, meta) {
  return JSON.stringify({ ...view, meta }, null, 2);
}

export function toMarkdown(view) {
  const lines = [
    `# Readiness: ${view.email} (${view.currentLevel} → ${view.targetLevel})`,
    "",
  ];

  for (const section of view.checklist) {
    lines.push(`## ${section.skillName} (${section.proficiency})`);
    lines.push("");
    for (const item of section.items) {
      const check = item.evidenced ? "[x]" : "[ ]";
      const artifact = item.artifactId ? ` (${item.artifactId})` : "";
      lines.push(`- ${check} ${item.marker}${artifact}`);
    }
    lines.push("");
  }

  lines.push(
    `**${view.summary.evidenced}/${view.summary.total} markers evidenced.**`,
  );

  if (view.summary.missing.length > 0) {
    lines.push("");
    lines.push("Missing:");
    for (const m of view.summary.missing) {
      lines.push(`- ${m}`);
    }
  }

  return lines.join("\n");
}
