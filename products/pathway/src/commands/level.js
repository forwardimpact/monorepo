/**
 * Level CLI Command
 *
 * Handles level summary, listing, and detail display in the terminal.
 *
 * Usage:
 *   npx fit-pathway level              # Summary with stats
 *   npx fit-pathway level --list       # IDs only (for piping)
 *   npx fit-pathway level <id>         # Detail view
 *   npx fit-pathway level --validate   # Validation checks
 */

import { createEntityCommand } from "./command-factory.js";
import { levelToMarkdown } from "../formatters/level/markdown.js";
import {
  formatTable,
  formatHeader,
  formatSubheader,
  formatBullet,
} from "@forwardimpact/libcli";
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

  process.stdout.write("\n" + formatHeader(`${emoji} Levels`) + "\n\n");

  const rows = levels.map((g) => [
    g.id,
    g.professionalTitle || g.displayName || g.id,
    g.managementTitle || "-",
    g.typicalExperienceRange || "-",
    capitalize(g.baseSkillProficiencies?.primary || "-"),
  ]);

  process.stdout.write(
    formatTable(
      [
        "ID",
        "Professional Title",
        "Management Title",
        "Experience",
        "Primary Level",
      ],
      rows,
    ) + "\n",
  );
  process.stdout.write(
    "\n" + formatSubheader(`Total: ${levels.length} levels`) + "\n\n",
  );
  process.stdout.write(
    formatBullet("Run 'npx fit-pathway level --list' for IDs and titles") +
      "\n",
  );
  process.stdout.write(
    formatBullet("Run 'npx fit-pathway level <id>' for details") + "\n\n",
  );
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
