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
import { composeSystemPrompt } from "./profile-prompt.js";
import { createMessageBus } from "./message-bus.js";
import {
  advisorTool,
  createOrchestrationContext,
  createFacilitatorToolServer,
  createFacilitatedAgentToolServer,
} from "./orchestration-toolkit.js";
import { OrchestrationLoop } from "./orchestration-loop.js";
import { advisorGuidance, createAdvisor, createAdvisorBudget } from "./advisor.js";
import { createTranscriptRecorder } from "./transcript-recorder.js";

/** System prompt for the facilitator lead. L0 mechanics only per COALIGNED. */
export const FACILITATOR_SYSTEM_PROMPT =
  "You are the facilitator.\n" +
  "You have no tools to perform work yourself.\n" +
  "Use `RollCall` to list participants.\n" +
  "Use `Ask` to delegate work to the best-suited participant.\n" +
  "Participants are domain experts; state the task, not how to do it.\n" +
  "`Ask` is async and returns {askIds:[N,…]} immediately.\n" +
  "Answers arrive on your next turn as `[answer#N] <participant>: <text>` in your inbox.\n" +
  "End your turn while Asks are pending. The system resumes you when answers arrive.\n" +
  "Multiple `Ask` calls in one turn run participants in parallel.\n" +
  "End every session by calling `Conclude` with a verdict and summary.";

/** System prompt for facilitated agent participants. L0 mechanics only per COALIGNED. */
export const FACILITATED_AGENT_SYSTEM_PROMPT =
  "You are a participant in a facilitated session.\n" +
  "Each question arrives as `[ask#N] <name>: <text>` in your inbox.\n" +
  "Quote N as askId on your `Answer` to route the reply correctly.\n" +
  "If the task already contains a completed response with no new human input after it, `Answer` that no further action is needed.\n" +
  "Do not redo completed work.";

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
 * @param {string} [deps.advisorModel] - Claude model for advisor consults; absent means no Advisor tool is offered.
 * @param {number} [deps.advisorMaxUses] - Session-wide consult budget shared by all agent participants (default 3).
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
  runtime,
  advisorModel,
  advisorMaxUses,
}) {
  if (!redactor) throw new Error("redactor is required");
  if (!runtime) throw new Error("runtime is required");
  const resolvedProfilesDir =
    profilesDir ?? resolve(facilitatorCwd, ".claude/agents");
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

  const abortController = new AbortController();
  // One budget per session, shared by every agent's Advisor handler.
  const budget = advisorModel ? createAdvisorBudget(advisorMaxUses ?? 3) : null;

  const agents = agentConfigs.map((config) => {
    // Everything advisor-shaped is gated on advisorModel; with it unset the
    // composed prompt and tool surface are byte-identical to today's.
    const systemPrompt = composeSystemPrompt({
      role: "agent",
      profile: config.agentProfile,
      profilesDir: resolvedProfilesDir,
      trailer: FACILITATED_AGENT_SYSTEM_PROMPT,
      amend: advisorModel
        ? [config.systemPromptAmend, advisorGuidance(budget.maxUses)]
            .filter(Boolean)
            .join("\n\n")
        : config.systemPromptAmend,
      runtime,
    });

    let recorder = null;
    let extraTools;
    if (advisorModel) {
      recorder = createTranscriptRecorder({ systemPrompt, redactor });
      // Late-bound through the `let facilitator` closure — the instance
      // does not exist yet when the advisor and tool are built.
      const advisor = createAdvisor({
        model: advisorModel,
        cwd: config.cwd ?? facilitatorCwd,
        query,
        recorder,
        redactor,
        runtime,
        onLine: (line) => facilitator.emitLine("advisor", line),
      });
      abortController.signal.addEventListener("abort", () => advisor.abort());
      extraTools = [
        advisorTool({
          from: config.name,
          consult: (q) => advisor.consult(q),
          emit: (e) => facilitator.emitOrchestratorEvent(e),
          budget,
          model: advisorModel,
        }),
      ];
    }

    const agentServer = createFacilitatedAgentToolServer(ctx, {
      from: config.name,
      ...(extraTools && { extraTools }),
    });

    const emitAgentLine = (line) => facilitator.emitLine(config.name, line);
    const runner = createAgentRunner({
      cwd: config.cwd ?? facilitatorCwd,
      query,
      output: devNull,
      model: agentModel ?? model,
      maxTurns: config.maxTurns ?? 50,
      allowedTools: config.allowedTools,
      onLine: recorder
        ? (line) => {
            emitAgentLine(line);
            recorder.recordMessage(line);
          }
        : emitAgentLine,
      ...(recorder && { onPrompt: (text) => recorder.recordPrompt(text) }),
      mcpServers: { orchestration: agentServer },
      settingSources: ["project"],
      systemPrompt,
      redactor,
    });

    return { name: config.name, role: config.role, runner };
  });

  const defaultDisallowed = [
    "Agent",
    "Task",
    "TaskOutput",
    "TaskStop",
    "Bash",
    "Write",
    "Edit",
  ];
  const disallowedTools = facilitatorDisallowedTools
    ? [...new Set([...defaultDisallowed, ...facilitatorDisallowedTools])]
    : defaultDisallowed;

  const facilitatorRunner = createAgentRunner({
    cwd: facilitatorCwd,
    query,
    output: devNull,
    model: facilitatorModel ?? model,
    maxTurns: maxTurns ?? 80,
    allowedTools: facilitatorAllowedTools ?? ["Read", "Glob", "Grep"],
    disallowedTools,
    onLine: (line) => facilitator.emitLine("facilitator", line),
    mcpServers: { orchestration: facilitatorServer },
    settingSources: ["project"],
    systemPrompt: composeSystemPrompt({
      role: "lead",
      profile: facilitatorProfile,
      profilesDir: resolvedProfilesDir,
      trailer: FACILITATOR_SYSTEM_PROMPT,
      runtime,
    }),
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
    abortController,
  });
  return facilitator;
}
