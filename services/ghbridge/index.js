import {
  Acknowledgement,
  CallbackRegistry,
  Dispatcher,
  RateLimiter,
  ResumeScheduler,
  TokenResolver,
  appendHistory,
  buildPrompt,
  createBridgeServer,
  createCallbackHandler,
  createInboxHandler,
  createLinkCompleteHandler,
  newDiscussionContext,
  normalizeBaseUrl,
  prepareLinkResume,
  validateCallbackPayload,
} from "@forwardimpact/libbridge";
import { bridge } from "@forwardimpact/libtype";

import { DiscussionAdapter } from "./src/discussion-adapter.js";
import {
  ADD_REACTION_MUTATION,
  REMOVE_REACTION_MUTATION,
  postDiscussionReplies,
  postSingleDiscussionReply,
} from "./src/graphql.js";
import { tryInject, reconcileInbox } from "./src/injection.js";

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
  #graphqlClient;
  #store;
  #client;
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
   * @param {object} deps.discussionClient - BridgeClient instance
   * @param {(secret: string, body: string, signature: string) => Promise<boolean>} deps.verifyWebhook
   * @param {(query: string, vars: object) => Promise<unknown>} deps.graphqlClient
   * @param {Acknowledgement} [deps.acknowledgement] - Override (tests)
   */
  constructor(config, deps) {
    const { logger, tracer, discussionClient, verifyWebhook } = deps;
    if (!logger) throw new Error("logger is required");
    if (!tracer) throw new Error("tracer is required");
    if (!discussionClient) throw new Error("discussionClient is required");
    if (typeof verifyWebhook !== "function") {
      throw new Error("verifyWebhook is required");
    }
    if (!deps.ghauthClient) throw new Error("ghauthClient is required");
    this.#config = config;
    this.#logger = logger;
    this.#tracer = tracer;
    this.#verifyWebhook = verifyWebhook;
    this.#graphqlClient = deps.graphqlClient;

    this.#store = new DiscussionAdapter(discussionClient);
    this.#client = discussionClient;
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
      tokenResolver: new TokenResolver(deps.ghauthClient),
    });
    this.#resume = new ResumeScheduler({
      dispatcher: this.#dispatcher,
      store: this.#store,
      logger,
      buildCallbackMeta: (ctx) => ({ discussionId: ctx.discussion_id }),
      buildResumeInputs: (ctx) => ({ discussionId: ctx.discussion_id }),
      onDeclined: (ctx, outcome) => this.#renderDeclined(ctx, outcome),
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

    const onLinkComplete = createLinkCompleteHandler({
      channel: CHANNEL,
      store: this.#store,
      dispatcher: this.#dispatcher,
      buildCallbackMeta: (ctx) => ({ discussionId: ctx.discussion_id }),
    });

    this.#bridge = createBridgeServer({
      config,
      logger,
      tracer,
      webhookPath: WEBHOOK_PATH,
      onWebhook: (c) => this.#handleWebhook(c),
      onCallback: (c) => this.#onCallback(c),
      onLinkComplete,
      onInbox: createInboxHandler({ client: discussionClient, logger }),
    });
  }

  /** @returns {import("@forwardimpact/libbridge").DiscussionAdapter} */
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

    const requester = discussion?.user?.id?.toString();
    if (!requester) {
      this.#logger.debug("webhook", "ignoring discussion without user id");
      return c.body(null, 204);
    }

    const span = this.#tracer.startSpan("GhBridge.HandleDiscussion", {
      kind: "SERVER",
      attributes: { discussion_id: discussionId },
    });
    try {
      const ctx = await this.#loadOrCreateContext(discussionId, discussion);

      appendHistory(ctx.history, { role: "user", text, author: requester });
      ctx.last_active_at = Date.now();
      await this.#store.add(ctx);

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
        const result = await this.#dispatcher.dispatch({
          ctx,
          prompt: buildPrompt(text, ctx.history),
          requester,
          ackTarget: { subjectId: discussionId },
          callbackMeta: { discussionId },
          workflowInputs: { discussionId },
        });
        if (result.kind === "dispatched") {
          span.addEvent("workflow_dispatched", {
            correlation_id: result.correlationId,
          });
        } else {
          await this.#handleDispatchResult(ctx, result, requester);
          span.addEvent("dispatch_declined", { kind: result.kind });
        }
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

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: webhook intake with origin check, inject, rate limit, and dispatch
  async #handleDiscussionComment(c, body) {
    const discussion = body.discussion;
    const comment = body.comment;
    const commentId = comment?.node_id;
    if (
      commentId &&
      (
        await this.#client.HasOrigin(
          bridge.OriginKey.fromObject({ id: commentId }),
        )
      ).exists
    ) {
      this.#logger.debug("webhook", "skipping self-originated comment", {
        comment_id: commentId,
      });
      return c.body(null, 204);
    }

    const requester = comment?.user?.id?.toString();
    if (!requester) return c.body(null, 204);

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

      appendHistory(ctx.history, { role: "user", text, author: requester });
      ctx.last_active_at = Date.now();
      await this.#store.add(ctx);

      const { freshDispatchAllowed } = await this.#resume.processInbound(ctx);

      if (freshDispatchAllowed) {
        const inject = await tryInject(ctx, requester, text, {
          client: this.#client,
          graphqlClient: this.#graphqlClient,
          recordOrigin: this.#recordOrigin(ctx),
        });
        if (inject) {
          await this.#store.add(ctx);
          await this.#store.flush();
          span.addEvent(inject.kind);
          span.setOk();
          return c.json({ ok: true, [inject.kind]: true });
        }

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
        const result = await this.#dispatcher.dispatch({
          ctx,
          prompt: buildPrompt(text, ctx.history),
          requester,
          ackTarget: { subjectId: comment?.node_id },
          callbackMeta: { discussionId: ctx.discussion_id },
          workflowInputs: { discussionId: ctx.discussion_id },
        });
        if (result.kind !== "dispatched") {
          await this.#handleDispatchResult(ctx, result, requester);
        }
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
    const recordOrigin = this.#recordOrigin(ctx);
    const unstreamed = (payload.replies ?? []).filter(
      (r) => r.kind === undefined,
    );
    await postDiscussionReplies(
      this.#graphqlClient,
      ctx,
      unstreamed,
      recordOrigin,
    );
    for (const reply of unstreamed) {
      appendHistory(ctx.history, {
        role: "assistant",
        text: reply.body ?? "",
      });
    }

    switch (payload.verdict) {
      case "recessed":
        this.#resume.enterRecess(
          ctx,
          meta.correlationId,
          payload.trigger,
          meta.meta?.requester,
        );
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
            recordOrigin,
          );
        }
        break;
      default:
        if (!payload.verdict) return;
        this.#resume.cancelRecess(ctx, meta.correlationId);
        if (payload.summary && !payload.replies?.length) {
          await postSingleDiscussionReply(
            this.#graphqlClient,
            ctx,
            payload.summary,
            recordOrigin,
          );
          appendHistory(ctx.history, {
            role: "assistant",
            text: payload.summary,
          });
        }
        break;
    }

    if (payload.verdict !== "recessed") {
      await reconcileInbox(ctx, meta, payload, {
        client: this.#client,
        dispatcher: this.#dispatcher,
      });
    }
  }

  async #handleDispatchResult(ctx, result, requester) {
    if (result.kind === "link_required") {
      await this.#stashAndPostLink(ctx, result, requester);
    } else {
      await this.#renderDeclined(ctx, result);
    }
  }

  async #stashAndPostLink(ctx, result, requester) {
    const { linkToken, augmentedUrl } = prepareLinkResume(
      result.authorizeUrl,
      this.#config.callback_base_url,
    );

    await this.#store.putPendingDispatch({
      link_token: linkToken,
      surface: CHANNEL,
      surface_user_id: requester,
      discussion_id: ctx.discussion_id,
      created_at: Date.now(),
    });

    await postSingleDiscussionReply(
      this.#graphqlClient,
      ctx,
      `To dispatch, link your GitHub account: ${augmentedUrl}`,
      this.#recordOrigin(ctx),
    );
  }

  async #renderDeclined(ctx, outcome) {
    let body;
    switch (outcome.kind) {
      case "link_required":
        body = `To dispatch, link your GitHub account: ${outcome.authorizeUrl}`;
        break;
      case "reauth_required":
        body =
          "Your GitHub link has expired. Please re-link your account to dispatch.";
        break;
      case "transient":
        body =
          "Unable to verify your GitHub identity right now. Please try again later.";
        break;
      default:
        return;
    }
    await postSingleDiscussionReply(
      this.#graphqlClient,
      ctx,
      body,
      this.#recordOrigin(ctx),
    );
  }

  #recordOrigin(ctx) {
    return async (comment) => {
      await this.#client.RecordOrigin(
        bridge.Origin.fromObject({
          id: comment.id,
          discussion_id: ctx.discussion_id,
          posted_at: Date.now(),
        }),
      );
    };
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
