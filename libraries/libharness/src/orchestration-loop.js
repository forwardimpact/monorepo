/**
 * OrchestrationLoop — N agent sessions coordinated by one lead LLM session.
 *
 * Ask is **async**: the tool returns immediately, the actual reply arrives
 * on a later turn as `[answer#N] participant: …` on the asker's bus queue.
 * Pending state keys by `askId` (visible in the `[ask#N]` tag), so duplicate
 * Asks to the same addressee coexist without overwriting each other, and
 * the asker can map each reply unambiguously back to its question.
 *
 * Both lead and participants follow the same outer pattern: drain the bus
 * queue, run / resume the LLM with the drained messages, then settle any
 * unanswered Asks the participant owes. They differ only in how the first
 * turn starts (the lead receives the task; participants wait for traffic).
 *
 * Termination signals:
 * - `ctx.concluded` — explicit Conclude / Adjourn / Recess.
 * - `stopped` — broader: also true on lead error, agent crash, or any
 *   other abort path. Loops watch `stopped`; `ctx.concluded` is only used
 *   for the summary's success/verdict.
 */
import { SequenceCounter } from "./sequence-counter.js";
import {
  cancelPendingAsks,
  pendingAsksOwedBy,
  remindOwedAsks,
} from "./orchestration-toolkit.js";
import { formatMessages } from "./orchestrator-helpers.js";

/** Default per-session lead-turn budget — accommodates multi-round injected conversations. */
const DEFAULT_MAX_LEAD_TURNS = 200;

/** Orchestrate N agent sessions coordinated by a single lead LLM session. */
export class OrchestrationLoop {
  /**
   * @param {object} deps
   * @param {import("./agent-runner.js").AgentRunner} deps.leadRunner
   * @param {Array<{name: string, role: string, runner: import("./agent-runner.js").AgentRunner}>} deps.agents
   * @param {import("./message-bus.js").MessageBus} deps.messageBus
   * @param {import("stream").Writable} deps.output
   * @param {string} deps.leadName - Canonical name of the lead participant on the bus.
   * @param {"facilitated"|"discussion"|"supervised"} deps.mode - Carries through to `protocol_violation` events.
   * @param {object} deps.ctx - Orchestration context (from `createOrchestrationContext()`).
   * @param {object} deps.redactor
   * @param {number} [deps.maxLeadTurns] - Cap on lead resumes per session (default 200).
   * @param {string} [deps.taskAmend] - Appended to the task before delivery.
   * @param {import("./inbox-poller.js").InboxPoller} [deps.inboxPoller]
   * @param {AbortController} [deps.abortController]
   */
  constructor({
    leadRunner,
    agents,
    messageBus,
    output,
    leadName,
    mode,
    maxLeadTurns,
    ctx,
    taskAmend,
    redactor,
    inboxPoller,
    abortController,
  }) {
    if (!leadRunner) throw new Error("leadRunner is required");
    if (!agents) throw new Error("agents is required");
    if (!messageBus) throw new Error("messageBus is required");
    if (!output) throw new Error("output is required");
    if (!leadName) throw new Error("leadName is required");
    if (!mode) throw new Error("mode is required");
    if (!ctx) throw new Error("ctx is required");
    if (!redactor) throw new Error("redactor is required");
    this.leadRunner = leadRunner;
    this.agents = agents;
    this.messageBus = messageBus;
    this.output = output;
    this.leadName = leadName;
    this.mode = mode;
    this.ctx = ctx;
    this.redactor = redactor;
    this.taskAmend = taskAmend ?? null;
    this.maxLeadTurns = maxLeadTurns ?? DEFAULT_MAX_LEAD_TURNS;
    this.inboxPoller = inboxPoller ?? null;
    this.abortController = abortController ?? null;
    this.counter = new SequenceCounter();
    this.leadTurns = 0;
    this.stopped = false;
    let resolveDone;
    this.donePromise = new Promise((r) => {
      resolveDone = r;
    });
    this.#signalDone = resolveDone;
  }

  /** Internal — resolved when `stopped` flips true so waiters unblock. */
  #signalDone;

  /**
   * Run the full orchestrated session.
   * @param {string} task
   * @returns {Promise<{success: boolean, turns: number}>}
   */
  async run(task) {
    this.emitOrchestratorEvent({ type: "session_start" });
    const initialTask = this.taskAmend
      ? task
        ? `${task}\n\n${this.taskAmend}`
        : this.taskAmend
      : task;

    let firstError = null;
    const abort = (err) => {
      if (err && !firstError) firstError = err;
      this.#stop();
    };

    // Start agent loops in parallel. Wrapped so a crash flips `stopped`
    // but the wrapper itself resolves — Promise.allSettled below never
    // sees an unhandled rejection.
    const agentPromises = this.agents.map((a) =>
      this.#runAgent(a).catch(abort),
    );
    const pollerPromise = this.inboxPoller?.run().catch(() => {});

    try {
      await this.#runLead(initialTask);
    } catch (err) {
      abort(err);
    } finally {
      this.#stop();
    }

    await Promise.allSettled([...agentPromises, pollerPromise].filter(Boolean));
    if (firstError) throw firstError;

    const success = this.ctx.concluded && this.ctx.verdict === "success";
    this.emitSummary({
      success,
      verdict: this.ctx.verdict,
      turns: this.leadTurns,
      summary: this.ctx.summary,
    });
    return { success, turns: this.leadTurns };
  }

  #stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.#signalDone();
    this.abortController?.abort();
    for (const agent of this.agents) {
      agent.runner.currentAbortController?.abort();
    }
    this.leadRunner.currentAbortController?.abort();
  }

  /**
   * Lead loop. The lead's first turn carries the task; every subsequent
   * turn is a resume triggered by something landing on its inbox.
   *
   * `messages.length === 0` from `#drainOrWait` means the session ended
   * before any message arrived — that's the natural exit. If
   * `drainOrWait` returned messages, deliver them even if the session
   * concluded in the microtask window between wake-up and this check;
   * the inbox already has them and they deserve to be seen.
   */
  async #runLead(initialTask) {
    this.leadTurns = 1;
    this.emitOrchestratorEvent({ type: "agent_start", agent: this.leadName });
    await this.leadRunner.run(initialTask);
    if (this.#exiting()) return;
    await this.#settleOwedAsks(this.leadName, this.leadRunner);

    while (!this.#exiting()) {
      if (this.leadTurns >= this.maxLeadTurns) {
        this.emitOrchestratorEvent({
          type: "lead_turn_limit",
          limit: this.maxLeadTurns,
        });
        return;
      }
      const messages = await this.#drainOrWait(this.leadName);
      if (messages.length === 0) return;

      this.leadTurns++;
      const hasSynthetic = messages.some((m) => m.kind === "synthetic");
      await this.leadRunner.resume(formatMessages(messages));
      if (hasSynthetic) this.inboxPoller?.markActed();
      if (this.#exiting()) return;
      await this.#settleOwedAsks(this.leadName, this.leadRunner);
    }
  }

  /**
   * Agent loop. The first message off the inbox triggers `run()`; every
   * subsequent batch triggers `resume()`. No turn budget — the agent
   * runner's own `maxTurns` caps each SDK call.
   */
  async #runAgent({ name, runner }) {
    let started = false;
    while (!this.#exiting()) {
      const messages = await this.#drainOrWait(name);
      if (messages.length === 0) return;

      if (!started) {
        started = true;
        this.emitOrchestratorEvent({ type: "agent_start", agent: name });
        await runner.run(formatMessages(messages));
      } else {
        await runner.resume(formatMessages(messages));
      }
      if (this.#exiting()) return;
      await this.#settleOwedAsks(name, runner);
    }
  }

  /** Either an explicit Conclude or any abort path. */
  #exiting() {
    return this.stopped || this.ctx.concluded;
  }

  /**
   * Drain the queue, or wait for the first message to arrive. Returns an
   * empty array when the session ended before any message landed.
   */
  async #drainOrWait(name) {
    let messages = this.messageBus.drain(name);
    if (messages.length > 0) return messages;
    await Promise.race([
      this.messageBus.waitForMessages(name),
      this.donePromise,
    ]);
    if (this.stopped) return [];
    messages = this.messageBus.drain(name);
    return messages;
  }

  /**
   * If `name` left a pending Ask unanswered, inject one synthetic reminder
   * and resume once more. If still unanswered after the reminder, emit a
   * `protocol_violation` event per outstanding ask and cancel them — the
   * asker's queue gets a synthetic `[no answer: …]` so it doesn't deadlock
   * on a participant that's silently ignoring its inbox.
   */
  async #settleOwedAsks(name, runner) {
    if (pendingAsksOwedBy(this.ctx, name).length === 0) return;
    if (this.stopped) return;

    const reminded = remindOwedAsks(this.ctx, name);
    if (!reminded) return;
    const reminders = this.messageBus.drain(name);
    if (reminders.length === 0) return;

    await runner.resume(formatMessages(reminders));
    if (this.stopped) return;

    const stillOwed = pendingAsksOwedBy(this.ctx, name);
    if (stillOwed.length === 0) return;

    for (const entry of stillOwed) {
      this.emitOrchestratorEvent({
        type: "protocol_violation",
        agent: name,
        askId: entry.askId,
        mode: this.mode,
      });
    }
    cancelPendingAsks(this.ctx, `${name} did not answer after reminder`, name);
  }

  /**
   * Emit one NDJSON line tagged with its source (participant name) and a
   * monotonic seq, wrapped in the universal `{source, seq, event}` envelope.
   * Called from each runner's `onLine` callback.
   * @param {string} source
   * @param {string} line - Raw NDJSON line from the SDK iterator.
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
   * Emit one orchestrator-source event (`session_start`, `agent_start`,
   * `protocol_violation`, `lead_turn_limit`) wrapped in the universal
   * envelope.
   * @param {object} event
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
   * Emit the terminal summary line. `Discusser` emits its own discuss-
   * augmented summary after this one; trace consumers keep the last
   * summary they see.
   * @param {{success: boolean, verdict?: string|null, turns: number, summary?: string|null}} result
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
