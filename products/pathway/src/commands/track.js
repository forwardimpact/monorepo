/**
 * Track CLI Command
 *
 * Handles track summary, listing, and detail display in the terminal.
 *
 * Usage:
 *   npx fit-pathway track              # Summary with stats
 *   npx fit-pathway track --list       # IDs only (for piping)
 *   npx fit-pathway track <id>         # Detail view
 *   npx fit-pathway track --validate   # Validation checks
 */

import { createEntityCommand } from "./command-factory.js";
import { trackToMarkdown } from "../formatters/track/markdown.js";
import { sortTracksByName } from "../formatters/track/shared.js";
import {
  formatTable,
  formatHeader,
  formatSubheader,
  formatBullet,
} from "@forwardimpact/libcli";
import { getConceptEmoji } from "@forwardimpact/libskill/levels";

/**
 * Format track summary output
 * @param {Array} tracks - Raw track entities
 * @param {Object} data - Full data context
 */
function formatSummary(tracks, data, runtime) {
  const { standard, disciplines } = data;
  const emoji = standard ? getConceptEmoji(standard, "track") : "🛤️";

  runtime.proc.stdout.write("\n" + formatHeader(`${emoji} Tracks`) + "\n\n");

  const rows = tracks.map((t) => {
    const modCount = Object.keys(t.skillModifiers || {}).length;
    const usedBy = disciplines
      ? disciplines.filter((d) => d.validTracks && d.validTracks.includes(t.id))
      : [];
    const disciplineNames = usedBy
      .map((d) => d.specialization || d.id)
      .join(", ");
    return [t.id, t.name, modCount, disciplineNames || "—"];
  });

  runtime.proc.stdout.write(
    formatTable(["ID", "Name", "Modifiers", "Disciplines"], rows) + "\n",
  );
  runtime.proc.stdout.write(
    "\n" + formatSubheader(`Total: ${tracks.length} tracks`) + "\n\n",
  );
  runtime.proc.stdout.write(
    formatBullet("Run 'npx fit-pathway track --list' for IDs") + "\n",
  );
  runtime.proc.stdout.write(
    formatBullet("Run 'npx fit-pathway track <id>' for details") + "\n\n",
  );
}

/**
 * Format track detail output - receives entity and context as single object
 * @param {Object} viewAndContext - Contains track entity and data context
 * @param {Object} standard - Standard config
 */
function formatDetail(viewAndContext, standard, runtime) {
  const { track, skills, behaviours, disciplines } = viewAndContext;
  runtime.proc.stdout.write(
    trackToMarkdown(track, { skills, behaviours, disciplines, standard }) +
      "\n",
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
