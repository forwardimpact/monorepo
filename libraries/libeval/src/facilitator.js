/**
 * Facilitator — facilitate-mode wrapper around `OrchestrationLoop`. The
 * lead participant is named "facilitator" and uses the `Conclude` tool to
 * end the session. The within-run turn loop itself lives in
 * `orchestration-loop.js`; this file owns only the facilitate-mode
 * specifics (lead role name, system prompts, tool wiring, factory).
 */

import { Writable } from "node:stream";
import { resolve } from "node:path";
import { createAgentRunner } from "./agent-runner.js";
import { composeProfilePrompt } from "./profile-prompt.js";
import { createMessageBus } from "./message-bus.js";
import {
  createOrchestrationContext,
  createFacilitatorToolServer,
  createFacilitatedAgentToolServer,
} from "./orchestration-toolkit.js";
import { createAsyncQueue } from "./orchestrator-helpers.js";
import { OrchestrationLoop } from "./orchestration-loop.js";

/** System prompt appended for the facilitator runner. */
export const FACILITATOR_SYSTEM_PROMPT =
  "You coordinate multiple participants via these tools: " +
  "Ask delivers a question to one named participant — or broadcasts when no addressee is named — and blocks until that participant answers. " +
  "Announce delivers a message with no reply obligation. " +
  "Redirect interrupts an in-progress participant with replacement instructions. " +
  "RollCall returns the participant roster. " +
  "Conclude ends the session with a verdict ('success' or 'failure') and a summary. " +
  "Ask and Announce calls issued in the same turn dispatch in parallel. " +
  "You MUST call Conclude to end every session — never end a turn with only text. " +
  "If you can answer the task yourself, still call Conclude with verdict='success' and the answer as the summary.";

/** System prompt appended for facilitated agent runners. */
export const FACILITATED_AGENT_SYSTEM_PROMPT =
  "You participate in a coordinated session. " +
  "Answer replies to an ask addressed to you. " +
  "Ask sends a question to another participant. " +
  "Announce broadcasts a message. " +
  "RollCall lists participants.";

/**
 * Facilitate-mode wrapper around `OrchestrationLoop`. The lead participant
 * is `"facilitator"` and the protocol mode is `"facilitated"`. Preserves
 * the public surface (`facilitatorRunner`, `facilitatorTurns`) that
 * existing callers rely on.
 */
export class Facilitator extends OrchestrationLoop {
  /**
   * @param {object} deps
   * @param {import("./agent-runner.js").AgentRunner} deps.facilitatorRunner
   * @param {Array<{name: string, role: string, runner: import("./agent-runner.js").AgentRunner}>} deps.agents
   * @param {import("./message-bus.js").MessageBus} deps.messageBus
   * @param {import("stream").Writable} deps.output
   * @param {number} [deps.maxTurns]
   * @param {object} [deps.ctx]
   * @param {object} [deps.eventQueue]
   * @param {string} [deps.taskAmend]
   * @param {object} deps.redactor
   */
  constructor(deps) {
    super({
      ...deps,
      leadRunner: deps.facilitatorRunner,
      leadName: "facilitator",
      mode: "facilitated",
    });
  }

  /** @returns {import("./agent-runner.js").AgentRunner} */
  get facilitatorRunner() {
    return this.leadRunner;
  }

  /** @returns {number} */
  get facilitatorTurns() {
    return this.leadTurns;
  }

  /** @param {number} v */
  set facilitatorTurns(v) {
    this.leadTurns = v;
  }
}

const devNull = new Writable({
  write(_chunk, _enc, cb) {
    cb();
  },
});

/**
 * Factory function — wires all participants with MCP servers.
 * @param {object} deps
 * @param {string} deps.facilitatorCwd
 * @param {Array<{name: string, role: string, cwd?: string, maxTurns?: number, allowedTools?: string[], agentProfile?: string, systemPromptAmend?: string}>} deps.agentConfigs
 * @param {function} deps.query
 * @param {import("stream").Writable} deps.output
 * @param {string} [deps.model] - Default model for all participants.
 * @param {string} [deps.agentModel] - Agent model override (falls back to `model`).
 * @param {string} [deps.facilitatorModel] - Facilitator model override (falls back to `model`).
 * @param {number} [deps.maxTurns] - Facilitator's own per-invocation turn budget (default 20). Each participating agent's budget is taken from `config.maxTurns` on its entry in `agentConfigs` (default 50 when unset). The CLI command (`commands/facilitate.js`) threads `--max-turns` into both this parameter and every agent config so a single CLI value bounds all participants uniformly.
 * @param {string[]} [deps.facilitatorAllowedTools] - Tools the facilitator may use; defaults to a read/write file-edit set.
 * @param {string[]} [deps.facilitatorDisallowedTools] - Additional tools to block on the facilitator; merged with the sub-agent spawn defaults (Agent/Task/TaskOutput/TaskStop).
 * @param {string} [deps.facilitatorProfile] - Facilitator profile name; resolved into the main-thread system prompt via `composeProfilePrompt`.
 * @param {string} [deps.profilesDir] - Directory containing `<name>.md` profile files. Defaults to `<facilitatorCwd>/.claude/agents`. Resolved once from the facilitator's cwd so profiles travel with the project, not with per-agent sandboxes.
 * @param {string} [deps.taskAmend] - Opaque addendum appended to the task before delivery.
 * @returns {Facilitator}
 */
export function createFacilitator({
  facilitatorCwd,
  agentConfigs,
  query,
  output,
  model,
  agentModel,
  facilitatorModel,
  maxTurns,
  facilitatorAllowedTools,
  facilitatorDisallowedTools,
  facilitatorProfile,
  profilesDir,
  taskAmend,
  redactor,
}) {
  if (!redactor) throw new Error("redactor is required");
  const resolvedProfilesDir =
    profilesDir ?? resolve(facilitatorCwd, ".claude/agents");
  const systemPromptFor = (profile, trailer) => {
    if (!trailer) throw new Error("trailer is required");
    return profile
      ? composeProfilePrompt(profile, {
          profilesDir: resolvedProfilesDir,
          trailer,
        })
      : { type: "preset", preset: "claude_code", append: trailer };
  };
  const ctx = createOrchestrationContext();
  const messageBus = createMessageBus({
    participants: ["facilitator", ...agentConfigs.map((a) => a.name)],
  });
  ctx.messageBus = messageBus;
  ctx.participants = [
    { name: "facilitator", role: "facilitator" },
    ...agentConfigs.map((a) => ({ name: a.name, role: a.role })),
  ];

  let facilitator;

  const eventQueue = createAsyncQueue();

  const facilitatorServer = createFacilitatorToolServer(ctx);

  const agents = agentConfigs.map((config) => {
    const agentServer = createFacilitatedAgentToolServer(ctx, {
      from: config.name,
    });

    const agentTrailer = config.systemPromptAmend
      ? `${FACILITATED_AGENT_SYSTEM_PROMPT}\n\n${config.systemPromptAmend}`
      : FACILITATED_AGENT_SYSTEM_PROMPT;

    const runner = createAgentRunner({
      cwd: config.cwd ?? facilitatorCwd,
      query,
      output: devNull,
      model: agentModel ?? model,
      maxTurns: config.maxTurns ?? 50,
      allowedTools: config.allowedTools,
      onLine: (line) => facilitator.emitLine(config.name, line),
      mcpServers: { orchestration: agentServer },
      settingSources: ["project"],
      systemPrompt: systemPromptFor(config.agentProfile, agentTrailer),
      redactor,
    });

    return { name: config.name, role: config.role, runner };
  });

  // Block the SDK's sub-agent spawn tools on the facilitator: its job is to
  // coordinate participants through the libeval orchestration harness, not
  // to fan work out to ad-hoc Claude Code sub-agents. Mirrors the supervisor.
  const defaultDisallowed = ["Agent", "Task", "TaskOutput", "TaskStop"];
  const disallowedTools = facilitatorDisallowedTools
    ? [...new Set([...defaultDisallowed, ...facilitatorDisallowedTools])]
    : defaultDisallowed;

  const facilitatorRunner = createAgentRunner({
    cwd: facilitatorCwd,
    query,
    output: devNull,
    model: facilitatorModel ?? model,
    maxTurns: maxTurns ?? 20,
    allowedTools: facilitatorAllowedTools ?? [
      "Bash",
      "Read",
      "Glob",
      "Grep",
      "Write",
      "Edit",
    ],
    disallowedTools,
    onLine: (line) => facilitator.emitLine("facilitator", line),
    mcpServers: { orchestration: facilitatorServer },
    settingSources: ["project"],
    systemPrompt: systemPromptFor(
      facilitatorProfile,
      FACILITATOR_SYSTEM_PROMPT,
    ),
    redactor,
  });

  facilitator = new Facilitator({
    facilitatorRunner,
    agents,
    messageBus,
    output,
    maxTurns,
    ctx,
    eventQueue,
    taskAmend,
    redactor,
  });
  return facilitator;
}
