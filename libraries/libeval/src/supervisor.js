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
  }

  /**
   * Run the supervisor ↔ agent relay loop.
   * @param {string} task - The initial task for the agent
   * @returns {Promise<{success: boolean, turns: number}>}
   */
  async run(task) {
    // Turn 0: Agent receives the task and starts working
    let agentResult = await this.agentRunner.run(task);
    this.emitTagged("agent", 0);

    for (let turn = 1; turn <= this.maxTurns; turn++) {
      // Supervisor observes the agent's output
      const supervisorPrompt =
        `The agent reported:\n\n${agentResult.text}\n\n` +
        `Decide: provide guidance, answer a question, or say EVALUATION_COMPLETE on its own line.`;

      let supervisorResult;
      if (turn === 1) {
        supervisorResult = await this.supervisorRunner.run(supervisorPrompt);
      } else {
        supervisorResult = await this.supervisorRunner.resume(supervisorPrompt);
      }
      this.emitTagged("supervisor", turn);

      if (isDone(supervisorResult.text)) {
        this.emitSummary({ success: true, turns: turn });
        return { success: true, turns: turn };
      }

      // Supervisor's response becomes the agent's next input
      agentResult = await this.agentRunner.resume(supervisorResult.text);
      this.emitTagged("agent", turn);
    }

    this.emitSummary({ success: false, turns: this.maxTurns });
    return { success: false, turns: this.maxTurns };
  }

  /**
   * Drain a runner's buffered output and re-emit each line tagged with
   * source and turn metadata.
   * @param {"agent"|"supervisor"} source
   * @param {number} turn
   */
  emitTagged(source, turn) {
    const runner =
      source === "agent" ? this.agentRunner : this.supervisorRunner;
    for (const line of runner.drainOutput()) {
      const event = JSON.parse(line);
      const tagged = { source, turn, event };
      this.output.write(JSON.stringify(tagged) + "\n");
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
}) {
  const agentRunner = createAgentRunner({
    cwd: agentCwd,
    query,
    output: new PassThrough(),
    model,
    maxTurns: 50,
    allowedTools,
  });

  const supervisorRunner = createAgentRunner({
    cwd: supervisorCwd,
    query,
    output: new PassThrough(),
    model,
    maxTurns: 10,
    allowedTools: ["Read", "Glob", "Grep"],
  });

  return new Supervisor({ agentRunner, supervisorRunner, output, maxTurns });
}
