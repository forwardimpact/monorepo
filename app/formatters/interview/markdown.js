/**
 * Interview formatting for markdown/CLI output
 */

import { formatLevel } from "../../lib/render.js";
import { getConceptEmoji } from "../../model/levels.js";

/**
 * Format interview detail as markdown
 * @param {Object} view - Interview detail view from presenter
 * @param {Object} options - Options (e.g., type, framework)
 * @param {Object} [options.framework] - Framework data for emoji lookup
 * @returns {string}
 */
export function interviewToMarkdown(view, { framework } = {}) {
  const skillEmoji = getConceptEmoji(framework, "skill");
  const behaviourEmoji = getConceptEmoji(framework, "behaviour");
  const lines = [
    `# ${view.typeInfo.icon} Interview: ${view.title}`,
    "",
    `**Type**: ${view.typeInfo.name} (${view.typeInfo.description})`,
    `**Expected duration**: ${view.expectedDurationMinutes} minutes`,
    `**Total questions**: ${view.totalQuestions}`,
    "",
  ];

  // Group sections by type
  const skillSections = view.sections.filter((s) => s.type === "skill");
  const behaviourSections = view.sections.filter((s) => s.type === "behaviour");

  // Skill questions
  if (skillSections.length > 0) {
    lines.push(`## ${skillEmoji} Skill Questions`, "");
    for (const section of skillSections) {
      lines.push(`### ${section.name} (${formatLevel(section.level)})`, "");
      for (const q of section.questions) {
        lines.push(`**Q**: ${q.question}`);
        if (q.followUps.length > 0) {
          for (const followUp of q.followUps) {
            lines.push(`  → ${followUp}`);
          }
        }
        lines.push("");
      }
    }
  }

  // Behaviour questions
  if (behaviourSections.length > 0) {
    lines.push(`## ${behaviourEmoji} Behaviour Questions`, "");
    for (const section of behaviourSections) {
      lines.push(`### ${section.name} (${formatLevel(section.level)})`, "");
      for (const q of section.questions) {
        lines.push(`**Q**: ${q.question}`);
        if (q.followUps.length > 0) {
          for (const followUp of q.followUps) {
            lines.push(`  → ${followUp}`);
          }
        }
        lines.push("");
      }
    }
  }

  return lines.join("\n");
}
