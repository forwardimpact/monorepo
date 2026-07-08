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
import { getConceptEmoji } from "@forwardimpact/libskill/levels";
import { capitalize } from "../formatters/shared.js";

/**
 * Format level summary output
 * @param {Array} levels - Raw level entities
 * @param {Object} data - Full data context
 */
function formatSummary(levels, data, runtime) {
  const { standard } = data;
  const emoji = standard ? getConceptEmoji(standard, "level") : "📊";

  runtime.proc.stdout.write("\n" + formatHeader(`${emoji} Levels`) + "\n\n");

  const rows = levels.map((g) => [
    g.id,
    g.professionalTitle || g.displayName || g.id,
    g.managementTitle || "-",
    g.typicalExperienceRange || "-",
    capitalize(g.baseSkillProficiencies?.core || "-"),
  ]);

  runtime.proc.stdout.write(
    formatTable(
      [
        "ID",
        "Professional Title",
        "Management Title",
        "Experience",
        "Core Level",
      ],
      rows,
    ) + "\n",
  );
  runtime.proc.stdout.write(
    "\n" + formatSubheader(`Total: ${levels.length} levels`) + "\n\n",
  );
  runtime.proc.stdout.write(
    formatBullet("Run 'npx fit-pathway level --list' for IDs") + "\n",
  );
  runtime.proc.stdout.write(
    formatBullet("Run 'npx fit-pathway level <id>' for details") + "\n\n",
  );
}

/**
 * Format level detail output
 * @param {Object} level - Raw level entity
 * @param {Object} standard - Standard config
 */
function formatDetail(level, standard, runtime) {
  runtime.proc.stdout.write(levelToMarkdown(level, standard) + "\n");
}

export const runLevelCommand = createEntityCommand({
  entityName: "level",
  pluralName: "levels",
  findEntity: (data, id) => data.levels.find((g) => g.id === id),
  presentDetail: (entity) => entity,
  formatSummary,
  formatDetail,
  emojiIcon: "📊",
});
