/**
 * Skill formatting for markdown/CLI output
 */

import { tableToMarkdown, capitalize } from "../shared.js";
import { prepareSkillsList, prepareSkillDetail } from "./shared.js";
import { getConceptEmoji } from "../../model/levels.js";

/**
 * Format skill list as markdown
 * @param {Array} skills - Raw skill entities
 * @param {Array} capabilities - Capability entities
 * @param {Object} [framework] - Framework config for emojis
 * @returns {string}
 */
export function skillListToMarkdown(skills, capabilities, framework) {
  const { groups, groupOrder } = prepareSkillsList(skills, capabilities);
  const emoji = framework ? getConceptEmoji(framework, "skill") : "📚";
  const lines = [`# ${emoji} Skills`, ""];

  for (const capability of groupOrder) {
    const capabilitySkills = groups[capability];
    lines.push(`## ${capitalize(capability)}`, "");

    for (const skill of capabilitySkills) {
      lines.push(`- **${skill.name}**: ${skill.truncatedDescription}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format skill detail as markdown
 * @param {Object} skill - Raw skill entity
 * @param {Object} context - Additional context
 * @param {Array} context.disciplines - All disciplines
 * @param {Array} context.tracks - All tracks
 * @param {Array} context.drivers - All drivers
 * @param {Array} context.capabilities - Capability entities
 * @param {Object} [context.framework] - Framework config for emojis
 * @returns {string}
 */
export function skillToMarkdown(
  skill,
  { disciplines, tracks, drivers, capabilities, framework },
) {
  const view = prepareSkillDetail(skill, {
    disciplines,
    tracks,
    drivers,
    capabilities,
  });
  const emoji = framework ? getConceptEmoji(framework, "skill") : "🎯";
  const lines = [
    `# ${emoji} ${view.name}`,
    "",
    `${view.capabilityEmoji} ${capitalize(view.capability)}`,
  ];

  // Add human-only badge if applicable
  if (view.isHumanOnly) {
    lines.push(
      "",
      "🤲 **Human-Only** — Requires interpersonal skills; excluded from agents",
    );
  }

  lines.push("", view.description, "");

  // Level descriptions table
  lines.push("## Level Descriptions", "");
  const levelRows = Object.entries(view.levelDescriptions).map(
    ([level, desc]) => [capitalize(level), desc],
  );
  lines.push(tableToMarkdown(["Level", "Description"], levelRows));
  lines.push("");

  // Related disciplines
  if (view.relatedDisciplines.length > 0) {
    lines.push("## Used in Disciplines", "");
    for (const d of view.relatedDisciplines) {
      lines.push(`- **${d.name}**: as ${d.skillType}`);
    }
    lines.push("");
  }

  // Related tracks with modifiers
  if (view.relatedTracks.length > 0) {
    lines.push("## Modified by Tracks", "");
    for (const t of view.relatedTracks) {
      const modifierStr = t.modifier > 0 ? `+${t.modifier}` : `${t.modifier}`;
      lines.push(`- **${t.name}**: ${modifierStr}`);
    }
    lines.push("");
  }

  // Related drivers
  if (view.relatedDrivers.length > 0) {
    lines.push("## Linked to Drivers", "");
    for (const d of view.relatedDrivers) {
      lines.push(`- ${d.name}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
