#!/usr/bin/env node

import { runOutputCommand } from "../src/commands/output.js";
import { runTeeCommand } from "../src/commands/tee.js";
import { runRunCommand } from "../src/commands/run.js";
import { runSuperviseCommand } from "../src/commands/supervise.js";

const COMMANDS = {
  output: runOutputCommand,
  tee: runTeeCommand,
  run: runRunCommand,
  supervise: runSuperviseCommand,
};

const HELP_TEXT = `
Eval CLI — Process Claude Code stream-json output

Usage:
  fit-eval <command> [options]

Commands:
  output [--format=json|text]    Process trace and output formatted result
  tee [output.ndjson]            Stream text to stdout, optionally save raw NDJSON
  run [options]                  Run a single agent via the Claude Agent SDK
  supervise [options]            Run a supervised agent ↔ supervisor relay loop

Run options:
  --task-file=PATH     Path to task file (mutually exclusive with --task-text)
  --task-text=STRING   Inline task text (mutually exclusive with --task-file)
  --cwd=DIR            Agent working directory (default: .)
  --model=MODEL        Claude model to use (default: opus)
  --max-turns=N        Maximum agentic turns (default: 50, 0 = unlimited)
  --output=PATH        Write NDJSON trace to file (default: stdout)
  --allowed-tools=LIST Comma-separated tools (default: Bash,Read,Glob,Grep,Write,Edit)
  --agent-profile=NAME Agent profile name (passed as --agent to Claude CLI)

Supervise options:
  --task-file=PATH          Path to task file (mutually exclusive with --task-text)
  --task-text=STRING        Inline task text (mutually exclusive with --task-file)
  --supervisor-cwd=DIR      Supervisor working directory (default: .)
  --agent-cwd=DIR           Agent working directory (default: temp directory)
  --model=MODEL             Claude model to use (default: opus)
  --max-turns=N             Maximum supervisor ↔ agent exchanges (default: 20, 0 = unlimited)
  --output=PATH             Write NDJSON trace to file (default: stdout)
  --allowed-tools=LIST      Comma-separated tools for agent (default: Bash,Read,Glob,Grep,Write,Edit)
  --supervisor-allowed-tools=LIST
                            Comma-separated tools for supervisor (default: Bash,Read,Glob,Grep,Write,Edit)
  --supervisor-profile=NAME Supervisor agent profile name (passed as --agent to Claude CLI)
  --agent-profile=NAME      Agent profile name (passed as --agent to Claude CLI)

Options:
  --help      Show this help message
  --version   Show version number

Examples:
  fit-eval output --format=text < trace.ndjson
  fit-eval output --format=json < trace.ndjson
  fit-eval tee < trace.ndjson
  fit-eval tee output.ndjson < trace.ndjson
  fit-eval run --task-text="Perform a security audit of the repository." --model=opus
  fit-eval run --task-file=scenarios/guide-setup/task.md --model=opus
  fit-eval supervise --task-file=scenarios/guide-setup/task.md --supervisor-cwd=.
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
