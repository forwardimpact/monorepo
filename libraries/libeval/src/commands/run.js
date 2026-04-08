import { readFileSync, createWriteStream } from "node:fs";
import { resolve } from "node:path";
import { createAgentRunner } from "../agent-runner.js";
import { createTeeWriter } from "../tee-writer.js";

/**
 * Parse a --key=value or --key value flag from args.
 * @param {string[]} args
 * @param {string} name - Flag name without --
 * @returns {string|undefined}
 */
function parseFlag(args, name) {
  const prefix = `--${name}=`;
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith(prefix)) return args[i].slice(prefix.length);
    if (args[i] === `--${name}` && i + 1 < args.length) return args[i + 1];
  }
  return undefined;
}

/**
 * Run command — execute a single agent via the Claude Agent SDK.
 *
 * Usage: fit-eval run [options]
 *
 * Options:
 *   --task-file=PATH     Path to task file (mutually exclusive with --task-text)
 *   --task-text=STRING   Inline task text (mutually exclusive with --task-file)
 *   --cwd=DIR            Agent working directory (default: .)
 *   --model=MODEL        Claude model to use (default: opus)
 *   --max-turns=N        Maximum agentic turns (default: 50, 0 = unlimited)
 *   --output=PATH        Write NDJSON trace to file (default: stdout)
 *   --allowed-tools=LIST Comma-separated tools (default: Bash,Read,Glob,Grep,Write,Edit)
 *   --agent-profile=NAME Agent profile name (passed as --agent to Claude CLI)
 *
 * @param {string[]} args - Command arguments
 */
export async function runRunCommand(args) {
  const taskFile = parseFlag(args, "task-file");
  const taskText = parseFlag(args, "task-text");
  if (taskFile && taskText)
    throw new Error("--task-file and --task-text are mutually exclusive");
  if (!taskFile && !taskText)
    throw new Error("--task-file or --task-text is required");

  const cwd = resolve(parseFlag(args, "cwd") ?? ".");
  const model = parseFlag(args, "model") ?? "opus";
  const maxTurnsRaw = parseFlag(args, "max-turns") ?? "50";
  const maxTurns = maxTurnsRaw === "0" ? 0 : parseInt(maxTurnsRaw, 10);
  const outputPath = parseFlag(args, "output");
  const agentProfile = parseFlag(args, "agent-profile") ?? undefined;
  const allowedTools = (
    parseFlag(args, "allowed-tools") ?? "Bash,Read,Glob,Grep,Write,Edit"
  ).split(",");

  const taskContent = taskFile ? readFileSync(taskFile, "utf8") : taskText;

  // When --output is specified, stream text to stdout while writing NDJSON to file.
  // Otherwise, write NDJSON directly to stdout (backwards-compatible).
  const fileStream = outputPath ? createWriteStream(outputPath) : null;
  const output = fileStream
    ? createTeeWriter({ fileStream, textStream: process.stdout, mode: "raw" })
    : process.stdout;

  const { query } = await import("@anthropic-ai/claude-agent-sdk");
  const runner = createAgentRunner({
    cwd,
    query,
    output,
    model,
    maxTurns,
    allowedTools,
    settingSources: ["project"],
    agentProfile,
  });

  const result = await runner.run(taskContent);

  if (fileStream) {
    await new Promise((r) => output.end(r));
    await new Promise((r) => fileStream.end(r));
  }

  process.exit(result.success ? 0 : 1);
}
