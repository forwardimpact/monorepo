/**
 * Agent Command
 *
 * CLI command for generating AI coding agent configurations
 * from Engineering Pathway data.
 *
 * All agents are stage-specific. Use --stage for a single stage
 * or --all-stages (default) for all stages.
 *
 * By default, outputs to console. Use --output to write files.
 *
 * Usage:
 *   npx pathway agent <discipline> [--track=<track>]
 *   npx pathway agent <discipline> --track=<track> --stage=plan
 *   npx pathway agent <discipline> --track=<track> --output=./agents
 *   npx pathway agent --list
 *
 * Examples:
 *   npx pathway agent software_engineering --track=platform
 *   npx pathway agent software_engineering --track=platform --stage=plan
 *   npx pathway agent software_engineering --track=platform --output=./agents
 */

import { writeFile, mkdir, readFile } from "fs/promises";
import { join, dirname } from "path";
import { existsSync } from "fs";
import { stringify as stringifyYaml } from "yaml";
import {
  loadAgentData,
  loadSkillsWithAgentData,
} from "@forwardimpact/schema/loader";
import {
  generateStageAgentProfile,
  validateAgentProfile,
  validateAgentSkill,
  deriveReferenceGrade,
  deriveAgentSkills,
  generateSkillMd,
} from "@forwardimpact/model/agent";
import { formatAgentProfile } from "../formatters/agent/profile.js";
import { formatAgentSkill } from "../formatters/agent/skill.js";
import { formatError, formatSuccess } from "../lib/cli-output.js";
import {
  loadAgentTemplate,
  loadSkillTemplate,
} from "../lib/template-loader.js";

/**
 * Ensure directory exists for a file path
 * @param {string} filePath - Full file path
 */
async function ensureDir(filePath) {
  await mkdir(dirname(filePath), { recursive: true });
}

/**
 * Generate VS Code settings file with required settings
 * Merges with existing settings if file exists
 * @param {string} baseDir - Base output directory
 * @param {Object} vscodeSettings - Settings loaded from data
 */
async function generateVSCodeSettings(baseDir, vscodeSettings) {
  const settingsPath = join(baseDir, ".vscode", "settings.json");

  let settings = {};
  if (existsSync(settingsPath)) {
    const content = await readFile(settingsPath, "utf-8");
    settings = JSON.parse(content);
  }

  const merged = { ...settings, ...vscodeSettings };

  await ensureDir(settingsPath);
  await writeFile(
    settingsPath,
    JSON.stringify(merged, null, 2) + "\n",
    "utf-8",
  );
  console.log(formatSuccess(`Updated: ${settingsPath}`));
}

/**
 * Generate devcontainer.json from template with VS Code settings embedded
 * @param {string} baseDir - Base output directory
 * @param {Object} devcontainerConfig - Devcontainer config loaded from data
 * @param {Object} vscodeSettings - VS Code settings to embed in customizations
 */
async function generateDevcontainer(
  baseDir,
  devcontainerConfig,
  vscodeSettings,
) {
  if (!devcontainerConfig || Object.keys(devcontainerConfig).length === 0) {
    return;
  }

  const devcontainerPath = join(baseDir, ".devcontainer", "devcontainer.json");

  // Build devcontainer.json with VS Code settings embedded
  const devcontainer = {
    ...devcontainerConfig,
    customizations: {
      vscode: {
        settings: vscodeSettings,
      },
    },
  };

  await ensureDir(devcontainerPath);
  await writeFile(
    devcontainerPath,
    JSON.stringify(devcontainer, null, 2) + "\n",
    "utf-8",
  );
  console.log(formatSuccess(`Created: ${devcontainerPath}`));
}

/**
 * Generate GitHub Actions workflow for Copilot Coding Agent setup steps
 * @param {string} baseDir - Base output directory
 * @param {Object|null} copilotSetupSteps - Workflow config loaded from data
 */
async function generateCopilotSetupSteps(baseDir, copilotSetupSteps) {
  if (!copilotSetupSteps) {
    return;
  }

  const workflowPath = join(
    baseDir,
    ".github",
    "workflows",
    "copilot-setup-steps.yml",
  );

  await ensureDir(workflowPath);
  await writeFile(workflowPath, stringifyYaml(copilotSetupSteps), "utf-8");
  console.log(formatSuccess(`Created: ${workflowPath}`));
}

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
  console.log(`\nRun 'npx pathway agent --list' for all combinations`);
  console.log(
    `Run 'npx pathway agent <discipline> <track>' to generate files\n`,
  );
}

/**
 * List available agent combinations (clean output for piping)
 * @param {Object} data - Pathway data
 * @param {Object} agentData - Agent-specific data
 * @param {boolean} verbose - Show verbose output
 */
function listAgentCombinations(data, agentData, verbose = false) {
  if (!verbose) {
    // Clean output for piping
    for (const discipline of agentData.disciplines) {
      for (const track of agentData.tracks) {
        const humanDiscipline = data.disciplines.find(
          (d) => d.id === discipline.id,
        );
        const humanTrack = data.tracks.find((t) => t.id === track.id);
        if (humanDiscipline && humanTrack) {
          console.log(`${discipline.id} ${track.id}`);
        }
      }
    }
    return;
  }

  // Verbose output
  console.log("# 🤖 Available Agent Combinations\n");

  const agentDisciplineIds = new Set(agentData.disciplines.map((d) => d.id));
  const agentTrackIds = new Set(agentData.tracks.map((t) => t.id));

  console.log("## Disciplines with agent definitions:\n");
  for (const discipline of data.disciplines) {
    const hasAgent = agentDisciplineIds.has(discipline.id);
    const status = hasAgent ? "✅" : "⬜";
    console.log(
      `  ${status} ${discipline.id} - ${discipline.specialization || discipline.name}`,
    );
  }

  console.log("\n## Tracks with agent definitions:\n");
  for (const track of data.tracks) {
    const hasAgent = agentTrackIds.has(track.id);
    const status = hasAgent ? "✅" : "⬜";
    console.log(`  ${status} ${track.id} - ${track.name}`);
  }

  console.log("\n## Valid combinations:\n");
  for (const discipline of agentData.disciplines) {
    for (const track of agentData.tracks) {
      const humanDiscipline = data.disciplines.find(
        (d) => d.id === discipline.id,
      );
      const humanTrack = data.tracks.find((t) => t.id === track.id);
      if (humanDiscipline && humanTrack) {
        console.log(`  npx pathway agent ${discipline.id} ${track.id}`);
      }
    }
  }

  console.log("\n## Available stages:\n");
  for (const stage of data.stages) {
    console.log(`  --stage=${stage.id}: ${stage.description.split(" - ")[0]}`);
  }
}

/**
 * Write agent profile to file
 * @param {Object} profile - Generated profile
 * @param {string} baseDir - Base output directory
 * @param {string} template - Mustache template for agent profile
 */
async function writeProfile(profile, baseDir, template) {
  const profilePath = join(baseDir, ".github", "agents", profile.filename);
  const profileContent = formatAgentProfile(profile, template);
  await ensureDir(profilePath);
  await writeFile(profilePath, profileContent, "utf-8");
  console.log(formatSuccess(`Created: ${profilePath}`));
  return profilePath;
}

/**
 * Write skill files
 * @param {Array} skills - Generated skills
 * @param {string} baseDir - Base output directory
 * @param {string} template - Mustache template for skills
 */
async function writeSkills(skills, baseDir, template) {
  for (const skill of skills) {
    const skillPath = join(
      baseDir,
      ".claude",
      "skills",
      skill.dirname,
      "SKILL.md",
    );
    const skillContent = formatAgentSkill(skill, template);
    await ensureDir(skillPath);
    await writeFile(skillPath, skillContent, "utf-8");
    console.log(formatSuccess(`Created: ${skillPath}`));
  }
}

/**
 * Run the agent command
 * @param {Object} params - Command parameters
 * @param {Object} params.data - Loaded pathway data
 * @param {string[]} params.args - Command arguments [discipline_id]
 * @param {Object} params.options - Command options
 * @param {string} params.dataDir - Path to data directory
 */
export async function runAgentCommand({ data, args, options, dataDir }) {
  // Load agent-specific data
  const agentData = await loadAgentData(dataDir);
  const skillsWithAgent = await loadSkillsWithAgentData(dataDir);

  // --list: Output clean lines for piping
  if (options.list) {
    listAgentCombinations(data, agentData, false);
    return;
  }

  // No args: Show summary
  if (args.length === 0) {
    showAgentSummary(data, agentData, skillsWithAgent);
    return;
  }

  const [disciplineId] = args;
  const trackId = options.track;

  if (!disciplineId) {
    console.error(
      formatError(
        "Usage: npx pathway agent <discipline_id> [--track=<track_id>]",
      ),
    );
    console.error(
      "\nRun 'npx pathway agent --list' to see available combinations.",
    );
    process.exit(1);
  }

  // Look up human definitions
  const humanDiscipline = data.disciplines.find((d) => d.id === disciplineId);
  const humanTrack = trackId ? data.tracks.find((t) => t.id === trackId) : null;

  if (!humanDiscipline) {
    console.error(formatError(`Unknown discipline: ${disciplineId}`));
    console.error("\nAvailable disciplines:");
    for (const d of data.disciplines) {
      console.error(`  - ${d.id}`);
    }
    process.exit(1);
  }

  if (trackId && !humanTrack) {
    console.error(formatError(`Unknown track: ${trackId}`));
    console.error("\nAvailable tracks:");
    for (const t of data.tracks) {
      console.error(`  - ${t.id}`);
    }
    process.exit(1);
  }

  // Look up agent definitions
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
    for (const d of agentData.disciplines) {
      console.error(`  - ${d.id}`);
    }
    process.exit(1);
  }

  if (trackId && !agentTrack) {
    console.error(formatError(`No agent definition for track: ${trackId}`));
    console.error("\nAgent definitions exist for:");
    for (const t of agentData.tracks) {
      console.error(`  - ${t.id}`);
    }
    process.exit(1);
  }

  // Get reference grade for derivation
  const grade = deriveReferenceGrade(data.grades);

  const baseDir = options.output || ".";

  // Common params for stage-based generation
  const stageParams = {
    discipline: humanDiscipline,
    track: humanTrack,
    grade,
    skills: skillsWithAgent,
    behaviours: data.behaviours,
    agentBehaviours: agentData.behaviours,
    agentDiscipline,
    agentTrack,
    capabilities: data.capabilities,
    stages: data.stages,
  };

  // Handle --stage flag for single stage agent
  if (options.stage) {
    const stage = data.stages.find((s) => s.id === options.stage);
    if (!stage) {
      console.error(formatError(`Unknown stage: ${options.stage}`));
      console.error("\nAvailable stages:");
      for (const s of data.stages) {
        console.error(`  - ${s.id}`);
      }
      process.exit(1);
    }

    const profile = generateStageAgentProfile({ ...stageParams, stage });

    // Validate
    const errors = validateAgentProfile(profile);
    if (errors.length > 0) {
      console.error(formatError("Profile validation failed:"));
      for (const err of errors) {
        console.error(`  - ${err}`);
      }
      process.exit(1);
    }

    // Load template
    const agentTemplate = await loadAgentTemplate(dataDir);

    // Output to console (default) or write to files (with --output)
    if (!options.output) {
      console.log(formatAgentProfile(profile, agentTemplate));
      return;
    }

    await writeProfile(profile, baseDir, agentTemplate);
    await generateVSCodeSettings(baseDir, agentData.vscodeSettings);
    await generateDevcontainer(
      baseDir,
      agentData.devcontainer,
      agentData.vscodeSettings,
    );
    await generateCopilotSetupSteps(baseDir, agentData.copilotSetupSteps);
    console.log("");
    console.log(
      formatSuccess(`Generated stage agent: ${profile.frontmatter.name}`),
    );
    return;
  }

  // Default behavior: generate all stage agents (or single stage if --stage specified)
  // No generic agents - all agents are stage-specific
  const profiles = [];

  // Generate all stage agents
  for (const stage of data.stages) {
    const profile = generateStageAgentProfile({ ...stageParams, stage });
    profiles.push(profile);
  }

  // Derive skills once for all stages
  const derivedSkills = deriveAgentSkills({
    discipline: humanDiscipline,
    track: humanTrack,
    grade,
    skills: skillsWithAgent,
  });

  const skillFiles = derivedSkills
    .map((derived) => skillsWithAgent.find((s) => s.id === derived.skillId))
    .filter((skill) => skill?.agent)
    .map((skill) => generateSkillMd(skill, data.stages));

  // Validate all profiles
  for (const profile of profiles) {
    const errors = validateAgentProfile(profile);
    if (errors.length > 0) {
      console.error(
        formatError(`Profile ${profile.frontmatter.name} validation failed:`),
      );
      for (const err of errors) {
        console.error(`  - ${err}`);
      }
      process.exit(1);
    }
  }

  // Validate all skills
  for (const skill of skillFiles) {
    const errors = validateAgentSkill(skill);
    if (errors.length > 0) {
      console.error(
        formatError(`Skill ${skill.frontmatter.name} validation failed:`),
      );
      for (const err of errors) {
        console.error(`  - ${err}`);
      }
      process.exit(1);
    }
  }

  // Load templates
  const agentTemplate = await loadAgentTemplate(dataDir);
  const skillTemplate = await loadSkillTemplate(dataDir);

  // Output to console (default) or write to files (with --output)
  if (!options.output) {
    for (const profile of profiles) {
      console.log(formatAgentProfile(profile, agentTemplate));
      console.log("\n---\n");
    }
    return;
  }

  for (const profile of profiles) {
    await writeProfile(profile, baseDir, agentTemplate);
  }
  await writeSkills(skillFiles, baseDir, skillTemplate);
  await generateVSCodeSettings(baseDir, agentData.vscodeSettings);
  await generateDevcontainer(
    baseDir,
    agentData.devcontainer,
    agentData.vscodeSettings,
  );
  await generateCopilotSetupSteps(baseDir, agentData.copilotSetupSteps);

  console.log("");
  console.log(formatSuccess(`Generated ${profiles.length} agents:`));
  for (const profile of profiles) {
    console.log(`  - ${profile.frontmatter.name}`);
  }
  console.log(`  Skills: ${skillFiles.length} files`);
}
