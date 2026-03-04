/**
 * Discipline CLI Command
 *
 * Handles discipline summary, listing, and detail display in the terminal.
 *
 * Usage:
 *   npx pathway discipline              # Summary with stats
 *   npx pathway discipline --list       # IDs only (for piping)
 *   npx pathway discipline <id>         # Detail view
 *   npx pathway discipline --validate   # Validation checks
 */

import { createEntityCommand } from "./command-factory.js";
import { disciplineToMarkdown } from "../formatters/discipline/markdown.js";
import { formatTable } from "../lib/cli-output.js";

/**
 * Format discipline list item for --list output
 * @param {Object} discipline - Discipline entity
 * @returns {string} Formatted list line
 */
function formatListItem(discipline) {
  const type = discipline.isProfessional ? "professional" : "management";
  const tracks = (discipline.validTracks || [])
    .filter((t) => t !== null)
    .join("|");
  return `${discipline.id}, ${discipline.specialization || discipline.id}, ${type}, ${tracks || "—"}`;
}

/**
 * Format discipline summary output
 * @param {Array} disciplines - Raw discipline entities
 */
function formatSummary(disciplines) {
  console.log(`\n📋 Disciplines\n`);

  const rows = disciplines.map((d) => {
    const type = d.isProfessional ? "Professional" : "Management";
    const validTracks = (d.validTracks || []).filter((t) => t !== null);
    const trackStr = validTracks.length > 0 ? validTracks.join(", ") : "—";
    return [d.id, d.specialization || d.id, type, trackStr];
  });

  console.log(formatTable(["ID", "Specialization", "Type", "Tracks"], rows));
  console.log(`\nTotal: ${disciplines.length} disciplines`);
  console.log(`\nRun 'npx pathway discipline --list' for IDs and names`);
  console.log(`Run 'npx pathway discipline <id>' for details\n`);
}

/**
 * Format discipline detail output
 * @param {Object} viewAndContext - Contains discipline entity and context
 */
function formatDetail(viewAndContext) {
  const { discipline, skills, behaviours, tracks } = viewAndContext;
  console.log(disciplineToMarkdown(discipline, { skills, behaviours, tracks }));
}

export const runDisciplineCommand = createEntityCommand({
  entityName: "discipline",
  pluralName: "disciplines",
  findEntity: (data, id) => data.disciplines.find((d) => d.id === id),
  presentDetail: (entity, data) => ({
    discipline: entity,
    skills: data.skills,
    behaviours: data.behaviours,
    tracks: data.tracks,
  }),
  formatSummary,
  formatDetail,
  formatListItem,
  emojiIcon: "📋",
});
