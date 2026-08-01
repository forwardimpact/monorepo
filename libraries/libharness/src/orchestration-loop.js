/**
 * OrchestrationLoop — one lead LLM session coordinates N agent sessions.
 *
 * Ask is **async**. The tool returns immediately. The actual reply arrives
 * on a later turn as `[answer#N] participant: …` on the asker's bus queue.
 * Pending state keys by `askId` (visible in the `[ask#N]` tag). Duplicate
 * Asks to the same addressee then coexist and never overwrite each other.
 * The asker can map each reply unambiguously back to its question.
 *
 * Both lead and participants follow the same outer pattern. Drain the bus
 * queue. Run or resume the LLM with the drained messages. Then settle any
 * unanswered Asks the participant owes. They differ only in how the first
 * turn starts. The lead receives the task. Participants wait for traffic.
 *
 * Termination signals:
 * - `ctx.concluded` — explicit Conclude / Adjourn / Recess.
 * - `stopped` — broader. It is also true on lead error, agent crash, or any
 *   other abort path. Loops watch `stopped`. The code uses `ctx.concluded`
 *   only for the summary's success and verdict.
 */
import { SequenceCounter } from "./sequence-counter.js";
import {
  cancelPendingAsks,
  pendingAsksOwedBy,
  remindOwedAsks,
} from "./orchestration-toolkit.js";
import { formatMessages } from "./orchestrator-helpers.js";

/** Default per-session lead-turn budget. It fits multi-round injected conversations. */
const DEFAULT_MAX_LEAD_TURNS = 200;

/** Coordinate N agent sessions from a single lead LLM session. */
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
   * @param {string} [deps.taskAmend] - The loop appends it to the task before delivery.
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

  /** Internal. Resolves when `stopped` flips true so waiters unblock. */
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

    // Start agent loops in parallel. The wrapper makes a crash flip `stopped`
    // and still resolves itself. Promise.allSettled below then never sees an
    // unhandled rejection.
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
   * Lead loop. The lead's first turn carries the task. Every later turn is
   * a resume, and something that lands on its inbox triggers it.
   *
   * `messages.length === 0` from `#drainOrWait` means the session ended
   * before any message arrived. That is the natural exit. If `drainOrWait`
   * returned messages, deliver them even when the session concluded in the
   * microtask window between wake-up and this check. The inbox already holds
   * them, so the lead should see them.
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
   * Agent loop. The first message off the inbox triggers `run()`. Every
   * later batch triggers `resume()`. The loop has no turn budget. The agent
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
   * and resume once more. If it is still unanswered after the reminder, emit
   * a `protocol_violation` event per outstanding ask and cancel them. The
   * asker's queue then gets a synthetic `[no answer: …]`. The asker does not
   * deadlock on a participant that silently ignores its inbox.
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
   * Emit one NDJSON line in the universal `{source, seq, event}` envelope.
   * Tag it with its source (the participant name) and a monotonic seq.
   * Each runner's `onLine` callback calls this.
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
   * `protocol_violation`, `lead_turn_limit`) in the universal envelope.
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
   * augmented summary after this one. Trace consumers keep the last
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
