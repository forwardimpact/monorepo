import { resolve, join } from "node:path";
import { isoTimestamp } from "@forwardimpact/libutil";
import { createSupervisor } from "../supervisor.js";
import { createRedactor } from "../redaction.js";
import { createTeeWriter } from "../tee-writer.js";
import { resolveTaskContent } from "./task-input.js";
import { resolveWorkTracker } from "./work-tracker.js";
import { createServiceConfig } from "@forwardimpact/libconfig";
import { AGENT_MODEL, LEAD_MODEL } from "@forwardimpact/libutil/models";

/**
 * Parse all supervise flags from parsed values into an options object.
 * @param {object} values - Parsed option values from cli.parse()
 * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
 * @returns {Promise<object>}
 */
export async function parseSuperviseOptions(values, runtime) {
  const { task: taskContent, amend: taskAmend } = resolveTaskContent(
    values,
    runtime,
  );
  const supervisorAllowedToolsRaw = values["supervisor-allowed-tools"];

  // `||` (not `??`) throughout so an empty-string flag from a CI forwarder
  // falls back to the default rather than overriding it with "".
  const tmpRoot = runtime.proc.env.TMPDIR ?? "/tmp";
  const agentCwd = resolve(
    values["agent-cwd"] ||
      (await runtime.fs.mkdtemp(join(tmpRoot, "fit-harness-agent-"))),
  );

  return {
    taskContent,
    taskAmend,
    supervisorCwd: resolve(values["supervisor-cwd"] || "."),
    agentCwd,
    agentModel: values["agent-model"] || AGENT_MODEL,
    supervisorModel: values["lead-model"] || LEAD_MODEL,
    maxTurns: (() => {
      const raw = values["max-turns"] || "200";
      return raw === "0" ? 0 : parseInt(raw, 10);
    })(),
    outputPath: values.output,
    supervisorProfile: values["lead-profile"] || undefined,
    agentProfile: values["agent-profile"] || undefined,
    workTracker: resolveWorkTracker(values, runtime?.proc?.env),
    allowedTools: (
      values["allowed-tools"] ||
      "Bash,Read,Glob,Grep,Write,Edit,Agent,TodoWrite"
    ).split(","),
    supervisorAllowedTools: supervisorAllowedToolsRaw
      ? supervisorAllowedToolsRaw.split(",")
      : undefined,
    mcpServer: values["mcp-server"] || undefined,
  };
}

/**
 * Supervise command — run one agent under a supervisor via the
 * orchestration loop. The supervisor delegates work through Ask, sees
 * each reply on its next turn, and ends with Conclude.
 *
 * Usage: fit-harness supervise [options]
 *
 * @param {import("@forwardimpact/libcli").InvocationContext} ctx
 * @returns {Promise<{ok: boolean, code?: number, error?: string}>}
 */
export async function runSuperviseCommand(ctx) {
  const runtime = ctx.deps.runtime;
  const opts = await parseSuperviseOptions(ctx.options, runtime);

  // Build the redactor as the first observable side-effect after option
  // parsing — the env snapshot must freeze BEFORE any in-process
  // env writes the command performs (e.g. LIBHARNESS_AGENT_PROFILE).
  const redactor = createRedactor({ runtime });

  // When --output is specified, stream text to stdout while writing NDJSON to file.
  // Otherwise, write NDJSON directly to stdout (backwards-compatible).
  const fileStream = opts.outputPath
    ? runtime.fs.createWriteStream(opts.outputPath)
    : null;
  const output = fileStream
    ? createTeeWriter({
        fileStream,
        textStream: runtime.proc.stdout,
        mode: "supervised",
        now: () => isoTimestamp(runtime.clock.now()),
      })
    : runtime.proc.stdout;

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
    runtime.proc.env.LIBHARNESS_AGENT_PROFILE = opts.agentProfile;
  }
  // Unconditional so the default "github" is observable to the agent's
  // active-tracker resolution, mirroring --agent-profile's env write above.
  runtime.proc.env.LIBHARNESS_WORK_TRACKER = opts.workTracker;

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
    runtime,
  });

  const result = await supervisor.run(opts.taskContent);

  if (fileStream) {
    await new Promise((r) => output.end(r));
    await new Promise((r) => fileStream.end(r));
  }

  return result.success ? { ok: true } : { ok: false, code: 1, error: "" };
}
