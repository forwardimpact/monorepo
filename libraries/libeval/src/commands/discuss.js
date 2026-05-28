import { createWriteStream } from "node:fs";
import { resolve } from "node:path";
import { createDiscusser } from "../discusser.js";
import { createRedactor } from "../redaction.js";
import { createTeeWriter } from "../tee-writer.js";
import { resolveTaskContent } from "./task-input.js";

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
 * @returns {object}
 */
export function parseDiscussOptions(values) {
  const { task: taskContent, amend: taskAmend } = resolveTaskContent(values);

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

  return {
    taskContent,
    taskAmend,
    agentConfigs,
    leadProfile: values["lead-profile"] ?? undefined,
    leadModel: values["lead-model"] ?? "claude-opus-4-7[1m]",
    agentModel: values["agent-model"] ?? "claude-opus-4-7[1m]",
    maxTurns,
    outputPath: values.output,
    discussionId: values["discussion-id"] ?? null,
    resumeContext,
  };
}

/**
 * Discuss command — run a discusser-led session with suspend/resume
 * semantics, threading `discussion_id` through the trace so multi-run
 * conversations are queryable as one.
 *
 * @param {object} values - Parsed option values
 * @param {string[]} _args - Positional arguments
 */
export async function runDiscussCommand(values, _args) {
  const opts = parseDiscussOptions(values);

  const redactor = createRedactor();

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

  if (opts.leadProfile) {
    process.env.LIBEVAL_AGENT_PROFILE = opts.leadProfile;
  }

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
    taskAmend: opts.taskAmend,
    redactor,
  });

  const result = await discusser.run(opts.taskContent);

  if (fileStream) {
    await new Promise((r) => output.end(r));
    await new Promise((r) => fileStream.end(r));
  }

  process.exit(result.success ? 0 : 1);
}
