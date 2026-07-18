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
import { composeSystemPrompt } from "./profile-prompt.js";
import { createMessageBus } from "./message-bus.js";
import {
  advisorTool,
  createOrchestrationContext,
  createSupervisedAgentToolServer,
  createSupervisorToolServer,
} from "./orchestration-toolkit.js";
import { OrchestrationLoop } from "./orchestration-loop.js";
import { advisorGuidance, createAdvisor, createAdvisorBudget } from "./advisor.js";
import { createTranscriptRecorder } from "./transcript-recorder.js";

/** System prompt for the supervisor lead. L0 mechanics only per COALIGNED. */
export const SUPERVISOR_SYSTEM_PROMPT =
  "You supervise one agent.\n" +
  "Use `Ask` to delegate the agent's task to the agent.\n" +
  "`Ask` is async and returns {askIds:[N]} immediately.\n" +
  "The reply arrives on your next turn as `[answer#N] agent: <text>` in your inbox.\n" +
  "End your turn while Asks are pending. The system resumes you when an answer arrives.\n" +
  "If the agent goes off-track, send a corrective `Ask`.\n" +
  "End every session by calling `Conclude` with a verdict and summary.";

/** System prompt for the supervised agent. L0 mechanics only per COALIGNED. */
export const AGENT_SYSTEM_PROMPT =
  "A supervisor directs your work.\n" +
  "Each question arrives as `[ask#N] supervisor: <text>` in your inbox.\n" +
  "Quote N as askId on your `Answer` to route the reply correctly.\n" +
  "If the task already contains a completed response with no new human input after it, `Answer` that no further action is needed.\n" +
  "Do not redo completed work.";

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
   * @param {AbortController} [deps.abortController]
   */
  constructor({
    supervisorRunner,
    agentRunner,
    messageBus,
    output,
    ctx,
    taskAmend,
    redactor,
    abortController,
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
      abortController,
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
 * @param {string} [deps.agentSystemPromptAmend] - Amendment folded into the agent's `<session_protocol>` section, after the protocol trailer.
 * @param {string} [deps.profilesDir]
 * @param {string} [deps.taskAmend]
 * @param {Record<string, object>} [deps.agentMcpServers]
 * @param {string} [deps.advisorModel] - Claude model for advisor consults; absent means no Advisor tool is offered.
 * @param {number} [deps.advisorMaxUses] - Session-wide consult budget (default 3).
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
  agentSystemPromptAmend,
  profilesDir,
  taskAmend,
  agentMcpServers,
  redactor,
  runtime,
  advisorModel,
  advisorMaxUses,
}) {
  if (!redactor) throw new Error("redactor is required");
  if (!runtime) throw new Error("runtime is required");
  const resolvedProfilesDir =
    profilesDir ?? resolve(supervisorCwd, ".claude/agents");

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
  const abortController = new AbortController();

  // Advisor wiring — everything below is gated on advisorModel being set;
  // with it unset the composed prompt and tool surface are byte-identical
  // to today's.
  const budget = advisorModel ? createAdvisorBudget(advisorMaxUses ?? 3) : null;
  const agentSystemPrompt = composeSystemPrompt({
    role: "agent",
    profile: agentProfile,
    profilesDir: resolvedProfilesDir,
    trailer: AGENT_SYSTEM_PROMPT,
    amend: advisorModel
      ? [agentSystemPromptAmend, advisorGuidance(budget.maxUses)]
          .filter(Boolean)
          .join("\n\n")
      : agentSystemPromptAmend,
    runtime,
  });

  let recorder = null;
  let extraTools;
  if (advisorModel) {
    recorder = createTranscriptRecorder({
      systemPrompt: agentSystemPrompt,
      redactor,
    });
    // Late-bound through the `let supervisor` closure — the instance does
    // not exist yet when the advisor and tool are built.
    const advisor = createAdvisor({
      model: advisorModel,
      cwd: agentCwd,
      query,
      recorder,
      redactor,
      runtime,
      onLine: (line) => supervisor.emitLine("advisor", line),
    });
    abortController.signal.addEventListener("abort", () => advisor.abort());
    extraTools = [
      advisorTool({
        from: "agent",
        consult: (q) => advisor.consult(q),
        emit: (e) => supervisor.emitOrchestratorEvent(e),
        budget,
        model: advisorModel,
      }),
    ];
  }

  const agentServer = createSupervisedAgentToolServer(
    ctx,
    extraTools ? { extraTools } : {},
  );
  const supervisorServer = createSupervisorToolServer(ctx);

  const emitAgentLine = (line) => supervisor.emitLine("agent", line);
  const agentRunner = createAgentRunner({
    cwd: agentCwd,
    query,
    output: devNull,
    model: agentModel ?? model,
    maxTurns: perRunBudget,
    allowedTools,
    onLine: recorder
      ? (line) => {
          emitAgentLine(line);
          recorder.recordMessage(line);
        }
      : emitAgentLine,
    ...(recorder && { onPrompt: (text) => recorder.recordPrompt(text) }),
    settingSources: ["project"],
    systemPrompt: agentSystemPrompt,
    mcpServers: { orchestration: agentServer, ...agentMcpServers },
    redactor,
  });

  const defaultDisallowed = [
    "Agent",
    "Task",
    "TaskOutput",
    "TaskStop",
    "Write",
    "Edit",
  ];
  const disallowedTools = supervisorDisallowedTools
    ? [...new Set([...defaultDisallowed, ...supervisorDisallowedTools])]
    : defaultDisallowed;

  const supervisorRunner = createAgentRunner({
    cwd: supervisorCwd,
    query,
    output: devNull,
    model: supervisorModel ?? model,
    maxTurns: perRunBudget,
    allowedTools: supervisorAllowedTools ?? ["Read", "Glob", "Grep", "Bash"],
    disallowedTools,
    onLine: (line) => supervisor.emitLine("supervisor", line),
    settingSources: ["project"],
    systemPrompt: composeSystemPrompt({
      role: "lead",
      profile: supervisorProfile,
      profilesDir: resolvedProfilesDir,
      trailer: SUPERVISOR_SYSTEM_PROMPT,
      runtime,
    }),
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
    abortController,
  });
  return supervisor;
}
