/**
 * Behaviour CLI Command
 *
 * Handles behaviour summary, listing, and detail display in the terminal.
 *
 * Usage:
 *   npx fit-pathway behaviour              # Summary with stats
 *   npx fit-pathway behaviour --list       # IDs only (for piping)
 *   npx fit-pathway behaviour <id>         # Detail view
 *   npx fit-pathway behaviour --validate   # Validation checks
 */

import { createEntityCommand } from "./command-factory.js";
import { behaviourToMarkdown } from "../formatters/behaviour/markdown.js";
import { formatTable } from "../lib/cli-output.js";

/**
 * Format behaviour list item for --list output
 * @param {Object} behaviour - Behaviour entity
 * @returns {string} Formatted list line
 */
function formatListItem(behaviour) {
  return `${behaviour.id}, ${behaviour.name}`;
}

/**
 * Format behaviour summary output
 * @param {Array} behaviours - Raw behaviour entities
 * @param {Object} data - Full data context
 */
function formatSummary(behaviours, data) {
  const { drivers } = data;

  console.log(`\n🧠 Behaviours\n`);

  // Summary table
  const rows = behaviours.map((b) => {
    const linkedDrivers = drivers.filter((d) =>
      d.contributingBehaviours?.includes(b.id),
    ).length;
    return [b.id, b.name, linkedDrivers];
  });

  console.log(formatTable(["ID", "Name", "Drivers"], rows));
  console.log(`\nTotal: ${behaviours.length} behaviours`);
  console.log(`\nRun 'npx fit-pathway behaviour --list' for IDs and names`);
  console.log(`Run 'npx fit-pathway behaviour <id>' for details\n`);
}

/**
 * Format behaviour detail output
 * @param {Object} viewAndContext - Contains behaviour entity and context
 */
function formatDetail(viewAndContext) {
  const { behaviour, drivers } = viewAndContext;
  console.log(behaviourToMarkdown(behaviour, { drivers }));
}

export const runBehaviourCommand = createEntityCommand({
  entityName: "behaviour",
  pluralName: "behaviours",
  findEntity: (data, id) => data.behaviours.find((b) => b.id === id),
  presentDetail: (entity, data) => ({
    behaviour: entity,
    drivers: data.drivers,
  }),
  formatSummary,
  formatDetail,
  formatListItem,
  emojiIcon: "🧠",
});
