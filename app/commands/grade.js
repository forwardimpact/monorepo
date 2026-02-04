/**
 * Grade CLI Command
 *
 * Handles grade summary, listing, and detail display in the terminal.
 *
 * Usage:
 *   npx pathway grade              # Summary with stats
 *   npx pathway grade --list       # IDs only (for piping)
 *   npx pathway grade <id>         # Detail view
 *   npx pathway grade --validate   # Validation checks
 */

import { createEntityCommand } from "./command-factory.js";
import { gradeToMarkdown } from "../formatters/grade/markdown.js";
import { formatTable } from "../lib/cli-output.js";
import { getConceptEmoji } from "../model/levels.js";
import { capitalize } from "../formatters/shared.js";

/**
 * Format grade summary output
 * @param {Array} grades - Raw grade entities
 * @param {Object} data - Full data context
 */
function formatSummary(grades, data) {
  const { framework } = data;
  const emoji = framework ? getConceptEmoji(framework, "grade") : "📊";

  console.log(`\n${emoji} Grades\n`);

  const rows = grades.map((g) => [
    g.id,
    g.displayName || g.id,
    g.typicalExperienceRange || "-",
    capitalize(g.baseSkillLevels?.primary || "-"),
  ]);

  console.log(formatTable(["ID", "Name", "Experience", "Primary Level"], rows));
  console.log(`\nTotal: ${grades.length} grades`);
  console.log(`\nRun 'npx pathway grade --list' for IDs`);
  console.log(`Run 'npx pathway grade <id>' for details\n`);
}

/**
 * Format grade detail output
 * @param {Object} grade - Raw grade entity
 * @param {Object} framework - Framework config
 */
function formatDetail(grade, framework) {
  console.log(gradeToMarkdown(grade, framework));
}

export const runGradeCommand = createEntityCommand({
  entityName: "grade",
  pluralName: "grades",
  findEntity: (data, id) => data.grades.find((g) => g.id === id),
  presentDetail: (entity) => entity,
  formatSummary,
  formatDetail,
  emojiIcon: "📊",
});
