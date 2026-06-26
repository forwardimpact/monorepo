import { resolve } from "node:path";
import { isoTimestamp } from "@forwardimpact/libutil";
import { createFacilitator } from "../facilitator.js";
import { createRedactor } from "../redaction.js";
import { createTeeWriter } from "../tee-writer.js";
import { resolveTaskContent } from "./task-input.js";
import { resolveWorkTracker } from "./work-tracker.js";
import { AGENT_MODEL, LEAD_MODEL } from "@forwardimpact/libutil/models";

/**
 * Parse comma-separated agent profile names into structured configs.
 * @param {string} raw - Comma-separated profile names
 * @param {string} cwd - Shared working directory for all agents
 * @returns {Array<{name: string, role: string, cwd: string, agentProfile: string}>}
 */
function parseAgentProfiles(raw, cwd, maxTurns) {
  return raw.split(",").map((entry) => {
    const name = entry.trim();
    return { name, role: name, cwd, agentProfile: name, maxTurns };
  });
}

/**
 * Parse and validate facilitate command options. Exported for test
 * coverage of the `--max-turns` → per-agent threading contract; not part
 * of the package's public API.
 * @param {object} values - Parsed option values
 * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
 * @returns {object} Parsed options
 */
export function parseFacilitateOptions(values, runtime) {
  const { task: taskContent, amend: taskAmend } = resolveTaskContent(
    values,
    runtime,
  );

  const profilesRaw = values["agent-profiles"];
  if (!profilesRaw) throw new Error("--agent-profiles is required");
  const agentCwd = resolve(values["agent-cwd"] ?? ".");

  const maxTurnsRaw = values["max-turns"] ?? "20";
  const maxTurns = maxTurnsRaw === "0" ? 0 : parseInt(maxTurnsRaw, 10);

  // Thread --max-turns into each participant: without this, every facilitated
  // agent silently falls back to the 50-turn default in facilitator.js even
  // when the caller raises the budget. Observed in run 26078312414 where
  // staff-engineer terminated at 51 turns despite --max-turns=200.
  const agentConfigs = parseAgentProfiles(profilesRaw, agentCwd, maxTurns);

  return {
    taskContent,
    taskAmend,
    agentConfigs,
    facilitatorCwd: resolve(values["facilitator-cwd"] ?? "."),
    agentModel: values["agent-model"] || AGENT_MODEL,
    facilitatorModel: values["lead-model"] || LEAD_MODEL,
    maxTurns,
    outputPath: values.output,
    facilitatorProfile: values["lead-profile"] ?? undefined,
    workTracker: resolveWorkTracker(values, runtime?.proc?.env),
  };
}

/**
 * Facilitate command — run a facilitated multi-agent session.
 *
 * Usage: fit-harness facilitate [options]
 *
 * @param {import("@forwardimpact/libcli").InvocationContext} ctx
 * @returns {Promise<{ok: boolean, code?: number, error?: string}>}
 */
export async function runFacilitateCommand(ctx) {
  const runtime = ctx.deps.runtime;
  const opts = parseFacilitateOptions(ctx.options, runtime);

  // Build the redactor as the first observable side-effect after option
  // parsing — the env snapshot must freeze BEFORE any in-process
  // env writes the command performs (e.g. LIBEVAL_AGENT_PROFILE).
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

  if (opts.facilitatorProfile) {
    runtime.proc.env.LIBEVAL_AGENT_PROFILE = opts.facilitatorProfile;
  }
  // Unconditional so the default "github" is observable to the agent's
  // active-tracker resolution, mirroring --agent-profile's env write above.
  runtime.proc.env.LIBEVAL_WORK_TRACKER = opts.workTracker;

  const { query } = await import("@anthropic-ai/claude-agent-sdk");
  const facilitator = createFacilitator({
    facilitatorCwd: opts.facilitatorCwd,
    agentConfigs: opts.agentConfigs,
    query,
    output,
    agentModel: opts.agentModel,
    facilitatorModel: opts.facilitatorModel,
    maxTurns: opts.maxTurns,
    facilitatorProfile: opts.facilitatorProfile,
    taskAmend: opts.taskAmend,
    redactor,
    runtime,
  });

  const result = await facilitator.run(opts.taskContent);

  if (fileStream) {
    await new Promise((r) => output.end(r));
    await new Promise((r) => fileStream.end(r));
  }

  return result.success ? { ok: true } : { ok: false, code: 1, error: "" };
}
