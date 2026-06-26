import { resolve } from "node:path";
import { isoTimestamp } from "@forwardimpact/libutil";
import { createDiscusser } from "../discusser.js";
import { createRedactor } from "../redaction.js";
import { createTeeWriter } from "../tee-writer.js";
import { resolveTaskContent } from "./task-input.js";
import { resolveWorkTracker } from "./work-tracker.js";
import { AGENT_MODEL, LEAD_MODEL } from "@forwardimpact/libutil/models";

function parseAgentProfiles(raw, cwd, maxTurns) {
  if (!raw) return [];
  return raw.split(",").map((entry) => {
    const name = entry.trim();
    return { name, role: name, cwd, agentProfile: name, maxTurns };
  });
}

/**
 * Parse and validate discuss command options. Exported so tests can verify
 * defaults and the legacy-flag clean break.
 * @param {object} values - Parsed option values
 * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
 * @returns {object}
 */
export function parseDiscussOptions(values, runtime) {
  const { task: taskContent, amend: taskAmend } = resolveTaskContent(
    values,
    runtime,
  );

  const profilesRaw = values["agent-profiles"];
  const agentCwd = resolve(values["agent-cwd"] ?? ".");

  const maxTurnsRaw = values["max-turns"] ?? "40";
  const maxTurns = maxTurnsRaw === "0" ? 0 : parseInt(maxTurnsRaw, 10);

  const agentConfigs = parseAgentProfiles(profilesRaw, agentCwd, maxTurns);

  const resumeContextRaw = values["resume-context"];
  let resumeContext = null;
  if (resumeContextRaw) {
    try {
      resumeContext = JSON.parse(resumeContextRaw);
    } catch (err) {
      throw new Error(`--resume-context is not valid JSON: ${err.message}`);
    }
  }

  const maxLeadTurnsRaw = values["max-lead-turns"] ?? "200";
  const maxLeadTurns = parseInt(maxLeadTurnsRaw, 10);

  return {
    taskContent,
    taskAmend,
    agentConfigs,
    leadProfile: values["lead-profile"] ?? undefined,
    leadModel: values["lead-model"] || LEAD_MODEL,
    agentModel: values["agent-model"] || AGENT_MODEL,
    maxTurns,
    maxLeadTurns,
    outputPath: values.output,
    workTracker: resolveWorkTracker(values, runtime?.proc?.env),
    discussionId: values["discussion-id"] ?? null,
    resumeContext,
    callbackUrl: runtime.proc.env.CALLBACK_URL ?? null,
    inboxUrl: runtime.proc.env.INBOX_URL ?? null,
    correlationId: runtime.proc.env.CORRELATION_ID ?? null,
  };
}

/**
 * Discuss command — run a discusser-led session with suspend/resume
 * semantics, threading `discussion_id` through the trace so multi-run
 * conversations are queryable as one.
 *
 * @param {import("@forwardimpact/libcli").InvocationContext} ctx
 * @returns {Promise<{ok: boolean, code?: number, error?: string}>}
 */
export async function runDiscussCommand(ctx) {
  const runtime = ctx.deps.runtime;
  const opts = parseDiscussOptions(ctx.options, runtime);

  const redactor = createRedactor({ runtime });

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

  if (opts.leadProfile) {
    runtime.proc.env.LIBEVAL_AGENT_PROFILE = opts.leadProfile;
  }
  // Unconditional so the default "github" is observable to the agent's
  // active-tracker resolution, mirroring --agent-profile's env write above.
  runtime.proc.env.LIBEVAL_WORK_TRACKER = opts.workTracker;

  const { query } = await import("@anthropic-ai/claude-agent-sdk");
  const discusser = createDiscusser({
    leadProfile: opts.leadProfile,
    leadModel: opts.leadModel,
    agentModel: opts.agentModel,
    agentConfigs: opts.agentConfigs,
    discussionId: opts.discussionId,
    resumeContext: opts.resumeContext,
    query,
    output,
    maxTurns: opts.maxTurns,
    maxLeadTurns: opts.maxLeadTurns,
    taskAmend: opts.taskAmend,
    redactor,
    callbackUrl: opts.callbackUrl,
    inboxUrl: opts.inboxUrl,
    correlationId: opts.correlationId,
    runtime,
  });

  const result = await discusser.run(opts.taskContent);

  if (fileStream) {
    await new Promise((r) => output.end(r));
    await new Promise((r) => fileStream.end(r));
  }

  return result.success ? { ok: true } : { ok: false, code: 1, error: "" };
}
