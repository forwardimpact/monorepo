/**
 * Track formatting for markdown/CLI output
 */

import { tableToMarkdown } from "../shared.js";
import { prepareTracksList, prepareTrackDetail } from "./shared.js";
import { getConceptEmoji } from "../../model/levels.js";

/**
 * Format track list as markdown
 * @param {Array} tracks - Raw track entities
 * @param {Object} [framework] - Framework config for emojis
 * @returns {string}
 */
export function trackListToMarkdown(tracks, framework) {
  const { items } = prepareTracksList(tracks);
  const emoji = framework ? getConceptEmoji(framework, "track") : "🛤️";
  const lines = [`# ${emoji} Tracks`, ""];

  for (const track of items) {
    const types = [];
    if (track.isProfessional) types.push("Professional");
    if (track.isManagement) types.push("Management");
    lines.push(`- **${track.name}**: ${types.join(", ")}`);
  }
  lines.push("");

  return lines.join("\n");
}

/**
 * Format track detail as markdown
 * @param {Object} track - Raw track entity
 * @param {Object} context - Additional context
 * @param {Array} context.skills - All skills
 * @param {Array} context.behaviours - All behaviours
 * @param {Array} context.disciplines - All disciplines
 * @param {Object} [context.framework] - Framework config for emojis
 * @returns {string}
 */
export function trackToMarkdown(
  track,
  { skills, behaviours, disciplines, framework },
) {
  const view = prepareTrackDetail(track, { skills, behaviours, disciplines });

  const types = [];
  if (view.isProfessional) types.push("Professional");
  if (view.isManagement) types.push("Management");

  const emoji = framework ? getConceptEmoji(framework, "track") : "🛤️";
  const lines = [
    `# ${emoji} ${view.name}`,
    "",
    `**Type**: ${types.join(", ")}`,
    "",
    view.description,
    "",
  ];

  // Skill modifiers - show expanded skills for capabilities
  if (view.skillModifiers.length > 0) {
    lines.push("## Skill Modifiers", "");
    for (const m of view.skillModifiers) {
      const modifierStr = m.modifier > 0 ? `+${m.modifier}` : `${m.modifier}`;
      if (m.isCapability && m.skills && m.skills.length > 0) {
        // Capability with expanded skills
        lines.push(`### ${m.name} Capability (${modifierStr})`, "");
        for (const skill of m.skills) {
          lines.push(`- ${skill.name}`);
        }
        lines.push("");
      } else if (m.isCapability) {
        // Capability without expanded skills
        lines.push(`- **All ${m.name} skills**: ${modifierStr}`);
      } else {
        // Individual skill
        lines.push(`- **${m.name}**: ${modifierStr}`);
      }
    }
    lines.push("");
  }

  // Behaviour modifiers
  if (view.behaviourModifiers.length > 0) {
    lines.push("## Behaviour Modifiers", "");
    const modifierRows = view.behaviourModifiers.map((b) => [
      b.name,
      b.modifier > 0 ? `+${b.modifier}` : `${b.modifier}`,
    ]);
    lines.push(tableToMarkdown(["Behaviour", "Modifier"], modifierRows));
    lines.push("");
  }

  // Valid disciplines
  if (view.validDisciplines.length > 0) {
    lines.push("## Valid Disciplines", "");
    for (const d of view.validDisciplines) {
      lines.push(`- ${d.name}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
