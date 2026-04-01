import { readFileSync, createWriteStream, mkdtempSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { createSupervisor } from "../supervisor.js";
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
 * Supervise command — run two agents in a relay loop via the Claude Agent SDK.
 *
 * Usage: fit-eval supervise [options]
 *
 * Options:
 *   --task=PATH               Path to task file (required)
 *   --supervisor-cwd=DIR      Supervisor working directory (default: .)
 *   --agent-cwd=DIR           Agent working directory (default: temp directory)
 *   --model=MODEL             Claude model to use (default: opus)
 *   --max-turns=N             Maximum supervisor ↔ agent exchanges (default: 20)
 *   --output=PATH             Write NDJSON trace to file (default: stdout)
 *   --allowed-tools=LIST      Comma-separated tools for the agent (default: Bash,Read,Glob,Grep,Write,Edit)
 *   --supervisor-profile=NAME Supervisor agent profile name (passed as --agent to Claude CLI)
 *   --agent-profile=NAME      Agent profile name (passed as --agent to Claude CLI)
 *
 * @param {string[]} args - Command arguments
 */
export async function runSuperviseCommand(args) {
  const task = parseFlag(args, "task");
  if (!task) throw new Error("--task is required");

  const supervisorCwd = resolve(parseFlag(args, "supervisor-cwd") ?? ".");
  const agentCwd = resolve(
    parseFlag(args, "agent-cwd") ??
      mkdtempSync(join(tmpdir(), "fit-eval-agent-")),
  );
  const model = parseFlag(args, "model") ?? "opus";
  const maxTurns = parseInt(parseFlag(args, "max-turns") ?? "20", 10);
  const outputPath = parseFlag(args, "output");
  const supervisorProfile = parseFlag(args, "supervisor-profile") ?? undefined;
  const agentProfile = parseFlag(args, "agent-profile") ?? undefined;
  const allowedTools = (
    parseFlag(args, "allowed-tools") ?? "Bash,Read,Glob,Grep,Write,Edit"
  ).split(",");

  const taskContent = readFileSync(task, "utf8");

  // When --output is specified, stream text to stdout while writing NDJSON to file.
  // Otherwise, write NDJSON directly to stdout (backwards-compatible).
  const fileStream = outputPath ? createWriteStream(outputPath) : null;
  const output = fileStream
    ? createTeeWriter({
        fileStream,
        textStream: process.stdout,
        mode: "supervised",
      })
    : process.stdout;

  const { query } = await import("@anthropic-ai/claude-agent-sdk");
  const supervisor = createSupervisor({
    supervisorCwd,
    agentCwd,
    query,
    output,
    model,
    maxTurns,
    allowedTools,
    supervisorProfile,
    agentProfile,
  });

  const result = await supervisor.run(taskContent);

  if (fileStream) {
    await new Promise((r) => output.end(r));
    await new Promise((r) => fileStream.end(r));
  }

  process.exit(result.success ? 0 : 1);
}
