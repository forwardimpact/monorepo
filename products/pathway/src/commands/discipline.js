/**
 * Discipline CLI Command
 *
 * Handles discipline summary, listing, and detail display in the terminal.
 *
 * Usage:
 *   npx fit-pathway discipline              # Summary with stats
 *   npx fit-pathway discipline --list       # IDs only (for piping)
 *   npx fit-pathway discipline <id>         # Detail view
 *   npx fit-pathway discipline --validate   # Validation checks
 */

import { createEntityCommand } from "./command-factory.js";
import { disciplineToMarkdown } from "../formatters/discipline/markdown.js";
import {
  formatTable,
  formatHeader,
  formatSubheader,
  formatBullet,
} from "@forwardimpact/libcli";

/**
 * Format discipline summary output
 * @param {Array} disciplines - Raw discipline entities
 */
function formatSummary(disciplines, _data, runtime) {
  runtime.proc.stdout.write(
    "\n" + formatHeader("\u{1F4CB} Disciplines") + "\n\n",
  );

  const rows = disciplines.map((d) => {
    const type = d.isProfessional ? "Professional" : "Management";
    const validTracks = (d.validTracks || []).filter((t) => t !== null);
    const trackStr = validTracks.length > 0 ? validTracks.join(", ") : "—";
    return [d.id, d.specialization || d.id, type, trackStr];
  });

  runtime.proc.stdout.write(
    formatTable(["ID", "Specialization", "Type", "Tracks"], rows) + "\n",
  );
  runtime.proc.stdout.write(
    "\n" + formatSubheader(`Total: ${disciplines.length} disciplines`) + "\n\n",
  );
  runtime.proc.stdout.write(
    formatBullet("Run 'npx fit-pathway discipline --list' for IDs") + "\n",
  );
  runtime.proc.stdout.write(
    formatBullet("Run 'npx fit-pathway discipline <id>' for details") + "\n\n",
  );
}

/**
 * Format discipline detail output
 * @param {Object} viewAndContext - Contains discipline entity and context
 */
function formatDetail(viewAndContext, _standard, runtime) {
  const { discipline, skills, behaviours, tracks } = viewAndContext;
  runtime.proc.stdout.write(
    disciplineToMarkdown(discipline, { skills, behaviours, tracks }) + "\n",
  );
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
  emojiIcon: "📋",
});
