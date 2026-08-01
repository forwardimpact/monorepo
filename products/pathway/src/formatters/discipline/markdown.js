/**
 * Discipline formatter for markdown/CLI output
 */

import { tableToMarkdown, formatModifier } from "../shared.js";
import { prepareDisciplinesList, prepareDisciplineDetail } from "./shared.js";

/**
 * Format discipline list as markdown
 * @param {Array} disciplines - Raw discipline entities
 * @returns {string}
 */
export function disciplineListToMarkdown(disciplines) {
  const { items } = prepareDisciplinesList(disciplines);
  const lines = ["# 📋 Disciplines", ""];

  const rows = items.map((d) => [
    d.name,
    `${d.coreSkillsCount}C`,
    `${d.supportingSkillsCount}S`,
    `${d.broadSkillsCount}B`,
  ]);

  lines.push(
    tableToMarkdown(["Discipline", "Core", "Supporting", "Broad"], rows),
  );
  lines.push("");

  return lines.join("\n");
}

/**
 * Resolve track IDs to display names
 * @param {string[]} trackIds
 * @param {Array} [tracks]
 * @returns {string[]}
 */
function resolveTrackNames(trackIds, tracks) {
  return trackIds.map((tid) => {
    const track = tracks?.find((t) => t.id === tid);
    return track ? track.name : tid;
  });
}

/**
 * Append a skill list section if non-empty
 * @param {string[]} lines
 * @param {string} heading
 * @param {Array} skillList
 */
function appendSkillSection(lines, heading, skillList) {
  if (skillList.length === 0) return;
  lines.push(`## ${heading}`, "");
  for (const s of skillList) {
    lines.push(`- ${s.name}`);
  }
  lines.push("");
}

/**
 * Format discipline detail as markdown
 * @param {Object} discipline - Raw discipline entity
 * @param {Object} context - Additional context
 * @param {Array} context.skills - All skills
 * @param {Array} context.behaviours - All behaviours
 * @param {Array} [context.tracks] - All tracks (to show valid track names)
 * @param {boolean} [context.showBehaviourModifiers=true] - Whether to show behaviour modifiers section
 * @returns {string}
 */
export function disciplineToMarkdown(
  discipline,
  { skills, behaviours, tracks, showBehaviourModifiers = true } = {},
) {
  const view = prepareDisciplineDetail(discipline, { skills, behaviours });
  const type = discipline.isProfessional ? "Professional" : "Management";
  const lines = [`# 📋 ${view.name}`, "", view.description, ""];

  // Type and valid tracks
  const validTracks = (discipline.validTracks || []).filter((t) => t !== null);
  if (validTracks.length > 0) {
    const trackNames = resolveTrackNames(validTracks, tracks);
    lines.push(`**Type:** ${type}  `);
    lines.push(`**Valid Tracks:** ${trackNames.join(", ")}`, "");
  } else {
    lines.push(`**Type:** ${type}`, "");
  }

  appendSkillSection(lines, "Core Skills", view.coreSkills);
  appendSkillSection(lines, "Supporting Skills", view.supportingSkills);
  appendSkillSection(lines, "Broad Skills", view.broadSkills);

  // Behaviour modifiers
  if (showBehaviourModifiers && view.behaviourModifiers.length > 0) {
    lines.push("## Behaviour Modifiers", "");
    const modifierRows = view.behaviourModifiers.map((b) => [
      b.name,
      formatModifier(b.modifier),
    ]);
    lines.push(tableToMarkdown(["Behaviour", "Modifier"], modifierRows));
    lines.push("");
  }

  return lines.join("\n");
}
