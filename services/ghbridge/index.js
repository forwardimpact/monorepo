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
  ADD_DISCUSSION_COMMENT_MUTATION,
  ADD_REACTION_MUTATION,
} from "./src/graphql.js";

const CHANNEL = "github-discussions";
const WEBHOOK_PATH = "/api/webhook";
const WORKFLOW_FILE = "kata-dispatch.yml";
const MAX_FIELD_LENGTH = 2000;
const CHUNK_CAP_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — well under setTimeout's 24.8d cap

function normalizeBaseUrl(url) {
  return (url ?? "").replace(/\/+$/, "");
}

/**
 * Validate and sanitize the callback payload. Returns a clean object or null.
 * Mirrors the msbridge helper but accepts the channel-agnostic optional
 * fields (`replies`, `trigger`, `discussion_id`).
 *
 * @param {unknown} body
 * @returns {object | null}
 */
export function validateCallbackPayload(body) {
  if (!body || typeof body !== "object") return null;
  const cid = body.correlation_id;
  if (typeof cid !== "string" || !cid) return null;

  const verdict =
    typeof body.verdict === "string"
      ? body.verdict.slice(0, MAX_FIELD_LENGTH)
      : "unknown";
  const summary =
    typeof body.summary === "string"
      ? body.summary.slice(0, MAX_FIELD_LENGTH)
      : "";
  const replies = Array.isArray(body.replies) ? body.replies : [];
  const discussionId =
    typeof body.discussion_id === "string" ? body.discussion_id : undefined;
  const trigger =
    body.trigger && typeof body.trigger === "object" ? body.trigger : undefined;
  const runUrl = typeof body.run_url === "string" ? body.run_url : undefined;

  return {
    correlation_id: cid,
    verdict,
    summary,
    replies,
    ...(discussionId && { discussion_id: discussionId }),
    ...(trigger && { trigger }),
    ...(runUrl && { run_url: runUrl }),
  };
}

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
  #elapsedTimers = new Map();

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
    this.#progressTicker = new ProgressTicker();

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
    for (const timer of this.#elapsedTimers.values()) clearTimeout(timer);
    this.#elapsedTimers.clear();
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
      if (fired.length > 0) {
        for (const { correlationId, rfc } of fired) {
          const historySince = ctx.history.slice(rfc.history_index_at_open);
          await this.#redispatchForResume(ctx, correlationId, historySince);
          delete ctx.open_rfcs[correlationId];
          this.#clearElapsedTimer(correlationId);
        }
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
      const ghToken = await this.#getInstallationToken();
      await this.#postReplies(ctx, payload.replies, ghToken);
      for (const reply of payload.replies) {
        appendHistory(ctx.history, {
          role: "assistant",
          text: reply.body ?? "",
        });
      }

      switch (payload.verdict) {
        case "recessed":
          await this.#enterRecess(ctx, meta.correlationId, payload.trigger);
          break;
        case "adjourned":
          delete ctx.open_rfcs[meta.correlationId];
          this.#clearElapsedTimer(meta.correlationId);
          break;
        case "failed":
          delete ctx.open_rfcs[meta.correlationId];
          this.#clearElapsedTimer(meta.correlationId);
          if (payload.summary) {
            await this.#postSingleReply(ctx, payload.summary, ghToken);
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

  async #postReplies(ctx, replies, _ghToken) {
    for (const reply of replies) {
      if (!reply || typeof reply.body !== "string") continue;
      const input = {
        discussionId: ctx.discussion_id,
        body: reply.body,
        ...(reply.in_reply_to ? { replyToId: reply.in_reply_to } : {}),
      };
      await this.#graphqlClient(ADD_DISCUSSION_COMMENT_MUTATION, { i: input });
    }
  }

  async #postSingleReply(ctx, text, _ghToken) {
    await this.#graphqlClient(ADD_DISCUSSION_COMMENT_MUTATION, {
      i: { discussionId: ctx.discussion_id, body: text },
    });
  }

  async #enterRecess(ctx, correlationId, trigger) {
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
        this.#scheduleElapsedTimer(correlationId, dueAt);
      }
    }
  }

  #scheduleElapsedTimer(correlationId, dueAt) {
    this.#clearElapsedTimer(correlationId);
    const remaining = dueAt - Date.now();
    if (remaining <= 0) {
      this.#fireElapsed(correlationId).catch((err) =>
        this.#logger.error("elapsed", err, { correlation_id: correlationId }),
      );
      return;
    }
    if (remaining > CHUNK_CAP_MS) {
      const timer = setTimeout(
        () => this.#scheduleElapsedTimer(correlationId, dueAt),
        CHUNK_CAP_MS,
      );
      timer.unref?.();
      this.#elapsedTimers.set(correlationId, timer);
      return;
    }
    const timer = setTimeout(() => {
      this.#fireElapsed(correlationId).catch((err) =>
        this.#logger.error("elapsed", err, { correlation_id: correlationId }),
      );
    }, remaining);
    timer.unref?.();
    this.#elapsedTimers.set(correlationId, timer);
  }

  #clearElapsedTimer(correlationId) {
    const timer = this.#elapsedTimers.get(correlationId);
    if (timer) {
      clearTimeout(timer);
      this.#elapsedTimers.delete(correlationId);
    }
  }

  async #fireElapsed(correlationId) {
    this.#elapsedTimers.delete(correlationId);
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
          this.#scheduleElapsedTimer(correlationId, rfc.due_at);
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
    return {
      id: DiscussionContextStore.keyOf(CHANNEL, discussionId),
      channel: CHANNEL,
      discussion_id: discussionId,
      history: [],
      participants: [
        {
          name: discussion?.user?.login ?? "github-user",
          kind: "human",
          external_id: discussion?.user?.id?.toString(),
          metadata: { node_id: discussion?.node_id },
        },
      ],
      open_rfcs: {},
      lead: "release-engineer",
      pending_callbacks: {},
      dispatches: [],
      last_active_at: Date.now(),
    };
  }
}
