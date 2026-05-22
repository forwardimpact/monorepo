import { ElapsedScheduler } from "./elapsed-scheduler.js";
import { evaluateTrigger, parseIsoDuration } from "./triggers.js";

const DEFAULT_PROMPT = "Resume requested.";

/**
 * Channel-agnostic suspend/resume lifecycle for the discuss-mode trace.
 * When the workflow returns a `"recessed"` verdict, the bridge calls
 * `enterRecess(...)` to persist the trigger on
 * `ctx.open_rfcs[correlationId]`. The scheduler watches inbound activity
 * via `processInbound(ctx)` and ticking elapsed timers via the embedded
 * `ElapsedScheduler`; when a trigger fires, it redispatches the workflow
 * through the shared `Dispatcher` with a `resume_context` payload
 * linking back to the original correlation id.
 *
 * Channel-specific extras are supplied by two small constructor
 * callbacks:
 *
 *   buildCallbackMeta(ctx) -> { ... }   // matches the bridge's loadDiscussionId
 *   buildResumeInputs(ctx) -> { ... }   // extra workflow_dispatch inputs
 *
 * Both default to ghbridge's convention; msbridge overrides
 * `buildCallbackMeta` to `{ threadId: ctx.discussion_id }` when it
 * adopts resume.
 *
 * @example
 *   const scheduler = new ResumeScheduler({
 *     dispatcher,
 *     store,
 *     logger,
 *     buildCallbackMeta: (ctx) => ({ discussionId: ctx.discussion_id }),
 *     buildResumeInputs: (ctx) => ({ discussionId: ctx.discussion_id }),
 *   });
 *   // service start:
 *   await scheduler.rearm();
 *   // inbound activity:
 *   const { freshDispatchAllowed } = await scheduler.processInbound(ctx);
 *   if (freshDispatchAllowed) { ... dispatch fresh ... }
 *   // on "recessed" verdict:
 *   scheduler.enterRecess(ctx, correlationId, payload.trigger);
 *   // on "adjourned" / "failed":
 *   scheduler.cancelRecess(ctx, correlationId);
 *   // service stop:
 *   scheduler.clear();
 */
export class ResumeScheduler {
  #dispatcher;
  #store;
  #logger;
  #elapsed;
  #prompt;
  #buildResumeInputs;
  #buildCallbackMeta;

  /**
   * @param {object} options
   * @param {import("./dispatcher.js").Dispatcher} options.dispatcher
   * @param {import("./discussion-context.js").DiscussionContextStore} options.store
   * @param {{error?: Function, info?: Function}} [options.logger]
   * @param {string} [options.prompt] - Default "Resume requested."
   * @param {(ctx: object) => object} [options.buildCallbackMeta]
   * @param {(ctx: object) => object} [options.buildResumeInputs]
   */
  constructor({
    dispatcher,
    store,
    logger,
    prompt = DEFAULT_PROMPT,
    buildCallbackMeta = (ctx) => ({ discussionId: ctx.discussion_id }),
    buildResumeInputs = () => ({}),
  }) {
    if (!dispatcher) throw new Error("dispatcher is required");
    if (!store) throw new Error("store is required");
    if (typeof buildCallbackMeta !== "function") {
      throw new Error("buildCallbackMeta must be a function");
    }
    if (typeof buildResumeInputs !== "function") {
      throw new Error("buildResumeInputs must be a function");
    }
    this.#dispatcher = dispatcher;
    this.#store = store;
    this.#logger = logger ?? null;
    this.#prompt = prompt;
    this.#buildCallbackMeta = buildCallbackMeta;
    this.#buildResumeInputs = buildResumeInputs;
    this.#elapsed = new ElapsedScheduler({
      onFire: (cid) => this.#fireElapsed(cid),
      onError: (err, cid) =>
        this.#logger?.error?.("resume.elapsed", err, {
          correlation_id: cid,
        }),
    });
  }

  /** @returns {number} Number of armed elapsed timers */
  get size() {
    return this.#elapsed.size;
  }

  /**
   * Begin watching `correlationId` for trigger resolution. Persists the
   * trigger and the history index at recess time onto
   * `ctx.open_rfcs[correlationId]`. If the trigger has an elapsed
   * component, schedules an in-memory timer that will fire even when no
   * inbound activity arrives. No-op if `trigger` is falsy.
   *
   * The caller is responsible for flushing the store after this call —
   * `enterRecess` mutates ctx but does not write.
   *
   * @param {object} ctx
   * @param {string} correlationId
   * @param {import("./triggers.js").ResumeTrigger} trigger
   */
  enterRecess(ctx, correlationId, trigger) {
    if (!trigger) return;
    const openedAt = Date.now();
    ctx.open_rfcs[correlationId] = {
      trigger,
      opened_at: openedAt,
      history_index_at_open: ctx.history.length,
    };
    if (trigger.kind === "elapsed" || trigger.kind === "either") {
      if (typeof trigger.elapsed === "string") {
        const dueAt = openedAt + parseIsoDuration(trigger.elapsed);
        ctx.open_rfcs[correlationId].due_at = dueAt;
        this.#elapsed.schedule(correlationId, dueAt);
      }
    }
  }

  /**
   * Stop watching `correlationId`. Removes the rfc from `ctx.open_rfcs`
   * and cancels any associated elapsed timer. Idempotent — safe to call
   * for verdicts that didn't actually recess.
   *
   * @param {object} ctx
   * @param {string} correlationId
   */
  cancelRecess(ctx, correlationId) {
    delete ctx.open_rfcs[correlationId];
    this.#elapsed.cancel(correlationId);
  }

  /**
   * Walk `ctx.open_rfcs`. For each rfc whose trigger has fired given the
   * current history length and clock, redispatch the workflow with
   * `resume_context` linking back to the original correlation id, then
   * cancel the rfc. Returns a summary so the host can decide whether to
   * additionally fire a fresh lead session on this inbound activity.
   *
   * If a redispatch fails the rfc remains armed — the host's failure
   * recovery (next inbound activity, or the next elapsed tick) will
   * retry.
   *
   * @param {object} ctx
   * @returns {Promise<{
   *   fired: number,
   *   hasOpenRfc: boolean,
   *   freshDispatchAllowed: boolean,
   * }>}
   */
  async processInbound(ctx) {
    const fired = this.#evaluate(ctx);
    for (const { correlationId, rfc } of fired) {
      const historySince = ctx.history.slice(rfc.history_index_at_open);
      await this.#redispatch(ctx, correlationId, historySince);
      this.cancelRecess(ctx, correlationId);
    }
    const hasOpenRfc = Object.keys(ctx.open_rfcs ?? {}).length > 0;
    return {
      fired: fired.length,
      hasOpenRfc,
      freshDispatchAllowed: fired.length === 0 && !hasOpenRfc,
    };
  }

  /**
   * Rehydrate persistent elapsed timers from the store. Call once after
   * the bridge server starts so deadlines set before a restart still
   * fire.
   * @returns {Promise<void>}
   */
  async rearm() {
    if (!this.#store.loaded) await this.#store.loadData();
    for (const record of this.#store.index.values()) {
      const open = record?.open_rfcs;
      if (!open) continue;
      for (const [correlationId, rfc] of Object.entries(open)) {
        if (typeof rfc.due_at === "number") {
          this.#elapsed.schedule(correlationId, rfc.due_at);
        }
      }
    }
  }

  /** Cancel every armed elapsed timer. Safe to call on shutdown. */
  clear() {
    this.#elapsed.clear();
  }

  #evaluate(ctx) {
    const fired = [];
    for (const [correlationId, rfc] of Object.entries(ctx.open_rfcs ?? {})) {
      const trigger = rfc.trigger;
      if (!trigger) continue;
      const observed = {
        responses: ctx.history.length - rfc.history_index_at_open,
        opened_at: rfc.opened_at,
      };
      if (evaluateTrigger(trigger, observed, Date.now()).fired) {
        fired.push({ correlationId, rfc });
      }
    }
    return fired;
  }

  async #redispatch(ctx, correlationId, historySince) {
    const resumeContext = JSON.stringify({
      correlation_id: correlationId,
      history_since: historySince,
    });
    await this.#dispatcher.dispatch({
      ctx,
      prompt: this.#prompt,
      callbackMeta: this.#buildCallbackMeta(ctx),
      workflowInputs: {
        ...this.#buildResumeInputs(ctx),
        resumeContext,
      },
    });
  }

  async #fireElapsed(correlationId) {
    const found = await this.#findContextWithRfc(correlationId);
    if (!found) return;
    const { ctx, rfc } = found;
    const historySince = ctx.history.slice(rfc.history_index_at_open);
    await this.#redispatch(ctx, correlationId, historySince);
    this.cancelRecess(ctx, correlationId);
    ctx.last_active_at = Date.now();
    await this.#store.add(ctx);
    await this.#store.flush();
  }

  async #findContextWithRfc(correlationId) {
    if (!this.#store.loaded) await this.#store.loadData();
    for (const record of this.#store.index.values()) {
      if (record?.open_rfcs?.[correlationId]) {
        return { ctx: record, rfc: record.open_rfcs[correlationId] };
      }
    }
    return null;
  }
}
