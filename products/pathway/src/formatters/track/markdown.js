/**
 * Track formatting for markdown/CLI output
 */

import { tableToMarkdown, formatModifier } from "../shared.js";
import { prepareTracksList, prepareTrackDetail } from "./shared.js";
import { getConceptEmoji } from "@forwardimpact/libskill/levels";

/**
 * Format track list as markdown
 * @param {Array} tracks - Raw track entities
 * @param {Object} [standard] - Standard config for emojis
 * @returns {string}
 */
export function trackListToMarkdown(tracks, standard) {
  const { items } = prepareTracksList(tracks);
  const emoji = standard ? getConceptEmoji(standard, "track") : "🛤️";
  const lines = [`# ${emoji} Tracks`, ""];

  for (const track of items) {
    lines.push(`- **${track.name}**`);
  }
  lines.push("");

  return lines.join("\n");
}

/**
 * Find disciplines that use a given track
 * @param {Array} disciplines - All disciplines
 * @param {string} trackId - Track ID to match
 * @returns {string[]} Formatted discipline names
 */
function findUsingDisciplines(disciplines, trackId) {
  return disciplines
    .filter((d) => d.validTracks && d.validTracks.includes(trackId))
    .map(
      (d) =>
        `${d.specialization || d.id} (${d.isProfessional ? "professional" : "management"})`,
    );
}

/**
 * Render a single skill modifier entry
 * @param {string[]} lines
 * @param {Object} m - Skill modifier
 */
function renderSkillModifier(lines, m) {
  const modifierStr = formatModifier(m.modifier);
  if (m.isCapability && m.skills && m.skills.length > 0) {
    lines.push(`### ${m.name} Capability (${modifierStr})`, "");
    for (const skill of m.skills) {
      lines.push(`- ${skill.name}`);
    }
    lines.push("");
  } else if (m.isCapability) {
    lines.push(`- **All ${m.name} skills**: ${modifierStr}`);
  } else {
    lines.push(`- **${m.name}**: ${modifierStr}`);
  }
}

/**
 * Format track detail as markdown
 * @param {Object} track - Raw track entity
 * @param {Object} context - Additional context
 * @param {Array} context.skills - All skills
 * @param {Array} context.behaviours - All behaviours
 * @param {Array} context.disciplines - All disciplines
 * @param {Object} [context.standard] - Standard config for emojis
 * @returns {string}
 */
export function trackToMarkdown(
  track,
  { skills, behaviours, disciplines, standard },
) {
  const view = prepareTrackDetail(track, { skills, behaviours, disciplines });

  const emoji = standard ? getConceptEmoji(standard, "track") : "🛤️";
  const lines = [`# ${emoji} ${view.name}`, "", view.description, ""];

  // Show which disciplines use this track
  if (disciplines) {
    const names = findUsingDisciplines(disciplines, track.id);
    if (names.length > 0) {
      lines.push(`**Used by:** ${names.join(", ")}`, "");
    }
  }

  // Skill modifiers - show expanded skills for capabilities
  if (view.skillModifiers.length > 0) {
    lines.push("## Skill Modifiers", "");
    for (const m of view.skillModifiers) {
      renderSkillModifier(lines, m);
    }
    lines.push("");
  }

  // Behaviour modifiers
  if (view.behaviourModifiers.length > 0) {
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
