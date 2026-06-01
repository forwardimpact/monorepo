import { ElapsedScheduler } from "./elapsed-scheduler.js";
import { evaluateTrigger, parseIsoDuration } from "./triggers.js";

const DEFAULT_PROMPT = "Resume requested.";

/** Channel-agnostic suspend/resume lifecycle for the discuss-mode trace. */
export class ResumeScheduler {
  #dispatcher;
  #store;
  #logger;
  #elapsed;
  #prompt;
  #buildResumeInputs;
  #buildCallbackMeta;
  #onDeclined;
  #clock;

  /**
   * @param {object} options
   * @param {import("./dispatcher.js").Dispatcher} options.dispatcher
   * @param {import("./index.js").DiscussionAdapter} options.store
   * @param {{error?: Function, info?: Function}} [options.logger]
   * @param {string} [options.prompt] - Default "Resume requested."
   * @param {(ctx: object) => object} [options.buildCallbackMeta]
   * @param {(ctx: object) => object} [options.buildResumeInputs]
   * @param {((ctx: object, outcome: object) => Promise<void>) | null} [options.onDeclined]
   * @param {import("@forwardimpact/libutil/runtime").Runtime["clock"]} [options.clock]
   */
  constructor({
    dispatcher,
    store,
    logger,
    prompt = DEFAULT_PROMPT,
    buildCallbackMeta = (ctx) => ({ discussionId: ctx.discussion_id }),
    buildResumeInputs = () => ({}),
    onDeclined = null,
    clock,
  }) {
    if (!dispatcher) throw new Error("dispatcher is required");
    if (!store) throw new Error("store is required");
    if (typeof buildCallbackMeta !== "function") {
      throw new Error("buildCallbackMeta must be a function");
    }
    if (typeof buildResumeInputs !== "function") {
      throw new Error("buildResumeInputs must be a function");
    }
    if (onDeclined != null && typeof onDeclined !== "function") {
      throw new Error("onDeclined must be a function");
    }
    if (!clock) throw new Error("clock is required");
    this.#dispatcher = dispatcher;
    this.#store = store;
    this.#logger = logger ?? null;
    this.#prompt = prompt;
    this.#buildCallbackMeta = buildCallbackMeta;
    this.#buildResumeInputs = buildResumeInputs;
    this.#onDeclined = onDeclined;
    this.#clock = clock;
    this.#elapsed = new ElapsedScheduler({
      onFire: (cid) => this.#fireElapsed(cid),
      onError: (err, cid) =>
        this.#logger?.error?.("resume.elapsed", err, {
          correlation_id: cid,
        }),
      clock,
    });
  }

  /** @returns {number} Number of armed elapsed timers */
  get size() {
    return this.#elapsed.size;
  }

  /**
   * Begin watching `correlationId` for trigger resolution. Persists the
   * trigger, the history index at recess time, and the triggering
   * requester onto `ctx.open_rfcs[correlationId]`. If the trigger has an
   * elapsed component, schedules an in-memory timer.
   *
   * The caller is responsible for flushing the store after this call —
   * `enterRecess` mutates ctx but does not write.
   *
   * @param {object} ctx
   * @param {string} correlationId
   * @param {import("./triggers.js").ResumeTrigger} trigger
   * @param {string} requester - Surface user id of the triggering human
   */
  enterRecess(ctx, correlationId, trigger, requester) {
    if (!trigger) return;
    const openedAt = this.#clock.now();
    ctx.open_rfcs[correlationId] = {
      trigger,
      opened_at: openedAt,
      history_index_at_open: ctx.history.length,
      requester,
    };
    if (trigger.kind === "elapsed" && typeof trigger.elapsed === "string") {
      const dueAt = openedAt + parseIsoDuration(trigger.elapsed);
      ctx.open_rfcs[correlationId].due_at = dueAt;
      this.#elapsed.schedule(correlationId, dueAt);
    }
  }

  /**
   * Stop watching `correlationId`. Removes the rfc from `ctx.open_rfcs`
   * and cancels any associated elapsed timer. Idempotent.
   *
   * @param {object} ctx
   * @param {string} correlationId
   */
  cancelRecess(ctx, correlationId) {
    delete ctx.open_rfcs[correlationId];
    this.#elapsed.cancel(correlationId);
  }

  /**
   * Walk `ctx.open_rfcs`. For each rfc whose trigger has fired,
   * redispatch the workflow. Returns a summary so the host can decide
   * whether to additionally fire a fresh lead session.
   *
   * @param {object} ctx
   * @returns {Promise<{fired: number, hasOpenRfc: boolean, freshDispatchAllowed: boolean}>}
   */
  async processInbound(ctx) {
    const fired = this.#evaluate(ctx);
    for (const { correlationId, rfc } of fired) {
      const historySince = ctx.history.slice(rfc.history_index_at_open);
      const result = await this.#redispatch(ctx, correlationId, historySince);
      if (result.kind === "dispatched") {
        this.cancelRecess(ctx, correlationId);
      }
    }
    const hasOpenRfc = Object.keys(ctx.open_rfcs ?? {}).length > 0;
    return {
      fired: fired.length,
      hasOpenRfc,
      freshDispatchAllowed: fired.length === 0 && !hasOpenRfc,
    };
  }

  /**
   * Rehydrate persistent elapsed timers from the store.
   * @returns {Promise<void>}
   */
  async rearm() {
    const refs = await this.#store.listOpenRecesses();
    for (const { correlationId, dueAt } of refs) {
      this.#elapsed.schedule(correlationId, dueAt);
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
        replies: ctx.history.length - rfc.history_index_at_open,
        opened_at: rfc.opened_at,
      };
      if (evaluateTrigger(trigger, observed, this.#clock.now()).fired) {
        fired.push({ correlationId, rfc });
      }
    }
    return fired;
  }

  async #redispatch(ctx, correlationId, historySince) {
    const rfc = ctx.open_rfcs[correlationId];
    if (!rfc.requester) {
      this.cancelRecess(ctx, correlationId);
      this.#logger?.info?.("resume.skip", "rfc missing requester", {
        correlation_id: correlationId,
      });
      return {
        kind: "transient",
        error: new Error("rfc missing requester"),
      };
    }
    const resumeContext = JSON.stringify({
      correlation_id: correlationId,
      history_since: historySince,
    });
    const result = await this.#dispatcher.dispatch({
      ctx,
      prompt: this.#prompt,
      requester: rfc.requester,
      callbackMeta: this.#buildCallbackMeta(ctx),
      workflowInputs: {
        ...this.#buildResumeInputs(ctx),
        resumeContext,
      },
    });
    if (result.kind !== "dispatched") {
      this.cancelRecess(ctx, correlationId);
      await this.#store.add(ctx);
      await this.#store.flush();
      if (this.#onDeclined) await this.#onDeclined(ctx, result);
    }
    return result;
  }

  async #fireElapsed(correlationId) {
    const found = await this.#findContextWithRfc(correlationId);
    if (!found) return;
    const { ctx, rfc } = found;
    const historySince = ctx.history.slice(rfc.history_index_at_open);
    const result = await this.#redispatch(ctx, correlationId, historySince);
    if (result.kind === "dispatched") {
      this.cancelRecess(ctx, correlationId);
      ctx.last_active_at = this.#clock.now();
      await this.#store.add(ctx);
      await this.#store.flush();
    }
  }

  async #findContextWithRfc(correlationId) {
    const ctx = await this.#store.loadByCorrelation(correlationId);
    if (!ctx) return null;
    return { ctx, rfc: ctx.open_rfcs[correlationId] };
  }
}
