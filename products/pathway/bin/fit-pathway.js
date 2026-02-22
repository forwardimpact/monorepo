#!/usr/bin/env node
/**
 * Engineering Pathway CLI
 *
 * A command-line interface for browsing and generating job definitions,
 * interview questions, career progression analysis, and AI agent configurations.
 *
 * Usage:
 *   npx fit-pathway <command> [options]
 *
 * Commands:
 *   discipline [<id>]           Show disciplines
 *   level [<id>]                Show levels
 *   track [<id>]                Show tracks
 *   behaviour [<id>]            Show behaviours
 *   skill [<id>]                Show skills (summary, --list, or detail)
 *   driver [<id>]               Show drivers
 *   stage [<id>]                Show stages
 *   tool [<name>]               Show tools
 *   job [<discipline> <level>] [--track=TRACK]  Generate job definition
 *   interview <discipline> <level> [--track=TRACK] [--type=mission|decomposition|stakeholder]  Generate interview
 *   progress <discipline> <level> [--track=TRACK] [--compare=LEVEL]  Career progression
 *   questions [options]         Browse interview questions
 *   agent [<discipline> <track>] [--output=PATH]  Generate AI agent
 *
 * Global Options:
 *   --list         Output IDs only (for piping)
 *   --json         Output as JSON
 *   --help         Show help
 */

import { join, resolve } from "path";
import { existsSync } from "fs";
import { homedir } from "os";
import { loadAllData } from "@forwardimpact/map/loader";
import { formatError } from "../src/lib/cli-output.js";

// Import command handlers
import { runDisciplineCommand } from "../src/commands/discipline.js";
import { runLevelCommand } from "../src/commands/level.js";
import { runTrackCommand } from "../src/commands/track.js";
import { runBehaviourCommand } from "../src/commands/behaviour.js";
import { runSkillCommand } from "../src/commands/skill.js";
import { runDriverCommand } from "../src/commands/driver.js";
import { runStageCommand } from "../src/commands/stage.js";
import { runToolCommand } from "../src/commands/tool.js";
import { runJobCommand } from "../src/commands/job.js";
import { runInterviewCommand } from "../src/commands/interview.js";
import { runProgressCommand } from "../src/commands/progress.js";
import { runQuestionsCommand } from "../src/commands/questions.js";
import { runAgentCommand } from "../src/commands/agent.js";
import { runDevCommand } from "../src/commands/dev.js";
import { runInitCommand } from "../src/commands/init.js";
import { runBuildCommand } from "../src/commands/build.js";
import { runUpdateCommand } from "../src/commands/update.js";

const COMMANDS = {
  discipline: runDisciplineCommand,
  level: runLevelCommand,
  track: runTrackCommand,
  behaviour: runBehaviourCommand,
  skill: runSkillCommand,
  driver: runDriverCommand,
  stage: runStageCommand,
  tool: runToolCommand,
  job: runJobCommand,
  interview: runInterviewCommand,
  progress: runProgressCommand,
  questions: runQuestionsCommand,
  agent: runAgentCommand,
};

const HELP_TEXT = `
Engineering Pathway CLI

Usage:
  npx fit-pathway <command> [options]

Global Options:
  --list            Output IDs only (for piping to other commands)
  --json            Output as JSON
  --data=PATH       Path to data directory (default: ./data or examples/)
  --help            Show this help message

────────────────────────────────────────────────────────────────────────────────
GETTING STARTED
────────────────────────────────────────────────────────────────────────────────

  init                                Create ./data/ with example data
  dev [--port=PORT]                   Run live development server
  build [--output=PATH] [--url=URL]   Generate static site + distribution bundle
  update [--url=URL]                  Update local ~/.fit/pathway/ installation

────────────────────────────────────────────────────────────────────────────────
ENTITY COMMANDS
────────────────────────────────────────────────────────────────────────────────

All entity commands support: summary (default), --list (IDs for piping), <id> (detail)

  discipline [<id>]     Browse engineering disciplines
  level [<id>]          Browse career levels
  track [<id>]          Browse track specializations
  behaviour [<id>]      Browse professional behaviours
  driver [<id>]         Browse outcome drivers
  stage [<id>]          Browse lifecycle stages

  skill [<id>]          Browse skills
    --agent             Output as agent SKILL.md format

  tool [<name>]         Browse required tools (aggregated from skills)

────────────────────────────────────────────────────────────────────────────────
JOB COMMAND
────────────────────────────────────────────────────────────────────────────────

Generate job definitions from discipline × level × track combinations.

Usage:
  npx fit-pathway job                                  Summary with stats
  npx fit-pathway job --list                           All valid combinations
  npx fit-pathway job <discipline> <level>             Detail view (trackless)
  npx fit-pathway job <d> <l> --track=<track>          Detail view (with track)
  npx fit-pathway job <d> <l> --skills                 Plain list of skill IDs
  npx fit-pathway job <d> <l> --tools                  Plain list of tool names
  npx fit-pathway job <d> <l> --checklist=<stage>      Show handoff checklist

Options:
  --track=TRACK       Track specialization (e.g., platform, forward_deployed)
  --skills            Output plain list of skill IDs (for piping)
  --tools             Output plain list of tool names (for piping)
  --checklist=STAGE   Show checklist for stage handoff (plan, code)

Examples:
  npx fit-pathway job software_engineering L4
  npx fit-pathway job software_engineering L4 --track=platform
  npx fit-pathway job se L3 --track=platform --skills
  npx fit-pathway job se L3 --track=platform --tools

────────────────────────────────────────────────────────────────────────────────
AGENT COMMAND
────────────────────────────────────────────────────────────────────────────────

Generate AI coding agent configurations from discipline × track × stage.

Usage:
  npx fit-pathway agent                                Summary with stats
  npx fit-pathway agent --list                         All valid combinations
  npx fit-pathway agent <discipline> --track=<track>   Generate all stage agents
  npx fit-pathway agent <d> --track=<t> --stage=<s>    Generate single stage agent
  npx fit-pathway agent <d> --track=<t> --skills       Plain list of skill IDs
  npx fit-pathway agent <d> --track=<t> --tools        Plain list of tool names

Options:
  --track=TRACK       Track for the agent (required for generation)
  --stage=STAGE       Generate specific stage agent (plan, code, review)
  --output=PATH       Write files to directory (without this, outputs to console)
  --skills            Output plain list of skill IDs (for piping)
  --tools             Output plain list of tool names (for piping)

Examples:
  npx fit-pathway agent software_engineering --track=platform
  npx fit-pathway agent software_engineering --track=platform --stage=plan
  npx fit-pathway agent software_engineering --track=platform --output=./agents
  npx fit-pathway agent software_engineering --track=platform --skills

────────────────────────────────────────────────────────────────────────────────
INTERVIEW COMMAND
────────────────────────────────────────────────────────────────────────────────

Generate interview question sets based on job requirements.

Usage:
  npx fit-pathway interview <discipline> <level>                     All types
  npx fit-pathway interview <d> <l> --track=<track>                  With track
  npx fit-pathway interview <d> <l> --track=<t> --type=<type>        Single type

Options:
  --track=TRACK       Track specialization
  --type=TYPE         Interview type: mission, decomposition, stakeholder
                      (omit for all types)

────────────────────────────────────────────────────────────────────────────────
PROGRESS COMMAND
────────────────────────────────────────────────────────────────────────────────

Analyze career progression between levels.

Usage:
  npx fit-pathway progress <discipline> <level>
  npx fit-pathway progress <d> <l> --track=<track>
  npx fit-pathway progress <d> <l> --compare=<to_level>

Options:
  --track=TRACK        Track specialization
  --compare=LEVEL      Compare to specific level

────────────────────────────────────────────────────────────────────────────────
QUESTIONS COMMAND
────────────────────────────────────────────────────────────────────────────────

Browse and filter interview questions.

Usage:
  npx fit-pathway questions
  npx fit-pathway questions --level=practitioner
  npx fit-pathway questions --skill=architecture_design
  npx fit-pathway questions --stats

Options:
  --level=LEVEL        Filter by skill proficiency
  --maturity=MATURITY  Filter by behaviour maturity
  --skill=ID           Filter to specific skill
  --behaviour=ID       Filter to specific behaviour
  --capability=CAP     Filter by capability
  --stats              Show detailed statistics
  --format=FORMAT      Output format: table, yaml, json
`;

/**
 * Parse command line arguments
 * @param {string[]} args
 * @returns {Object}
 */
function parseArgs(args) {
  const result = {
    command: null,
    args: [],
    list: false,
    json: false,
    help: false,
    type: "full",
    compare: null,
    data: null,
    // Shared command options
    track: null,
    // Questions command options
    level: null,
    maturity: null,
    skill: null,
    behaviour: null,
    capability: null,
    format: null,
    stats: false,
    // Job command options
    checklist: null,
    skills: false,
    tools: false,
    // Agent command options
    output: null,
    stage: null,
    "all-stages": false,
    agent: false,
    // Serve command options
    port: null,
    // Init command options
    path: null,
    // Site command options
    clean: true,
    url: null,
  };

  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (arg === "--list" || arg === "-l") {
      result.list = true;
    } else if (arg === "--json") {
      result.json = true;
    } else if (arg.startsWith("--type=")) {
      result.type = arg.slice(7);
    } else if (arg.startsWith("--compare=")) {
      result.compare = arg.slice(10);
    } else if (arg.startsWith("--data=")) {
      result.data = arg.slice(7);
    } else if (arg.startsWith("--track=")) {
      result.track = arg.slice(8);
    } else if (arg.startsWith("--output=")) {
      result.output = arg.slice(9);
    } else if (arg.startsWith("--level=")) {
      result.level = arg.slice(8);
    } else if (arg.startsWith("--maturity=")) {
      result.maturity = arg.slice(11);
    } else if (arg.startsWith("--skill=")) {
      result.skill = arg.slice(8);
    } else if (arg.startsWith("--behaviour=")) {
      result.behaviour = arg.slice(12);
    } else if (arg.startsWith("--capability=")) {
      result.capability = arg.slice(14);
    } else if (arg.startsWith("--format=")) {
      result.format = arg.slice(9);
    } else if (arg === "--stats") {
      result.stats = true;
    } else if (arg.startsWith("--role=")) {
      result.role = arg.slice(7);
    } else if (arg === "--all-roles") {
      result["all-roles"] = true;
    } else if (arg.startsWith("--stage=")) {
      result.stage = arg.slice(8);
    } else if (arg === "--all-stages") {
      result["all-stages"] = true;
    } else if (arg === "--agent") {
      result.agent = true;
    } else if (arg.startsWith("--checklist=")) {
      result.checklist = arg.slice(12);
    } else if (arg === "--skills") {
      result.skills = true;
    } else if (arg === "--tools") {
      result.tools = true;
    } else if (arg.startsWith("--port=")) {
      result.port = parseInt(arg.slice(7), 10);
    } else if (arg.startsWith("--path=")) {
      result.path = arg.slice(7);
    } else if (arg === "--no-clean") {
      result.clean = false;
    } else if (arg.startsWith("--url=")) {
      result.url = arg.slice(6);
    } else if (!arg.startsWith("-")) {
      if (!result.command) {
        result.command = arg;
      } else {
        result.args.push(arg);
      }
    }
  }

  return result;
}

/**
 * Print help text
 */
function printHelp() {
  console.log(HELP_TEXT);
}

/**
 * Resolve the data directory path.
 * Resolution order:
 * 1. --data=<path> flag (explicit override)
 * 2. PATHWAY_DATA environment variable
 * 3. ~/.fit/pathway/data/ (home directory install)
 * 4. ./data/ relative to current working directory
 * 5. ./examples/ relative to current working directory
 * 6. products/map/examples/ for monorepo development
 *
 * @param {Object} options - Parsed command options
 * @returns {string} Resolved absolute path to data directory
 */
function resolveDataPath(options) {
  // 1. Explicit flag
  if (options.data) {
    return resolve(options.data);
  }

  // 2. Environment variable
  if (process.env.PATHWAY_DATA) {
    return resolve(process.env.PATHWAY_DATA);
  }

  // 3. Home directory install (~/.fit/pathway/data/)
  const homeData = join(homedir(), ".fit", "pathway", "data");
  if (existsSync(homeData)) {
    return homeData;
  }

  // 4. Current working directory ./data/
  const cwdData = join(process.cwd(), "data");
  if (existsSync(cwdData)) {
    return cwdData;
  }

  // 5. Current working directory ./examples/
  const cwdExamples = join(process.cwd(), "examples");
  if (existsSync(cwdExamples)) {
    return cwdExamples;
  }

  // 6. Monorepo: products/map/examples/
  const mapExamples = join(process.cwd(), "products/map/examples");
  if (existsSync(mapExamples)) {
    return mapExamples;
  }

  throw new Error(
    "No data directory found. Create ./data/ or use --data=<path>",
  );
}

/**
 * Main CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  // No command: show help
  if (!options.command) {
    printHelp();
    process.exit(0);
  }

  const command = options.command;

  // Handle init command (doesn't need data directory to exist)
  if (command === "init") {
    await runInitCommand({ options });
    process.exit(0);
  }

  const dataDir = resolveDataPath(options);

  // Handle dev command (needs data directory)
  if (command === "dev") {
    await runDevCommand({ dataDir, options });
    // dev doesn't exit, keeps running
    return;
  }

  // Handle build command (generates static site)
  if (command === "build") {
    await runBuildCommand({ dataDir, options });
    process.exit(0);
  }

  // Handle update command (re-downloads bundle for local install)
  if (command === "update") {
    await runUpdateCommand({ dataDir, options });
    process.exit(0);
  }

  const handler = COMMANDS[command];

  if (!handler) {
    console.error(formatError(`Unknown command: ${command}`));
    console.error(`Run 'npx fit-pathway --help' for usage.`);
    process.exit(1);
  }

  try {
    const data = await loadAllData(dataDir, {
      validate: true,
      throwOnError: true,
    });

    await handler({ data, args: options.args, options, dataDir });
  } catch (error) {
    console.error(formatError(error.message));
    process.exit(1);
  }
}

main();
