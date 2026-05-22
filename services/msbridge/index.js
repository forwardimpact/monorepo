import {
  Acknowledgement,
  CallbackHandlerError,
  CallbackRegistry,
  DiscussionContextStore,
  Dispatcher,
  RateLimiter,
  appendHistory,
  buildPrompt,
  createBridgeServer,
  createCallbackHandler,
  newDiscussionContext,
  normalizeBaseUrl,
  validateCallbackPayload,
} from "@forwardimpact/libbridge";

import {
  TurnContext,
  botFrameworkIntake,
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
 * Microsoft Teams bridge service. Receives messages from Teams via the
 * Bot Framework, drives the libbridge dispatch dance, and delivers the
 * callback reply back into the Teams conversation. Mirrors `ghbridge`:
 * shared libbridge primitives (Dispatcher, callback handler,
 * Acknowledgement) plus a small `src/teams.js` for botbuilder-bound
 * rendering.
 */
export class MsBridgeService {
  #logger;
  #tracer;
  #msAppId;
  #adapter;
  #store;
  #callbacks;
  #rateLimiter;
  #ack;
  #dispatcher;
  #bridge;
  #onCallback;

  /**
   * @param {import("@forwardimpact/libbridge").BridgeConfig & {
   *   msAppId: () => string,
   *   msAppPassword: () => string,
   *   msAppTenantId: () => string,
   *   ghToken: () => string,
   * }} config
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
    this.#logger = logger;
    this.#tracer = tracer;
    this.#msAppId = () => config.msAppId();

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
    this.#ack =
      acknowledgement ??
      new Acknowledgement({
        reactionAdapter: buildReactionAdapter(this.#adapter, this.#msAppId),
        typingAdapter: buildTypingAdapter(this.#adapter, this.#msAppId),
        logger,
      });
    this.#dispatcher = new Dispatcher({
      callbacks: this.#callbacks,
      ack: this.#ack,
      store: this.#store,
      callbackBaseUrl: normalizeBaseUrl(config.callback_base_url),
      workflowFile: WORKFLOW_FILE,
      githubRepo: config.github_repo,
      getGithubToken: () => config.ghToken(),
    });

    this.#onCallback = createCallbackHandler({
      channel: CHANNEL,
      callbacks: this.#callbacks,
      ack: this.#ack,
      store: this.#store,
      logger,
      tracer,
      spanName: "MsBridge.HandleCallback",
      loadDiscussionId: (meta) => meta.meta?.threadId,
      handleReply: (ctx, payload, meta) =>
        this.#handleReply(ctx, payload, meta),
    });

    this.#bridge = createBridgeServer({
      config,
      logger,
      tracer,
      webhookPath: WEBHOOK_PATH,
      onWebhook: botFrameworkIntake(
        this.#adapter,
        (turnContext) => this.#handleNewMessage(turnContext),
        logger,
      ),
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
      const ref = TurnContext.getConversationReference(activity);
      const ctx = await this.#loadOrCreateContext(threadId, ref);
      ctx.last_active_at = Date.now();
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

      try {
        const { correlationId } = await this.#dispatcher.dispatch({
          ctx,
          prompt: buildPrompt(text, ctx.history),
          ackTarget: { ref, activityId: activity.id },
          historyText: text,
          callbackMeta: { threadId },
        });
        span.addEvent("workflow_dispatched", {
          correlation_id: correlationId,
        });
        span.setOk();
      } catch (err) {
        this.#logger.error("handleNewMessage", err, { thread_id: threadId });
        span.setError(err);
        await context.sendActivity(
          "Failed to reach the agent team. Please try again later.",
        );
      }
    } finally {
      await span.end();
    }
  }

  async #handleReply(ctx, payload, meta) {
    if (!ctx.participants?.[0]?.metadata) {
      throw new CallbackHandlerError(410, "Conversation reference missing");
    }
    const ref = ctx.participants[0].metadata;
    await this.#postReplies(ref, payload.replies, ctx);
    await this.#applyVerdict(
      ref,
      payload,
      ctx.discussion_id,
      meta.correlationId,
    );
  }

  async #postReplies(ref, replies, ctx) {
    const list = Array.isArray(replies) ? replies : [];
    for (const reply of list) {
      if (!reply || typeof reply.body !== "string" || !reply.body) continue;
      await sendReply(this.#adapter, this.#msAppId, ref, reply.body);
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
      await sendReply(this.#adapter, this.#msAppId, ref, payload.summary);
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
