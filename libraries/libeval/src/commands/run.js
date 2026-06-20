import { Writable } from "node:stream";
import { resolve } from "node:path";
import { isoTimestamp } from "@forwardimpact/libutil";
import { createAgentRunner } from "../agent-runner.js";
import { composeProfilePrompt } from "../profile-prompt.js";
import { createRedactor } from "../redaction.js";
import { createTeeWriter } from "../tee-writer.js";
import { SequenceCounter } from "../sequence-counter.js";
import { resolveWorkTracker } from "./work-tracker.js";
import { resolveTaskContent } from "./task-input.js";
import { createServiceConfig } from "@forwardimpact/libconfig";
import { AGENT_MODEL } from "@forwardimpact/libutil/models";

/**
 * Parse and validate run command options from parsed values.
 * @param {object} values - Parsed option values from cli.parse()
 * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
 * @returns {{ taskContent: string, cwd: string, model: string, maxTurns: number, outputPath: string|undefined, agentProfile: string|undefined, workTracker: string, allowedTools: string[] }}
 */
export function parseRunOptions(values, runtime) {
  const { task: taskContent, amend: taskAmend } = resolveTaskContent(
    values,
    runtime,
  );
  const maxTurnsRaw = values["max-turns"] ?? "50";

  return {
    taskContent,
    taskAmend,
    cwd: resolve(values.cwd ?? "."),
    agentModel: values["agent-model"] || AGENT_MODEL,
    maxTurns: maxTurnsRaw === "0" ? 0 : parseInt(maxTurnsRaw, 10),
    outputPath: values.output,
    agentProfile: values["agent-profile"] ?? undefined,
    workTracker: resolveWorkTracker(values, runtime?.proc?.env),
    allowedTools: (
      values["allowed-tools"] ??
      "Bash,Read,Glob,Grep,Write,Edit,Agent,TodoWrite"
    ).split(","),
    mcpServer: values["mcp-server"] ?? undefined,
  };
}

/**
 * Run command — execute a single agent via the Claude Agent SDK.
 *
 * Usage: fit-eval run [options]
 *
 * @param {import("@forwardimpact/libcli").InvocationContext} ctx
 * @returns {Promise<{ok: boolean, code?: number, error?: string}>}
 */
export async function runRunCommand(ctx) {
  const runtime = ctx.deps.runtime;
  const {
    taskContent,
    taskAmend,
    cwd,
    agentModel,
    maxTurns,
    outputPath,
    agentProfile,
    workTracker,
    allowedTools,
    mcpServer,
  } = parseRunOptions(ctx.options, runtime);

  // Build the redactor as the first observable side-effect after option
  // parsing — the env snapshot must freeze BEFORE any in-process
  // env writes the command performs (e.g. LIBEVAL_AGENT_PROFILE).
  const redactor = createRedactor({ runtime });

  // When --output is specified, stream text to stdout while writing NDJSON to file.
  // Otherwise, write NDJSON directly to stdout (backwards-compatible).
  const fileStream = outputPath
    ? runtime.fs.createWriteStream(outputPath)
    : null;
  const output = fileStream
    ? createTeeWriter({
        fileStream,
        textStream: runtime.proc.stdout,
        mode: "raw",
        now: () => isoTimestamp(runtime.clock.now()),
      })
    : runtime.proc.stdout;

  const counter = new SequenceCounter();
  const devNull = new Writable({
    write(_chunk, _enc, cb) {
      cb();
    },
  });
  const onLine = (line) => {
    const event = JSON.parse(line);
    const tagged = { source: "agent", seq: counter.next(), event };
    output.write(JSON.stringify(redactor.redactValue(tagged)) + "\n");
  };

  let mcpServers = null;
  if (mcpServer) {
    const mcpConfig = await createServiceConfig("mcp");
    mcpServers = {
      [mcpServer]: {
        type: "http",
        url: mcpConfig.url,
        headers: { Authorization: `Bearer ${mcpConfig.mcpToken()}` },
      },
    };
    allowedTools.push(`mcp__${mcpServer}__*`);
  }

  if (agentProfile) {
    runtime.proc.env.LIBEVAL_AGENT_PROFILE = agentProfile;
  }
  // Unconditional so the default "github" is observable to the agent's
  // active-tracker resolution, mirroring --agent-profile's env write above.
  runtime.proc.env.LIBEVAL_WORK_TRACKER = workTracker;

  const systemPrompt = agentProfile
    ? composeProfilePrompt(agentProfile, {
        profilesDir: resolve(cwd, ".claude/agents"),
        runtime,
      })
    : undefined;

  const { query } = await import("@anthropic-ai/claude-agent-sdk");
  const runner = createAgentRunner({
    cwd,
    query,
    output: devNull,
    model: agentModel,
    maxTurns,
    allowedTools,
    onLine,
    settingSources: ["project"],
    systemPrompt,
    taskAmend,
    mcpServers,
    redactor,
    runtime,
  });

  const result = await runner.run(taskContent);

  if (fileStream) {
    await new Promise((r) => output.end(r));
    await new Promise((r) => fileStream.end(r));
  }

  return result.success
    ? { ok: true }
    : { ok: false, code: 1, error: result.error?.message ?? "" };
}
