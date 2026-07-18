import { Writable } from "node:stream";
import { resolve } from "node:path";
import { isoTimestamp } from "@forwardimpact/libutil";
import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { createAgentRunner } from "../agent-runner.js";
import {
  advisorGuidance,
  createAdvisor,
  createAdvisorBudget,
} from "../advisor.js";
import { advisorTool } from "../orchestration-toolkit.js";
import {
  composeProfilePrompt,
  composeSystemPrompt,
} from "../profile-prompt.js";
import { createRedactor } from "../redaction.js";
import { createTeeWriter } from "../tee-writer.js";
import { createTranscriptRecorder } from "../transcript-recorder.js";
import { SequenceCounter } from "../sequence-counter.js";
import { resolveWorkTracker } from "./work-tracker.js";
import { resolveTaskContent } from "./task-input.js";
import { createServiceConfig } from "@forwardimpact/libconfig";
import { AGENT_MODEL } from "@forwardimpact/libutil/models";

/**
 * Parse and validate run command options from parsed values.
 * @param {object} values - Parsed option values from cli.parse()
 * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
 * @returns {{ taskContent: string, cwd: string, model: string, maxTurns: number, outputPath: string|undefined, agentProfile: string|undefined, workTracker: string, allowedTools: string[], advisorModel: string|undefined, advisorMaxUses: number }}
 */
export function parseRunOptions(values, runtime) {
  const { task: taskContent, amend: taskAmend } = resolveTaskContent(
    values,
    runtime,
  );
  // `||` (not `??`) so an empty-string flag from a CI forwarder falls back to
  // the default, rather than overriding it with "".
  const maxTurnsRaw = values["max-turns"] || "50";

  if (values["advisor-max-uses"] && !values["advisor-model"]) {
    throw new Error("--advisor-max-uses requires --advisor-model");
  }

  return {
    taskContent,
    taskAmend,
    cwd: resolve(values.cwd || "."),
    agentModel: values["agent-model"] || AGENT_MODEL,
    maxTurns: maxTurnsRaw === "0" ? 0 : parseInt(maxTurnsRaw, 10),
    outputPath: values.output,
    agentProfile: values["agent-profile"] || undefined,
    workTracker: resolveWorkTracker(values, runtime?.proc?.env),
    allowedTools: (
      values["allowed-tools"] ||
      "Bash,Read,Glob,Grep,Write,Edit,Agent,TodoWrite"
    ).split(","),
    mcpServer: values["mcp-server"] || undefined,
    advisorModel: values["advisor-model"] || undefined,
    advisorMaxUses: parseInt(values["advisor-max-uses"] || "3", 10),
  };
}

const devNull = new Writable({
  write(_chunk, _enc, cb) {
    cb();
  },
});

/**
 * Wire the run-mode agent session: external MCP entry, `LIBHARNESS_*` env
 * writes, system-prompt composition, and — when an advisor model is set —
 * the advisor wiring (budget, recorder, advisor session, dedicated MCP
 * server holding only the `Advisor` tool). Extracted from `runRunCommand`
 * so tests can inject a fake `query`.
 *
 * Run mode has no stop path (the command simply awaits the runner), so the
 * consult timeout is deliberately the advisor's only guard.
 *
 * @param {object} deps
 * @param {ReturnType<typeof parseRunOptions>} deps.opts
 * @param {import("../redaction.js").Redactor} deps.redactor
 * @param {import("stream").Writable} deps.output - Envelope NDJSON sink.
 * @param {SequenceCounter} deps.counter
 * @param {function} deps.query - SDK query function.
 * @param {import("@forwardimpact/libutil/runtime").Runtime} deps.runtime
 * @returns {Promise<{runner: import("../agent-runner.js").AgentRunner, advisor: object|null}>}
 */
export async function wireRunSession({
  opts,
  redactor,
  output,
  counter,
  query,
  runtime,
}) {
  const emitEnvelope = (source, event) => {
    output.write(
      JSON.stringify(
        redactor.redactValue({ source, seq: counter.next(), event }),
      ) + "\n",
    );
  };
  const onLine = (line) => emitEnvelope("agent", JSON.parse(line));

  let mcpServers = null;
  const allowedTools = opts.allowedTools;
  if (opts.mcpServer) {
    const mcpConfig = await createServiceConfig("mcp");
    mcpServers = {
      [opts.mcpServer]: {
        type: "http",
        url: mcpConfig.url,
        headers: { Authorization: `Bearer ${mcpConfig.mcpToken()}` },
      },
    };
    allowedTools.push(`mcp__${opts.mcpServer}__*`);
  }

  if (opts.agentProfile) {
    runtime.proc.env.LIBHARNESS_AGENT_PROFILE = opts.agentProfile;
  }
  // Unconditional so the default "github" is observable to the agent's
  // active-tracker resolution, mirroring --agent-profile's env write above.
  runtime.proc.env.LIBHARNESS_WORK_TRACKER = opts.workTracker;

  // With a profile, the consult guidance rides the profile composer's
  // amendment parameter; with no profile, a preset-append prompt carries
  // the guidance as its only session-protocol fragment. Advisor off and no
  // profile means no system prompt — today's behavior, unchanged.
  let systemPrompt;
  if (opts.agentProfile) {
    systemPrompt = composeProfilePrompt(opts.agentProfile, {
      profilesDir: resolve(opts.cwd, ".claude/agents"),
      runtime,
      ...(opts.advisorModel && {
        amend: advisorGuidance(opts.advisorMaxUses),
      }),
    });
  } else if (opts.advisorModel) {
    systemPrompt = composeSystemPrompt({
      role: "agent",
      trailer: advisorGuidance(opts.advisorMaxUses),
      runtime,
    });
  }

  let advisor = null;
  let recorder = null;
  if (opts.advisorModel) {
    const budget = createAdvisorBudget(opts.advisorMaxUses);
    recorder = createTranscriptRecorder({ systemPrompt, redactor });
    advisor = createAdvisor({
      model: opts.advisorModel,
      cwd: opts.cwd,
      query,
      recorder,
      redactor,
      runtime,
      onLine: (line) => emitEnvelope("advisor", JSON.parse(line)),
    });
    const advTool = advisorTool({
      from: "agent",
      consult: (q) => advisor.consult(q),
      emit: (event) => emitEnvelope("orchestrator", event),
      budget,
      model: opts.advisorModel,
    });
    // No allowlist push: in-process SDK MCP servers work under
    // bypassPermissions without allowlist entries (loop-mode precedent).
    mcpServers = {
      ...mcpServers,
      advisor: createSdkMcpServer({ name: "advisor", tools: [advTool] }),
    };
  }

  const runner = createAgentRunner({
    cwd: opts.cwd,
    query,
    output: devNull,
    model: opts.agentModel,
    maxTurns: opts.maxTurns,
    allowedTools,
    onLine: recorder
      ? (line) => {
          onLine(line);
          recorder.recordMessage(line);
        }
      : onLine,
    ...(recorder && { onPrompt: (text) => recorder.recordPrompt(text) }),
    settingSources: ["project"],
    systemPrompt,
    taskAmend: opts.taskAmend,
    mcpServers,
    redactor,
    runtime,
  });

  return { runner, advisor };
}

/**
 * Run command — execute a single agent via the Claude Agent SDK.
 *
 * Usage: fit-harness run [options]
 *
 * @param {import("@forwardimpact/libcli").InvocationContext} ctx
 * @returns {Promise<{ok: boolean, code?: number, error?: string}>}
 */
export async function runRunCommand(ctx) {
  const runtime = ctx.deps.runtime;
  const opts = parseRunOptions(ctx.options, runtime);

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
        mode: "raw",
        now: () => isoTimestamp(runtime.clock.now()),
      })
    : runtime.proc.stdout;

  const counter = new SequenceCounter();
  const { query } = await import("@anthropic-ai/claude-agent-sdk");
  const { runner } = await wireRunSession({
    opts,
    redactor,
    output,
    counter,
    query,
    runtime,
  });

  const result = await runner.run(opts.taskContent);

  if (fileStream) {
    await new Promise((r) => output.end(r));
    await new Promise((r) => fileStream.end(r));
  }

  return result.success
    ? { ok: true }
    : { ok: false, code: 1, error: result.error?.message ?? "" };
}
