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
 *   --task=PATH          Path to task file (required)
 *   --cwd=DIR            Agent working directory (default: .)
 *   --model=MODEL        Claude model to use (default: opus)
 *   --max-turns=N        Maximum agentic turns (default: 50)
 *   --output=PATH        Write NDJSON trace to file (default: stdout)
 *   --allowed-tools=LIST Comma-separated tools (default: Bash,Read,Glob,Grep,Write,Edit)
 *
 * @param {string[]} args - Command arguments
 */
export async function runRunCommand(args) {
  const task = parseFlag(args, "task");
  if (!task) throw new Error("--task is required");

  const cwd = resolve(parseFlag(args, "cwd") ?? ".");
  const model = parseFlag(args, "model") ?? "opus";
  const maxTurns = parseInt(parseFlag(args, "max-turns") ?? "50", 10);
  const outputPath = parseFlag(args, "output");
  const allowedTools = (
    parseFlag(args, "allowed-tools") ?? "Bash,Read,Glob,Grep,Write,Edit"
  ).split(",");

  const taskContent = readFileSync(task, "utf8");

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
  });

  const result = await runner.run(taskContent);

  if (fileStream) {
    await new Promise((r) => output.end(r));
    await new Promise((r) => fileStream.end(r));
  }

  process.exit(result.success ? 0 : 1);
}
