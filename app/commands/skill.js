/**
 * Skill CLI Command
 *
 * Handles skill summary, listing, and detail display in the terminal.
 *
 * Usage:
 *   npx pathway skill              # Summary with stats
 *   npx pathway skill --list       # IDs only (for piping)
 *   npx pathway skill <id>         # Detail view
 *   npx pathway skill <id> --agent # Agent SKILL.md output
 *   npx pathway skill --validate   # Validation checks
 */

import { createEntityCommand } from "./command-factory.js";
import { skillToMarkdown } from "../formatters/skill/markdown.js";
import { prepareSkillsList } from "../formatters/skill/shared.js";
import { getConceptEmoji } from "../model/levels.js";
import { formatTable, formatError } from "../lib/cli-output.js";
import { generateSkillMd } from "../model/agent.js";
import { formatAgentSkill } from "../formatters/agent/skill.js";
import { loadSkillTemplate } from "../lib/template-loader.js";

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

/**
 * Format skill as agent SKILL.md output
 * @param {Object} skill - Skill entity with agent section
 * @param {Array} stages - All stage entities
 * @param {string} dataDir - Path to data directory for template loading
 */
async function formatAgentDetail(skill, stages, dataDir) {
  if (!skill.agent) {
    console.error(formatError(`Skill '${skill.id}' has no agent section`));
    console.error(`\nSkills with agent support:`);
    console.error(
      `  npx pathway skill --list | xargs -I{} sh -c 'npx pathway skill {} --json | jq -e .skill.agent > /dev/null && echo {}'`,
    );
    process.exit(1);
  }

  const template = await loadSkillTemplate(dataDir);
  const skillMd = generateSkillMd(skill, stages);
  const output = formatAgentSkill(skillMd, template);
  console.log(output);
}

const baseSkillCommand = createEntityCommand({
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

/**
 * Run skill command with --agent support
 * @param {Object} params - Command parameters
 * @param {Object} params.data - Loaded pathway data
 * @param {string[]} params.args - Command arguments
 * @param {Object} params.options - Command options
 * @param {string} params.dataDir - Path to data directory
 */
export async function runSkillCommand({ data, args, options, dataDir }) {
  // Handle --agent flag for detail view
  if (options.agent && args.length > 0) {
    const [id] = args;
    const skill = data.skills.find((s) => s.id === id);

    if (!skill) {
      console.error(formatError(`Skill not found: ${id}`));
      console.error(`Available: ${data.skills.map((s) => s.id).join(", ")}`);
      process.exit(1);
    }

    await formatAgentDetail(skill, data.stages, dataDir);
    return;
  }

  // Delegate to base command for all other cases
  return baseSkillCommand({ data, args, options, dataDir });
}
