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

import { runRosterCommand } from "../src/commands/roster.js";
import { runValidateCommand } from "../src/commands/validate.js";
import { loadMapData, resolveDataDir } from "../src/lib/cli.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Package version read from package.json. */
const VERSION = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf8"),
).version;

const COMMANDS = {
  roster: runRosterCommand,
  validate: runValidateCommand,
};

const definition = {
  name: "fit-summit",
  version: VERSION,
  description: "Team capability planning from skill data.",
  commands: [
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
    help: { type: "boolean", short: "h", description: "Show help" },
    version: { type: "boolean", short: "v", description: "Show version" },
  },
  examples: [
    "fit-summit roster",
    "fit-summit roster --roster ./summit.yaml",
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
