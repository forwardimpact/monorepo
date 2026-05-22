import { randomUUID } from "node:crypto";

import botbuilder from "botbuilder";

import {
  CallbackRegistry,
  DiscussionContextStore,
  ProgressTicker,
  RateLimiter,
  appendHistory,
  buildPrompt,
  createBridgeServer,
  dispatchWorkflow,
} from "@forwardimpact/libbridge";

const { CloudAdapter, ConfigurationBotFrameworkAuthentication, TurnContext } =
  botbuilder;

const CHANNEL = "msteams";
const WEBHOOK_PATH = "/api/messages";
const WORKFLOW_FILE = "kata-dispatch.yml";
const MAX_FIELD_LENGTH = 2000;
const TYPING_VERBS = [
  "Moonwalking",
  "Unravelling",
  "Tempering",
  "Crafting",
  "Simmering",
  "Percolating",
  "Decoding",
];

export { buildPrompt, appendHistory } from "@forwardimpact/libbridge";

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isValidRunUrl(url) {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "github.com";
  } catch {
    return false;
  }
}

/**
 * Format the verdict and summary as a Teams reply.
 *
 * @param {{verdict: string, summary: string, run_url?: string}} payload
 * @returns {string}
 */
export function formatReply(payload) {
  return payload.summary ?? "";
}

/**
 * Validate and sanitize the callback payload. Returns a clean object or null.
 * Accepts (and silently ignores) the channel-agnostic optional fields
 * `replies`, `trigger`, `discussion_id` that the kata-dispatch callback
 * sometimes carries — Teams does not render those surfaces.
 *
 * @param {unknown} body
 * @returns {{correlation_id: string, verdict: string, summary: string, run_url?: string} | null}
 */
export function validateCallbackPayload(body) {
  if (!body || typeof body !== "object") return null;

  const cid = body.correlation_id;
  if (typeof cid !== "string" || !cid) return null;
  if (typeof body.verdict !== "string" || !body.verdict) return null;
  if (typeof body.summary !== "string") return null;
  if (typeof body.run_url !== "string" || !isValidRunUrl(body.run_url)) {
    return null;
  }

  return {
    correlation_id: cid,
    verdict: body.verdict.slice(0, MAX_FIELD_LENGTH),
    summary: body.summary.slice(0, MAX_FIELD_LENGTH),
    run_url: body.run_url,
  };
}

function normalizeBaseUrl(url) {
  return (url ?? "").replace(/\/+$/, "");
}

/**
 * Microsoft Teams bridge service. Receives messages from Teams via the Bot
 * Framework, dispatches the channel-agnostic Kata dispatch workflow on
 * GitHub, and delivers the callback reply back into the Teams
 * conversation. Refactored onto `@forwardimpact/libbridge` so msbridge and
 * ghbridge share the same intake skeleton, callback registry, rate
 * limiter, history bound, and durable thread state.
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
  #progressTicker;
  #bridge;

  /**
   * @param {import("@forwardimpact/libconfig").ServiceConfig} config
   * @param {object} deps
   * @param {import("@forwardimpact/libtelemetry").Logger} deps.logger
   * @param {import("@forwardimpact/libtelemetry").Tracer} deps.tracer
   * @param {import("@forwardimpact/libstorage").StorageInterface} deps.storage
   * @param {object} [deps.adapter] - Override for tests
   */
  constructor(config, { logger, tracer, storage, adapter }) {
    if (!logger) throw new Error("logger is required");
    if (!tracer) throw new Error("tracer is required");
    if (!storage) throw new Error("storage is required");
    this.config = config;
    this.#config = config;
    this.#logger = logger;
    this.#tracer = tracer;
    this.#callbackBaseUrl = normalizeBaseUrl(config.callback_base_url);

    this.#adapter = adapter ?? this.#defaultAdapter(config);
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
    this.#progressTicker = new ProgressTicker();

    this.#bridge = createBridgeServer({
      config,
      logger,
      tracer,
      webhookPath: WEBHOOK_PATH,
      onWebhook: (c) => this.#handleMessages(c),
      onCallback: (c) => this.#handleCallback(c),
    });
  }

  #defaultAdapter(config) {
    const auth = new ConfigurationBotFrameworkAuthentication({
      MicrosoftAppId: config.msAppId(),
      MicrosoftAppPassword: config.msAppPassword(),
      MicrosoftAppTenantId: config.msAppTenantId(),
      MicrosoftAppType: "SingleTenant",
    });
    return new CloudAdapter(auth);
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

  async #handleMessages(c) {
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
      setHeader(k, v) {
        this._headers[k.toLowerCase()] = v;
      },
    };
    try {
      await this.#adapter.process(expressLikeReq, resLike, (context) =>
        this.#handleMessage(context),
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

  async #handleMessage(context) {
    const activity = context.activity;
    if (activity.type !== "message") return;

    const threadId = activity.conversation?.id;
    const text = (activity.text ?? "").trim();
    if (!threadId || !text) return;

    const span = this.#tracer.startSpan("MsBridge.HandleMessage", {
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

      const verb =
        TYPING_VERBS[Math.floor(Math.random() * TYPING_VERBS.length)];
      await context.sendActivity(`${verb}...`);

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
        this.#startTypingTicker(callbackToken, ref);
        span.addEvent("workflow_dispatched", {
          correlation_id: correlationId,
        });
        span.setOk();
      } catch (err) {
        this.#callbacks.consume(callbackToken);
        delete ctx.pending_callbacks[callbackToken];
        this.#logger.error("handleMessage", err, {
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
      const replyText = formatReply(payload);
      await this.#adapter.continueConversationAsync(
        this.#config.msAppId(),
        ref,
        async (turnContext) => {
          await turnContext.sendActivity(replyText);
        },
      );
      appendHistory(ctx.history, { role: "assistant", text: payload.summary });
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

  async #loadOrCreateContext(threadId, ref) {
    const existing = await this.#store.loadByChannel(CHANNEL, threadId);
    if (existing) return existing;
    return {
      id: DiscussionContextStore.keyOf(CHANNEL, threadId),
      channel: CHANNEL,
      discussion_id: threadId,
      history: [],
      participants: [
        {
          name: "teams-user",
          kind: "human",
          external_id: ref?.user?.id,
          metadata: ref,
        },
      ],
      open_rfcs: {},
      lead: "release-engineer",
      pending_callbacks: {},
      dispatches: [],
      last_active_at: Date.now(),
    };
  }

  #startTypingTicker(callbackToken, ref) {
    this.#progressTicker.start(callbackToken, async () => {
      const verb =
        TYPING_VERBS[Math.floor(Math.random() * TYPING_VERBS.length)];
      await this.#adapter.continueConversationAsync(
        this.#config.msAppId(),
        ref,
        async (context) => {
          await context.sendActivity(`${verb}...`);
        },
      );
    });
  }
}
