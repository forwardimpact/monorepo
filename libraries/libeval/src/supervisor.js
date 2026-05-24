/**
 * Supervisor — supervise-mode wrapper around `OrchestrationLoop`. One
 * named participant (`"agent"`) coordinated by a lead participant
 * (`"supervisor"`). Structurally the same as `Facilitator` with a
 * single agent; differs only in role names, prompts, and pass-through
 * accessors.
 *
 * Ask is async (same contract as facilitate / discuss): returns
 * `{askIds:[N]}` immediately; the agent's reply arrives on the
 * supervisor's next turn as `[answer#N] agent: <text>`. The supervisor
 * sees the agent at each Ask boundary, plans the next step, and
 * eventually calls Conclude.
 *
 * For tighter feedback loops, size the agent's per-turn budget down
 * (smaller `maxTurns` on the agent runner) so each Ask returns sooner.
 */

import { Writable } from "node:stream";
import { resolve } from "node:path";
import { createAgentRunner } from "./agent-runner.js";
import { composeProfilePrompt } from "./profile-prompt.js";
import { createMessageBus } from "./message-bus.js";
import {
  createOrchestrationContext,
  createSupervisedAgentToolServer,
  createSupervisorToolServer,
} from "./orchestration-toolkit.js";
import { OrchestrationLoop } from "./orchestration-loop.js";

/** System prompt appended for the supervisor runner in supervise mode. */
export const SUPERVISOR_SYSTEM_PROMPT =
  "You supervise one agent named `agent`. " +
  "Ask sends a question and returns immediately with {askIds:[N]}. The reply arrives on a later turn as `[answer#N] agent: <text>` in your inbox — between turns you can plan and reflect while the agent works. End your turn with text after asking; the orchestrator wakes you when the agent replies. " +
  "Answer replies to an ask the agent addressed to you (you'll see it tagged `[ask#N] agent: …` in your inbox). Quote askId from the [ask#N] tag; omit it and the handler auto-picks the only pending ask or routes your message as an Announce. " +
  "Announce delivers a message with no reply obligation. " +
  "Conclude ends the session with a verdict ('success' or 'failure') and a summary; the verdict reflects whether the agent's work meets the criteria stated in the task. " +
  "You MUST end every session with Conclude — never end a turn with only text *after* every Ask round has resolved. " +
  "If the agent goes off-track, course-correct by issuing a new Ask with corrected instructions; each Ask carries a fresh askId, so a follow-up never collides with an earlier one.";

/** System prompt appended for the agent runner in supervise mode. */
export const AGENT_SYSTEM_PROMPT =
  "A supervisor watches your work. " +
  "Each question you receive carries an [ask#N] header — quote that N back as the askId field on Answer so the reply pairs with the right question. " +
  "Answer replies to an ask addressed to you. askId is optional: omit it and the handler auto-picks if exactly one ask is owed to you, otherwise it routes your message as an Announce. " +
  "Ask sends a question to the supervisor and returns immediately with {askIds:[N]}; the reply arrives on a later turn as `[answer#N] supervisor: <text>` in your inbox. " +
  "Announce sends a message with no reply expected — use this for unsolicited remarks or to reply to an Announce.";

/**
 * Supervise-mode wrapper around `OrchestrationLoop`. The lead is
 * `"supervisor"`, one participant is `"agent"`, mode tag is `"supervised"`.
 */
export class Supervisor extends OrchestrationLoop {
  /**
   * @param {object} deps
   * @param {import("./agent-runner.js").AgentRunner} deps.supervisorRunner
   * @param {import("./agent-runner.js").AgentRunner} deps.agentRunner
   * @param {import("./message-bus.js").MessageBus} deps.messageBus
   * @param {import("stream").Writable} deps.output
   * @param {object} deps.ctx
   * @param {object} deps.redactor
   * @param {string} [deps.taskAmend]
   */
  constructor({
    supervisorRunner,
    agentRunner,
    messageBus,
    output,
    ctx,
    taskAmend,
    redactor,
  }) {
    if (!agentRunner) throw new Error("agentRunner is required");
    if (!supervisorRunner) throw new Error("supervisorRunner is required");
    if (!output) throw new Error("output is required");
    super({
      leadRunner: supervisorRunner,
      agents: [{ name: "agent", role: "agent", runner: agentRunner }],
      messageBus,
      output,
      leadName: "supervisor",
      mode: "supervised",
      ctx,
      taskAmend,
      redactor,
    });
  }

  /** Readability shims for tests that read the runners by their domain names. */
  /** Readability shim — exposes the lead runner under its mode-specific name. */
  get supervisorRunner() {
    return this.leadRunner;
  }

  /** Readability shim — exposes the single agent runner directly. */
  get agentRunner() {
    return this.agents[0].runner;
  }
}

const devNull = new Writable({
  write(_chunk, _enc, cb) {
    cb();
  },
});

/**
 * Factory — wires the supervisor + agent runners and the orchestration
 * context. Mirrors the facilitator factory in shape.
 *
 * @param {object} deps
 * @param {string} deps.supervisorCwd
 * @param {string} deps.agentCwd
 * @param {function} deps.query
 * @param {import("stream").Writable} deps.output
 * @param {string} [deps.model]
 * @param {string} [deps.agentModel]
 * @param {string} [deps.supervisorModel]
 * @param {number} [deps.maxTurns] - Per-runner SDK turn budget (default 200).
 * @param {string[]} [deps.allowedTools]
 * @param {string[]} [deps.supervisorAllowedTools]
 * @param {string[]} [deps.supervisorDisallowedTools]
 * @param {string} [deps.supervisorProfile]
 * @param {string} [deps.agentProfile]
 * @param {string} [deps.profilesDir]
 * @param {string} [deps.taskAmend]
 * @param {Record<string, object>} [deps.agentMcpServers]
 * @returns {Supervisor}
 */
export function createSupervisor({
  supervisorCwd,
  agentCwd,
  query,
  output,
  model,
  agentModel,
  supervisorModel,
  maxTurns,
  allowedTools,
  supervisorAllowedTools,
  supervisorDisallowedTools,
  supervisorProfile,
  agentProfile,
  profilesDir,
  taskAmend,
  agentMcpServers,
  redactor,
}) {
  if (!redactor) throw new Error("redactor is required");
  const resolvedProfilesDir =
    profilesDir ?? resolve(supervisorCwd, ".claude/agents");
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
    participants: ["supervisor", "agent"],
  });
  ctx.messageBus = messageBus;
  ctx.participants = [
    { name: "supervisor", role: "supervisor" },
    { name: "agent", role: "agent" },
  ];

  let supervisor;
  const perRunBudget = maxTurns ?? 200;

  const agentServer = createSupervisedAgentToolServer(ctx);
  const supervisorServer = createSupervisorToolServer(ctx);

  const agentRunner = createAgentRunner({
    cwd: agentCwd,
    query,
    output: devNull,
    model: agentModel ?? model,
    maxTurns: perRunBudget,
    allowedTools,
    onLine: (line) => supervisor.emitLine("agent", line),
    settingSources: ["project"],
    systemPrompt: systemPromptFor(agentProfile, AGENT_SYSTEM_PROMPT),
    mcpServers: { orchestration: agentServer, ...agentMcpServers },
    redactor,
  });

  // Block the SDK's sub-agent spawn tools on the supervisor: it should
  // coordinate the agent through orchestration tools, not fan work out
  // to ad-hoc Claude Code sub-agents.
  const defaultDisallowed = ["Agent", "Task", "TaskOutput", "TaskStop"];
  const disallowedTools = supervisorDisallowedTools
    ? [...new Set([...defaultDisallowed, ...supervisorDisallowedTools])]
    : defaultDisallowed;

  const supervisorRunner = createAgentRunner({
    cwd: supervisorCwd,
    query,
    output: devNull,
    model: supervisorModel ?? model,
    maxTurns: perRunBudget,
    allowedTools: supervisorAllowedTools ?? [
      "Bash",
      "Read",
      "Glob",
      "Grep",
      "Write",
      "Edit",
    ],
    disallowedTools,
    onLine: (line) => supervisor.emitLine("supervisor", line),
    settingSources: ["project"],
    systemPrompt: systemPromptFor(supervisorProfile, SUPERVISOR_SYSTEM_PROMPT),
    mcpServers: { orchestration: supervisorServer },
    redactor,
  });

  supervisor = new Supervisor({
    supervisorRunner,
    agentRunner,
    messageBus,
    output,
    ctx,
    taskAmend,
    redactor,
  });
  return supervisor;
}
