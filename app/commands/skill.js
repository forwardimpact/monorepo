/**
 * Skill CLI Command
 *
 * Handles skill summary, listing, and detail display in the terminal.
 *
 * Usage:
 *   npx pathway skill              # Summary with stats
 *   npx pathway skill --list       # IDs only (for piping)
 *   npx pathway skill <id>         # Detail view
 *   npx pathway skill --validate   # Validation checks
 */

import { createEntityCommand } from "./command-factory.js";
import { skillToMarkdown } from "../formatters/skill/markdown.js";
import { prepareSkillsList } from "../formatters/skill/shared.js";
import { getConceptEmoji } from "../model/levels.js";
import { formatTable } from "../lib/cli-output.js";

/**
 * Format skill summary output
 * @param {Array} skills - Raw skill entities
 * @param {Object} data - Full data context
 */
function formatSummary(skills, data) {
  const { capabilities, framework } = data;
  const { groups, groupOrder } = prepareSkillsList(skills, capabilities);
  const emoji = framework ? getConceptEmoji(framework, "skill") : "📚";

  console.log(`\n${emoji} Skills\n`);

  // Summary table by capability
  const rows = groupOrder.map((capability) => {
    const count = groups[capability]?.length || 0;
    const withAgent = groups[capability]?.filter((s) => s.agent).length || 0;
    return [capability, count, withAgent];
  });

  console.log(formatTable(["Capability", "Count", "Agent"], rows));
  console.log(`\nTotal: ${skills.length} skills`);
  console.log(`\nRun 'npx pathway skill --list' for IDs`);
  console.log(`Run 'npx pathway skill <id>' for details\n`);
}

/**
 * Format skill detail output
 * @param {Object} viewAndContext - Contains skill entity and context
 * @param {Object} framework - Framework config
 */
function formatDetail(viewAndContext, framework) {
  const { skill, disciplines, tracks, drivers, capabilities } = viewAndContext;
  console.log(
    skillToMarkdown(skill, {
      disciplines,
      tracks,
      drivers,
      capabilities,
      framework,
    }),
  );
}

export const runSkillCommand = createEntityCommand({
  entityName: "skill",
  pluralName: "skills",
  findEntity: (data, id) => data.skills.find((s) => s.id === id),
  presentDetail: (entity, data) => ({
    skill: entity,
    disciplines: data.disciplines,
    tracks: data.tracks,
    drivers: data.drivers,
    capabilities: data.capabilities,
  }),
  formatSummary,
  formatDetail,
  emoji: "📚",
});
