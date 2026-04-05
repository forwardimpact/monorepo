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

/** System prompt appended for the supervisor runner in supervise mode. */
export const SUPERVISOR_SYSTEM_PROMPT =
  "You supervise another AI agent through a relay — only your final message in each turn is relayed to the agent. " +
  "Guide the agent, answer its questions, and write EVALUATION_COMPLETE when their task is complete.";

/** System prompt appended for the agent runner in supervise mode. */
export const AGENT_SYSTEM_PROMPT =
  "You are being supervised by another AI agent. " +
  "When requirements are ambiguous or you are uncertain, stop and ask a clarifying question before proceeding.";

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
      this.currentSource = "agent";
      this.currentTurn = turn;
      let agentResult;
      if (turn === 1) {
        agentResult = await this.agentRunner.run(relay);
      } else {
        agentResult = await this.agentRunner.resume(relay);
      }

      if (agentResult.error) {
        this.emitSummary({ success: false, turns: turn });
        return { success: false, turns: turn };
      }

      // Build the full agent transcript from buffered NDJSON events so the
      // supervisor sees tool calls and reasoning, not just the SDK result summary.
      const agentTranscript = this.extractTranscript(this.agentRunner);

      const supervisorPrompt =
        `The agent reported:\n\n${agentTranscript}\n\n` +
        `Review the agent's work and decide how to proceed.`;

      this.currentSource = "supervisor";
      this.currentTurn = turn;
      this.completeSignalSeen = false;
      supervisorResult = await this.supervisorRunner.resume(supervisorPrompt);

      if (supervisorResult.error) {
        this.emitSummary({ success: false, turns: turn });
        return { success: false, turns: turn };
      }

      // The supervisor's turn is fully complete — check for success signal
      // in either the SDK result text or streamed messages.
      if (this.completeSignalSeen || isComplete(supervisorResult.text)) {
        this.emitSummary({ success: true, turns: turn });
        return { success: true, turns: turn };
      }
    }

    this.emitSummary({ success: false, turns: this.maxTurns });
    return { success: false, turns: this.maxTurns };
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
   * content for the EVALUATION_COMPLETE signal and sets completeSignalSeen.
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

    // Scan supervisor assistant messages for the success signal in real time.
    // The SDK result text only reflects the final assistant message, but the
    // supervisor may write EVALUATION_COMPLETE in an earlier message and
    // then continue with follow-up tool calls.
    if (this.currentSource === "supervisor" && event.type === "assistant") {
      const content = event.message?.content ?? event.content ?? [];
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "text" && isComplete(block.text)) {
            this.completeSignalSeen = true;
          }
        }
      }
    }
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
