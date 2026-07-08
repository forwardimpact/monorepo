/**
 * Skill formatting for markdown/CLI output
 */

import { tableToMarkdown, capitalize, formatModifier } from "../shared.js";
import { prepareSkillsList, prepareSkillDetail } from "./shared.js";
import { getConceptEmoji } from "@forwardimpact/libskill/levels";

/**
 * Format skill list as markdown
 * @param {Array} skills - Raw skill entities
 * @param {Array} capabilities - Capability entities
 * @param {Object} [standard] - Standard config for emojis
 * @returns {string}
 */
export function skillListToMarkdown(skills, capabilities, standard) {
  const { groups, groupOrder } = prepareSkillsList(skills, capabilities);
  const emoji = standard ? getConceptEmoji(standard, "skill") : "📚";
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
 * Append related disciplines section
 * @param {string[]} lines
 * @param {Object} view
 */
function appendDisciplines(lines, view) {
  if (view.relatedDisciplines.length === 0) return;
  lines.push("## Used in Disciplines", "");
  for (const d of view.relatedDisciplines) {
    lines.push(`- **${d.name}**: as ${d.skillType}`);
  }
  lines.push("");
}

/**
 * Append related tracks section
 * @param {string[]} lines
 * @param {Object} view
 */
function appendTracks(lines, view) {
  if (view.relatedTracks.length === 0) return;
  lines.push("## Modified by Tracks", "");
  for (const t of view.relatedTracks) {
    const modifierStr = formatModifier(t.modifier);
    lines.push(`- **${t.name}**: ${modifierStr}`);
  }
  lines.push("");
}

/**
 * Append related drivers section
 * @param {string[]} lines
 * @param {Object} view
 */
function appendDrivers(lines, view) {
  if (view.relatedDrivers.length === 0) return;
  lines.push("## Linked to Drivers", "");
  for (const d of view.relatedDrivers) {
    lines.push(`- ${d.name}`);
  }
  lines.push("");
}

/**
 * Append required tools section
 * @param {string[]} lines
 * @param {Object} view
 */
function appendTools(lines, view) {
  if (view.toolReferences.length === 0) return;
  lines.push("## Required Tools", "");
  const toolRows = view.toolReferences.map((tool) => [
    tool.url ? `[${tool.name}](${tool.url})` : tool.name,
    tool.useWhen,
  ]);
  lines.push(tableToMarkdown(["Tool", "Use When"], toolRows));
  lines.push("");
}

/**
 * Format skill detail as markdown
 * @param {Object} skill - Raw skill entity
 * @param {Object} context - Additional context
 * @param {Array} context.disciplines - All disciplines
 * @param {Array} context.tracks - All tracks
 * @param {Array} context.drivers - All drivers
 * @param {Array} context.capabilities - Capability entities
 * @param {Object} [context.standard] - Standard config for emojis
 * @returns {string}
 */
export function skillToMarkdown(
  skill,
  { disciplines, tracks, drivers, capabilities, standard },
) {
  const view = prepareSkillDetail(skill, {
    disciplines,
    tracks,
    drivers,
    capabilities,
  });
  const emoji = standard ? getConceptEmoji(standard, "skill") : "🎯";
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
  const levelRows = Object.entries(view.proficiencyDescriptions).map(
    ([level, desc]) => [capitalize(level), desc],
  );
  lines.push(tableToMarkdown(["Level", "Description"], levelRows));
  lines.push("");

  appendDisciplines(lines, view);
  appendTracks(lines, view);
  appendDrivers(lines, view);
  appendTools(lines, view);

  for (const ref of view.references) {
    lines.push(`## ${ref.title}`, "", ref.body, "");
  }

  return lines.join("\n");
}
