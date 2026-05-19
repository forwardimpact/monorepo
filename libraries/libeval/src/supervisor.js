/**
 * Supervisor — orchestrates a relay loop between an agent and a supervisor,
 * both running as AgentRunner instances. The supervisor receives the task first,
 * introduces itself, and delegates work to the agent. The loop then alternates:
 * agent → supervisor → agent.
 *
 * Signaling uses orchestration tools (Ask / Announce / Redirect / Conclude)
 * via in-process MCP servers; the supervisor has no Answer tool — agent replies
 * are routed back through the relay loop. The Ask/Answer contract is enforced
 * at turn boundaries: an unanswered Ask triggers one synthetic reminder and
 * then a `protocol_violation` trace event plus a null-answer injection so the
 * session advances without silent deadlock.
 *
 * Follows OO+DI: constructor injection, factory function, tests bypass factory.
 */

import { Writable } from "node:stream";
import { resolve } from "node:path";
import { createAgentRunner } from "./agent-runner.js";
import { composeProfilePrompt } from "./profile-prompt.js";
import { TraceCollector } from "./trace-collector.js";
import { SequenceCounter } from "./sequence-counter.js";
import { createMessageBus } from "./message-bus.js";
import {
  createOrchestrationContext,
  createSupervisorToolServer,
  createSupervisedAgentToolServer,
  checkPendingAsk,
} from "./orchestration-toolkit.js";
import { formatMessages } from "./orchestrator-helpers.js";

/** System prompt appended for the supervisor runner in supervise mode. */
export const SUPERVISOR_SYSTEM_PROMPT =
  "You supervise one agent. " +
  "Ask sends a question to the agent; the reply arrives via Answer. " +
  "Answer replies to an ask the agent addressed to you. " +
  "Announce sends a message with no reply obligation. " +
  "Redirect interrupts the agent with replacement instructions. " +
  "Conclude ends the session with a verdict ('success' or 'failure') and a summary; " +
  "the verdict reflects whether the agent's work meets the criteria stated in the task.";

/** System prompt appended for the agent runner in supervise mode. */
export const AGENT_SYSTEM_PROMPT =
  "A supervisor watches your work. " +
  "Answer replies to an ask addressed to you. " +
  "Ask sends a question to the supervisor; the reply arrives via Answer. " +
  "Announce sends a message with no reply expected.";

/**
 * Maximum number of mid-turn interventions allowed within a single agent turn.
 * Bounded so a looping supervisor exhausts its quota fast (observability) but
 * leaves headroom for legitimate "intervene, observe, intervene again" patterns.
 * The outer maxTurns budget still bounds overall runtime.
 */
const MAX_INTERVENTIONS_PER_TURN = 5;

/** Orchestrate a relay loop between a supervisor LLM and an agent LLM with mid-turn review. */
export class Supervisor {
  /**
   * @param {object} deps
   * @param {import("./agent-runner.js").AgentRunner} deps.agentRunner - Runs the agent sessions
   * @param {import("./agent-runner.js").AgentRunner} deps.supervisorRunner - Runs the supervisor sessions
   * @param {import("stream").Writable} deps.output - Stream to emit tagged NDJSON to
   * @param {number} [deps.maxTurns] - Maximum supervisor ↔ agent exchanges
   * @param {object} [deps.ctx] - Orchestration context (injected by factory)
   * @param {import("./message-bus.js").MessageBus} [deps.messageBus] - Two-participant message bus ("supervisor" / "agent")
   * @param {string} [deps.taskAmend] - Opaque addendum appended to the task before delivery.
   */
  constructor({
    agentRunner,
    supervisorRunner,
    output,
    maxTurns,
    ctx,
    messageBus,
    taskAmend,
    redactor,
  }) {
    if (!agentRunner) throw new Error("agentRunner is required");
    if (!supervisorRunner) throw new Error("supervisorRunner is required");
    if (!output) throw new Error("output is required");
    if (!redactor) throw new Error("redactor is required");
    this.redactor = redactor;
    this.agentRunner = agentRunner;
    this.supervisorRunner = supervisorRunner;
    this.output = output;
    this.maxTurns = maxTurns ?? 100;
    this.ctx = ctx ?? createOrchestrationContext();
    this.messageBus =
      messageBus ?? createMessageBus({ participants: ["supervisor", "agent"] });
    if (!this.ctx.messageBus) this.ctx.messageBus = this.messageBus;
    this.counter = new SequenceCounter();
    this.taskAmend = taskAmend ?? null;
    /** @type {"agent"|"supervisor"} */
    this.currentSource = "agent";
    /** @type {number} */
    this.currentTurn = 0;
  }

  /**
   * Run the supervisor ↔ agent relay loop.
   * @param {string} task - The initial task for the supervisor
   * @returns {Promise<{success: boolean, turns: number, concluded: boolean}>}
   */
  async run(task) {
    const initialTask = this.taskAmend ? `${task}\n\n${this.taskAmend}` : task;
    this.currentSource = "supervisor";
    this.currentTurn = 0;
    let supervisorResult = await this.supervisorRunner.run(initialTask);

    if (supervisorResult.error) {
      this.emitSummary({ success: false, turns: 0 });
      return { success: false, turns: 0, concluded: false };
    }

    if (this.ctx.concluded) {
      const success = this.ctx.verdict === "success";
      this.emitSummary({
        success,
        verdict: this.ctx.verdict,
        turns: 0,
        summary: this.ctx.summary,
      });
      return { success, turns: 0, concluded: true };
    }

    let pendingRelay = null;
    const turnLimit = this.maxTurns === 0 ? Infinity : this.maxTurns;
    for (let turn = 1; turn <= turnLimit; turn++) {
      const relay =
        pendingRelay ?? this.#buildInitialRelay(supervisorResult.text);

      const turnOutcome = await this.#runAgentTurn(turn, relay);
      if (turnOutcome.exit) {
        return { ...turnOutcome.exit, concluded: this.ctx.concluded };
      }

      const reviewOutcome = await this.#endOfTurnReview(turn);
      if (reviewOutcome.exit) {
        return { ...reviewOutcome.exit, concluded: this.ctx.concluded };
      }
      supervisorResult = reviewOutcome.supervisorResult;
      pendingRelay = reviewOutcome.relay ?? null;
    }

    this.emitSummary({ success: false, turns: this.maxTurns });
    return { success: false, turns: this.maxTurns, concluded: false };
  }

  #buildInitialRelay(fallbackText) {
    const queued = this.messageBus.drain("agent");
    if (queued.length > 0) return formatMessages(queued);
    return this.extractLastText(this.supervisorRunner, fallbackText);
  }

  #checkAsk(name) {
    return checkPendingAsk({
      ctx: this.ctx,
      messageBus: this.messageBus,
      addresseeName: name,
      mode: "supervised",
      emitViolation: (e) => this.emitOrchestratorEvent(e),
    });
  }

  /**
   * Drive the agent through one turn, allowing the supervisor to interrupt
   * via the Redirect tool. Returns either an `exit` outcome (the loop should
   * return immediately) or `{exit: null}` (proceed to end-of-turn review).
   * @param {number} turn
   * @param {string} initialRelay
   * @returns {Promise<{exit: {success: boolean, turns: number}|null}>}
   */
  async #runAgentTurn(turn, initialRelay) {
    let relay = initialRelay;
    let interventions = 0;
    let agentCalled = this.agentRunner.sessionId !== null;

    this.agentRunner.onBatch = (batchLines, ctx) =>
      this.#midTurnReview(turn, batchLines, ctx);

    try {
      while (true) {
        this.currentSource = "agent";
        this.currentTurn = turn;
        const agentResult = agentCalled
          ? await this.agentRunner.resume(relay)
          : await this.agentRunner.run(relay);
        agentCalled = true;

        const outcome = this.#classifyAgentOutcome(
          agentResult,
          turn,
          interventions,
        );

        if (outcome.type === "exit") return { exit: outcome.exit };
        if (outcome.type === "intervention_limit") return { exit: null };

        if (outcome.type === "redirect") {
          interventions++;
          relay = outcome.relay;
          this.emitOrchestratorEvent({ type: "intervention_relayed", turn });
          continue;
        }

        const askRelay = this.#drainAgentAskRelay();
        if (askRelay) {
          relay = askRelay;
          continue;
        }

        return { exit: null };
      }
    } finally {
      this.agentRunner.onBatch = null;
    }
  }

  /**
   * Classify the outcome of a single agent execution within #runAgentTurn.
   * @returns {{type: string, exit?: object|null, relay?: string}}
   */
  #classifyAgentOutcome(agentResult, turn, interventions) {
    if (agentResult.error && !agentResult.aborted) {
      this.emitSummary({ success: false, turns: turn });
      return { type: "exit", exit: { success: false, turns: turn } };
    }

    if (this.ctx.concluded) {
      const success = this.ctx.verdict === "success";
      this.emitSummary({
        success,
        verdict: this.ctx.verdict,
        turns: turn,
        summary: this.ctx.summary,
      });
      return { type: "exit", exit: { success, turns: turn } };
    }

    if (agentResult.aborted && this.ctx.redirect) {
      const redirect = this.ctx.redirect;
      this.ctx.redirect = null;
      if (interventions + 1 >= MAX_INTERVENTIONS_PER_TURN) {
        this.emitOrchestratorEvent({ type: "intervention_limit", turn });
        return { type: "intervention_limit" };
      }
      return { type: "redirect", relay: redirect.message };
    }

    return { type: "continue" };
  }

  /**
   * If the agent has an unanswered ask, drain reminders and return a
   * formatted relay string. Returns null when no relay is needed.
   * @returns {string|null}
   */
  #drainAgentAskRelay() {
    if (this.#checkAsk("agent") !== "recheck" || this.ctx.concluded)
      return null;
    const reminders = this.messageBus.drain("agent");
    return reminders.length > 0 ? formatMessages(reminders) : null;
  }

  /**
   * Mid-turn supervisor review fired from inside the agent's onBatch hook.
   * Runs the supervisor's LLM against the batch and aborts the agent if
   * the supervisor calls Redirect or Conclude.
   * @param {number} turn
   * @param {string[]} batchLines
   * @param {{abort: () => void}} ctx
   */
  async #midTurnReview(turn, batchLines, { abort }) {
    const batchTranscript = this.renderBatch(batchLines);
    this.emitOrchestratorEvent({ type: "mid_turn_review", turn });

    this.currentSource = "supervisor";
    this.ctx.redirect = null;

    await this.supervisorRunner.resume(
      `The agent is mid-turn. Latest batch:\n\n${batchTranscript}\n\n` +
        `Review and use your tools if action is needed.`,
    );
    this.currentSource = "agent";

    if (this.ctx.redirect) {
      this.emitOrchestratorEvent({ type: "intervention_requested", turn });
      abort();
      return;
    }
    if (this.ctx.concluded) {
      this.emitOrchestratorEvent({ type: "complete_requested", turn });
      abort();
    }
  }

  /**
   * End-of-turn supervisor review. Returns either an exit outcome (error or
   * completion) or the supervisor result so the outer loop can build the
   * next turn's relay.
   * @param {number} turn
   * @returns {Promise<{exit: {success: boolean, turns: number}|null, supervisorResult?: object, relay?: string}>}
   */
  async #endOfTurnReview(turn) {
    const queuedForSupervisor = this.messageBus.drain("supervisor");
    const agentTranscript = this.extractTranscript(this.agentRunner);
    this.currentSource = "supervisor";
    this.currentTurn = turn;
    this.ctx.redirect = null;

    const reviewPrompt =
      queuedForSupervisor.length > 0
        ? `The agent reported:\n\n${agentTranscript}\n\n` +
          `Agent messages:\n${formatMessages(queuedForSupervisor)}\n\n` +
          `Review and decide how to proceed.`
        : `The agent reported:\n\n${agentTranscript}\n\nReview the agent's work and decide how to proceed.`;

    let supervisorResult = await this.supervisorRunner.resume(reviewPrompt);

    if (supervisorResult.error) {
      this.emitSummary({ success: false, turns: turn });
      return { exit: { success: false, turns: turn } };
    }

    if (this.ctx.concluded) {
      const success = this.ctx.verdict === "success";
      this.emitSummary({
        success,
        verdict: this.ctx.verdict,
        turns: turn,
        summary: this.ctx.summary,
      });
      return { exit: { success, turns: turn } };
    }

    if (this.#checkAsk("supervisor") === "recheck" && !this.ctx.concluded) {
      const reminders = this.messageBus.drain("supervisor");
      if (reminders.length > 0) {
        supervisorResult = await this.supervisorRunner.resume(
          formatMessages(reminders),
        );
        if (this.ctx.concluded) {
          const success = this.ctx.verdict === "success";
          this.emitSummary({
            success,
            verdict: this.ctx.verdict,
            turns: turn,
            summary: this.ctx.summary,
          });
          return { exit: { success, turns: turn } };
        }
        this.#checkAsk("supervisor");
      }
    }

    if (this.ctx.redirect) {
      const redirect = this.ctx.redirect;
      this.ctx.redirect = null;
      return { exit: null, supervisorResult, relay: redirect.message };
    }

    const queuedForAgent = this.messageBus.drain("agent");
    const relay =
      queuedForAgent.length > 0 ? formatMessages(queuedForAgent) : undefined;
    return { exit: null, supervisorResult, relay };
  }

  /**
   * Extract a human-readable transcript from an AgentRunner's buffered output.
   * @param {import("./agent-runner.js").AgentRunner} runner
   * @returns {string}
   */
  extractTranscript(runner) {
    const lines = runner.drainOutput();
    const collector = new TraceCollector();
    for (const line of lines) {
      collector.addLine(line);
    }
    return collector.toText() || "[The agent produced no output.]";
  }

  /**
   * Extract only the last assistant text block from an AgentRunner's buffer.
   * @param {import("./agent-runner.js").AgentRunner} runner
   * @param {string} fallback
   * @returns {string}
   */
  extractLastText(runner, fallback) {
    const lines = runner.buffer;
    for (let i = lines.length - 1; i >= 0; i--) {
      const event = JSON.parse(lines[i]);
      if (event.type !== "assistant") continue;
      const content = event.message?.content ?? event.content;
      if (!Array.isArray(content)) continue;
      for (let j = content.length - 1; j >= 0; j--) {
        if (content[j].type === "text" && content[j].text) {
          return content[j].text;
        }
      }
    }
    return fallback;
  }

  /**
   * Emit a single NDJSON line tagged with the current source and seq.
   * @param {string} line - Raw NDJSON line from the runner
   */
  emitLine(line) {
    const event = JSON.parse(line);
    const tagged = {
      source: this.currentSource,
      seq: this.counter.next(),
      event,
    };
    this.output.write(JSON.stringify(this.redactor.redactValue(tagged)) + "\n");
  }

  /**
   * Render a batch of buffered NDJSON lines as human-readable text.
   * @param {string[]} batchLines
   * @returns {string}
   */
  renderBatch(batchLines) {
    if (batchLines.length === 0) return "[empty]";
    const collector = new TraceCollector();
    for (const line of batchLines) {
      collector.addLine(line);
    }
    return collector.toText() || "[empty]";
  }

  /**
   * Emit an orchestrator-source NDJSON line.
   * @param {{type: string, turn?: number}} event
   */
  emitOrchestratorEvent(event) {
    this.output.write(
      JSON.stringify(
        this.redactor.redactValue({
          source: "orchestrator",
          seq: this.counter.next(),
          event,
        }),
      ) + "\n",
    );
  }

  /**
   * Emit a final orchestrator summary line, wrapped in the universal envelope.
   * @param {{success: boolean, verdict?: string|null, turns: number, summary?: string}} result
   */
  emitSummary(result) {
    this.output.write(
      JSON.stringify(
        this.redactor.redactValue({
          source: "orchestrator",
          seq: this.counter.next(),
          event: {
            type: "summary",
            success: result.success,
            ...(result.verdict && { verdict: result.verdict }),
            turns: result.turns,
            ...(result.summary && { summary: result.summary }),
          },
        }),
      ) + "\n",
    );
  }
}

const devNull = new Writable({
  write(_chunk, _enc, cb) {
    cb();
  },
});

/**
 * Factory function — wires both AgentRunners with their respective configs.
 * @param {object} deps
 * @param {string} deps.supervisorCwd
 * @param {string} deps.agentCwd
 * @param {function} deps.query
 * @param {import("stream").Writable} deps.output
 * @param {string} [deps.model] - Default model for both runners.
 * @param {string} [deps.agentModel] - Agent model override (falls back to `model`).
 * @param {string} [deps.supervisorModel] - Supervisor model override (falls back to `model`).
 * @param {number} [deps.maxTurns]
 * @param {string[]} [deps.allowedTools]
 * @param {string[]} [deps.supervisorAllowedTools]
 * @param {string[]} [deps.supervisorDisallowedTools]
 * @param {string} [deps.supervisorProfile] - Supervisor profile name; resolved into the main-thread system prompt via `composeProfilePrompt`.
 * @param {string} [deps.agentProfile] - Agent profile name; resolved into the main-thread system prompt via `composeProfilePrompt`.
 * @param {string} [deps.profilesDir] - Directory containing `<name>.md` profile files. Defaults to `<supervisorCwd>/.claude/agents`. Resolved once from the orchestrator's cwd so profiles travel with the project, not with a per-agent sandbox.
 * @param {string} [deps.taskAmend] - Opaque addendum appended to the task before delivery.
 * @param {Record<string, object>} [deps.agentMcpServers] - Additional MCP servers exposed to the agent (merged alongside the orchestration server).
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
  supervisorDisallowedTools,
  supervisorAllowedTools,
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
  let supervisor;

  const ctx = createOrchestrationContext();
  const messageBus = createMessageBus({
    participants: ["supervisor", "agent"],
  });
  ctx.messageBus = messageBus;
  ctx.participants = [
    { name: "supervisor", role: "supervisor" },
    { name: "agent", role: "agent" },
  ];

  const supervisorServer = createSupervisorToolServer(ctx);
  const agentServer = createSupervisedAgentToolServer(ctx);

  const onLine = (line) => supervisor.emitLine(line);

  const perInvocationTurns =
    maxTurns === 0 ? 0 : Math.max(maxTurns ?? 100, 200);

  const agentRunner = createAgentRunner({
    cwd: agentCwd,
    query,
    output: devNull,
    model: agentModel ?? model,
    maxTurns: perInvocationTurns,
    allowedTools,
    onLine,
    settingSources: ["project"],
    systemPrompt: systemPromptFor(agentProfile, AGENT_SYSTEM_PROMPT),
    mcpServers: { orchestration: agentServer, ...agentMcpServers },
    redactor,
  });

  // Block the SDK's sub-agent spawn tools on the supervisor: its job is to
  // coordinate the agent through the libeval orchestration harness, not to
  // fan work out to ad-hoc Claude Code sub-agents. Mirrors the facilitator.
  const defaultDisallowed = ["Agent", "Task", "TaskOutput", "TaskStop"];
  const disallowedTools = supervisorDisallowedTools
    ? [...new Set([...defaultDisallowed, ...supervisorDisallowedTools])]
    : defaultDisallowed;

  const supervisorRunner = createAgentRunner({
    cwd: supervisorCwd,
    query,
    output: devNull,
    model: supervisorModel ?? model,
    maxTurns: perInvocationTurns,
    allowedTools: supervisorAllowedTools ?? [
      "Bash",
      "Read",
      "Glob",
      "Grep",
      "Write",
      "Edit",
    ],
    disallowedTools,
    onLine,
    settingSources: ["project"],
    systemPrompt: systemPromptFor(supervisorProfile, SUPERVISOR_SYSTEM_PROMPT),
    mcpServers: { orchestration: supervisorServer },
    redactor,
  });

  supervisor = new Supervisor({
    agentRunner,
    supervisorRunner,
    output,
    maxTurns,
    ctx,
    messageBus,
    taskAmend,
    redactor,
  });
  return supervisor;
}
