#!/usr/bin/env node
/**
 * Engineering Pathway CLI
 *
 * A command-line interface for browsing and generating job definitions,
 * interview questions, career progression analysis, and AI agent configurations.
 *
 * Usage:
 *   npx pathway <command> [options]
 *
 * Commands:
 *   skill [<id>]                Show skills (summary, --list, or detail)
 *   behaviour [<id>]            Show behaviours
 *   discipline [<id>]           Show disciplines
 *   grade [<id>]                Show grades
 *   track [<id>]                Show tracks
 *   driver [<id>]               Show drivers
 *   job [<discipline> <track> <grade>]  Generate job definition
 *   interview <discipline> <track> <grade> [--type=TYPE]  Generate interview
 *   progress <discipline> <track> <grade> [--compare=GRADE]  Career progression
 *   questions [options]         Browse interview questions
 *   agent [<discipline> <track>] [--output=PATH]  Generate AI agent
 *
 * Global Options:
 *   --list         Output IDs only (for piping)
 *   --validate     Run validation checks
 *   --json         Output as JSON
 *   --help         Show help
 */

import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { existsSync } from "fs";
import {
  loadAllData,
  loadAgentData,
  loadSkillsWithAgentData,
  loadQuestionBankFromFolder,
} from "../app/model/loader.js";
import { generateAllIndexes } from "../app/model/index-generator.js";
import { formatError } from "../app/lib/cli-output.js";

// Import command handlers
import { runSkillCommand } from "../app/commands/skill.js";
import { runBehaviourCommand } from "../app/commands/behaviour.js";
import { runDisciplineCommand } from "../app/commands/discipline.js";
import { runGradeCommand } from "../app/commands/grade.js";
import { runTrackCommand } from "../app/commands/track.js";
import { runDriverCommand } from "../app/commands/driver.js";
import { runStageCommand } from "../app/commands/stage.js";
import { runJobCommand } from "../app/commands/job.js";
import { runInterviewCommand } from "../app/commands/interview.js";
import { runProgressCommand } from "../app/commands/progress.js";
import { runQuestionsCommand } from "../app/commands/questions.js";
import { runAgentCommand } from "../app/commands/agent.js";
import { runServeCommand } from "../app/commands/serve.js";
import { runInitCommand } from "../app/commands/init.js";
import { runSiteCommand } from "../app/commands/site.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");

const COMMANDS = {
  skill: runSkillCommand,
  behaviour: runBehaviourCommand,
  discipline: runDisciplineCommand,
  grade: runGradeCommand,
  track: runTrackCommand,
  driver: runDriverCommand,
  stage: runStageCommand,
  job: runJobCommand,
  interview: runInterviewCommand,
  progress: runProgressCommand,
  questions: runQuestionsCommand,
  agent: runAgentCommand,
};

const HELP_TEXT = `
Engineering Pathway CLI

Usage:
  npx pathway <command> [options]
  npx pathway --validate              Run full data validation
  npx pathway --generate-index        Generate browser index files

Getting Started:
  init                                Create ./data/ with example data
  serve [--port=PORT]                 Serve web app at http://localhost:3000
  site [--output=PATH]                Generate static site to ./site/

Entity Commands (summary by default, --list for IDs, <id> for detail):
  skill [<id>]                        Browse skills
  behaviour [<id>]                    Browse behaviours  
  discipline [<id>]                   Browse disciplines
  grade [<id>]                        Browse grades
  track [<id>]                        Browse tracks
  driver [<id>]                       Browse drivers
  stage [<id>]                        Browse lifecycle stages

Composite Commands:
  job [<discipline> <track> <grade>]  Generate job definition
  interview <discipline> <track> <grade> [--type=TYPE]
                                      Generate interview questions
  progress <discipline> <track> <grade> [--compare=GRADE]
                                      Show career progression
  questions [filters]                 Browse interview questions
  agent [<discipline> <track>]        Generate AI coding agent

Global Options:
  --list            Output IDs only (for piping to other commands)
  --validate        Run validation checks
  --generate-index  Generate _index.yaml files for browser loading
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
  --output=PATH       Output directory (default: current directory)
  --preview           Show output without writing files
  --role=ROLE         Generate specific role variant
  --all-roles         Generate default + all role variants

Examples:
  npx pathway skill                    # Summary of all skills
  npx pathway skill --list             # Skill IDs for piping
  npx pathway skill ai_evaluation      # Detail view

  npx pathway job                      # Summary of valid combinations
  npx pathway job --list               # All combinations for piping
  npx pathway job software_engineering platform L4
  npx pathway job se platform L3 --checklist=code_to_review

  npx pathway questions --level=practitioner
  npx pathway questions --stats

  npx pathway agent software_engineering platform --output=./agents
  npx pathway --validate               # Validate all data
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
    validate: false,
    generateIndex: false,
    type: "full",
    compare: null,
    data: null,
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
    preview: false,
    role: null,
    "all-roles": false,
    stage: null,
    "all-stages": false,
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
    } else if (arg === "--validate") {
      result.validate = true;
    } else if (arg === "--generate-index") {
      result.generateIndex = true;
    } else if (arg === "--preview") {
      result.preview = true;
    } else if (arg.startsWith("--type=")) {
      result.type = arg.slice(7);
    } else if (arg.startsWith("--compare=")) {
      result.compare = arg.slice(10);
    } else if (arg.startsWith("--data=")) {
      result.data = arg.slice(7);
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
 * Run full data validation
 * @param {string} dataDir - Path to data directory
 */
async function runFullValidation(dataDir) {
  console.log(`\n🔍 Validating data in: ${dataDir}\n`);

  let hasErrors = false;

  // Load and validate core data
  const data = await loadAllData(dataDir, {
    validate: true,
    throwOnError: false,
  });

  if (data.validation.valid) {
    console.log("✅ Core data validation passed");
  } else {
    console.log("❌ Core data validation failed");
    hasErrors = true;
    for (const e of data.validation.errors) {
      console.log(`  - [${e.type}] ${e.message}`);
    }
  }

  if (data.validation.warnings.length > 0) {
    console.log("\n⚠️  Warnings:");
    for (const w of data.validation.warnings) {
      console.log(`  - [${w.type}] ${w.message}`);
    }
  }

  // Validate question bank
  try {
    const questionBank = await loadQuestionBankFromFolder(
      join(dataDir, "questions"),
      data.skills,
      data.behaviours,
      { validate: true, throwOnError: false },
    );

    if (questionBank.validation?.valid) {
      console.log("✅ Question bank validation passed");
    } else if (questionBank.validation) {
      console.log("❌ Question bank validation failed");
      hasErrors = true;
      for (const e of questionBank.validation.errors) {
        console.log(`  - [${e.type}] ${e.message}`);
      }
    }
  } catch (err) {
    console.log("⚠️  Could not validate question bank:", err.message);
  }

  // Validate agent data
  try {
    const agentData = await loadAgentData(dataDir);
    const skillsWithAgent = await loadSkillsWithAgentData(dataDir);

    const skillsWithAgentCount = skillsWithAgent.filter((s) => s.agent).length;

    console.log(
      `✅ Agent data: ${agentData.disciplines.length} disciplines, ${agentData.tracks.length} tracks, ${skillsWithAgentCount} skills with agent sections`,
    );

    // Check for orphaned agent definitions
    for (const d of agentData.disciplines) {
      if (!data.disciplines.find((h) => h.id === d.id)) {
        console.log(`  ⚠️  Agent discipline '${d.id}' has no human definition`);
      }
    }
    for (const t of agentData.tracks) {
      if (!data.tracks.find((h) => h.id === t.id)) {
        console.log(`  ⚠️  Agent track '${t.id}' has no human definition`);
      }
    }
  } catch (err) {
    console.log("⚠️  Could not validate agent data:", err.message);
  }

  // Summary
  console.log("\n📊 Data Summary:");
  console.log(`   Skills:      ${data.skills?.length || 0}`);
  console.log(`   Behaviours:  ${data.behaviours?.length || 0}`);
  console.log(`   Disciplines: ${data.disciplines?.length || 0}`);
  console.log(`   Tracks:      ${data.tracks?.length || 0}`);
  console.log(`   Grades:      ${data.grades?.length || 0}`);
  console.log(`   Drivers:     ${data.drivers?.length || 0}`);
  console.log("");

  return hasErrors ? 1 : 0;
}

/**
 * Run index generation
 * @param {string} dataDir - Path to data directory
 */
async function runGenerateIndex(dataDir) {
  console.log(`\n📁 Generating index files in: ${dataDir}\n`);

  const results = await generateAllIndexes(dataDir);

  for (const [dir, files] of Object.entries(results)) {
    if (files.error) {
      console.log(`❌ ${dir}: ${files.error}`);
    } else {
      console.log(`✅ ${dir}/_index.yaml (${files.length} files)`);
    }
  }

  console.log("\n✨ Index generation complete\n");
  return 0;
}

/**
 * Resolve the data directory path.
 * Resolution order:
 * 1. --data=<path> flag (explicit override)
 * 2. PATHWAY_DATA environment variable
 * 3. ./data/ relative to current working directory
 * 4. Package examples (for demo/testing)
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

  // 3. Current working directory
  const cwdData = join(process.cwd(), "data");
  if (existsSync(cwdData)) {
    return cwdData;
  }

  // 4. Package examples (for demo/testing)
  const examplesData = join(rootDir, "examples");
  if (existsSync(examplesData)) {
    return examplesData;
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

  const dataDir = resolveDataPath(options);

  // Handle global --generate-index (no command)
  if (options.generateIndex && !options.command) {
    const exitCode = await runGenerateIndex(dataDir);
    process.exit(exitCode);
  }

  // Handle global --validate (no command)
  if (options.validate && !options.command) {
    const exitCode = await runFullValidation(dataDir);
    process.exit(exitCode);
  }

  // No command and no flags: show help
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
    console.error(`Run 'npx pathway --help' for usage.`);
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
