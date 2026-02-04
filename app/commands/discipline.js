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
 * Format discipline summary output
 * @param {Array} disciplines - Raw discipline entities
 */
function formatSummary(disciplines) {
  console.log(`\n📋 Disciplines\n`);

  const rows = disciplines.map((d) => [
    d.id,
    d.coreSkills?.length || 0,
    d.supportingSkills?.length || 0,
    d.broadSkills?.length || 0,
  ]);

  console.log(formatTable(["ID", "Core", "Supporting", "Broad"], rows));
  console.log(`\nTotal: ${disciplines.length} disciplines`);
  console.log(`\nRun 'npx pathway discipline --list' for IDs`);
  console.log(`Run 'npx pathway discipline <id>' for details\n`);
}

/**
 * Format discipline detail output
 * @param {Object} viewAndContext - Contains discipline entity and context
 */
function formatDetail(viewAndContext) {
  const { discipline, skills, behaviours } = viewAndContext;
  console.log(disciplineToMarkdown(discipline, { skills, behaviours }));
}

export const runDisciplineCommand = createEntityCommand({
  entityName: "discipline",
  pluralName: "disciplines",
  findEntity: (data, id) => data.disciplines.find((d) => d.id === id),
  presentDetail: (entity, data) => ({
    discipline: entity,
    skills: data.skills,
    behaviours: data.behaviours,
  }),
  formatSummary,
  formatDetail,
  emojiIcon: "📋",
});
