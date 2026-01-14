/**
 * Progress/progression formatting for markdown/CLI output
 */

import { tableToMarkdown } from "../shared.js";
import { formatLevel } from "../../lib/render.js";

/**
 * Format progress detail as markdown
 * @param {Object} view - Progress detail view from presenter
 * @returns {string}
 */
export function progressToMarkdown(view) {
  const lines = [
    `# 📈 Career Progression`,
    "",
    `**From**: ${view.fromTitle}`,
    `**To**: ${view.toTitle}`,
    "",
  ];

  // Summary
  lines.push("## Summary", "");
  lines.push(`- Skills to improve: ${view.summary.skillsToImprove}`);
  lines.push(`- Behaviours to improve: ${view.summary.behavioursToImprove}`);
  lines.push(`- New skills: ${view.summary.newSkills}`);
  lines.push(`- Total changes: ${view.summary.totalChanges}`);
  lines.push("");

  // Skill changes
  const skillsWithChanges = view.skillChanges.filter(
    (s) => s.levelChange !== 0,
  );
  if (skillsWithChanges.length > 0) {
    lines.push("## Skill Changes", "");
    const skillRows = skillsWithChanges.map((s) => [
      s.name,
      formatLevel(s.type),
      formatLevel(s.fromLevel || "-"),
      "→",
      formatLevel(s.toLevel),
      formatChange(s.levelChange),
    ]);
    lines.push(
      tableToMarkdown(["Skill", "Type", "From", "", "To", "Change"], skillRows),
    );
    lines.push("");
  }

  // Behaviour changes
  const behavioursWithChanges = view.behaviourChanges.filter(
    (b) => b.maturityChange !== 0,
  );
  if (behavioursWithChanges.length > 0) {
    lines.push("## Behaviour Changes", "");
    const behaviourRows = behavioursWithChanges.map((b) => [
      b.name,
      formatLevel(b.fromMaturity || "-"),
      "→",
      formatLevel(b.toMaturity),
      formatChange(b.maturityChange),
    ]);
    lines.push(
      tableToMarkdown(["Behaviour", "From", "", "To", "Change"], behaviourRows),
    );
    lines.push("");
  }

  if (skillsWithChanges.length === 0 && behavioursWithChanges.length === 0) {
    lines.push("No changes required for this progression.");
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format change indicator
 * @param {number} change
 * @returns {string}
 */
function formatChange(change) {
  if (change > 0) return `+${change}`;
  if (change < 0) return `${change}`;
  return "0";
}
