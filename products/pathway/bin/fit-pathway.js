#!/usr/bin/env node
/**
 * Engineering Pathway CLI
 *
 * A command-line interface for browsing and generating job definitions,
 * interview questions, career progression analysis, and AI agent configurations.
 *
 * Usage:
 *   npx fit-pathway <command> [options]
 */

import "@forwardimpact/libpreflight/node22";

import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import { homedir } from "os";
import { createDataLoader } from "@forwardimpact/map/loader";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { createCli } from "@forwardimpact/libcli";
import { createTemplateLoader } from "@forwardimpact/libtemplate";

// Import command handlers
import { runDisciplineCommand } from "../src/commands/discipline.js";
import { runLevelCommand } from "../src/commands/level.js";
import { runTrackCommand } from "../src/commands/track.js";
import { runBehaviourCommand } from "../src/commands/behaviour.js";
import { runSkillCommand } from "../src/commands/skill.js";
import { runDriverCommand } from "../src/commands/driver.js";
import { runToolCommand } from "../src/commands/tool.js";
import { runJobCommand } from "../src/commands/job.js";
import { runInterviewCommand } from "../src/commands/interview.js";
import { runProgressCommand } from "../src/commands/progress.js";
import { runQuestionsCommand } from "../src/commands/questions.js";
import { runAgentCommand } from "../src/commands/agent.js";
import { runDevCommand } from "../src/commands/dev.js";
import { runBuildCommand } from "../src/commands/build.js";
import { runUpdateCommand } from "../src/commands/update.js";
import { runServeCommand } from "../src/commands/serve.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(__dirname, "..", "templates");

// `bun build --compile` injects FIT_PATHWAY_VERSION via --define, eliminating
// the readFileSync branch in the compiled binary (which would ENOENT against
// the bunfs virtual mount). Source execution falls through to package.json.
const VERSION =
  process.env.FIT_PATHWAY_VERSION ||
  JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"))
    .version;

const COMMANDS = {
  discipline: runDisciplineCommand,
  level: runLevelCommand,
  track: runTrackCommand,
  behaviour: runBehaviourCommand,
  skill: runSkillCommand,
  driver: runDriverCommand,
  tool: runToolCommand,
  job: runJobCommand,
  interview: runInterviewCommand,
  progress: runProgressCommand,
  questions: runQuestionsCommand,
  agent: runAgentCommand,
};

const definition = {
  name: "fit-pathway",
  version: VERSION,
  description: "Career progression for agent-aligned engineering standards",
  commands: [
    { name: "discipline", args: "[<id>]", description: "Show disciplines" },
    { name: "level", args: "[<id>]", description: "Show levels" },
    { name: "track", args: "[<id>]", description: "Show tracks" },
    { name: "behaviour", args: "[<id>]", description: "Show behaviours" },
    {
      name: "skill",
      args: "[<id>]",
      description: "Show skills",
      options: {
        agent: {
          type: "boolean",
          description: "Show agent detail for a skill",
        },
      },
    },
    { name: "driver", args: "[<id>]", description: "Show drivers" },
    { name: "tool", args: "[<name>]", description: "Show tools" },
    {
      name: "job",
      args: "[<discipline> <level>]",
      description: "Generate job definition",
      options: {
        track: { type: "string", description: "Track specialization" },
        skills: { type: "boolean", description: "Output skill IDs" },
        tools: { type: "boolean", description: "Output tool names" },
      },
    },
    {
      name: "interview",
      args: "<discipline> <level>",
      description: "Generate interview questions",
      options: {
        track: { type: "string", description: "Track specialization" },
        type: {
          type: "string",
          description: "Interview type",
          default: "full",
        },
      },
    },
    {
      name: "progress",
      args: "<discipline> <level>",
      description: "Career progression analysis",
      options: {
        track: { type: "string", description: "Track specialization" },
        compare: { type: "string", description: "Compare to level" },
      },
    },
    {
      name: "questions",
      description: "Browse interview questions",
      options: {
        skill: { type: "string", description: "Filter by skill ID" },
        behaviour: { type: "string", description: "Filter by behaviour ID" },
        capability: { type: "string", description: "Filter by capability" },
        level: { type: "string", description: "Filter by level" },
        maturity: {
          type: "string",
          description: "Filter by behaviour maturity",
        },
        stats: { type: "boolean", description: "Show question statistics" },
      },
    },
    {
      name: "agent",
      args: "<discipline>",
      description: "Generate AI agent profile",
      options: {
        track: { type: "string", description: "Track specialization" },
        level: {
          type: "string",
          description: "Level calibration (see `fit-pathway level --list`)",
        },
        output: {
          type: "string",
          description: "Output directory for generated files",
        },
        skills: { type: "boolean", description: "Output skill IDs" },
        tools: { type: "boolean", description: "Output tool names" },
      },
    },
    {
      name: "dev",
      description: "Run live development server",
      options: {
        port: { type: "string", description: "Dev server port" },
      },
    },
    {
      name: "build",
      description: "Generate static site",
      options: {
        output: { type: "string", description: "Output directory" },
        url: {
          type: "string",
          description: "Site URL for distribution bundle",
        },
        clean: {
          type: "boolean",
          default: true,
          description: "Clean output directory before building",
        },
      },
    },
    {
      name: "serve",
      args: "[<dir>]",
      description:
        "Serve a build directory with git smart HTTP (default: public/)",
      options: {
        port: { type: "string", description: "Listen port (default: 3000)" },
        host: {
          type: "string",
          description: "Listen host (default: 0.0.0.0)",
        },
      },
    },
    {
      name: "update",
      description: "Update local installation",
      options: {
        url: { type: "string", description: "URL for update" },
      },
    },
  ],
  globalOptions: {
    list: {
      type: "boolean",
      short: "l",
      description: "Output IDs only (for piping)",
    },
    json: { type: "boolean", description: "Output as JSON" },
    data: { type: "string", description: "Path to data directory" },
    format: { type: "string", description: "Output format" },
    help: { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", short: "v", description: "Show version" },
  },
  examples: [
    "fit-pathway discipline backend",
    "fit-pathway job software_engineering J060 --track=platform",
    "fit-pathway interview software_engineering J060 --json",
    "fit-pathway agent software_engineering --track=platform",
  ],
  documentation: [
    {
      title: "Pathway Overview",
      url: "https://www.forwardimpact.team/pathway/index.md",
      description: "Product overview, audience model, and key concepts.",
    },
    {
      title: "Getting Started: Pathway for Engineers",
      url: "https://www.forwardimpact.team/docs/getting-started/engineers/pathway/index.md",
      description: "From zero to a running Pathway site.",
    },
    {
      title: "Authoring Agent-Aligned Engineering Standards",
      url: "https://www.forwardimpact.team/docs/products/authoring-standards/index.md",
      description:
        "End-to-end guide to defining your engineering standard in YAML.",
    },
    {
      title: "Validate and Update the Standard",
      url: "https://www.forwardimpact.team/docs/products/authoring-standards/update-standard/index.md",
      description: "Run validation, interpret errors, and update safely.",
    },
    {
      title: "Configure Agents to Meet Your Engineering Standard",
      url: "https://www.forwardimpact.team/docs/products/agent-teams/index.md",
      description: "Generate, structure, and maintain exported agent teams.",
    },
    {
      title: "Give Agents Organizational Context",
      url: "https://www.forwardimpact.team/docs/products/agent-teams/organizational-context/index.md",
      description:
        "Track-scoped team instructions and installation-scoped organizational context for exported agent teams.",
    },
    {
      title: "See What's Expected at Your Level",
      url: "https://www.forwardimpact.team/docs/products/career-paths/index.md",
      description:
        "Browse jobs, skills, and career progression between levels.",
    },
    {
      title: "Understand Autonomy and Scope",
      url: "https://www.forwardimpact.team/docs/products/career-paths/autonomy-scope/index.md",
      description: "What each level implies for decision-making and ownership.",
    },
  ],
};

/**
 * Main CLI entry point
 */
async function main() {
  const cli = createCli(definition);
  const parsed = cli.parse(process.argv.slice(2));
  if (!parsed) process.exit(0);

  const { values, positionals } = parsed;
  const [command, ...args] = positionals;

  if (!command) {
    cli.showHelp();
    process.exit(0);
  }

  const runtime = createDefaultRuntime();

  let dataDir;
  if (values.data) {
    dataDir = resolve(values.data);
  } else {
    try {
      dataDir = join(runtime.finder.findData("data", homedir()), "pathway");
    } catch {
      cli.error(
        "No data directory found. Use --data=<path> to specify location.",
      );
      process.exit(1);
    }
  }

  if (command === "dev") {
    await runDevCommand({ dataDir, options: values, runtime });
    return;
  }

  if (command === "serve") {
    const dir = resolve(args[0] || "public");
    await runServeCommand({ dir, options: values, runtime });
    return;
  }

  if (command === "build") {
    await runBuildCommand({ dataDir, options: values, runtime });
    process.exit(0);
  }

  if (command === "update") {
    await runUpdateCommand({ dataDir, options: values, runtime });
    process.exit(0);
  }

  const handler = COMMANDS[command];

  if (!handler) {
    cli.usageError(`unknown command "${command}"`);
    process.exit(2);
  }

  try {
    const loader = createDataLoader(runtime);
    const templateLoader = createTemplateLoader(TEMPLATE_DIR);

    const data = await loader.loadAndValidate(dataDir);

    await handler({
      data,
      args,
      options: values,
      dataDir,
      templateLoader,
      loader,
      runtime,
    });
  } catch (error) {
    cli.error(error.message);
    process.exit(1);
  }
}

main();
