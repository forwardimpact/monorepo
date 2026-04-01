/**
 * Supervisor — orchestrates a relay loop between an agent and a supervisor,
 * both running as AgentRunner instances. The agent works on a task while the
 * supervisor observes and decides when the evaluation is complete.
 *
 * Follows OO+DI: constructor injection, factory function, tests bypass factory.
 */

import { PassThrough } from "node:stream";
import { createAgentRunner } from "./agent-runner.js";

/**
 * Check if the supervisor's response signals evaluation completion.
 * Uses a structured signal — `EVALUATION_COMPLETE` on its own line —
 * to avoid false positives from natural language.
 * @param {string} text
 * @returns {boolean}
 */
export function isDone(text) {
  return /^EVALUATION_COMPLETE$/m.test(text);
}

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
  }

  /**
   * Run the supervisor ↔ agent relay loop.
   * @param {string} task - The initial task for the agent
   * @returns {Promise<{success: boolean, turns: number}>}
   */
  async run(task) {
    // Turn 0: Agent receives the task and starts working
    this.currentSource = "agent";
    this.currentTurn = 0;
    let agentResult = await this.agentRunner.run(task);

    if (agentResult.error) {
      this.emitSummary({ success: false, turns: 0 });
      return { success: false, turns: 0 };
    }

    for (let turn = 1; turn <= this.maxTurns; turn++) {
      // Supervisor observes the agent's output
      const supervisorPrompt =
        `The agent reported:\n\n${agentResult.text}\n\n` +
        `Decide: provide guidance, answer a question, or say EVALUATION_COMPLETE on its own line.`;

      this.currentSource = "supervisor";
      this.currentTurn = turn;
      let supervisorResult;
      if (turn === 1) {
        supervisorResult = await this.supervisorRunner.run(supervisorPrompt);
      } else {
        supervisorResult = await this.supervisorRunner.resume(supervisorPrompt);
      }

      if (supervisorResult.error) {
        this.emitSummary({ success: false, turns: turn });
        return { success: false, turns: turn };
      }

      if (isDone(supervisorResult.text)) {
        this.emitSummary({ success: true, turns: turn });
        return { success: true, turns: turn };
      }

      // Supervisor's response becomes the agent's next input
      this.currentSource = "agent";
      this.currentTurn = turn;
      agentResult = await this.agentRunner.resume(supervisorResult.text);

      if (agentResult.error) {
        this.emitSummary({ success: false, turns: turn });
        return { success: false, turns: turn };
      }
    }

    this.emitSummary({ success: false, turns: this.maxTurns });
    return { success: false, turns: this.maxTurns };
  }

  /**
   * Emit a single NDJSON line tagged with the current source and turn.
   * Called in real-time via the AgentRunner onLine callback.
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
  });

  const supervisorRunner = createAgentRunner({
    cwd: supervisorCwd,
    query,
    output: new PassThrough(),
    model,
    maxTurns: 10,
    allowedTools: ["Read", "Glob", "Grep"],
    onLine,
    settingSources: ["project"],
    agentProfile: supervisorProfile,
  });

  supervisor = new Supervisor({
    agentRunner,
    supervisorRunner,
    output,
    maxTurns,
  });
  return supervisor;
}
