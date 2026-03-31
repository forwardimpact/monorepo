/**
 * Level CLI Command
 *
 * Handles level summary, listing, and detail display in the terminal.
 *
 * Usage:
 *   bunx pathway level              # Summary with stats
 *   bunx pathway level --list       # IDs only (for piping)
 *   bunx pathway level <id>         # Detail view
 *   bunx pathway level --validate   # Validation checks
 */

import { createEntityCommand } from "./command-factory.js";
import { levelToMarkdown } from "../formatters/level/markdown.js";
import { formatTable } from "../lib/cli-output.js";
import { getConceptEmoji } from "@forwardimpact/map/levels";
import { capitalize } from "../formatters/shared.js";

/**
 * Format level list item for --list output
 * @param {Object} level - Level entity
 * @returns {string} Formatted list line
 */
function formatListItem(level) {
  return `${level.id}, ${level.professionalTitle || level.id}, ${level.managementTitle || level.id}`;
}

/**
 * Format level summary output
 * @param {Array} levels - Raw level entities
 * @param {Object} data - Full data context
 */
function formatSummary(levels, data) {
  const { framework } = data;
  const emoji = framework ? getConceptEmoji(framework, "level") : "📊";

  console.log(`\n${emoji} Levels\n`);

  const rows = levels.map((g) => [
    g.id,
    g.professionalTitle || g.displayName || g.id,
    g.managementTitle || "-",
    g.typicalExperienceRange || "-",
    capitalize(g.baseSkillProficiencies?.primary || "-"),
  ]);

  console.log(
    formatTable(
      [
        "ID",
        "Professional Title",
        "Management Title",
        "Experience",
        "Primary Level",
      ],
      rows,
    ),
  );
  console.log(`\nTotal: ${levels.length} levels`);
  console.log(`\nRun 'bunx pathway level --list' for IDs and titles`);
  console.log(`Run 'bunx pathway level <id>' for details\n`);
}

/**
 * Format level detail output
 * @param {Object} level - Raw level entity
 * @param {Object} framework - Framework config
 */
function formatDetail(level, framework) {
  console.log(levelToMarkdown(level, framework));
}

export const runLevelCommand = createEntityCommand({
  entityName: "level",
  pluralName: "levels",
  findEntity: (data, id) => data.levels.find((g) => g.id === id),
  presentDetail: (entity) => entity,
  formatSummary,
  formatDetail,
  formatListItem,
  emojiIcon: "📊",
});
