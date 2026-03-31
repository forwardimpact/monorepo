#!/usr/bin/env bun

import { runOutputCommand } from "../src/commands/output.js";
import { runTeeCommand } from "../src/commands/tee.js";

const COMMANDS = {
  output: runOutputCommand,
  tee: runTeeCommand,
};

const HELP_TEXT = `
Eval CLI — Process Claude Code stream-json output

Usage:
  fit-eval <command> [options]

Commands:
  output [--format=json|text]    Process trace and output formatted result
  tee [output.ndjson]            Stream text to stdout, optionally save raw NDJSON

Options:
  --help      Show this help message
  --version   Show version number

Examples:
  fit-eval output --format=text < trace.ndjson
  fit-eval output --format=json < trace.ndjson
  fit-eval tee < trace.ndjson
  fit-eval tee output.ndjson < trace.ndjson
`.trim();

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    console.log(HELP_TEXT);
    return;
  }

  if (args.includes("--version")) {
    const { readFileSync } = await import("fs");
    const { join, dirname } = await import("path");
    const { fileURLToPath } = await import("url");
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(
      readFileSync(join(__dirname, "..", "package.json"), "utf8"),
    );
    console.log(pkg.version);
    return;
  }

  const commandName = args[0];
  const handler = COMMANDS[commandName];

  if (!handler) {
    console.error(`Unknown command: ${commandName}\n`);
    console.error(HELP_TEXT);
    process.exit(1);
  }

  await handler(args.slice(1));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
