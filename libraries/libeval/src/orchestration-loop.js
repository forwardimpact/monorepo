/**
 * OrchestrationLoop — N agent sessions + one lead LLM session. The
 * Ask/Answer contract is enforced at turn boundaries via checkPendingAsk:
 * one synthetic reminder, then a `protocol_violation` event plus a
 * null-answer injection so the session advances instead of deadlocking.
 *
 * Mode-specific concepts (Conclude vs. Adjourn/Recess, lead role name,
 * system prompts, tool sets) live in mode-specific wrappers
 * (`Facilitator` for facilitate mode, `Discusser` for discuss mode). This
 * file owns only the loop itself.
 */
import { SequenceCounter } from "./sequence-counter.js";
import {
  createOrchestrationContext,
  checkPendingAsk,
} from "./orchestration-toolkit.js";
import { createAsyncQueue, formatMessages } from "./orchestrator-helpers.js";

/**
 * Orchestrate N agent sessions coordinated by a single lead LLM session.
 * Mode-neutral. Callers parameterise the lead participant's name and the
 * `protocol_violation` mode tag so the same loop powers both facilitate
 * and discuss modes without either knowing about the other.
 */
export class OrchestrationLoop {
  /**
   * @param {object} deps
   * @param {import("./agent-runner.js").AgentRunner} deps.leadRunner
   * @param {Array<{name: string, role: string, runner: import("./agent-runner.js").AgentRunner}>} deps.agents
   * @param {import("./message-bus.js").MessageBus} deps.messageBus
   * @param {import("stream").Writable} deps.output
   * @param {string} [deps.leadName] - Canonical name of the lead participant on the messageBus (default "lead").
   * @param {"facilitated"|"discussion"|"supervised"} [deps.mode] - Mode tag emitted on `protocol_violation` events.
   * @param {number} [deps.maxTurns]
   * @param {object} [deps.ctx]
   * @param {object} [deps.eventQueue]
   * @param {string} [deps.taskAmend] - Opaque addendum appended to the task before delivery.
   * @param {object} deps.redactor
   */
  constructor({
    leadRunner,
    agents,
    messageBus,
    output,
    leadName,
    mode,
    maxTurns,
    ctx,
    eventQueue,
    taskAmend,
    redactor,
  }) {
    if (!redactor) throw new Error("redactor is required");
    this.redactor = redactor;
    this.leadRunner = leadRunner;
    this.leadName = leadName ?? "lead";
    this.mode = mode ?? "facilitated";
    this.agents = agents;
    this.messageBus = messageBus;
    this.output = output;
    this.maxTurns = maxTurns ?? 20;
    this.ctx = ctx ?? createOrchestrationContext();
    this.counter = new SequenceCounter();
    this.eventQueue = eventQueue ?? createAsyncQueue();
    this.leadTurns = 0;
    this.taskAmend = taskAmend ?? null;

    let resolve;
    const promise = new Promise((r) => {
      resolve = r;
    });
    this.concludePromise = promise;
    this.concludeResolve = resolve;
  }

  /**
   * Run the full orchestrated session.
   * @param {string} task
   * @returns {Promise<{success: boolean, turns: number}>}
   */
  async run(task) {
    this.emitOrchestratorEvent({ type: "session_start" });

    const initialTask = this.taskAmend ? `${task}\n\n${this.taskAmend}` : task;

    // Launch agent loops first — they wait for messages via messageBus.
    // This lets agents process Ask/Announce messages that arrive during
    // the lead's initial run, rather than after it completes.
    const agentPromises = this.agents.map((a) => this.#runAgent(a));

    // Turn 0: lead receives the task
    this.leadTurns++;
    await this.leadRunner.run(initialTask);

    // Handle redirect after turn 0
    await this.#processRedirect();

    if (this.ctx.concluded) {
      // Lead concluded during its initial run. Let agents finish any
      // in-progress work before returning — they may have received Ask/Answer
      // messages and started processing concurrently.
      this.concludeResolve();
      await Promise.allSettled(agentPromises);
      const success = this.ctx.verdict === "success";
      this.emitSummary({
        success,
        verdict: this.ctx.verdict,
        turns: this.leadTurns,
        summary: this.ctx.summary,
      });
      return { success, turns: this.leadTurns };
    }

    // Abort agents promptly when the session concludes during the event loop
    this.concludePromise.then(() => {
      for (const agent of this.agents) {
        agent.runner.currentAbortController?.abort();
      }
    });

    // Concurrent phase: lead event loop + already-running agent loops
    const leadPromise = this.#leadLoop();

    try {
      await Promise.all([...agentPromises, leadPromise]);
    } catch (err) {
      for (const agent of this.agents) {
        agent.runner.currentAbortController?.abort();
      }
      this.leadRunner.currentAbortController?.abort();
      throw err;
    }

    const success = this.ctx.concluded && this.ctx.verdict === "success";
    const result = {
      success,
      turns: this.leadTurns,
    };
    this.emitSummary({
      success,
      verdict: this.ctx.verdict,
      turns: result.turns,
      summary: this.ctx.summary,
    });
    return result;
  }

  #checkAsk(name) {
    return checkPendingAsk({
      ctx: this.ctx,
      messageBus: this.messageBus,
      addresseeName: name,
      mode: this.mode,
      emitViolation: (e) => this.emitOrchestratorEvent(e),
    });
  }

  async #enforcePendingAsk(agent) {
    if (this.#checkAsk(agent.name) !== "recheck") return;
    if (this.ctx.concluded) return;
    const reminders = this.messageBus.drain(agent.name);
    if (reminders.length === 0) return;
    await agent.runner.resume(formatMessages(reminders));
    if (this.ctx.concluded) return;
    this.#checkAsk(agent.name);
  }

  /**
   * Agent outer loop — waits for messages, runs/resumes the agent.
   * @param {{name: string, role: string, runner: import("./agent-runner.js").AgentRunner}} agent
   */
  async #runAgent(agent) {
    // Wait for first message (lazy start)
    await Promise.race([
      this.messageBus.waitForMessages(agent.name),
      this.concludePromise,
    ]);
    if (this.ctx.concluded) return;

    let messages = this.messageBus.drain(agent.name);
    if (messages.length === 0) return;

    this.emitOrchestratorEvent({ type: "agent_start", agent: agent.name });
    await agent.runner.run(formatMessages(messages));
    if (await this.#settleAgentTurn(agent)) return;

    // Loop: check for new messages, resume if any
    while (!this.ctx.concluded) {
      messages = await this.#awaitAgentMessages(agent.name);
      if (messages.length === 0) break;
      await agent.runner.resume(formatMessages(messages));
      if (await this.#settleAgentTurn(agent)) break;
    }
  }

  /**
   * Enforce pending-ask and emit turn_complete. Returns true when the
   * session has concluded and the caller should stop.
   */
  async #settleAgentTurn(agent) {
    if (this.ctx.concluded) return true;
    await this.#enforcePendingAsk(agent);
    if (this.ctx.concluded) return true;
    this.eventQueue.enqueue({
      type: "lifecycle",
      agent: agent.name,
      status: "turn_complete",
    });
    return false;
  }

  /**
   * Wait for messages addressed to `name`, returning an empty array when
   * the session concludes first.
   */
  async #awaitAgentMessages(name) {
    const messages = this.messageBus.drain(name);
    if (messages.length > 0) return messages;
    await Promise.race([
      this.messageBus.waitForMessages(name),
      this.concludePromise,
    ]);
    if (this.ctx.concluded) return [];
    return this.messageBus.drain(name);
  }

  /**
   * Lead event loop — only runs when input arrives.
   */
  async #leadLoop() {
    while (!this.ctx.concluded) {
      const event = await this.eventQueue.dequeue();
      if (this.ctx.concluded || event === null) break;
      await this.#handleEvent(event);
    }
  }

  async #handleEvent(event) {
    switch (event.type) {
      case "messages":
      case "lifecycle": {
        const msgs = this.messageBus.drain(this.leadName);
        if (msgs.length === 0) break;
        this.leadTurns++;
        await this.leadRunner.resume(formatMessages(msgs));
        await this.#processRedirect();
        if (!this.ctx.concluded) await this.#enforceLeadPendingAsk();
        break;
      }
    }

    if (this.ctx.concluded) {
      this.concludeResolve();
      this.eventQueue.close();
    }
  }

  async #enforceLeadPendingAsk() {
    if (this.#checkAsk(this.leadName) !== "recheck") return;
    if (this.ctx.concluded) return;
    const reminders = this.messageBus.drain(this.leadName);
    if (reminders.length === 0) return;
    this.leadTurns++;
    await this.leadRunner.resume(formatMessages(reminders));
    await this.#processRedirect();
    if (this.ctx.concluded) return;
    this.#checkAsk(this.leadName);
  }

  /**
   * Process a pending redirect after a lead turn.
   */
  async #processRedirect() {
    if (!this.ctx.redirect) return;
    const redirect = this.ctx.redirect;
    this.ctx.redirect = null;

    this.emitOrchestratorEvent({
      type: "redirect",
      to: redirect.to,
    });

    if (redirect.to === "all") {
      // Abort all agents and deliver redirect via broadcast
      for (const agent of this.agents) {
        agent.runner.currentAbortController?.abort();
      }
      this.messageBus.announce(this.leadName, redirect.message);
    } else if (redirect.to) {
      // Abort specific agent and deliver via direct message
      const target = this.agents.find((a) => a.name === redirect.to);
      if (target) {
        target.runner.currentAbortController?.abort();
      }
      this.messageBus.direct(this.leadName, redirect.to, redirect.message);
    }
  }

  /** Return the last assistant text block from a runner's buffer, or the fallback if none exists. */
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
   * Emit a single NDJSON line tagged with source and seq.
   * @param {string} source - Participant name
   * @param {string} line - Raw NDJSON line
   */
  emitLine(source, line) {
    const event = JSON.parse(line);
    this.output.write(
      JSON.stringify(
        this.redactor.redactValue({
          source,
          seq: this.counter.next(),
          event,
        }),
      ) + "\n",
    );
  }

  /**
   * @param {{type: string}} event
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
