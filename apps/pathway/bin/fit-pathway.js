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
 *   grade [<id>]                Show grades
 *   track [<id>]                Show tracks
 *   behaviour [<id>]            Show behaviours
 *   skill [<id>]                Show skills (summary, --list, or detail)
 *   driver [<id>]               Show drivers
 *   stage [<id>]                Show stages
 *   tool [<name>]               Show tools
 *   job [<discipline> <grade>] [--track=TRACK]  Generate job definition
 *   interview <discipline> <grade> [--track=TRACK] [--type=TYPE]  Generate interview
 *   progress <discipline> <grade> [--track=TRACK] [--compare=GRADE]  Career progression
 *   questions [options]         Browse interview questions
 *   agent [<discipline> <track>] [--output=PATH]  Generate AI agent
 *
 * Global Options:
 *   --list         Output IDs only (for piping)
 *   --json         Output as JSON
 *   --help         Show help
 *
 * Validation (moved to fit-schema):
 *   npx fit-schema validate
 *   npx fit-schema generate-index
 */

import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { existsSync } from "fs";
import { loadAllData } from "@forwardimpact/schema/loader";
import { formatError } from "../src/lib/cli-output.js";

// Import command handlers
import { runDisciplineCommand } from "../src/commands/discipline.js";
import { runGradeCommand } from "../src/commands/grade.js";
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
import { runServeCommand } from "../src/commands/serve.js";
import { runInitCommand } from "../src/commands/init.js";
import { runSiteCommand } from "../src/commands/site.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");

const COMMANDS = {
  discipline: runDisciplineCommand,
  grade: runGradeCommand,
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

Validation (use fit-schema instead):
  npx fit-schema validate             Run full data validation
  npx fit-schema generate-index       Generate browser index files

Getting Started:
  init                                Create ./data/ with example data
  serve [--port=PORT]                 Serve web app at http://localhost:3000
  site [--output=PATH]                Generate static site to ./site/

Entity Commands (summary by default, --list for IDs, <id> for detail):
  discipline [<id>]                   Browse disciplines
  grade [<id>]                        Browse grades
  track [<id>]                        Browse tracks
  behaviour [<id>]                    Browse behaviours  
  skill [<id>]                        Browse skills
    --agent                           Output as agent SKILL.md format
  driver [<id>]                       Browse drivers
  stage [<id>]                        Browse lifecycle stages
  tool [<name>]                       Browse recommended tools

Composite Commands:
  job [<discipline> <grade>] [--track=TRACK]  Generate job definition
  interview <discipline> <grade> [--track=TRACK] [--type=TYPE]
                                      Generate interview questions
  progress <discipline> <grade> [--track=TRACK] [--compare=GRADE]
                                      Show career progression
  questions [filters]                 Browse interview questions
  agent <discipline> [--track=<track>] Generate AI coding agent

Global Options:
  --list            Output IDs only (for piping to other commands)
  --json            Output as JSON
  --data=PATH       Path to data directory (default: ./data or examples/)
  --help            Show this help message

Questions Filters:
  --level=LEVEL       Filter by skill level
  --maturity=MAT      Filter by behaviour maturity
  --skill=ID          Filter to specific skill
  --behaviour=ID      Filter to behaviour
  --capability=CAP    Filter by capability
  --stats             Show detailed statistics
  --format=FORMAT     Output format: table, yaml, json

Agent Options:
  --track=TRACK       Track for the agent (e.g., platform, forward_deployed)
  --output=PATH       Write files to directory (without this, outputs to console)
  --stage=STAGE       Generate specific stage agent (plan, code, review)
  --all-stages        Generate all stage agents (default)

Examples:
  npx fit-pathway skill                    # Summary of all skills
  npx fit-pathway skill --list             # Skill IDs for piping
  npx fit-pathway skill ai_evaluation      # Detail view
  npx fit-pathway skill architecture_design --agent  # Agent SKILL.md output

  npx fit-pathway tool                     # Summary of all tools
  npx fit-pathway tool --list              # Tool names for piping
  npx fit-pathway tool DuckDB              # Tool detail with skill usages

  npx fit-pathway job                      # Summary of valid combinations
  npx fit-pathway job --list               # All combinations for piping
  npx fit-pathway job software_engineering L4
  npx fit-pathway job software_engineering L4 --track=platform
  npx fit-pathway job se L3 --track=platform --checklist=code

  npx fit-pathway questions --level=practitioner
  npx fit-pathway questions --stats

  npx fit-pathway agent software_engineering --track=platform --output=./agents
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
    } else if (arg.startsWith("--port=")) {
      result.port = parseInt(arg.slice(7), 10);
    } else if (arg.startsWith("--path=")) {
      result.path = arg.slice(7);
    } else if (arg === "--no-clean") {
      result.clean = false;
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
 * 3. ./data/ relative to current working directory
 * 4. ./examples/ relative to current working directory
 * 5. apps/schema/examples/ for monorepo development
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

  // 3. Current working directory ./data/
  const cwdData = join(process.cwd(), "data");
  if (existsSync(cwdData)) {
    return cwdData;
  }

  // 4. Current working directory ./examples/
  const cwdExamples = join(process.cwd(), "examples");
  if (existsSync(cwdExamples)) {
    return cwdExamples;
  }

  // 5. Monorepo: apps/schema/examples/
  const schemaExamples = join(process.cwd(), "apps/schema/examples");
  if (existsSync(schemaExamples)) {
    return schemaExamples;
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

  // Handle serve command (needs data directory)
  if (command === "serve") {
    await runServeCommand({ dataDir, options });
    // serve doesn't exit, keeps running
    return;
  }

  // Handle site command (generates static site)
  if (command === "site") {
    await runSiteCommand({ dataDir, options });
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
