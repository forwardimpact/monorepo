#!/usr/bin/env node
/**
 * Summit CLI
 *
 * Team capability planning from skill data.
 *
 * Usage:
 *   npx fit-summit <command> [options]
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createCli } from "@forwardimpact/libcli";

import { runCoverageCommand } from "../src/commands/coverage.js";
import { runRisksCommand } from "../src/commands/risks.js";
import { runRosterCommand } from "../src/commands/roster.js";
import { runValidateCommand } from "../src/commands/validate.js";
import { runWhatIfCommand } from "../src/commands/what-if.js";
import { loadMapData, resolveDataDir } from "../src/lib/cli.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Package version read from package.json. */
const VERSION = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf8"),
).version;

const COMMANDS = {
  coverage: runCoverageCommand,
  risks: runRisksCommand,
  roster: runRosterCommand,
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
    },
    {
      name: "risks",
      args: "<team>",
      description: "Show structural risks",
    },
    {
      name: "what-if",
      args: "<team> [--add/--remove/--move/--promote]",
      description: "Simulate roster changes",
    },
    { name: "roster", args: "", description: "Show current roster" },
    { name: "validate", args: "", description: "Validate roster file" },
  ],
  options: {
    roster: { type: "string", description: "Path to summit.yaml" },
    data: { type: "string", description: "Path to Map data directory" },
    format: {
      type: "string",
      default: "text",
      description: "Output format: text, json, markdown",
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
    add: { type: "string", description: "what-if: add a hypothetical person" },
    remove: { type: "string", description: "what-if: remove a team member" },
    move: {
      type: "string",
      description: "what-if: move a member between teams",
    },
    to: { type: "string", description: "what-if: destination team for --move" },
    promote: {
      type: "string",
      description: "what-if: promote a member to the next level",
    },
    focus: {
      type: "string",
      description: "what-if: filter the diff to one capability",
    },
    allocation: {
      type: "string",
      description: "what-if: allocation fraction for --add on a project",
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
};

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

  const handler = COMMANDS[command];
  if (!handler) {
    cli.usageError(`unknown command "${command}"`);
    process.exit(2);
  }

  try {
    const dataDir = resolveDataDir(values);
    const data = await loadMapData(dataDir);
    await handler({ data, args, options: values, dataDir });
  } catch (error) {
    cli.error(error.message);
    process.exit(1);
  }
}

main();
