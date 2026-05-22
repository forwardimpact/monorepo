import { randomUUID } from "node:crypto";

import {
  Acknowledgement,
  CallbackRegistry,
  DiscussionContextStore,
  RateLimiter,
  appendHistory,
  buildPrompt,
  createBridgeServer,
  dispatchWorkflow,
  newDiscussionContext,
  normalizeBaseUrl,
  validateCallbackPayload,
} from "@forwardimpact/libbridge";

import {
  TurnContext,
  buildReactionAdapter,
  buildTypingAdapter,
  createDefaultAdapter,
  sendReply,
} from "./src/teams.js";

const CHANNEL = "msteams";
const WEBHOOK_PATH = "/api/messages";
const WORKFLOW_FILE = "kata-dispatch.yml";

export { appendHistory, buildPrompt, validateCallbackPayload };

/**
 * Microsoft Teams bridge service. Receives messages from Teams via the Bot
 * Framework, dispatches the channel-agnostic Kata dispatch workflow on
 * GitHub, and delivers the callback reply back into the Teams
 * conversation. Mirrors the shape of `services/ghbridge`: shared libbridge
 * primitives plus a small `src/teams.js` for botbuilder-bound rendering.
 */
export class MsBridgeService {
  #logger;
  #tracer;
  #config;
  #callbackBaseUrl;
  #adapter;
  #store;
  #callbacks;
  #rateLimiter;
  #ack;
  #bridge;

  /**
   * @param {import("@forwardimpact/libconfig").ServiceConfig} config
   * @param {object} deps
   * @param {import("@forwardimpact/libtelemetry").Logger} deps.logger
   * @param {import("@forwardimpact/libtelemetry").Tracer} deps.tracer
   * @param {import("@forwardimpact/libstorage").StorageInterface} deps.storage
   * @param {object} [deps.adapter] - Bot Framework adapter override (tests)
   * @param {Acknowledgement} [deps.acknowledgement] - Override (tests)
   */
  constructor(config, { logger, tracer, storage, adapter, acknowledgement }) {
    if (!logger) throw new Error("logger is required");
    if (!tracer) throw new Error("tracer is required");
    if (!storage) throw new Error("storage is required");
    this.config = config;
    this.#config = config;
    this.#logger = logger;
    this.#tracer = tracer;
    this.#callbackBaseUrl = normalizeBaseUrl(config.callback_base_url);

    this.#adapter = adapter ?? createDefaultAdapter(config);
    this.#adapter.onTurnError = async (context, error) => {
      this.#logger.error("onTurnError", error);
      try {
        await context.sendActivity("Sorry, something went wrong.");
      } catch (sendError) {
        this.#logger.error("onTurnError", "failed to send error notice", {
          original: error?.message,
          send_error: sendError?.message,
        });
      }
    };

    this.#store = new DiscussionContextStore(storage);
    this.#callbacks = new CallbackRegistry();
    this.#rateLimiter = new RateLimiter();
    const msAppIdFn = () => this.#config.msAppId();
    this.#ack =
      acknowledgement ??
      new Acknowledgement({
        reactionAdapter: buildReactionAdapter(this.#adapter, msAppIdFn),
        typingAdapter: buildTypingAdapter(this.#adapter, msAppIdFn),
        logger,
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

  /** @returns {object} */
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
  }

  /** @returns {Promise<void>} */
  async stop() {
    await this.#bridge.stop();
    await this.#store.shutdown();
  }

  async #handleWebhook(c) {
    const req = c.req.raw;
    const rawBody = c.get("rawBody");
    const expressLikeReq = {
      headers: Object.fromEntries(req.headers.entries()),
      body: rawBody ? JSON.parse(rawBody.toString("utf8")) : {},
      method: req.method,
    };
    const resLike = {
      headersSent: false,
      _status: 200,
      _body: undefined,
      _headers: {},
      status(code) {
        this._status = code;
        return this;
      },
      json(body) {
        this._body = JSON.stringify(body);
        this._headers["content-type"] = "application/json";
        this.headersSent = true;
        return this;
      },
      send(body) {
        this._body = body;
        this.headersSent = true;
        return this;
      },
      end(body) {
        if (body !== undefined) this._body = body;
        this.headersSent = true;
        return this;
      },
      header(k, v) {
        this._headers[k.toLowerCase()] = v;
      },
    };
    try {
      await this.#adapter.process(expressLikeReq, resLike, (context) =>
        this.#handleNewMessage(context),
      );
      return new Response(resLike._body ?? null, {
        status: resLike._status,
        headers: resLike._headers,
      });
    } catch (err) {
      this.#logger.error("messages", err);
      return c.json({ error: "Invalid activity" }, 400);
    }
  }

  async #handleNewMessage(context) {
    const activity = context.activity;
    if (activity.type !== "message") return;

    const threadId = activity.conversation?.id;
    const text = (activity.text ?? "").trim();
    if (!threadId || !text) return;

    const span = this.#tracer.startSpan("MsBridge.HandleNewMessage", {
      kind: "SERVER",
      attributes: { thread_id: threadId },
    });

    try {
      const now = Date.now();
      const ref = TurnContext.getConversationReference(activity);
      const ctx = await this.#loadOrCreateContext(threadId, ref);
      ctx.last_active_at = now;
      ctx.participants[0].metadata = ref;

      const limit = this.#rateLimiter.check(threadId, ctx.dispatches);
      if (!limit.allowed) {
        await context.sendActivity(
          "You're sending messages too quickly. Please wait a moment before trying again.",
        );
        span.addEvent("rate_limited");
        span.setOk();
        await this.#store.add(ctx);
        await this.#store.flush();
        return;
      }

      const prompt = buildPrompt(text, ctx.history);
      const correlationId = randomUUID();
      const callbackToken = this.#callbacks.register(correlationId, {
        threadId,
      });
      ctx.pending_callbacks[callbackToken] = correlationId;
      const callbackUrl = `${this.#callbackBaseUrl}/api/callback/${callbackToken}`;
      const ackTarget = { ref, activityId: activity.id };

      await this.#ack.start(callbackToken, ackTarget);
      try {
        await dispatchWorkflow({
          workflowFile: WORKFLOW_FILE,
          repo: this.#config.github_repo,
          token: this.#config.ghToken(),
          prompt,
          callbackUrl,
          correlationId,
        });
        appendHistory(ctx.history, { role: "user", text });
        ctx.dispatches.push(Date.now());
        await this.#store.add(ctx);
        await this.#store.flush();
        span.addEvent("workflow_dispatched", {
          correlation_id: correlationId,
        });
        span.setOk();
      } catch (err) {
        await this.#ack.finish(callbackToken, ackTarget);
        this.#callbacks.consume(callbackToken);
        delete ctx.pending_callbacks[callbackToken];
        this.#logger.error("handleNewMessage", err, {
          thread_id: threadId,
          correlation_id: correlationId,
        });
        span.setError(err);
        await context.sendActivity(
          "Failed to reach the agent team. Please try again later.",
        );
      }
    } finally {
      await span.end();
    }
  }

  async #handleCallback(c) {
    const token = c.req.param("token");
    const meta = this.#callbacks.consume(token);
    if (!meta) {
      return c.json({ error: "Unknown callback token" }, 404);
    }
    await this.#ack.finish(token);

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

    const threadId = meta.meta?.threadId;
    const ctx = await this.#store.loadByChannel(CHANNEL, threadId);
    if (!ctx || !ctx.participants?.[0]?.metadata) {
      return c.json({ error: "Conversation reference missing" }, 410);
    }
    delete ctx.pending_callbacks[token];

    const span = this.#tracer.startSpan("MsBridge.HandleCallback", {
      kind: "SERVER",
      attributes: { correlation_id: meta.correlationId },
    });
    try {
      const ref = ctx.participants[0].metadata;
      await this.#postReplies(ref, payload.replies, ctx);
      await this.#applyVerdict(ref, payload, threadId, meta.correlationId);

      ctx.last_active_at = Date.now();
      await this.#store.add(ctx);
      await this.#store.flush();
      span.addEvent("reply_delivered", { verdict: payload.verdict });
      span.setOk();
      return c.json({ ok: true }, 200);
    } catch (err) {
      this.#logger.error("callback", err, {
        thread_id: threadId,
        correlation_id: meta.correlationId,
      });
      span.setError(err);
      return c.json({ error: "Failed to deliver reply" }, 500);
    } finally {
      await span.end();
    }
  }

  async #postReplies(ref, replies, ctx) {
    const list = Array.isArray(replies) ? replies : [];
    const msAppIdFn = () => this.#config.msAppId();
    for (const reply of list) {
      if (!reply || typeof reply.body !== "string" || !reply.body) continue;
      await sendReply(this.#adapter, msAppIdFn, ref, reply.body);
    }
    for (const reply of list) {
      if (!reply || typeof reply.body !== "string") continue;
      appendHistory(ctx.history, { role: "assistant", text: reply.body });
    }
  }

  async #applyVerdict(ref, payload, threadId, correlationId) {
    if (payload.verdict === "recessed") {
      this.#logger.info("callback", "resume not yet supported on msteams", {
        thread_id: threadId,
        correlation_id: correlationId,
      });
      return;
    }
    if (payload.verdict === "failed" && payload.summary) {
      await sendReply(
        this.#adapter,
        () => this.#config.msAppId(),
        ref,
        payload.summary,
      );
    }
  }

  async #loadOrCreateContext(threadId, ref) {
    const existing = await this.#store.loadByChannel(CHANNEL, threadId);
    if (existing) return existing;
    return newDiscussionContext({
      channel: CHANNEL,
      discussionId: threadId,
      participant: {
        name: "teams-user",
        kind: "human",
        external_id: ref?.user?.id,
        metadata: ref,
      },
    });
  }
}
