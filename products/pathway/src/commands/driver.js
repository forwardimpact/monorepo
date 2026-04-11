/**
 * Driver CLI Command
 *
 * Handles driver summary, listing, and detail display in the terminal.
 *
 * Usage:
 *   npx fit-pathway driver              # Summary with stats
 *   npx fit-pathway driver --list       # IDs only (for piping)
 *   npx fit-pathway driver <id>         # Detail view
 *   npx fit-pathway driver --validate   # Validation checks
 */

import { createEntityCommand } from "./command-factory.js";
import { prepareDriverDetail } from "../formatters/driver/shared.js";
import {
  formatTable,
  formatHeader,
  formatSubheader,
  formatBullet,
} from "@forwardimpact/libcli";
import { getConceptEmoji } from "@forwardimpact/map/levels";

/**
 * Format driver list item for --list output
 * @param {Object} driver - Driver entity
 * @returns {string} Formatted list line
 */
function formatListItem(driver) {
  return `${driver.id}, ${driver.name}`;
}

/**
 * Format driver summary output
 * @param {Array} drivers - Raw driver entities
 * @param {Object} data - Full data context
 */
function formatSummary(drivers, data) {
  const { skills, behaviours, framework } = data;
  const emoji = framework ? getConceptEmoji(framework, "driver") : "🎯";

  process.stdout.write("\n" + formatHeader(`${emoji} Drivers`) + "\n\n");

  const rows = drivers.map((d) => {
    const contributingSkills = skills.filter((s) =>
      d.contributingSkills?.includes(s.id),
    ).length;
    const contributingBehaviours = behaviours.filter((b) =>
      d.contributingBehaviours?.includes(b.id),
    ).length;
    return [d.id, d.name, contributingSkills, contributingBehaviours];
  });

  process.stdout.write(
    formatTable(["ID", "Name", "Skills", "Behaviours"], rows) + "\n",
  );
  process.stdout.write(
    "\n" + formatSubheader(`Total: ${drivers.length} drivers`) + "\n\n",
  );
  process.stdout.write(
    formatBullet("Run 'npx fit-pathway driver --list' for IDs and names") +
      "\n",
  );
  process.stdout.write(
    formatBullet("Run 'npx fit-pathway driver <id>' for details") + "\n\n",
  );
}

/**
 * Format driver detail output
 * @param {Object} viewAndContext - Contains driver entity and context
 * @param {Object} framework - Framework config
 */
function formatDetail(viewAndContext, framework) {
  const { driver, skills, behaviours } = viewAndContext;
  const view = prepareDriverDetail(driver, { skills, behaviours });
  const emoji = framework ? getConceptEmoji(framework, "driver") : "🎯";

  process.stdout.write("\n" + formatHeader(`${emoji} ${view.name}`) + "\n\n");
  process.stdout.write(view.description + "\n\n");

  // Contributing skills
  if (view.contributingSkills.length > 0) {
    process.stdout.write(formatSubheader("Contributing Skills") + "\n\n");
    for (const s of view.contributingSkills) {
      process.stdout.write(formatBullet(s.name, 1) + "\n");
    }
    process.stdout.write("\n");
  }

  // Contributing behaviours
  if (view.contributingBehaviours.length > 0) {
    process.stdout.write(formatSubheader("Contributing Behaviours") + "\n\n");
    for (const b of view.contributingBehaviours) {
      process.stdout.write(formatBullet(b.name, 1) + "\n");
    }
    process.stdout.write("\n");
  }
}

export const runDriverCommand = createEntityCommand({
  entityName: "driver",
  pluralName: "drivers",
  findEntity: (data, id) => data.drivers.find((d) => d.id === id),
  presentDetail: (entity, data) => ({
    driver: entity,
    skills: data.skills,
    behaviours: data.behaviours,
  }),
  formatSummary,
  formatDetail,
  formatListItem,
  emojiIcon: "🎯",
});
