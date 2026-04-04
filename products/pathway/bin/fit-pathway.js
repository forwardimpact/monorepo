#!/usr/bin/env node
/**
 * Engineering Pathway CLI
 *
 * A command-line interface for browsing and generating job definitions,
 * interview questions, career progression analysis, and AI agent configurations.
 *
 * Usage:
 *   bunx fit-pathway <command> [options]
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

import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import fs from "fs/promises";
import { homedir } from "os";
import { createDataLoader } from "@forwardimpact/map/loader";
import { validateAllData } from "@forwardimpact/map/validation";
import { Finder } from "@forwardimpact/libutil";
import { createLogger } from "@forwardimpact/libtelemetry";
import { formatError } from "../src/lib/cli-output.js";
import { createTemplateLoader } from "@forwardimpact/libtemplate";

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

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(__dirname, "..", "templates");

/** Package version read from package.json */
const VERSION = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf8"),
).version;

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
  bunx fit-pathway <command> [options]

Global Options:
  --list            Output IDs only (for piping to other commands)
  --json            Output as JSON
  --data=PATH       Path to data directory (default: ./data)
  --version         Show version number
  --help            Show this help message

────────────────────────────────────────────────────────────────────────────────
GETTING STARTED
────────────────────────────────────────────────────────────────────────────────

  init                                Create ./data/ with example data
  dev [--port=PORT]                   Run live development server
  build [--output=PATH] [--url=URL]   Generate static site + distribution bundle
  update [--url=URL]                  Update local ~/.fit/data/pathway/ installation

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
  bunx fit-pathway job                                  Summary with stats
  bunx fit-pathway job --track=<track>                  Summary filtered by track
  bunx fit-pathway job --list                           All valid combinations
  bunx fit-pathway job --list --track=<track>            Combinations for a track
  bunx fit-pathway job <discipline> <level>             Detail view (trackless)
  bunx fit-pathway job <d> <l> --track=<track>          Detail view (with track)
  bunx fit-pathway job <d> <l> --skills                 Plain list of skill IDs
  bunx fit-pathway job <d> <l> --tools                  Plain list of tool names
  bunx fit-pathway job <d> <l> --checklist=<stage>      Show handoff checklist

Options:
  --track=TRACK       Track specialization (e.g., platform, forward_deployed)
                      Also filters --list and summary modes
  --skills            Output plain list of skill IDs (for piping)
  --tools             Output plain list of tool names (for piping)
  --checklist=STAGE   Show checklist for stage handoff (plan, code)

Examples:
  bunx fit-pathway job                                  # overview of all jobs
  bunx fit-pathway job --track=forward_deployed         # jobs on a specific track
  bunx fit-pathway job --list --track=forward_deployed  # list for piping
  bunx fit-pathway job software_engineering J060        # trackless job detail
  bunx fit-pathway job software_engineering J060 --track=platform  # with track

────────────────────────────────────────────────────────────────────────────────
AGENT COMMAND
────────────────────────────────────────────────────────────────────────────────

Generate AI coding agent configurations from discipline × track × stage.

Usage:
  bunx fit-pathway agent                                Summary with stats
  bunx fit-pathway agent --list                         All valid combinations
  bunx fit-pathway agent <discipline> --track=<track>   Generate all stage agents
  bunx fit-pathway agent <d> --track=<t> --stage=<s>    Generate single stage agent
  bunx fit-pathway agent <d> --track=<t> --skills       Plain list of skill IDs
  bunx fit-pathway agent <d> --track=<t> --tools        Plain list of tool names

Options:
  --track=TRACK       Track for the agent (required for generation)
  --stage=STAGE       Generate specific stage agent (plan, code, review)
  --output=PATH       Write files to directory (without this, outputs to console)
  --skills            Output plain list of skill IDs (for piping)
  --tools             Output plain list of tool names (for piping)

Examples:
  bunx fit-pathway agent software_engineering --track=platform
  bunx fit-pathway agent software_engineering --track=platform --stage=plan
  bunx fit-pathway agent software_engineering --track=platform --output=./agents
  bunx fit-pathway agent software_engineering --track=platform --skills

────────────────────────────────────────────────────────────────────────────────
INTERVIEW COMMAND
────────────────────────────────────────────────────────────────────────────────

Generate interview question sets based on job requirements.

Usage:
  bunx fit-pathway interview <discipline> <level>                     All types
  bunx fit-pathway interview <d> <l> --track=<track>                  With track
  bunx fit-pathway interview <d> <l> --track=<t> --type=<type>        Single type

Options:
  --track=TRACK       Track specialization
  --type=TYPE         Interview type: mission, decomposition, stakeholder
                      (omit for all types)

────────────────────────────────────────────────────────────────────────────────
PROGRESS COMMAND
────────────────────────────────────────────────────────────────────────────────

Analyze career progression between levels.

Usage:
  bunx fit-pathway progress <discipline> <level>
  bunx fit-pathway progress <d> <l> --track=<track>
  bunx fit-pathway progress <d> <l> --compare=<to_level>

Options:
  --track=TRACK        Track specialization
  --compare=LEVEL      Compare to specific level

────────────────────────────────────────────────────────────────────────────────
QUESTIONS COMMAND
────────────────────────────────────────────────────────────────────────────────

Browse and filter interview questions.

Usage:
  bunx fit-pathway questions
  bunx fit-pathway questions --level=practitioner
  bunx fit-pathway questions --skill=architecture_design
  bunx fit-pathway questions --stats

Options:
  --level=LEVEL        Filter by skill proficiency
  --maturity=MATURITY  Filter by behaviour maturity
  --skill=ID           Filter to specific skill
  --behaviour=ID       Filter to specific behaviour
  --capability=CAP     Filter by capability
  --stats              Show detailed statistics
  --format=FORMAT      Output format: table, yaml, json
`;

/** Boolean flags: exact match sets the field to true */
const BOOLEAN_FLAGS = {
  "--version": "version",
  "-v": "version",
  "--help": "help",
  "-h": "help",
  "--list": "list",
  "-l": "list",
  "--json": "json",
  "--stats": "stats",
  "--all-roles": "all-roles",
  "--all-stages": "all-stages",
  "--agent": "agent",
  "--skills": "skills",
  "--tools": "tools",
};

/** Negation flags: exact match sets the field to false */
const NEGATION_FLAGS = { "--no-clean": "clean" };

/** Value flags: --key=val sets result[field] = val */
const VALUE_FLAGS = {
  "--type": "type",
  "--compare": "compare",
  "--data": "data",
  "--track": "track",
  "--output": "output",
  "--level": "level",
  "--maturity": "maturity",
  "--skill": "skill",
  "--behaviour": "behaviour",
  "--capability": "capability",
  "--format": "format",
  "--role": "role",
  "--stage": "stage",
  "--checklist": "checklist",
  "--path": "path",
  "--url": "url",
};

/**
 * Try to parse a --key=value argument using the VALUE_FLAGS table
 * @param {string} arg
 * @param {Object} result
 * @returns {boolean} true if the arg was handled
 */
function parseValueFlag(arg, result) {
  const eqIndex = arg.indexOf("=");
  if (eqIndex === -1) return false;
  const key = arg.slice(0, eqIndex);
  const field = VALUE_FLAGS[key];
  if (!field) return false;
  result[field] = arg.slice(eqIndex + 1);
  return true;
}

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
    version: false,
    type: "full",
    compare: null,
    data: null,
    track: null,
    level: null,
    maturity: null,
    skill: null,
    behaviour: null,
    capability: null,
    format: null,
    stats: false,
    checklist: null,
    skills: false,
    tools: false,
    output: null,
    stage: null,
    "all-stages": false,
    agent: false,
    port: null,
    path: null,
    clean: true,
    url: null,
  };

  for (const arg of args) {
    if (BOOLEAN_FLAGS[arg]) {
      result[BOOLEAN_FLAGS[arg]] = true;
    } else if (NEGATION_FLAGS[arg]) {
      result[NEGATION_FLAGS[arg]] = false;
    } else if (arg.startsWith("--port=")) {
      result.port = parseInt(arg.slice(7), 10);
    } else if (parseValueFlag(arg, result)) {
      // handled
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
 * Main CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.version) {
    console.log(VERSION);
    process.exit(0);
  }

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  if (!options.command) {
    printHelp();
    process.exit(0);
  }

  const command = options.command;

  if (command === "init") {
    await runInitCommand({ options });
    process.exit(0);
  }

  let dataDir;
  if (options.data) {
    dataDir = resolve(options.data);
  } else {
    const logger = createLogger("pathway");
    const finder = new Finder(fs, logger, process);
    try {
      dataDir = join(finder.findData("data", homedir()), "pathway");
    } catch {
      throw new Error(
        "No data directory found. Use --data=<path> to specify location.",
      );
    }
  }

  if (command === "dev") {
    await runDevCommand({ dataDir, options });
    return;
  }

  if (command === "build") {
    await runBuildCommand({ dataDir, options });
    process.exit(0);
  }

  if (command === "update") {
    await runUpdateCommand({ dataDir, options });
    process.exit(0);
  }

  const handler = COMMANDS[command];

  if (!handler) {
    console.error(formatError(`Unknown command: ${command}`));
    console.error(`Run 'bunx fit-pathway --help' for usage.`);
    process.exit(1);
  }

  try {
    const loader = createDataLoader();
    const templateLoader = createTemplateLoader(TEMPLATE_DIR);

    const data = await loader.loadAllData(dataDir);
    validateAllData(data);

    await handler({
      data,
      args: options.args,
      options,
      dataDir,
      templateLoader,
      loader,
    });
  } catch (error) {
    console.error(formatError(error.message));
    process.exit(1);
  }
}

main();
