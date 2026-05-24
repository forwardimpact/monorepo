/**
 * Facilitator — facilitate-mode wrapper around `OrchestrationLoop`. The
 * lead participant is named "facilitator" and ends the session via the
 * `Conclude` tool. The within-run turn loop lives in
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
import { OrchestrationLoop } from "./orchestration-loop.js";

/** System prompt appended for the facilitator runner. */
export const FACILITATOR_SYSTEM_PROMPT =
  "You coordinate multiple participants via these tools: " +
  "Ask sends a question and returns immediately with {askIds:[N,…]}. The reply arrives on a later turn as `[answer#N] <participant>: <text>` in your inbox — between turns you can plan, reflect, or send more Asks while participants work in parallel. End your turn with text after you've asked everything you intend to; the orchestrator wakes you again as soon as a reply (or any message) lands. " +
  "Answer replies to an ask a participant addressed to you (you'll see it tagged `[ask#N] <participant>: …` in your inbox). Quote askId from the [ask#N] tag; omit it and the handler auto-picks the only pending ask or routes your message as an Announce. " +
  "Announce delivers a message with no reply obligation. " +
  "RollCall returns the participant roster. " +
  "Conclude ends the session with a verdict ('success' or 'failure') and a summary. " +
  "Multiple Ask / Announce calls in one assistant turn dispatch in parallel — issue them as parallel tool_use blocks rather than sending the same question both broadcast and individually. " +
  "You MUST end every session with Conclude — never end a turn with only text *after* every Ask round has resolved. " +
  "If you can answer the task yourself, still call Conclude with verdict='success' and the answer as the summary.";

/** System prompt appended for facilitated agent runners. */
export const FACILITATED_AGENT_SYSTEM_PROMPT =
  "You participate in a coordinated session. " +
  "Each question you receive carries an [ask#N] header — quote that N back as the askId field on Answer so the reply pairs with the right question. " +
  "Answer replies to an ask addressed to you. askId is optional: omit it and the handler auto-picks if exactly one ask is owed to you, otherwise it routes your message as an Announce. " +
  "Ask sends a question to another participant and returns immediately with {askIds:[N]}; the reply arrives on a later turn as `[answer#N] <participant>: <text>` in your inbox. " +
  "Announce broadcasts a message to every other participant — use this for unsolicited remarks or to reply to an Announce. " +
  "RollCall lists participants.";

/**
 * Facilitate-mode wrapper around `OrchestrationLoop`. The lead is named
 * `"facilitator"`. `facilitatorRunner` getter is a readability shim for
 * tests that read the runner directly.
 */
export class Facilitator extends OrchestrationLoop {
  /**
   * @param {object} deps
   * @param {import("./agent-runner.js").AgentRunner} deps.facilitatorRunner
   * @param {Array<{name: string, role: string, runner: import("./agent-runner.js").AgentRunner}>} deps.agents
   * @param {import("./message-bus.js").MessageBus} deps.messageBus
   * @param {import("stream").Writable} deps.output
   * @param {object} deps.ctx
   * @param {object} deps.redactor
   * @param {string} [deps.taskAmend]
   */
  constructor(deps) {
    super({
      ...deps,
      leadRunner: deps.facilitatorRunner,
      leadName: "facilitator",
      mode: "facilitated",
    });
  }

  /** Readability shim — exposes the lead runner under its mode-specific name. */
  get facilitatorRunner() {
    return this.leadRunner;
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
 * @param {string} [deps.model]
 * @param {string} [deps.agentModel]
 * @param {string} [deps.facilitatorModel]
 * @param {number} [deps.maxTurns] - Per-SDK-call turn budget for the facilitator runner (default 80). Each agent's budget is taken from `config.maxTurns` (default 50). The lead is resumed once per inbox-drain round, so this caps the size of one such round, not the whole session — `OrchestrationLoop.maxLeadTurns` bounds session length.
 * @param {string[]} [deps.facilitatorAllowedTools]
 * @param {string[]} [deps.facilitatorDisallowedTools]
 * @param {string} [deps.facilitatorProfile]
 * @param {string} [deps.profilesDir]
 * @param {string} [deps.taskAmend]
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
    maxTurns: maxTurns ?? 80,
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
    ctx,
    taskAmend,
    redactor,
  });
  return facilitator;
}
