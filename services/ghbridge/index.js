import { randomUUID } from "node:crypto";

import {
  CallbackRegistry,
  DiscussionContextStore,
  ProgressTicker,
  RateLimiter,
  appendHistory,
  buildPrompt,
  createBridgeServer,
  dispatchWorkflow,
  evaluateTrigger,
  parseIsoDuration,
} from "@forwardimpact/libbridge";

import {
  newDiscussionContext,
  normalizeBaseUrl,
  validateCallbackPayload,
} from "./src/callback-payload.js";
import { ElapsedScheduler } from "./src/elapsed-scheduler.js";
import {
  ADD_REACTION_MUTATION,
  postDiscussionReplies,
  postSingleDiscussionReply,
} from "./src/graphql.js";

export { validateCallbackPayload };

const CHANNEL = "github-discussions";
const WEBHOOK_PATH = "/api/webhook";
const WORKFLOW_FILE = "kata-dispatch.yml";

/**
 * GitHub Discussions bridge service. Receives webhooks from the Kata GitHub
 * App for `discussion` and `discussion_comment` events, dispatches the
 * channel-agnostic Kata dispatch workflow, and posts the lead's structured
 * replies back to the thread via the `addDiscussionComment` GraphQL
 * mutation. Suspend/resume semantics: a `recessed` verdict persists a
 * trigger, then re-dispatches with `resume_context` when the trigger fires.
 */
export class GhBridgeService {
  #logger;
  #tracer;
  #config;
  #callbackBaseUrl;
  #verifyWebhook;
  #getInstallationToken;
  #graphqlClient;
  #store;
  #callbacks;
  #rateLimiter;
  #progressTicker;
  #bridge;
  #elapsedScheduler;

  /**
   * @param {import("@forwardimpact/libconfig").ServiceConfig} config
   * @param {object} deps
   * @param {import("@forwardimpact/libtelemetry").Logger} deps.logger
   * @param {import("@forwardimpact/libtelemetry").Tracer} deps.tracer
   * @param {import("@forwardimpact/libstorage").StorageInterface} deps.storage
   * @param {(secret: string, body: string, signature: string) => Promise<boolean>} deps.verifyWebhook
   * @param {() => Promise<string>} deps.getInstallationToken
   * @param {(query: string, vars: object) => Promise<unknown>} deps.graphqlClient
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
    this.#callbackBaseUrl = normalizeBaseUrl(config.callback_base_url);
    this.#verifyWebhook = verifyWebhook;
    this.#getInstallationToken = getInstallationToken;
    this.#graphqlClient = deps.graphqlClient;

    this.#store = new DiscussionContextStore(storage);
    this.#callbacks = new CallbackRegistry();
    this.#rateLimiter = new RateLimiter();
    this.#progressTicker = deps.progressTicker ?? new ProgressTicker();
    this.#elapsedScheduler = new ElapsedScheduler({
      onFire: (cid) => this.#fireElapsed(cid),
      onError: (err, cid) =>
        this.#logger.error("elapsed", err, { correlation_id: cid }),
    });

    this.#bridge = createBridgeServer({
      config,
      logger,
      tracer,
      webhookPath: WEBHOOK_PATH,
      onWebhook: (c) => this.#handleWebhook(c),
      onCallback: (c) => this.#handleCallback(c),
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

      const prompt = buildPrompt(text, ctx.history);
      const correlationId = randomUUID();
      const token = this.#callbacks.register(correlationId, { discussionId });
      ctx.pending_callbacks[token] = correlationId;
      const callbackUrl = `${this.#callbackBaseUrl}/api/callback/${token}`;

      try {
        const ghToken = await this.#getInstallationToken();
        await dispatchWorkflow({
          workflowFile: WORKFLOW_FILE,
          repo: this.#config.github_repo,
          token: ghToken,
          prompt,
          callbackUrl,
          correlationId,
          discussionId,
        });
        appendHistory(ctx.history, { role: "user", text });
        ctx.dispatches.push(Date.now());
        ctx.last_active_at = Date.now();
        await this.#store.add(ctx);
        await this.#store.flush();
        this.#startProgressIndicator(token, discussion?.node_id, ghToken);
        span.addEvent("workflow_dispatched", {
          correlation_id: correlationId,
        });
        span.setOk();
        return c.body(null, 200);
      } catch (err) {
        this.#callbacks.consume(token);
        delete ctx.pending_callbacks[token];
        this.#logger.error("webhook", err, {
          discussion_id: discussionId,
          correlation_id: correlationId,
        });
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
        // thread. Per plan-a-05 Step 5.4, responses accrue toward the
        // trigger; the eventual re-dispatch carries the full `history_since`.
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
        await this.#dispatchFreshFromComment(ctx, text, comment);
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

  async #dispatchFreshFromComment(ctx, text, comment) {
    const prompt = buildPrompt(text, ctx.history);
    const correlationId = randomUUID();
    const token = this.#callbacks.register(correlationId, {
      discussionId: ctx.discussion_id,
    });
    ctx.pending_callbacks[token] = correlationId;
    const callbackUrl = `${this.#callbackBaseUrl}/api/callback/${token}`;

    try {
      const ghToken = await this.#getInstallationToken();
      await dispatchWorkflow({
        workflowFile: WORKFLOW_FILE,
        repo: this.#config.github_repo,
        token: ghToken,
        prompt,
        callbackUrl,
        correlationId,
        discussionId: ctx.discussion_id,
      });
      ctx.dispatches.push(Date.now());
      this.#startProgressIndicator(token, comment?.node_id, ghToken);
    } catch (err) {
      this.#callbacks.consume(token);
      delete ctx.pending_callbacks[token];
      throw err;
    }
  }

  async #redispatchForResume(ctx, correlationId, historySince) {
    const newCorrelationId = randomUUID();
    const token = this.#callbacks.register(newCorrelationId, {
      discussionId: ctx.discussion_id,
    });
    ctx.pending_callbacks[token] = newCorrelationId;
    const callbackUrl = `${this.#callbackBaseUrl}/api/callback/${token}`;

    const resumeContext = JSON.stringify({
      correlation_id: correlationId,
      history_since: historySince,
    });
    try {
      const ghToken = await this.#getInstallationToken();
      await dispatchWorkflow({
        workflowFile: WORKFLOW_FILE,
        repo: this.#config.github_repo,
        token: ghToken,
        prompt: "Resume requested.",
        callbackUrl,
        correlationId: newCorrelationId,
        discussionId: ctx.discussion_id,
        resumeContext,
      });
    } catch (err) {
      this.#callbacks.consume(token);
      delete ctx.pending_callbacks[token];
      throw err;
    }
    ctx.dispatches.push(Date.now());
  }

  async #handleCallback(c) {
    const token = c.req.param("token");
    const meta = this.#callbacks.consume(token);
    if (!meta) {
      this.#logger.debug("callback", "unknown token");
      return c.json({ error: "Unknown callback token" }, 404);
    }
    this.#progressTicker.stop(token);

    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }
    const payload = validateCallbackPayload(body);
    if (!payload) return c.json({ error: "Invalid payload" }, 400);
    if (payload.correlation_id !== meta.correlationId) {
      return c.json({ error: "Correlation ID mismatch" }, 400);
    }

    const discussionId = meta.meta?.discussionId;
    const ctx = await this.#store.loadByChannel(CHANNEL, discussionId);
    if (!ctx) {
      this.#logger.error("callback", "context missing", { discussionId });
      return c.json({ error: "Discussion context missing" }, 410);
    }
    delete ctx.pending_callbacks[token];

    const span = this.#tracer.startSpan("GhBridge.HandleCallback", {
      kind: "SERVER",
      attributes: { correlation_id: meta.correlationId },
    });
    try {
      await this.#getInstallationToken();
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

      ctx.last_active_at = Date.now();
      await this.#store.add(ctx);
      await this.#store.flush();
      span.addEvent("reply_delivered", { verdict: payload.verdict });
      span.setOk();
      return c.json({ ok: true }, 200);
    } catch (err) {
      this.#logger.error("callback", err, {
        correlation_id: meta.correlationId,
      });
      span.setError(err);
      return c.json({ error: "Failed to deliver reply" }, 500);
    } finally {
      await span.end();
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

  #startProgressIndicator(token, commentNodeId, _ghToken) {
    if (!commentNodeId) return;
    this.#progressTicker.start(token, async () => {
      await this.#graphqlClient(ADD_REACTION_MUTATION, {
        i: { subjectId: commentNodeId, content: "EYES" },
      });
    });
  }

  async #loadOrCreateContext(discussionId, discussion) {
    const existing = await this.#store.loadByChannel(CHANNEL, discussionId);
    if (existing) return existing;
    return newDiscussionContext(discussionId, discussion);
  }
}
