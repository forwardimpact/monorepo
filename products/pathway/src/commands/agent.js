/**
 * Agent Command
 *
 * CLI command for generating AI coding agent configurations
 * from Engineering Pathway data. Outputs follow the Claude Code
 * agent specification.
 *
 * All agents are stage-specific. Use --stage for a single stage
 * or --all-stages (default) for all stages.
 *
 * By default, outputs to console. Use --output to write files.
 *
 * Usage:
 *   npx fit-pathway agent <discipline> [--track=<track>]
 *   npx fit-pathway agent <discipline> --track=<track> --stage=plan
 *   npx fit-pathway agent <discipline> --track=<track> --output=./agents
 *   npx fit-pathway agent <discipline> [--track=<track>] --skills  # Plain list of skill IDs
 *   npx fit-pathway agent <discipline> [--track=<track>] --tools   # Plain list of tool names
 *   npx fit-pathway agent --list
 *
 * Examples:
 *   npx fit-pathway agent software_engineering --track=platform
 *   npx fit-pathway agent software_engineering --track=platform --stage=plan
 *   npx fit-pathway agent software_engineering --track=platform --output=./agents
 */

import { createDataLoader } from "@forwardimpact/map/loader";
import {
  generateStageAgentProfile,
  validateAgentProfile,
  validateAgentSkill,
  deriveReferenceLevel,
  deriveAgentSkills,
  generateSkillMarkdown,
  getDisciplineAbbreviation,
  toKebabCase,
  interpolateTeamInstructions,
} from "@forwardimpact/libskill/agent";
import { deriveToolkit } from "@forwardimpact/libskill/toolkit";
import { formatAgentProfile } from "../formatters/agent/profile.js";
import { formatError, formatSuccess } from "../lib/cli-output.js";
import { toolkitToPlainList } from "../formatters/toolkit/markdown.js";
import {
  generateClaudeCodeSettings,
  writeProfile,
  writeTeamInstructions,
  writeSkills,
} from "./agent-io.js";

/**
 * Show agent summary with stats
 * @param {Object} data - Pathway data
 * @param {Object} agentData - Agent-specific data
 * @param {Array} skillsWithAgent - Skills with agent sections
 */
function showAgentSummary(data, agentData, skillsWithAgent) {
  // Count valid combinations
  let validCombinations = 0;
  for (const discipline of agentData.disciplines) {
    for (const track of agentData.tracks) {
      const humanDiscipline = data.disciplines.find(
        (d) => d.id === discipline.id,
      );
      const humanTrack = data.tracks.find((t) => t.id === track.id);
      if (humanDiscipline && humanTrack) {
        validCombinations++;
      }
    }
  }

  const skillsWithAgentCount = skillsWithAgent.filter((s) => s.agent).length;

  console.log(`\n🤖 Agent\n`);
  console.log(
    `Disciplines: ${agentData.disciplines.length}/${data.disciplines.length} with agent definitions`,
  );
  console.log(
    `Tracks:      ${agentData.tracks.length}/${data.tracks.length} with agent definitions`,
  );
  console.log(
    `Skills:      ${skillsWithAgentCount}/${skillsWithAgent.length} with agent sections`,
  );
  console.log(`Stages:      ${data.stages.length} available`);
  console.log(`\nValid combinations: ${validCombinations}`);
  console.log(`\nRun 'npx fit-pathway agent --list' for all combinations`);
  console.log(
    `Run 'npx fit-pathway agent <discipline> <track>' to generate files\n`,
  );
}

/**
 * Find valid agent combination pairs
 * @param {Object} data - Pathway data
 * @param {Object} agentData - Agent-specific data
 * @returns {Array<{discipline: Object, track: Object, humanDiscipline: Object, humanTrack: Object}>}
 */
export function findValidCombinations(data, agentData) {
  const pairs = [];
  for (const discipline of agentData.disciplines) {
    for (const track of agentData.tracks) {
      const humanDiscipline = data.disciplines.find(
        (d) => d.id === discipline.id,
      );
      const humanTrack = data.tracks.find((t) => t.id === track.id);
      if (humanDiscipline && humanTrack) {
        pairs.push({ discipline, track, humanDiscipline, humanTrack });
      }
    }
  }
  return pairs;
}

/**
 * List available agent combinations — compact output for piping
 * @param {Object} data - Pathway data
 * @param {Object} agentData - Agent-specific data
 */
function listAgentCombinationsCompact(data, agentData) {
  for (const {
    discipline,
    track,
    humanDiscipline,
    humanTrack,
  } of findValidCombinations(data, agentData)) {
    const abbrev = getDisciplineAbbreviation(discipline.id);
    const agentName = `${abbrev}-${toKebabCase(track.id)}`;
    const specName = humanDiscipline.specialization || humanDiscipline.id;
    console.log(
      `${agentName} ${discipline.id} ${track.id}, ${specName} (${humanTrack.name})`,
    );
  }
}

/**
 * List available agent combinations — verbose output
 * @param {Object} data - Pathway data
 * @param {Object} agentData - Agent-specific data
 */
function listAgentCombinationsVerbose(data, agentData) {
  console.log("# 🤖 Available Agent Combinations\n");

  const agentDisciplineIds = new Set(agentData.disciplines.map((d) => d.id));
  const agentTrackIds = new Set(agentData.tracks.map((t) => t.id));

  console.log("## Disciplines with agent definitions:\n");
  for (const discipline of data.disciplines) {
    const status = agentDisciplineIds.has(discipline.id) ? "✅" : "⬜";
    console.log(
      `  ${status} ${discipline.id} - ${discipline.specialization || discipline.name}`,
    );
  }

  console.log("\n## Tracks with agent definitions:\n");
  for (const track of data.tracks) {
    const status = agentTrackIds.has(track.id) ? "✅" : "⬜";
    console.log(`  ${status} ${track.id} - ${track.name}`);
  }

  console.log("\n## Valid combinations:\n");
  for (const { discipline, track } of findValidCombinations(data, agentData)) {
    console.log(`  npx fit-pathway agent ${discipline.id} ${track.id}`);
  }

  console.log("\n## Available stages:\n");
  for (const stage of data.stages) {
    console.log(`  --stage=${stage.id}: ${stage.description.split(" - ")[0]}`);
  }
}

/**
 * List available agent combinations (clean output for piping)
 * @param {Object} data - Pathway data
 * @param {Object} agentData - Agent-specific data
 * @param {boolean} verbose - Show verbose output
 */
function listAgentCombinations(data, agentData, verbose = false) {
  if (verbose) {
    listAgentCombinationsVerbose(data, agentData);
  } else {
    listAgentCombinationsCompact(data, agentData);
  }
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

  if (!humanDiscipline) {
    console.error(formatError(`Unknown discipline: ${disciplineId}`));
    console.error("\nAvailable disciplines:");
    for (const d of data.disciplines) console.error(`  - ${d.id}`);
    process.exit(1);
  }
  if (trackId && !humanTrack) {
    console.error(formatError(`Unknown track: ${trackId}`));
    console.error("\nAvailable tracks:");
    for (const t of data.tracks) console.error(`  - ${t.id}`);
    process.exit(1);
  }

  const agentDiscipline = agentData.disciplines.find(
    (d) => d.id === disciplineId,
  );
  const agentTrack = trackId
    ? agentData.tracks.find((t) => t.id === trackId)
    : null;

  if (!agentDiscipline) {
    console.error(
      formatError(`No agent definition for discipline: ${disciplineId}`),
    );
    console.error("\nAgent definitions exist for:");
    for (const d of agentData.disciplines) console.error(`  - ${d.id}`);
    process.exit(1);
  }
  if (trackId && !agentTrack) {
    console.error(formatError(`No agent definition for track: ${trackId}`));
    console.error("\nAgent definitions exist for:");
    for (const t of agentData.tracks) console.error(`  - ${t.id}`);
    process.exit(1);
  }

  return { humanDiscipline, humanTrack, agentDiscipline, agentTrack };
}

/**
 * Output team instructions to console if present
 * @param {Object|null} agentTrack
 * @param {Object} humanDiscipline
 */
function printTeamInstructions(agentTrack, humanDiscipline) {
  const teamInstructions = interpolateTeamInstructions({
    agentTrack,
    humanDiscipline,
  });
  if (teamInstructions) {
    console.log("# Team Instructions (CLAUDE.md)\n");
    console.log(teamInstructions.trim());
    console.log("\n---\n");
  }
}

/**
 * Handle single-stage agent generation
 * @param {Object} params
 */
async function handleSingleStage({
  stageParams,
  options,
  data,
  agentTrack,
  humanDiscipline,
  agentData,
  templateLoader,
  dataDir,
}) {
  const stage = data.stages.find((s) => s.id === options.stage);
  if (!stage) {
    console.error(formatError(`Unknown stage: ${options.stage}`));
    console.error("\nAvailable stages:");
    for (const s of data.stages) console.error(`  - ${s.id}`);
    process.exit(1);
  }

  const profile = generateStageAgentProfile({ ...stageParams, stage });
  const errors = validateAgentProfile(profile);
  if (errors.length > 0) {
    console.error(formatError("Profile validation failed:"));
    for (const err of errors) console.error(`  - ${err}`);
    process.exit(1);
  }

  const agentTemplate = templateLoader.load("agent.template.md", dataDir);
  const baseDir = options.output || ".";

  if (!options.output) {
    printTeamInstructions(agentTrack, humanDiscipline);
    console.log(formatAgentProfile(profile, agentTemplate));
    return;
  }

  const teamInstructions = interpolateTeamInstructions({
    agentTrack,
    humanDiscipline,
  });
  await writeTeamInstructions(teamInstructions, baseDir);
  await writeProfile(profile, baseDir, agentTemplate);
  await generateClaudeCodeSettings(baseDir, agentData.claudeCodeSettings);
  console.log("");
  console.log(
    formatSuccess(`Generated stage agent: ${profile.frontmatter.name}`),
  );
}

/**
 * Handle all-stages agent generation
 * @param {Object} params
 */
async function handleAllStages({
  stageParams,
  options,
  data,
  agentTrack,
  humanDiscipline,
  humanTrack,
  agentData,
  skillsWithAgent,
  level,
  templateLoader,
  dataDir,
}) {
  const profiles = data.stages.map((stage) =>
    generateStageAgentProfile({ ...stageParams, stage }),
  );

  const derivedSkills = deriveAgentSkills({
    discipline: humanDiscipline,
    track: humanTrack,
    level,
    skills: skillsWithAgent,
  });

  const skillFiles = derivedSkills
    .map((derived) => skillsWithAgent.find((s) => s.id === derived.skillId))
    .filter((skill) => skill?.agent)
    .map((skill) =>
      generateSkillMarkdown({ skillData: skill, stages: data.stages }),
    );

  for (const profile of profiles) {
    const errors = validateAgentProfile(profile);
    if (errors.length > 0) {
      console.error(
        formatError(`Profile ${profile.frontmatter.name} validation failed:`),
      );
      for (const err of errors) console.error(`  - ${err}`);
      process.exit(1);
    }
  }

  for (const skill of skillFiles) {
    const errors = validateAgentSkill(skill);
    if (errors.length > 0) {
      console.error(
        formatError(`Skill ${skill.frontmatter.name} validation failed:`),
      );
      for (const err of errors) console.error(`  - ${err}`);
      process.exit(1);
    }
  }

  const agentTemplate = templateLoader.load("agent.template.md", dataDir);
  const skillTemplates = {
    skill: templateLoader.load("skill.template.md", dataDir),
    install: templateLoader.load("skill-install.template.sh", dataDir),
    reference: templateLoader.load("skill-reference.template.md", dataDir),
  };

  const baseDir = options.output || ".";

  if (!options.output) {
    printTeamInstructions(agentTrack, humanDiscipline);
    for (const profile of profiles) {
      console.log(formatAgentProfile(profile, agentTemplate));
      console.log("\n---\n");
    }
    return;
  }

  const teamInstructions = interpolateTeamInstructions({
    agentTrack,
    humanDiscipline,
  });
  await writeTeamInstructions(teamInstructions, baseDir);
  for (const profile of profiles) {
    await writeProfile(profile, baseDir, agentTemplate);
  }
  const fileCount = await writeSkills(skillFiles, baseDir, skillTemplates);
  await generateClaudeCodeSettings(baseDir, agentData.claudeCodeSettings);

  console.log("");
  console.log(formatSuccess(`Generated ${profiles.length} agents:`));
  for (const profile of profiles) {
    console.log(`  - ${profile.frontmatter.name}`);
  }
  console.log(`  Skills: ${fileCount} files`);
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
    showAgentSummary(data, agentData, skillsWithAgent);
    return;
  }

  const [disciplineId] = args;
  const trackId = options.track;

  if (args.length > 1) {
    console.error(
      formatError(
        `Unexpected argument: ${args[1]}. Did you mean --track=${args[1]}?`,
      ),
    );
    process.exit(1);
  }

  const { humanDiscipline, humanTrack, agentDiscipline, agentTrack } =
    resolveAgentEntities(data, agentData, disciplineId, trackId);

  const level = deriveReferenceLevel(data.levels);

  if (options.skills) {
    const derivedSkills = deriveAgentSkills({
      discipline: humanDiscipline,
      track: humanTrack,
      level,
      skills: skillsWithAgent,
    });
    for (const skill of derivedSkills) console.log(skill.skillId);
    return;
  }

  if (options.tools) {
    const derivedSkills = deriveAgentSkills({
      discipline: humanDiscipline,
      track: humanTrack,
      level,
      skills: skillsWithAgent,
    });
    const toolkit = deriveToolkit({
      skillMatrix: derivedSkills,
      skills: skillsWithAgent,
    });
    console.log(toolkitToPlainList(toolkit));
    return;
  }

  const stageParams = {
    discipline: humanDiscipline,
    track: humanTrack,
    level,
    skills: skillsWithAgent,
    behaviours: data.behaviours,
    agentBehaviours: agentData.behaviours,
    agentDiscipline,
    agentTrack,
    stages: data.stages,
  };

  const commonCtx = {
    stageParams,
    options,
    data,
    agentTrack,
    humanDiscipline,
    humanTrack,
    agentData,
    skillsWithAgent,
    level,
    templateLoader,
    dataDir,
  };

  if (options.stage) {
    await handleSingleStage(commonCtx);
  } else {
    await handleAllStages(commonCtx);
  }
}
