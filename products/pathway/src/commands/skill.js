/**
 * Skill CLI Command
 *
 * Handles skill summary, listing, and detail display in the terminal.
 *
 * Usage:
 *   npx fit-pathway skill              # Summary with stats
 *   npx fit-pathway skill --list       # IDs only (for piping)
 *   npx fit-pathway skill <id>         # Detail view
 *   npx fit-pathway skill <id> --agent # Agent SKILL.md output
 *   npx fit-pathway skill --validate   # Validation checks
 */

import { createEntityCommand } from "./command-factory.js";
import { skillToMarkdown } from "../formatters/skill/markdown.js";
import { prepareSkillsList } from "../formatters/skill/shared.js";
import { getConceptEmoji } from "@forwardimpact/map/levels";
import {
  formatTable,
  formatError,
  formatHeader,
  formatSubheader,
  formatBullet,
} from "@forwardimpact/libcli";
import { generateSkillMarkdown } from "@forwardimpact/libskill/agent";
import { formatAgentSkill } from "../formatters/agent/skill.js";

/**
 * Format skill summary output
 * @param {Array} skills - Raw skill entities
 * @param {Object} data - Full data context
 */
function formatSummary(skills, data) {
  const { capabilities, framework } = data;
  const { groups, groupOrder } = prepareSkillsList(skills, capabilities);
  const emoji = framework ? getConceptEmoji(framework, "skill") : "📚";

  process.stdout.write("\n" + formatHeader(`${emoji} Skills`) + "\n\n");

  // Summary table by capability
  const rows = groupOrder.map((capability) => {
    const count = groups[capability]?.length || 0;
    const withAgent = groups[capability]?.filter((s) => s.agent).length || 0;
    return [capability, count, withAgent];
  });

  process.stdout.write(
    formatTable(["Capability", "Count", "Agent"], rows) + "\n",
  );
  process.stdout.write(
    "\n" + formatSubheader(`Total: ${skills.length} skills`) + "\n\n",
  );
  process.stdout.write(
    formatBullet("Run 'npx fit-pathway skill --list' for IDs") + "\n",
  );
  process.stdout.write(
    formatBullet("Run 'npx fit-pathway skill <id>' for details") + "\n\n",
  );
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
async function formatAgentDetail(skill, stages, templateLoader, dataDir) {
  if (!skill.agent) {
    process.stderr.write(
      formatError(`Skill '${skill.id}' has no agent section`) + "\n",
    );
    process.stderr.write("\nSkills with agent support:\n");
    process.stderr.write(
      `  npx fit-pathway skill --list | xargs -I{} sh -c 'npx fit-pathway skill {} --json | jq -e .skill.agent > /dev/null && echo {}'\n`,
    );
    process.exit(1);
  }

  const template = templateLoader.load("skill.template.md", dataDir);
  const skillMd = generateSkillMarkdown({ skillData: skill, stages });
  const output = formatAgentSkill(skillMd, template);
  process.stdout.write(output + "\n");
}

/**
 * Format skill list item for --list output
 * @param {Object} skill - Skill entity
 * @returns {string} Formatted list line
 */
function formatListItem(skill) {
  return `${skill.id}, ${skill.name}, ${skill.capability || "-"}`;
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
  formatListItem,
  emojiIcon: "📚",
});

/**
 * Run skill command with --agent support
 * @param {Object} params - Command parameters
 * @param {Object} params.data - Loaded pathway data
 * @param {string[]} params.args - Command arguments
 * @param {Object} params.options - Command options
 * @param {string} params.dataDir - Path to data directory
 */
export async function runSkillCommand({
  data,
  args,
  options,
  dataDir,
  templateLoader,
}) {
  // Handle --agent flag for detail view
  if (options.agent && args.length > 0) {
    const [id] = args;
    const skill = data.skills.find((s) => s.id === id);

    if (!skill) {
      process.stderr.write(formatError(`Skill not found: ${id}`) + "\n");
      process.stderr.write(
        `Available: ${data.skills.map((s) => s.id).join(", ")}\n`,
      );
      process.exit(1);
    }

    await formatAgentDetail(skill, data.stages, templateLoader, dataDir);
    return;
  }

  // Delegate to base command for all other cases
  return baseSkillCommand({ data, args, options, dataDir });
}
