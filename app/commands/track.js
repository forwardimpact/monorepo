/**
 * Track CLI Command
 *
 * Handles track summary, listing, and detail display in the terminal.
 *
 * Usage:
 *   npx pathway track              # Summary with stats
 *   npx pathway track --list       # IDs only (for piping)
 *   npx pathway track <id>         # Detail view
 *   npx pathway track --validate   # Validation checks
 */

import { createEntityCommand } from "./command-factory.js";
import { trackToMarkdown } from "../formatters/track/markdown.js";
import { sortTracksByName } from "../formatters/track/shared.js";
import { formatTable } from "../lib/cli-output.js";
import { getConceptEmoji } from "../model/levels.js";

/**
 * Format track summary output
 * @param {Array} tracks - Raw track entities
 * @param {Object} data - Full data context
 */
function formatSummary(tracks, data) {
  const { framework } = data;
  const emoji = framework ? getConceptEmoji(framework, "track") : "🛤️";

  console.log(`\n${emoji} Tracks\n`);

  const rows = tracks.map((t) => {
    const modCount = Object.keys(t.skillModifiers || {}).length;
    return [t.id, t.name, modCount];
  });

  console.log(formatTable(["ID", "Name", "Modifiers"], rows));
  console.log(`\nTotal: ${tracks.length} tracks`);
  console.log(`\nRun 'npx pathway track --list' for IDs`);
  console.log(`Run 'npx pathway track <id>' for details\n`);
}

/**
 * Format track detail output - receives entity and context as single object
 * @param {Object} viewAndContext - Contains track entity and data context
 * @param {Object} framework - Framework config
 */
function formatDetail(viewAndContext, framework) {
  const { track, skills, behaviours, disciplines } = viewAndContext;
  console.log(
    trackToMarkdown(track, { skills, behaviours, disciplines, framework }),
  );
}

export const runTrackCommand = createEntityCommand({
  entityName: "track",
  pluralName: "tracks",
  findEntity: (data, id) => data.tracks.find((t) => t.id === id),
  presentDetail: (entity, data) => ({
    track: entity,
    skills: data.skills,
    behaviours: data.behaviours,
    disciplines: data.disciplines,
  }),
  sortItems: sortTracksByName,
  formatSummary,
  formatDetail,
  emojiIcon: "🛤️",
});
