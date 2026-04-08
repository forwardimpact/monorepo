/**
 * Supervisor — orchestrates a relay loop between an agent and a supervisor,
 * both running as AgentRunner instances. The supervisor receives the task first,
 * introduces itself, and delegates work to the agent. The loop then alternates:
 * agent → supervisor → agent.
 *
 * Follows OO+DI: constructor injection, factory function, tests bypass factory.
 */

import { PassThrough } from "node:stream";
import { createAgentRunner } from "./agent-runner.js";
import { TraceCollector } from "./trace-collector.js";

/**
 * Check if the supervisor's response signals evaluation success.
 * Matches EVALUATION_COMPLETE anywhere in the text, tolerating markdown
 * formatting (e.g. **EVALUATION_COMPLETE**). Uses word boundaries to
 * avoid matching inside longer identifiers.
 * @param {string} text
 * @returns {boolean}
 */
export function isComplete(text) {
  return /(?:^|[\s*_~`])EVALUATION_COMPLETE(?:[\s*_~`.,!?]|$)/m.test(text);
}

/**
 * Check if the supervisor's response signals a mid-turn intervention.
 * Same tolerance rules as isComplete (markdown formatting, word boundaries),
 * but matches the EVALUATION_INTERVENTION keyword instead.
 * @param {string} text
 * @returns {boolean}
 */
export function isIntervention(text) {
  return /(?:^|[\s*_~`])EVALUATION_INTERVENTION(?:[\s*_~`.,!?]|$)/m.test(text);
}

/** System prompt appended for the supervisor runner in supervise mode. */
export const SUPERVISOR_SYSTEM_PROMPT =
  "You supervise another AI agent, seeing its work in batches. " +
  "Reply briefly to let it continue, or write EVALUATION_INTERVENTION " +
  "followed by new instructions to stop it mid-turn. " +
  "Write EVALUATION_COMPLETE when the task is done. " +
  "Only your final message is relayed.";

/** System prompt appended for the agent runner in supervise mode. */
export const AGENT_SYSTEM_PROMPT =
  "A supervisor watches your work and may interrupt with new instructions " +
  "mid-task. Treat any new prompt as authoritative and adjust course. " +
  "When uncertain, stop and ask a clarifying question.";

/**
 * Maximum number of mid-turn interventions allowed within a single agent turn.
 * Bounded so a looping supervisor exhausts its quota fast (observability) but
 * leaves headroom for legitimate "intervene, observe, intervene again" patterns.
 * The outer maxTurns budget still bounds overall runtime.
 */
const MAX_INTERVENTIONS_PER_TURN = 5;

export class Supervisor {
  /**
   * @param {object} deps
   * @param {import("./agent-runner.js").AgentRunner} deps.agentRunner - Runs the agent sessions
   * @param {import("./agent-runner.js").AgentRunner} deps.supervisorRunner - Runs the supervisor sessions
   * @param {import("stream").Writable} deps.output - Stream to emit tagged NDJSON to
   * @param {number} [deps.maxTurns] - Maximum supervisor ↔ agent exchanges
   */
  constructor({ agentRunner, supervisorRunner, output, maxTurns }) {
    if (!agentRunner) throw new Error("agentRunner is required");
    if (!supervisorRunner) throw new Error("supervisorRunner is required");
    if (!output) throw new Error("output is required");
    this.agentRunner = agentRunner;
    this.supervisorRunner = supervisorRunner;
    this.output = output;
    this.maxTurns = maxTurns ?? 20;
    /** @type {"agent"|"supervisor"} */
    this.currentSource = "agent";
    /** @type {number} */
    this.currentTurn = 0;
    /**
     * Set to true when any supervisor message contains the success signal.
     * The SDK result text only reflects the last assistant message, so when
     * the supervisor writes EVALUATION_COMPLETE in an early message and
     * then continues with follow-up work, the result text won't contain it.
     * This flag captures the signal from the full message stream.
     * @type {boolean}
     */
    this.completeSignalSeen = false;
    /**
     * Set to true when any supervisor message contains EVALUATION_INTERVENTION.
     * Mirrors completeSignalSeen — populated by emitLine when a supervisor
     * assistant text block matches isIntervention(...). The mid-turn loop
     * reads this flag after each supervisor invocation to decide whether to
     * abort the agent's in-flight SDK session.
     * @type {boolean}
     */
    this.interventionSignalSeen = false;
    /**
     * The most recent supervisor SDK result captured inside the mid-turn
     * onBatch callback. The outer loop reads this after the agent aborts to
     * build the next relay prompt without re-running the supervisor.
     * @type {{success: boolean, text: string}|null}
     */
    this.lastSupervisorResult = null;
  }

  /**
   * Run the supervisor ↔ agent relay loop.
   * The supervisor receives the task first, introduces itself, and delegates
   * work to the agent. The loop then alternates: agent → supervisor → agent.
   * @param {string} task - The initial task for the supervisor
   * @returns {Promise<{success: boolean, turns: number}>}
   */
  async run(task) {
    // Turn 0: Supervisor receives the task and introduces it to the agent
    this.currentSource = "supervisor";
    this.currentTurn = 0;
    this.completeSignalSeen = false;
    this.interventionSignalSeen = false;
    this.lastSupervisorResult = null;
    let supervisorResult = await this.supervisorRunner.run(task);

    if (supervisorResult.error) {
      this.emitSummary({ success: false, turns: 0 });
      return { success: false, turns: 0 };
    }

    // Check for the success signal in either the SDK result text or the
    // streamed message content. The SDK result text only reflects the last
    // assistant message, so when the supervisor writes EVALUATION_COMPLETE
    // early and then continues (e.g. filing issues), we must also check the
    // flag set by emitLine during streaming.
    if (this.completeSignalSeen || isComplete(supervisorResult.text)) {
      this.emitSummary({ success: true, turns: 0 });
      return { success: true, turns: 0 };
    }

    for (let turn = 1; turn <= this.maxTurns; turn++) {
      // Only the supervisor's final message is relayed to the agent.
      // Extract the last assistant text block from the buffer to avoid
      // leaking intermediate reasoning (research, tool calls, notes).
      const relay = this.extractLastText(
        this.supervisorRunner,
        supervisorResult.text,
      );

      // Drive the agent through interventions until its SDK session ends
      // naturally, the supervisor signals completion mid-turn, or the
      // per-turn intervention budget is exhausted.
      const turnOutcome = await this.#runAgentTurn(turn, relay);
      if (turnOutcome.exit) return turnOutcome.exit;

      // End-of-turn review (existing behaviour). Returns either an exit
      // outcome (error or completion) or the supervisor result for the
      // next turn's relay.
      const reviewOutcome = await this.#endOfTurnReview(turn);
      if (reviewOutcome.exit) return reviewOutcome.exit;
      supervisorResult = reviewOutcome.supervisorResult;
    }

    this.emitSummary({ success: false, turns: this.maxTurns });
    return { success: false, turns: this.maxTurns };
  }

  /**
   * Drive the agent through one turn, allowing the supervisor to interrupt
   * mid-stream via EVALUATION_INTERVENTION. Returns either an `exit` outcome
   * (the loop should return immediately) or `{exit: null}` (proceed to the
   * end-of-turn review).
   * @param {number} turn
   * @param {string} initialRelay
   * @returns {Promise<{exit: {success: boolean, turns: number}|null}>}
   */
  async #runAgentTurn(turn, initialRelay) {
    let relay = initialRelay;
    let interventions = 0;

    // Wire the mid-turn observation hook on the agent runner. The bound
    // callback captures `turn` so the inner loop's multiple resume(...)
    // calls all see the same turn id. The supervisorRunner does NOT get
    // an onBatch callback — it only fires onLine, which is enough for
    // emitLine to detect EVALUATION_COMPLETE / EVALUATION_INTERVENTION.
    this.agentRunner.onBatch = (batchLines, ctx) =>
      this.#midTurnReview(turn, batchLines, ctx);

    try {
      while (true) {
        this.currentSource = "agent";
        this.currentTurn = turn;
        const isFirstAgentCall = turn === 1 && interventions === 0;
        const agentResult = isFirstAgentCall
          ? await this.agentRunner.run(relay)
          : await this.agentRunner.resume(relay);

        if (agentResult.error && !agentResult.aborted) {
          this.emitSummary({ success: false, turns: turn });
          return { exit: { success: false, turns: turn } };
        }

        // Mid-turn EVALUATION_COMPLETE: end the session immediately.
        if (this.completeSignalSeen) {
          this.emitSummary({ success: true, turns: turn });
          return { exit: { success: true, turns: turn } };
        }

        if (agentResult.aborted && this.interventionSignalSeen) {
          interventions++;
          if (interventions >= MAX_INTERVENTIONS_PER_TURN) {
            this.emitOrchestratorEvent({ type: "intervention_limit", turn });
            return { exit: null };
          }
          relay = this.extractLastText(
            this.supervisorRunner,
            this.lastSupervisorResult?.text ?? "",
          );
          this.emitOrchestratorEvent({ type: "intervention_relayed", turn });
          continue;
        }

        // Agent's SDK session finished naturally — proceed to end-of-turn.
        return { exit: null };
      }
    } finally {
      // Detach onBatch before the end-of-turn review so the supervisor's
      // own SDK session does not trigger nested onBatch fires.
      this.agentRunner.onBatch = null;
    }
  }

  /**
   * Mid-turn supervisor review fired from inside the agent's onBatch hook.
   * Emits a `mid_turn_review` orchestrator marker, runs the supervisor's
   * LLM against the batch, and aborts the agent if the supervisor signals
   * EVALUATION_INTERVENTION or EVALUATION_COMPLETE.
   * @param {number} turn
   * @param {string[]} batchLines
   * @param {{abort: () => void}} ctx
   */
  async #midTurnReview(turn, batchLines, { abort }) {
    const batchTranscript = this.renderBatch(batchLines);

    // Order matters: emit the orchestrator marker BEFORE the supervisor
    // LLM call so the trace reads
    //   agent line → orchestrator:mid_turn_review
    //   → supervisor lines (tagged turn:N)
    //   → orchestrator:intervention_requested|complete_requested
    this.emitOrchestratorEvent({ type: "mid_turn_review", turn });

    // currentTurn stays = turn so mid-turn supervisor lines share the
    // agent's turn id. They are distinguishable from end-of-turn reviews
    // by the surrounding orchestrator events emitted around this call.
    this.currentSource = "supervisor";
    this.completeSignalSeen = false;
    this.interventionSignalSeen = false;

    this.lastSupervisorResult = await this.supervisorRunner.resume(
      `The agent is mid-turn. Latest batch:\n\n${batchTranscript}\n\n` +
        `Respond with a brief acknowledgement to let it continue, or write ` +
        `EVALUATION_INTERVENTION followed by a corrective message to stop ` +
        `and relay a new instruction. Write EVALUATION_COMPLETE only when ` +
        `the task is fully done.`,
    );
    this.currentSource = "agent";

    if (this.interventionSignalSeen) {
      this.emitOrchestratorEvent({ type: "intervention_requested", turn });
      abort();
      return;
    }
    if (this.completeSignalSeen) {
      this.emitOrchestratorEvent({ type: "complete_requested", turn });
      abort();
    }
    // Non-intervention: do nothing; the agent loop pulls the next line.
  }

  /**
   * End-of-turn supervisor review (existing behaviour). Returns either an
   * exit outcome (error or completion) or the supervisor result so the
   * outer loop can build the next turn's relay.
   * @param {number} turn
   * @returns {Promise<{exit: {success: boolean, turns: number}|null, supervisorResult?: object}>}
   */
  async #endOfTurnReview(turn) {
    // Build the full agent transcript from buffered NDJSON events so the
    // supervisor sees tool calls and reasoning, not just the SDK result.
    const agentTranscript = this.extractTranscript(this.agentRunner);

    const supervisorPrompt =
      `The agent reported:\n\n${agentTranscript}\n\n` +
      `Review the agent's work and decide how to proceed.`;

    this.currentSource = "supervisor";
    this.currentTurn = turn;
    this.completeSignalSeen = false;
    this.interventionSignalSeen = false;
    const supervisorResult =
      await this.supervisorRunner.resume(supervisorPrompt);

    if (supervisorResult.error) {
      this.emitSummary({ success: false, turns: turn });
      return { exit: { success: false, turns: turn } };
    }

    // The supervisor's turn is fully complete — check for success signal
    // in either the SDK result text or streamed messages.
    if (this.completeSignalSeen || isComplete(supervisorResult.text)) {
      this.emitSummary({ success: true, turns: turn });
      return { exit: { success: true, turns: turn } };
    }

    return { exit: null, supervisorResult };
  }

  /**
   * Extract a human-readable transcript from an AgentRunner's buffered output.
   * Drains the buffer and replays events through a TraceCollector.
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
   * Scans buffered NDJSON events in reverse to find the final assistant message
   * with a text content block. This prevents intermediate reasoning (tool calls,
   * research notes) from leaking to the agent.
   * @param {import("./agent-runner.js").AgentRunner} runner
   * @param {string} fallback - Fallback text if no assistant text block is found
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
   * Emit a single NDJSON line tagged with the current source and turn.
   * Called in real-time via the AgentRunner onLine callback.
   *
   * When the current source is the supervisor, also scans assistant text
   * content for the EVALUATION_COMPLETE and EVALUATION_INTERVENTION signals,
   * setting completeSignalSeen / interventionSignalSeen respectively.
   * @param {string} line - Raw NDJSON line from the runner
   */
  emitLine(line) {
    const event = JSON.parse(line);
    const tagged = {
      source: this.currentSource,
      turn: this.currentTurn,
      event,
    };
    this.output.write(JSON.stringify(tagged) + "\n");

    // Scan supervisor assistant messages for the signals in real time.
    // The SDK result text only reflects the final assistant message, but the
    // supervisor may write EVALUATION_COMPLETE / EVALUATION_INTERVENTION in
    // an earlier message and then continue with follow-up tool calls.
    if (this.currentSource === "supervisor" && event.type === "assistant") {
      const content = event.message?.content ?? event.content ?? [];
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type !== "text" || !block.text) continue;
          if (isComplete(block.text)) this.completeSignalSeen = true;
          if (isIntervention(block.text)) this.interventionSignalSeen = true;
        }
      }
    }
  }

  /**
   * Render a batch of buffered NDJSON lines as human-readable text for the
   * mid-turn supervisor prompt. Reuses the TraceCollector pipeline so the
   * supervisor sees tool calls and reasoning, not just raw events.
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
   * Emit an orchestrator-source NDJSON line. Used by the mid-turn loop to
   * mark mid_turn_review / intervention_requested / intervention_relayed /
   * intervention_limit / complete_requested boundaries in the trace, so the
   * improvement coach can distinguish mid-turn supervisor activity from
   * end-of-turn reviews. Additive to existing trace shape — the parser
   * already reads `source` and ignores unknown event types.
   * @param {{type: string, turn?: number}} event
   */
  emitOrchestratorEvent(event) {
    this.output.write(
      JSON.stringify({
        source: "orchestrator",
        turn: this.currentTurn,
        event,
      }) + "\n",
    );
  }

  /**
   * Emit a final orchestrator summary line.
   * @param {{success: boolean, turns: number}} result
   */
  emitSummary(result) {
    const summary = {
      source: "orchestrator",
      type: "summary",
      success: result.success,
      turns: result.turns,
    };
    this.output.write(JSON.stringify(summary) + "\n");
  }
}

/**
 * Factory function — wires both AgentRunners with their respective configs.
 * @param {object} deps
 * @param {string} deps.supervisorCwd - Supervisor working directory
 * @param {string} deps.agentCwd - Agent working directory
 * @param {function} deps.query - SDK query function
 * @param {import("stream").Writable} deps.output - Final output stream
 * @param {string} [deps.model] - Claude model identifier
 * @param {number} [deps.maxTurns] - Maximum supervisor ↔ agent exchanges
 * @param {string[]} [deps.allowedTools] - Tools the agent may use
 * @param {string[]} [deps.supervisorAllowedTools] - Tools the supervisor may use (default: Bash, Read, Glob, Grep, Write, Edit)
 * @param {string[]} [deps.supervisorDisallowedTools] - Tools to explicitly block from the supervisor
 * @param {string} [deps.supervisorProfile] - Supervisor agent profile name
 * @param {string} [deps.agentProfile] - Agent profile name
 * @returns {Supervisor}
 */
export function createSupervisor({
  supervisorCwd,
  agentCwd,
  query,
  output,
  model,
  maxTurns,
  allowedTools,
  supervisorDisallowedTools,
  supervisorAllowedTools,
  supervisorProfile,
  agentProfile,
}) {
  // Forward-reference: onLine captures `supervisor` before construction completes.
  // This is safe because onLine is only called during run(), after construction.
  let supervisor;
  const onLine = (line) => supervisor.emitLine(line);

  const agentRunner = createAgentRunner({
    cwd: agentCwd,
    query,
    output: new PassThrough(),
    model,
    maxTurns: 50,
    allowedTools,
    onLine,
    settingSources: ["project"],
    agentProfile,
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append: AGENT_SYSTEM_PROMPT,
    },
  });

  // Block Task/TaskOutput so the supervisor cannot spawn its own sub-agents.
  // The relay loop handles agent communication — letting the supervisor use
  // Task would bypass the relay and produce an empty agent trace.
  const defaultDisallowed = ["Task", "TaskOutput"];
  const disallowedTools = supervisorDisallowedTools
    ? [...new Set([...defaultDisallowed, ...supervisorDisallowedTools])]
    : defaultDisallowed;

  const supervisorRunner = createAgentRunner({
    cwd: supervisorCwd,
    query,
    output: new PassThrough(),
    model,
    maxTurns: 10,
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
    agentProfile: supervisorProfile,
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append: SUPERVISOR_SYSTEM_PROMPT,
    },
  });

  supervisor = new Supervisor({
    agentRunner,
    supervisorRunner,
    output,
    maxTurns,
  });
  return supervisor;
}
