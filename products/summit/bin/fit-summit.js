#!/usr/bin/env node
/**
 * Summit CLI
 *
 * Team capability planning from skill data.
 *
 * Usage:
 *   npx fit-summit <command> [options]
 */

import "@forwardimpact/libpreflight/node22";

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createCli } from "@forwardimpact/libcli";
import { createProductConfig } from "@forwardimpact/libconfig";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { runCompareCommand } from "../src/commands/compare.js";
import { runCoverageCommand } from "../src/commands/coverage.js";
import { runGrowthCommand } from "../src/commands/growth.js";
import { runRisksCommand } from "../src/commands/risks.js";
import { runRosterCommand } from "../src/commands/roster.js";
import { runTrajectoryCommand } from "../src/commands/trajectory.js";
import { runValidateCommand } from "../src/commands/validate.js";
import { runWhatIfCommand } from "../src/commands/what-if.js";
import { loadMapData, resolveDataDir } from "../src/lib/cli.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// `bun build --compile` injects FIT_SUMMIT_VERSION via --define, eliminating
// the readFileSync branch in the compiled binary (which would ENOENT against
// the bunfs virtual mount). Source execution falls through to package.json.
const VERSION =
  process.env.FIT_SUMMIT_VERSION ||
  JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"))
    .version;

const config = await createProductConfig("summit");

const COMMANDS = {
  compare: runCompareCommand,
  coverage: runCoverageCommand,
  growth: runGrowthCommand,
  risks: runRisksCommand,
  roster: runRosterCommand,
  trajectory: runTrajectoryCommand,
  validate: runValidateCommand,
  "what-if": runWhatIfCommand,
};

const definition = {
  name: "fit-summit",
  version: VERSION,
  description: "Team capability planning from skill data.",
  commands: [
    {
      name: "coverage",
      args: "<team>",
      description: "Show capability coverage",
      options: {
        evidenced: {
          type: "boolean",
          description: "Include practiced capability from Map evidence data",
        },
        "lookback-months": {
          type: "string",
          description: "Lookback window for practice patterns (default: 12)",
        },
        project: {
          type: "string",
          description: "Use a project team instead of a reporting team",
        },
        audience: {
          type: "string",
          default: "manager",
          description: "Privacy audience: engineer, manager, director",
        },
      },
      examples: [
        "fit-summit coverage platform",
        "fit-summit coverage platform --evidenced --lookback-months=6",
      ],
    },
    {
      name: "risks",
      args: "<team>",
      description: "Show structural risks",
      options: {
        evidenced: {
          type: "boolean",
          description: "Include practiced capability from Map evidence data",
        },
        "lookback-months": {
          type: "string",
          description: "Lookback window for practice patterns (default: 12)",
        },
        project: {
          type: "string",
          description: "Use a project team instead of a reporting team",
        },
        audience: {
          type: "string",
          default: "manager",
          description: "Privacy audience: engineer, manager, director",
        },
      },
    },
    {
      name: "what-if",
      args: "<team>",
      description:
        "Simulate roster changes (the team is the source for --move, otherwise the target team for the diff)",
      options: {
        add: { type: "string", description: "Add a hypothetical person" },
        remove: { type: "string", description: "Remove a team member" },
        move: {
          type: "string",
          description:
            "Move a member out of <team> (the source) to --to (the destination)",
        },
        to: {
          type: "string",
          description:
            "Destination team for --move (receives the member); the diff covers both teams",
        },
        promote: {
          type: "string",
          description: "Promote a member to the next level",
        },
        focus: {
          type: "string",
          description: "Filter the diff to one capability",
        },
        allocation: {
          type: "string",
          description: "Allocation fraction for --add on a project",
        },
        project: {
          type: "string",
          description: "Use a project team instead of a reporting team",
        },
      },
      examples: [
        "fit-summit what-if platform --add 'Jane, senior, backend'",
        "fit-summit what-if platform --remove 'Bob'",
        "fit-summit what-if platform --promote 'Alice'",
        "fit-summit what-if platform --move 'Alice' --to billing",
      ],
    },
    {
      name: "growth",
      args: "<team>",
      description: "Show growth opportunities aligned with team needs",
      options: {
        evidenced: {
          type: "boolean",
          description: "Include practiced capability from Map evidence data",
        },
        outcomes: {
          type: "boolean",
          description: "Weight recommendations by GetDX driver scores",
        },
        "lookback-months": {
          type: "string",
          description: "Lookback window for practice patterns (default: 12)",
        },
        project: {
          type: "string",
          description: "Use a project team instead of a reporting team",
        },
        audience: {
          type: "string",
          default: "manager",
          description: "Privacy audience: engineer, manager, director",
        },
      },
    },
    {
      name: "compare",
      args: "<team1> <team2>",
      description: "Compare two teams' coverage and risks",
      options: {
        "left-project": {
          type: "string",
          description: "Left side is a project team",
        },
        "right-project": {
          type: "string",
          description: "Right side is a project team",
        },
        audience: {
          type: "string",
          default: "manager",
          description: "Privacy audience: engineer, manager, director",
        },
      },
    },
    {
      name: "trajectory",
      args: "<team>",
      description: "Show team capability over time",
      options: {
        quarters: {
          type: "string",
          description: "Number of quarters to show (default: 4)",
        },
        evidenced: {
          type: "boolean",
          description: "Include practiced capability from Map evidence data",
        },
      },
      examples: [
        "fit-summit trajectory platform",
        "fit-summit trajectory platform --quarters=8",
      ],
    },
    { name: "roster", description: "Show current roster" },
    { name: "validate", description: "Validate roster file" },
  ],
  globalOptions: {
    roster: { type: "string", description: "Path to summit.yaml" },
    data: { type: "string", description: "Path to Map data directory" },
    format: {
      type: "string",
      default: "text",
      description: "Output format: text, json, markdown (default: text)",
    },
    help: { type: "boolean", short: "h", description: "Show help" },
    version: { type: "boolean", short: "v", description: "Show version" },
  },
  examples: [
    "fit-summit roster",
    "fit-summit coverage platform",
    "fit-summit coverage --project migration-q2",
    "fit-summit validate --roster ./summit.yaml",
  ],
  documentation: [
    {
      title: "Summit Overview",
      url: "https://www.forwardimpact.team/summit/index.md",
      description: "Product overview, design principles, and audience model.",
    },
    {
      title: "Getting Started: Summit for Leaders",
      url: "https://www.forwardimpact.team/docs/getting-started/leaders/summit/index.md",
      description: "From zero to your first team capability analysis.",
    },
    {
      title: "Make Staffing Decisions You Can Defend",
      url: "https://www.forwardimpact.team/docs/products/team-capability/index.md",
      description:
        "Coverage heatmaps, structural risks, and what-if scenarios.",
    },
    {
      title: "Evaluate a Candidate Against Team Gaps",
      url: "https://www.forwardimpact.team/docs/products/team-capability/evaluate-candidate/index.md",
      description: "Check whether a candidate fills the team's actual gap.",
    },
    {
      title: "Surface Capability Gaps",
      url: "https://www.forwardimpact.team/docs/products/team-capability/surface-gaps/index.md",
      description: "Detect single points of failure and coverage blindspots.",
    },
  ],
};

async function main() {
  const runtime = createDefaultRuntime();
  const cli = createCli(definition, { runtime });
  const parsed = cli.parse(process.argv.slice(2));
  if (!parsed) process.exit(0);

  const { values, positionals } = parsed;
  const [command, ...args] = positionals;

  if (!command) {
    cli.showHelp();
    process.exit(0);
  }

  const handler = COMMANDS[command];
  if (!handler) {
    cli.usageError(`unknown command "${command}"`);
    process.exit(2);
  }

  try {
    const dataDir = resolveDataDir(values, runtime);
    const data = await loadMapData(dataDir, runtime);
    await handler({ data, args, options: values, dataDir, config, runtime });
  } catch (error) {
    cli.error(error.message);
    process.exit(1);
  }
}

main();
