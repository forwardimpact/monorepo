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
 * Parse all supervise flags from args into an options object.
 * @param {string[]} args
 * @returns {object}
 */
function parseSuperviseOptions(args) {
  const taskFile = parseFlag(args, "task-file");
  const taskText = parseFlag(args, "task-text");
  if (taskFile && taskText)
    throw new Error("--task-file and --task-text are mutually exclusive");
  if (!taskFile && !taskText)
    throw new Error("--task-file or --task-text is required");

  const supervisorAllowedToolsRaw = parseFlag(args, "supervisor-allowed-tools");

  return {
    taskContent: taskFile ? readFileSync(taskFile, "utf8") : taskText,
    supervisorCwd: resolve(parseFlag(args, "supervisor-cwd") ?? "."),
    agentCwd: resolve(
      parseFlag(args, "agent-cwd") ??
        mkdtempSync(join(tmpdir(), "fit-eval-agent-")),
    ),
    model: parseFlag(args, "model") ?? "opus",
    maxTurns: (() => {
      const raw = parseFlag(args, "max-turns") ?? "20";
      return raw === "0" ? 0 : parseInt(raw, 10);
    })(),
    outputPath: parseFlag(args, "output"),
    supervisorProfile: parseFlag(args, "supervisor-profile") ?? undefined,
    agentProfile: parseFlag(args, "agent-profile") ?? undefined,
    allowedTools: (
      parseFlag(args, "allowed-tools") ?? "Bash,Read,Glob,Grep,Write,Edit"
    ).split(","),
    supervisorAllowedTools: supervisorAllowedToolsRaw
      ? supervisorAllowedToolsRaw.split(",")
      : undefined,
  };
}

/**
 * Supervise command — run two agents in a relay loop via the Claude Agent SDK.
 *
 * Usage: fit-eval supervise [options]
 *
 * Options:
 *   --task-file=PATH          Path to task file (mutually exclusive with --task-text)
 *   --task-text=STRING        Inline task text (mutually exclusive with --task-file)
 *   --supervisor-cwd=DIR      Supervisor working directory (default: .)
 *   --agent-cwd=DIR           Agent working directory (default: temp directory)
 *   --model=MODEL             Claude model to use (default: opus)
 *   --max-turns=N             Maximum supervisor / agent exchanges (default: 20, 0 = unlimited)
 *   --output=PATH             Write NDJSON trace to file (default: stdout)
 *   --allowed-tools=LIST      Comma-separated tools for the agent (default: Bash,Read,Glob,Grep,Write,Edit)
 *   --supervisor-profile=NAME Supervisor agent profile name (passed as --agent to Claude CLI)
 *   --agent-profile=NAME      Agent profile name (passed as --agent to Claude CLI)
 *
 * @param {string[]} args - Command arguments
 */
export async function runSuperviseCommand(args) {
  const opts = parseSuperviseOptions(args);

  // When --output is specified, stream text to stdout while writing NDJSON to file.
  // Otherwise, write NDJSON directly to stdout (backwards-compatible).
  const fileStream = opts.outputPath
    ? createWriteStream(opts.outputPath)
    : null;
  const output = fileStream
    ? createTeeWriter({
        fileStream,
        textStream: process.stdout,
        mode: "supervised",
      })
    : process.stdout;

  const { query } = await import("@anthropic-ai/claude-agent-sdk");
  const supervisor = createSupervisor({
    supervisorCwd: opts.supervisorCwd,
    agentCwd: opts.agentCwd,
    query,
    output,
    model: opts.model,
    maxTurns: opts.maxTurns,
    allowedTools: opts.allowedTools,
    supervisorAllowedTools: opts.supervisorAllowedTools,
    supervisorProfile: opts.supervisorProfile,
    agentProfile: opts.agentProfile,
  });

  const result = await supervisor.run(opts.taskContent);

  if (fileStream) {
    await new Promise((r) => output.end(r));
    await new Promise((r) => fileStream.end(r));
  }

  process.exit(result.success ? 0 : 1);
}
