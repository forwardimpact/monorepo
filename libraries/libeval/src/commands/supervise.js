import { readFileSync, createWriteStream, mkdtempSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { createSupervisor } from "../supervisor.js";
import { createRedactor } from "../redaction.js";
import { createTeeWriter } from "../tee-writer.js";
import { createServiceConfig } from "@forwardimpact/libconfig";

/**
 * Parse all supervise flags from parsed values into an options object.
 * @param {object} values - Parsed option values from cli.parse()
 * @returns {object}
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: CLI option validation
function parseSuperviseOptions(values) {
  const taskFile = values["task-file"];
  const taskText = values["task-text"];
  if (taskFile && taskText)
    throw new Error("--task-file and --task-text are mutually exclusive");
  if (!taskFile && !taskText)
    throw new Error("--task-file or --task-text is required");

  const supervisorAllowedToolsRaw = values["supervisor-allowed-tools"];

  const taskAmend = values["task-amend"] ?? undefined;
  const taskContent = taskFile ? readFileSync(taskFile, "utf8") : taskText;

  return {
    taskContent,
    taskAmend,
    supervisorCwd: resolve(values["supervisor-cwd"] ?? "."),
    agentCwd: resolve(
      values["agent-cwd"] ?? mkdtempSync(join(tmpdir(), "fit-eval-agent-")),
    ),
    agentModel: values["agent-model"] ?? "claude-opus-4-7[1m]",
    supervisorModel: values["supervisor-model"] ?? "claude-opus-4-7[1m]",
    maxTurns: (() => {
      const raw = values["max-turns"] ?? "200";
      return raw === "0" ? 0 : parseInt(raw, 10);
    })(),
    outputPath: values.output,
    supervisorProfile: values["supervisor-profile"] ?? undefined,
    agentProfile: values["agent-profile"] ?? undefined,
    allowedTools: (
      values["allowed-tools"] ??
      "Bash,Read,Glob,Grep,Write,Edit,Agent,TodoWrite"
    ).split(","),
    supervisorAllowedTools: supervisorAllowedToolsRaw
      ? supervisorAllowedToolsRaw.split(",")
      : undefined,
    mcpServer: values["mcp-server"] ?? undefined,
  };
}

/**
 * Supervise command — run two agents in a relay loop via the Claude Agent SDK.
 *
 * Usage: fit-eval supervise [options]
 *
 * @param {object} values - Parsed option values from cli.parse()
 * @param {string[]} args - Positional arguments
 */
export async function runSuperviseCommand(values, _args) {
  const opts = parseSuperviseOptions(values);

  // Build the redactor as the first observable side-effect after option
  // parsing — the env snapshot must freeze BEFORE any in-process
  // process.env writes the command performs (e.g. LIBEVAL_AGENT_PROFILE).
  const redactor = createRedactor();

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

  let agentMcpServers = null;
  if (opts.mcpServer) {
    const mcpConfig = await createServiceConfig("mcp");
    agentMcpServers = {
      [opts.mcpServer]: {
        type: "http",
        url: mcpConfig.url,
        headers: { Authorization: `Bearer ${mcpConfig.mcpToken()}` },
      },
    };
    opts.allowedTools.push(`mcp__${opts.mcpServer}__*`);
  }

  if (opts.agentProfile) {
    process.env.LIBEVAL_AGENT_PROFILE = opts.agentProfile;
  }

  const { query } = await import("@anthropic-ai/claude-agent-sdk");
  const supervisor = createSupervisor({
    supervisorCwd: opts.supervisorCwd,
    agentCwd: opts.agentCwd,
    query,
    output,
    agentModel: opts.agentModel,
    supervisorModel: opts.supervisorModel,
    maxTurns: opts.maxTurns,
    allowedTools: opts.allowedTools,
    supervisorAllowedTools: opts.supervisorAllowedTools,
    supervisorProfile: opts.supervisorProfile,
    agentProfile: opts.agentProfile,
    taskAmend: opts.taskAmend,
    agentMcpServers,
    redactor,
  });

  const result = await supervisor.run(opts.taskContent);

  if (fileStream) {
    await new Promise((r) => output.end(r));
    await new Promise((r) => fileStream.end(r));
  }

  process.exit(result.success ? 0 : 1);
}
