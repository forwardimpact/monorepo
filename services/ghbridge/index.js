import {
  Acknowledgement,
  CallbackRegistry,
  DiscussionContextStore,
  Dispatcher,
  RateLimiter,
  appendHistory,
  buildPrompt,
  createBridgeServer,
  createCallbackHandler,
  evaluateTrigger,
  newDiscussionContext,
  normalizeBaseUrl,
  parseIsoDuration,
  validateCallbackPayload,
} from "@forwardimpact/libbridge";

import { ElapsedScheduler } from "./src/elapsed-scheduler.js";
import {
  ADD_REACTION_MUTATION,
  REMOVE_REACTION_MUTATION,
  postDiscussionReplies,
  postSingleDiscussionReply,
} from "./src/graphql.js";

export { validateCallbackPayload };

const CHANNEL = "github-discussions";
const WEBHOOK_PATH = "/api/webhook";
const WORKFLOW_FILE = "kata-dispatch.yml";
const REACTION_CONTENT = "EYES";

function buildReactionAdapter(graphqlClient) {
  return {
    add: async (target) => {
      if (!target?.subjectId) return null;
      await graphqlClient(ADD_REACTION_MUTATION, {
        i: { subjectId: target.subjectId, content: REACTION_CONTENT },
      });
      return target.subjectId;
    },
    remove: async (_reactionId, target) => {
      if (!target?.subjectId) return;
      await graphqlClient(REMOVE_REACTION_MUTATION, {
        i: { subjectId: target.subjectId, content: REACTION_CONTENT },
      });
    },
  };
}

/**
 * GitHub Discussions bridge service. Receives webhooks from the Kata GitHub
 * App for `discussion` and `discussion_comment` events, drives the libbridge
 * dispatch dance, and posts the lead's structured replies back to the thread
 * via the `addDiscussionComment` GraphQL mutation. Suspend/resume semantics:
 * a `recessed` verdict persists a trigger, then re-dispatches with
 * `resume_context` when the trigger fires.
 */
export class GhBridgeService {
  #logger;
  #tracer;
  #config;
  #verifyWebhook;
  #getInstallationToken;
  #graphqlClient;
  #store;
  #callbacks;
  #rateLimiter;
  #ack;
  #dispatcher;
  #bridge;
  #elapsedScheduler;
  #onCallback;

  /**
   * @param {import("@forwardimpact/libbridge").BridgeConfig & {
   *   app_webhook_secret: string,
   * }} config
   * @param {object} deps
   * @param {import("@forwardimpact/libtelemetry").Logger} deps.logger
   * @param {import("@forwardimpact/libtelemetry").Tracer} deps.tracer
   * @param {import("@forwardimpact/libstorage").StorageInterface} deps.storage
   * @param {(secret: string, body: string, signature: string) => Promise<boolean>} deps.verifyWebhook
   * @param {() => Promise<string>} deps.getInstallationToken
   * @param {(query: string, vars: object) => Promise<unknown>} deps.graphqlClient
   * @param {Acknowledgement} [deps.acknowledgement] - Override (tests)
   */
  constructor(config, deps) {
    const { logger, tracer, storage, verifyWebhook, getInstallationToken } =
      deps;
    if (!logger) throw new Error("logger is required");
    if (!tracer) throw new Error("tracer is required");
    if (!storage) throw new Error("storage is required");
    if (typeof verifyWebhook !== "function") {
      throw new Error("verifyWebhook is required");
    }
    if (typeof getInstallationToken !== "function") {
      throw new Error("getInstallationToken is required");
    }
    this.#config = config;
    this.#logger = logger;
    this.#tracer = tracer;
    this.#verifyWebhook = verifyWebhook;
    this.#getInstallationToken = getInstallationToken;
    this.#graphqlClient = deps.graphqlClient;

    this.#store = new DiscussionContextStore(storage);
    this.#callbacks = new CallbackRegistry();
    this.#rateLimiter = new RateLimiter();
    this.#ack =
      deps.acknowledgement ??
      new Acknowledgement({
        reactionAdapter: buildReactionAdapter(this.#graphqlClient),
        logger,
      });
    this.#dispatcher = new Dispatcher({
      callbacks: this.#callbacks,
      ack: this.#ack,
      store: this.#store,
      callbackBaseUrl: normalizeBaseUrl(config.callback_base_url),
      workflowFile: WORKFLOW_FILE,
      githubRepo: config.github_repo,
      getGithubToken: () => this.#getInstallationToken(),
    });
    this.#elapsedScheduler = new ElapsedScheduler({
      onFire: (cid) => this.#fireElapsed(cid),
      onError: (err, cid) =>
        this.#logger.error("elapsed", err, { correlation_id: cid }),
    });

    this.#onCallback = createCallbackHandler({
      channel: CHANNEL,
      callbacks: this.#callbacks,
      ack: this.#ack,
      store: this.#store,
      logger,
      tracer,
      spanName: "GhBridge.HandleCallback",
      loadDiscussionId: (meta) => meta.meta?.discussionId,
      ackFinishTarget: (meta) => ({ subjectId: meta.meta?.discussionId }),
      handleReply: (ctx, payload, meta) =>
        this.#handleReply(ctx, payload, meta),
    });

    this.#bridge = createBridgeServer({
      config,
      logger,
      tracer,
      webhookPath: WEBHOOK_PATH,
      onWebhook: (c) => this.#handleWebhook(c),
      onCallback: (c) => this.#onCallback(c),
    });
  }

  /** @returns {import("@forwardimpact/libbridge").DiscussionContextStore} */
  get store() {
    return this.#store;
  }

  /** @returns {import("@forwardimpact/libbridge").CallbackRegistry} */
  get callbacks() {
    return this.#callbacks;
  }

  /** @returns {object} The Hono app for diagnostic mount points */
  get app() {
    return this.#bridge.app;
  }

  /** @returns {{port: number} | null} */
  address() {
    return this.#bridge.address();
  }

  /** @returns {Promise<void>} */
  async start() {
    await this.#bridge.start();
    await this.#rearmElapsedTriggers();
  }

  /** @returns {Promise<void>} */
  async stop() {
    this.#elapsedScheduler.clear();
    await this.#bridge.stop();
    await this.#store.shutdown();
  }

  async #handleWebhook(c) {
    const signature = c.req.header("x-hub-signature-256");
    const event = c.req.header("x-github-event");
    const rawBody = c.get("rawBody");
    const secret = this.#config.app_webhook_secret;
    if (!signature || !rawBody) {
      this.#logger.debug("webhook", "missing signature or body");
      return c.json({ error: "Signature required" }, 401);
    }
    const ok = await this.#verifyWebhook(
      secret,
      rawBody.toString("utf8"),
      signature,
    );
    if (!ok) {
      this.#logger.debug("webhook", "signature mismatch");
      return c.json({ error: "Invalid signature" }, 401);
    }

    let body;
    try {
      body = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    if (event === "discussion" && body.action === "created") {
      return this.#handleDiscussionCreated(c, body);
    }
    if (event === "discussion_comment" && body.action === "created") {
      return this.#handleDiscussionComment(c, body);
    }
    return c.body(null, 204);
  }

  async #handleDiscussionCreated(c, body) {
    const discussion = body.discussion;
    const discussionId = discussion?.node_id;
    const text = (discussion?.body ?? "").trim();
    if (!discussionId || !text) {
      this.#logger.debug("webhook", "ignoring discussion without id or body");
      return c.body(null, 204);
    }

    const span = this.#tracer.startSpan("GhBridge.HandleDiscussion", {
      kind: "SERVER",
      attributes: { discussion_id: discussionId },
    });
    try {
      const ctx = await this.#loadOrCreateContext(discussionId, discussion);
      const limit = this.#rateLimiter.check(discussionId, ctx.dispatches);
      if (!limit.allowed) {
        this.#logger.info("webhook", "rate limited", {
          discussion_id: discussionId,
        });
        span.addEvent("rate_limited");
        span.setOk();
        return c.body(null, 200);
      }

      try {
        const { correlationId } = await this.#dispatcher.dispatch({
          ctx,
          prompt: buildPrompt(text, ctx.history),
          ackTarget: { subjectId: discussionId },
          historyText: text,
          callbackMeta: { discussionId },
          workflowInputs: { discussionId },
        });
        span.addEvent("workflow_dispatched", {
          correlation_id: correlationId,
        });
        span.setOk();
        return c.body(null, 200);
      } catch (err) {
        this.#logger.error("webhook", err, { discussion_id: discussionId });
        span.setError(err);
        return c.json({ error: "Dispatch failed" }, 502);
      }
    } finally {
      await span.end();
    }
  }

  async #handleDiscussionComment(c, body) {
    const discussion = body.discussion;
    const comment = body.comment;
    const discussionId = discussion?.node_id;
    const text = (comment?.body ?? "").trim();
    if (!discussionId || !text) return c.body(null, 204);

    const span = this.#tracer.startSpan("GhBridge.HandleComment", {
      kind: "SERVER",
      attributes: { discussion_id: discussionId },
    });
    try {
      let ctx = await this.#store.loadByChannel(CHANNEL, discussionId);
      if (!ctx) ctx = await this.#loadOrCreateContext(discussionId, discussion);

      appendHistory(ctx.history, { role: "user", text });
      ctx.last_active_at = Date.now();

      const fired = this.#evaluateResponseTriggers(ctx);
      const hasOpenRfc = Object.keys(ctx.open_rfcs ?? {}).length > 0;

      if (fired.length > 0) {
        for (const { correlationId, rfc } of fired) {
          const historySince = ctx.history.slice(rfc.history_index_at_open);
          await this.#redispatchForResume(ctx, correlationId, historySince);
          delete ctx.open_rfcs[correlationId];
          this.#elapsedScheduler.cancel(correlationId);
        }
      } else if (hasOpenRfc) {
        // RFC open, trigger not yet fired — accumulate this response into
        // history; do not spawn a parallel fresh lead session on the same
        // thread. Responses accrue toward the trigger; the eventual
        // re-dispatch carries the full `history_since`.
        span.setOk();
      } else {
        const limit = this.#rateLimiter.check(discussionId, ctx.dispatches);
        if (!limit.allowed) {
          this.#logger.info("webhook", "rate limited", {
            discussion_id: discussionId,
          });
          await this.#store.add(ctx);
          await this.#store.flush();
          span.addEvent("rate_limited");
          span.setOk();
          return c.body(null, 200);
        }
        await this.#dispatcher.dispatch({
          ctx,
          prompt: buildPrompt(text, ctx.history),
          ackTarget: { subjectId: comment?.node_id },
          callbackMeta: { discussionId: ctx.discussion_id },
          workflowInputs: { discussionId: ctx.discussion_id },
        });
      }

      await this.#store.add(ctx);
      await this.#store.flush();
      span.setOk();
      return c.body(null, 200);
    } catch (err) {
      this.#logger.error("webhook", err, { discussion_id: discussionId });
      span.setError(err);
      return c.json({ error: "Comment handling failed" }, 500);
    } finally {
      await span.end();
    }
  }

  #evaluateResponseTriggers(ctx) {
    const fired = [];
    for (const [correlationId, rfc] of Object.entries(ctx.open_rfcs ?? {})) {
      const trigger = rfc.trigger;
      if (!trigger) continue;
      const observed = {
        responses: ctx.history.length - rfc.history_index_at_open,
        opened_at: rfc.opened_at,
      };
      const result = evaluateTrigger(trigger, observed, Date.now());
      if (result.fired) fired.push({ correlationId, rfc });
    }
    return fired;
  }

  async #redispatchForResume(ctx, correlationId, historySince) {
    const resumeContext = JSON.stringify({
      correlation_id: correlationId,
      history_since: historySince,
    });
    await this.#dispatcher.dispatch({
      ctx,
      prompt: "Resume requested.",
      callbackMeta: { discussionId: ctx.discussion_id },
      workflowInputs: {
        discussionId: ctx.discussion_id,
        resumeContext,
      },
    });
  }

  async #handleReply(ctx, payload, meta) {
    await postDiscussionReplies(this.#graphqlClient, ctx, payload.replies);
    for (const reply of payload.replies) {
      appendHistory(ctx.history, {
        role: "assistant",
        text: reply.body ?? "",
      });
    }

    switch (payload.verdict) {
      case "recessed":
        this.#enterRecess(ctx, meta.correlationId, payload.trigger);
        break;
      case "adjourned":
        delete ctx.open_rfcs[meta.correlationId];
        this.#elapsedScheduler.cancel(meta.correlationId);
        break;
      case "failed":
        delete ctx.open_rfcs[meta.correlationId];
        this.#elapsedScheduler.cancel(meta.correlationId);
        if (payload.summary) {
          await postSingleDiscussionReply(
            this.#graphqlClient,
            ctx,
            payload.summary,
          );
        }
        break;
      default:
        break;
    }
  }

  #enterRecess(ctx, correlationId, trigger) {
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
        this.#elapsedScheduler.schedule(correlationId, dueAt);
      }
    }
  }

  async #fireElapsed(correlationId) {
    const records = await this.#findContextWithRfc(correlationId);
    if (!records) return;
    const { ctx, rfc } = records;
    const historySince = ctx.history.slice(rfc.history_index_at_open);
    await this.#redispatchForResume(ctx, correlationId, historySince);
    delete ctx.open_rfcs[correlationId];
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

  async #rearmElapsedTriggers() {
    if (!this.#store.loaded) await this.#store.loadData();
    for (const record of this.#store.index.values()) {
      const open = record?.open_rfcs;
      if (!open) continue;
      for (const [correlationId, rfc] of Object.entries(open)) {
        if (typeof rfc.due_at === "number") {
          this.#elapsedScheduler.schedule(correlationId, rfc.due_at);
        }
      }
    }
  }

  async #loadOrCreateContext(discussionId, discussion) {
    const existing = await this.#store.loadByChannel(CHANNEL, discussionId);
    if (existing) return existing;
    return newDiscussionContext({
      channel: CHANNEL,
      discussionId,
      participant: {
        name: discussion?.user?.login ?? "github-user",
        kind: "human",
        external_id: discussion?.user?.id?.toString(),
        metadata: { node_id: discussion?.node_id },
      },
    });
  }
}
