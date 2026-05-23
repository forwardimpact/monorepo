/**
 * Agent Command
 *
 * CLI command for generating AI coding agent configurations
 * from Engineering Pathway data. Outputs follow the Claude Code
 * agent specification.
 *
 * By default, outputs to console. Use --output to write files.
 *
 * Usage:
 *   npx fit-pathway agent <discipline> --track=<track>
 *   npx fit-pathway agent <discipline> --track=<track> --output=./agents
 *   npx fit-pathway agent <discipline> --track=<track> --skills  # Plain list of skill IDs
 *   npx fit-pathway agent <discipline> --track=<track> --tools   # Plain list of tool names
 *   npx fit-pathway agent --list
 *
 * Examples:
 *   npx fit-pathway agent software_engineering --track=platform
 *   npx fit-pathway agent software_engineering --track=platform --output=./agents
 */

import { createDataLoader } from "@forwardimpact/map/loader";
import {
  generateAgentProfile,
  validateAgentProfile,
  validateAgentSkill,
  deriveReferenceLevel,
  deriveAgentSkills,
  generateSkillMarkdown,
  interpolateTeamInstructions,
  renderOrganizationalContext,
} from "@forwardimpact/libskill/agent";
import { deriveToolkit } from "@forwardimpact/libskill/toolkit";
import { formatAgentProfile } from "../formatters/agent/profile.js";
import { formatTeamInstructions } from "../formatters/agent/team-instructions.js";
import {
  formatError,
  formatSuccess,
  formatSubheader,
  formatBullet,
} from "@forwardimpact/libcli";
import { toolkitToPlainList } from "../formatters/toolkit/markdown.js";
import { listAgentCombinations } from "./agent-list.js";
import {
  generateClaudeSettings,
  generateVscodeSettings,
  writeProfile,
  writeTeamInstructions,
  writeSkills,
} from "./agent-io.js";

// Re-export so downstream consumers (build-packs, tests) can import
// findValidCombinations from './commands/agent.js' as before.
export { findValidCombinations } from "./agent-list.js";

/**
 * Assert that an entity was found, or print an error with available IDs and exit
 * @param {Object|null} entity - The resolved entity (null triggers exit)
 * @param {string} errorMessage - Error message to display
 * @param {string} listHeader - Header for the available-items list
 * @param {Array} available - Items to list (each must have an .id)
 */
function requireEntity(entity, errorMessage, listHeader, available) {
  if (entity) return;
  process.stderr.write(formatError(errorMessage) + "\n");
  process.stderr.write(`\n${listHeader}\n`);
  for (const item of available) {
    process.stderr.write(formatBullet(item.id, 1) + "\n");
  }
  process.exit(1);
}

/**
 * Resolve and validate human + agent entities for a discipline/track pair
 * @param {Object} data - Full pathway data
 * @param {Object} agentData - Agent-specific data
 * @param {string} disciplineId
 * @param {string|null} trackId
 * @returns {{humanDiscipline: Object, humanTrack: Object|null, agentDiscipline: Object, agentTrack: Object|null}}
 */
function resolveAgentEntities(data, agentData, disciplineId, trackId) {
  const humanDiscipline = data.disciplines.find((d) => d.id === disciplineId);
  const humanTrack = trackId ? data.tracks.find((t) => t.id === trackId) : null;

  requireEntity(
    humanDiscipline,
    `Unknown discipline: ${disciplineId}`,
    "Available disciplines:",
    data.disciplines,
  );
  if (trackId) {
    requireEntity(
      humanTrack,
      `Unknown track: ${trackId}`,
      "Available tracks:",
      data.tracks,
    );
  }

  const agentDiscipline = agentData.disciplines.find(
    (d) => d.id === disciplineId,
  );
  const agentTrack = trackId
    ? agentData.tracks.find((t) => t.id === trackId)
    : null;

  requireEntity(
    agentDiscipline,
    `No agent definition for discipline: ${disciplineId}`,
    "Agent definitions exist for:",
    agentData.disciplines,
  );
  if (trackId) {
    requireEntity(
      agentTrack,
      `No agent definition for track: ${trackId}`,
      "Agent definitions exist for:",
      agentData.tracks,
    );
  }

  return { humanDiscipline, humanTrack, agentDiscipline, agentTrack };
}

/**
 * Output team instructions and/or organizational context to console if present
 * @param {Object|null} agentTrack
 * @param {Object} humanDiscipline
 * @param {string|null} orgSection - Rendered organizational context section
 * @param {string} template - Mustache template for CLAUDE.md
 */
function printTeamInstructions(
  agentTrack,
  humanDiscipline,
  orgSection,
  template,
  levelForInstructions,
) {
  const teamInstructions = interpolateTeamInstructions({
    agentTrack,
    humanDiscipline,
    level: levelForInstructions,
  });
  const content = formatTeamInstructions(
    teamInstructions,
    orgSection,
    template,
  );
  if (!content) return;
  const hasTeamInstructionsContent = Boolean(teamInstructions);
  const hasOrgSection = Boolean(orgSection);
  const header =
    hasTeamInstructionsContent && hasOrgSection
      ? "# Team Instructions + Organizational Context (CLAUDE.md)"
      : hasTeamInstructionsContent
        ? "# Team Instructions (CLAUDE.md)"
        : "# Organizational Context (CLAUDE.md)";
  process.stdout.write(`${header}\n\n`);
  process.stdout.write(content + "\n");
  process.stdout.write("\n---\n\n");
}

/**
 * Handle agent generation (single profile per discipline/track)
 * @param {Object} params
 */
async function handleAgent({
  options,
  data,
  agentTrack,
  humanDiscipline,
  humanTrack,
  agentData,
  agentDiscipline,
  skillsWithAgent,
  level,
  levelForInstructions,
  templateLoader,
  dataDir,
}) {
  const profile = generateAgentProfile({
    discipline: humanDiscipline,
    track: humanTrack,
    level,
    skills: skillsWithAgent,
    capabilities: data.capabilities,
    behaviours: data.behaviours,
    agentBehaviours: agentData.behaviours,
    agentDiscipline,
    agentTrack,
  });

  const derivedSkills = deriveAgentSkills({
    discipline: humanDiscipline,
    track: humanTrack,
    level,
    skills: skillsWithAgent,
    capabilities: data.capabilities,
  });

  const skillFiles = derivedSkills
    .map((derived) => skillsWithAgent.find((s) => s.id === derived.skillId))
    .filter((skill) => skill?.agent)
    .map((skill) => generateSkillMarkdown({ skillData: skill }));

  const errors = validateAgentProfile(profile);
  if (errors.length > 0) {
    process.stderr.write(
      formatError(`Profile ${profile.frontmatter.name} validation failed:`) +
        "\n",
    );
    for (const err of errors) {
      process.stderr.write(formatBullet(err, 1) + "\n");
    }
    process.exit(1);
  }

  for (const skill of skillFiles) {
    const skillErrors = validateAgentSkill(skill);
    if (skillErrors.length > 0) {
      process.stderr.write(
        formatError(`Skill ${skill.frontmatter.name} validation failed:`) +
          "\n",
      );
      for (const err of skillErrors) {
        process.stderr.write(formatBullet(err, 1) + "\n");
      }
      process.exit(1);
    }
  }

  const agentTemplate = templateLoader.load("agent.template.md", dataDir);
  const claudeTemplate = templateLoader.load("claude.template.md", dataDir);
  const skillTemplates = {
    skill: templateLoader.load("skill.template.md", dataDir),
    install: templateLoader.load("skill-install.template.sh", dataDir),
    reference: templateLoader.load("skill-reference.template.md", dataDir),
  };

  const baseDir = options.output || ".";

  // Computed once so console and file paths share the same rendered section.
  const orgSection = renderOrganizationalContext(
    agentData.organizationalContext,
  );

  if (!options.output) {
    printTeamInstructions(
      agentTrack,
      humanDiscipline,
      orgSection,
      claudeTemplate,
      levelForInstructions,
    );
    process.stdout.write(formatAgentProfile(profile, agentTemplate) + "\n");
    return;
  }

  const teamInstructions = interpolateTeamInstructions({
    agentTrack,
    humanDiscipline,
    level: levelForInstructions,
  });
  await writeTeamInstructions(
    teamInstructions,
    orgSection,
    baseDir,
    claudeTemplate,
  );
  await writeProfile(profile, baseDir, agentTemplate);
  const fileCount = await writeSkills(skillFiles, baseDir, skillTemplates);
  await generateClaudeSettings(baseDir, agentData.claudeSettings);
  await generateVscodeSettings(baseDir, agentData.vscodeSettings);

  process.stdout.write("\n");
  process.stdout.write(
    formatSuccess(`Generated agent: ${profile.frontmatter.name}`) + "\n",
  );
  process.stdout.write(formatSubheader(`Skills: ${fileCount} files`) + "\n");
}

/**
 * Run the agent command
 * @param {Object} params - Command parameters
 * @param {Object} params.data - Loaded pathway data
 * @param {string[]} params.args - Command arguments [discipline_id]
 * @param {Object} params.options - Command options
 * @param {string} params.dataDir - Path to data directory
 */
export async function runAgentCommand({
  data,
  args,
  options,
  dataDir,
  templateLoader,
  loader,
}) {
  const dataLoader = loader || createDataLoader();
  const agentData = await dataLoader.loadAgentData(dataDir);
  const skillsWithAgent = await dataLoader.loadSkillsWithAgentData(dataDir);

  if (options.list) {
    listAgentCombinations(data, agentData, false);
    return;
  }

  if (args.length === 0) {
    process.stderr.write(
      formatError("Missing required argument: <discipline>") + "\n",
    );
    process.stderr.write(
      "\nUsage: npx fit-pathway agent <discipline> --track=<track>\n",
    );
    process.exit(1);
  }

  const [disciplineId] = args;
  const trackId = options.track;

  if (args.length > 1) {
    process.stderr.write(
      formatError(
        `Unexpected argument: ${args[1]}. Did you mean --track=${args[1]}?`,
      ) + "\n",
    );
    process.exit(1);
  }

  if (!trackId) {
    process.stderr.write(
      formatError("Missing required option: --track=<track>") + "\n",
    );
    process.stderr.write(
      "\nUsage: npx fit-pathway agent <discipline> --track=<track>\n",
    );
    process.exit(1);
  }

  const { humanDiscipline, humanTrack, agentDiscipline, agentTrack } =
    resolveAgentEntities(data, agentData, disciplineId, trackId);

  let level;
  let levelForInstructions = null;
  if (options.level) {
    level = data.levels.find((l) => l.id === options.level);
    requireEntity(
      level,
      `Unknown level: ${options.level}`,
      "Available levels:",
      data.levels,
    );
    levelForInstructions = level;
  } else {
    level = deriveReferenceLevel(data.levels);
  }

  if (options.skills) {
    const derivedSkills = deriveAgentSkills({
      discipline: humanDiscipline,
      track: humanTrack,
      level,
      skills: skillsWithAgent,
      capabilities: data.capabilities,
    });
    for (const skill of derivedSkills)
      process.stdout.write(skill.skillId + "\n");
    return;
  }

  if (options.tools) {
    const derivedSkills = deriveAgentSkills({
      discipline: humanDiscipline,
      track: humanTrack,
      level,
      skills: skillsWithAgent,
      capabilities: data.capabilities,
    });
    const toolkit = deriveToolkit({
      skillMatrix: derivedSkills,
      skills: skillsWithAgent,
    });
    process.stdout.write(toolkitToPlainList(toolkit) + "\n");
    return;
  }

  await handleAgent({
    options,
    data,
    agentTrack,
    humanDiscipline,
    humanTrack,
    agentData,
    agentDiscipline,
    skillsWithAgent,
    level,
    levelForInstructions,
    templateLoader,
    dataDir,
  });
}
