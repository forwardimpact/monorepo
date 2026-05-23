import {
  Acknowledgement,
  CallbackRegistry,
  DiscussionContextStore,
  Dispatcher,
  RateLimiter,
  ResumeScheduler,
  appendHistory,
  buildPrompt,
  createBridgeServer,
  createCallbackHandler,
  newDiscussionContext,
  normalizeBaseUrl,
  validateCallbackPayload,
} from "@forwardimpact/libbridge";

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
 * GitHub Discussions bridge service. Receives webhooks from the Kata
 * GitHub App for `discussion` and `discussion_comment` events, drives
 * the libbridge dispatch dance, posts the lead's structured replies back
 * via the `addDiscussionComment` GraphQL mutation, and tracks the
 * suspend/resume lifecycle through the shared `ResumeScheduler`.
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
  #resume;
  #bridge;
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
    this.#resume = new ResumeScheduler({
      dispatcher: this.#dispatcher,
      store: this.#store,
      logger,
      buildCallbackMeta: (ctx) => ({ discussionId: ctx.discussion_id }),
      buildResumeInputs: (ctx) => ({ discussionId: ctx.discussion_id }),
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
    await this.#resume.rearm();
  }

  /** @returns {Promise<void>} */
  async stop() {
    this.#resume.clear();
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

      const { freshDispatchAllowed } = await this.#resume.processInbound(ctx);

      if (freshDispatchAllowed) {
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
        this.#resume.enterRecess(ctx, meta.correlationId, payload.trigger);
        break;
      case "adjourned":
        this.#resume.cancelRecess(ctx, meta.correlationId);
        break;
      case "failed":
        this.#resume.cancelRecess(ctx, meta.correlationId);
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
