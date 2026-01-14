/**
 * Driver CLI Command
 *
 * Handles driver summary, listing, and detail display in the terminal.
 *
 * Usage:
 *   npx pathway driver              # Summary with stats
 *   npx pathway driver --list       # IDs only (for piping)
 *   npx pathway driver <id>         # Detail view
 *   npx pathway driver --validate   # Validation checks
 */

import { createEntityCommand } from "./command-factory.js";
import { prepareDriverDetail } from "../formatters/driver/shared.js";
import { formatTable } from "../lib/cli-output.js";
import {
  formatHeader,
  formatSubheader,
  formatBullet,
} from "../lib/cli-output.js";
import { getConceptEmoji } from "../model/levels.js";

/**
 * Format driver summary output
 * @param {Array} drivers - Raw driver entities
 * @param {Object} data - Full data context
 */
function formatSummary(drivers, data) {
  const { skills, behaviours, framework } = data;
  const emoji = framework ? getConceptEmoji(framework, "driver") : "🎯";

  console.log(`\n${emoji} Drivers\n`);

  const rows = drivers.map((d) => {
    const contributingSkills = skills.filter((s) =>
      d.contributingSkills?.includes(s.id),
    ).length;
    const contributingBehaviours = behaviours.filter((b) =>
      d.contributingBehaviours?.includes(b.id),
    ).length;
    return [d.id, d.name, contributingSkills, contributingBehaviours];
  });

  console.log(formatTable(["ID", "Name", "Skills", "Behaviours"], rows));
  console.log(`\nTotal: ${drivers.length} drivers`);
  console.log(`\nRun 'npx pathway driver --list' for IDs`);
  console.log(`Run 'npx pathway driver <id>' for details\n`);
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

  console.log(formatHeader(`\n${emoji} ${view.name}\n`));
  console.log(`${view.description}\n`);

  // Contributing skills
  if (view.contributingSkills.length > 0) {
    console.log(formatSubheader("Contributing Skills\n"));
    for (const s of view.contributingSkills) {
      console.log(formatBullet(s.name, 1));
    }
    console.log();
  }

  // Contributing behaviours
  if (view.contributingBehaviours.length > 0) {
    console.log(formatSubheader("Contributing Behaviours\n"));
    for (const b of view.contributingBehaviours) {
      console.log(formatBullet(b.name, 1));
    }
    console.log();
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
  emoji: "🎯",
});
