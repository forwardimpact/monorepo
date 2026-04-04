/**
 * Interview formatting for markdown/CLI output
 */

import { formatLevel } from "../../lib/render.js";
import { getConceptEmoji } from "@forwardimpact/map/levels";

/**
 * Append follow-ups to lines
 * @param {string[]} lines
 * @param {Object} q - Question object
 */
function appendFollowUps(lines, q) {
  if (q.followUps.length > 0) {
    lines.push("", "**Follow-ups:**");
    for (const followUp of q.followUps) {
      lines.push(`  → ${followUp}`);
    }
  }
}

/**
 * Append looking-for items to lines
 * @param {string[]} lines
 * @param {Object} q - Question object
 */
function appendLookingFor(lines, q) {
  if (q.lookingFor && q.lookingFor.length > 0) {
    lines.push("", "**What to look for:**");
    for (const item of q.lookingFor) {
      lines.push(`- ${item}`);
    }
  }
}

/**
 * Format skill question sections
 * @param {string[]} lines
 * @param {Array} sections
 * @param {string} emoji
 */
function formatSkillSections(lines, sections, emoji) {
  if (sections.length === 0) return;
  lines.push(`## ${emoji} Skill Questions`, "");
  for (const section of sections) {
    lines.push(`### ${section.name} (${formatLevel(section.level)})`, "");
    for (const q of section.questions) {
      lines.push(`**Q**: ${q.question}`);
      appendFollowUps(lines, q);
      appendLookingFor(lines, q);
      lines.push("");
    }
  }
}

/**
 * Format scenario-based question sections (capability or behaviour)
 * @param {string[]} lines
 * @param {Array} sections
 * @param {string} heading
 * @param {string} promptsKey - Key for guided prompts
 * @param {string} promptsLabel - Display label for prompts
 */
function formatScenarioSections(
  lines,
  sections,
  heading,
  promptsKey,
  promptsLabel,
) {
  if (sections.length === 0) return;
  lines.push(`## ${heading}`, "");
  for (const section of sections) {
    lines.push(`### ${section.name} (${formatLevel(section.level)})`, "");
    for (const q of section.questions) {
      lines.push(`**Scenario**: ${q.question}`);
      if (q.context) {
        lines.push(`> ${q.context}`);
      }
      if (q[promptsKey] && q[promptsKey].length > 0) {
        lines.push("", `**${promptsLabel}:**`);
        for (const prompt of q[promptsKey]) {
          lines.push(`- ${prompt}`);
        }
      }
      appendFollowUps(lines, q);
      appendLookingFor(lines, q);
      lines.push("");
    }
  }
}

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

  const skillSections = view.sections.filter((s) => s.type === "skill");
  const behaviourSections = view.sections.filter((s) => s.type === "behaviour");
  const capabilitySections = view.sections.filter(
    (s) => s.type === "capability",
  );

  formatSkillSections(lines, skillSections, skillEmoji);

  formatScenarioSections(
    lines,
    capabilitySections,
    "🧩 Decomposition Questions",
    "decompositionPrompts",
    "Guide the candidate through",
  );

  formatScenarioSections(
    lines,
    behaviourSections,
    `${behaviourEmoji} Stakeholder Simulation`,
    "simulationPrompts",
    "Steer the simulation",
  );

  return lines.join("\n");
}
