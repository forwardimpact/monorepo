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
import {
  formatTable,
  formatHeader,
  formatSubheader,
  formatBullet,
} from "@forwardimpact/libcli";

/**
 * Format behaviour summary output
 * @param {Array} behaviours - Raw behaviour entities
 * @param {Object} data - Full data context
 */
function formatSummary(behaviours, data, runtime) {
  const { drivers } = data;

  runtime.proc.stdout.write(
    "\n" + formatHeader("\u{1F9E0} Behaviours") + "\n\n",
  );

  // Summary table
  const rows = behaviours.map((b) => {
    const linkedDrivers = drivers.filter((d) =>
      d.contributingBehaviours?.includes(b.id),
    ).length;
    return [b.id, b.name, linkedDrivers];
  });

  runtime.proc.stdout.write(
    formatTable(["ID", "Name", "Drivers"], rows) + "\n",
  );
  runtime.proc.stdout.write(
    "\n" + formatSubheader(`Total: ${behaviours.length} behaviours`) + "\n\n",
  );
  runtime.proc.stdout.write(
    formatBullet("Run 'npx fit-pathway behaviour --list' for IDs") + "\n",
  );
  runtime.proc.stdout.write(
    formatBullet("Run 'npx fit-pathway behaviour <id>' for details") + "\n\n",
  );
}

/**
 * Format behaviour detail output
 * @param {Object} viewAndContext - Contains behaviour entity and context
 */
function formatDetail(viewAndContext, _standard, runtime) {
  const { behaviour, drivers } = viewAndContext;
  runtime.proc.stdout.write(behaviourToMarkdown(behaviour, { drivers }) + "\n");
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
  emojiIcon: "🧠",
});
