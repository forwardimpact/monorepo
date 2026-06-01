import {
  Acknowledgement,
  CallbackHandlerError,
  CallbackRegistry,
  DefaultTenantResolver,
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

function parseRepo(githubRepo) {
  if (typeof githubRepo !== "string" || !githubRepo) return undefined;
  const [owner, name] = githubRepo.split("/");
  if (!owner || !name) return undefined;
  return { owner, name };
}

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
  #config;
  #msAppId;
  #adapter;
  #client;
  #store;
  #callbacks;
  #rateLimiter;
  #ack;
  #dispatcher;
  #resume;
  #bridge;
  #onCallback;
  #clock;

  /**
   * @param {import("@forwardimpact/libbridge").BridgeConfig & {
   *   msAppId: () => string,
   *   msAppPassword: () => string,
   *   msAppTenantId: () => string,
   * }} config
   * @param {object} deps
   * @param {import("@forwardimpact/libtelemetry").Logger} deps.logger
   * @param {import("@forwardimpact/libtelemetry").Tracer} deps.tracer
   * @param {object} deps.discussionClient - BridgeClient instance
   * @param {object} deps.ghuserClient - ghuser gRPC client
   * @param {import("@forwardimpact/libutil/runtime").Runtime["clock"]} deps.clock
   *   Injected clock collaborator (`now()` for discussion-context timestamps).
   * @param {object} [deps.adapter] - Bot Framework adapter override (tests)
   * @param {Acknowledgement} [deps.acknowledgement] - Override (tests)
   */
  constructor(
    config,
    {
      logger,
      tracer,
      discussionClient,
      ghuserClient,
      adapter,
      acknowledgement,
      clock,
    },
  ) {
    if (!logger) throw new Error("logger is required");
    if (!tracer) throw new Error("tracer is required");
    if (!discussionClient) throw new Error("discussionClient is required");
    if (!ghuserClient) throw new Error("ghuserClient is required");
    if (!clock) throw new Error("clock is required");
    this.#logger = logger;
    this.#tracer = tracer;
    this.#clock = clock;
    this.#config = config;
    this.#msAppId = () => config.msAppId();

    this.#client = discussionClient;
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

    this.#store = new DiscussionAdapter(discussionClient);
    this.#callbacks = new CallbackRegistry({ clock: this.#clock });
    this.#rateLimiter = new RateLimiter({ clock: this.#clock });
    this.#ack =
      acknowledgement ??
      new Acknowledgement({
        reactionAdapter: buildReactionAdapter(),
        typingAdapter: buildTypingAdapter(this.#adapter, this.#msAppId),
        logger,
      });
    this.#dispatcher = new Dispatcher({
      clock: this.#clock,
      callbacks: this.#callbacks,
      ack: this.#ack,
      store: this.#store,
      callbackBaseUrl: normalizeBaseUrl(config.callback_base_url),
      workflowFile: WORKFLOW_FILE,
      githubRepo: config.github_repo,
      tokenResolver: new TokenResolver(ghuserClient),
      tenantResolver: new DefaultTenantResolver({
        channel: CHANNEL,
        repo: parseRepo(config.github_repo),
      }),
    });
    this.#resume = new ResumeScheduler({
      clock: this.#clock,
      dispatcher: this.#dispatcher,
      store: this.#store,
      logger,
      buildCallbackMeta: (ctx) => ({ threadId: ctx.discussion_id }),
      buildResumeInputs: () => ({}),
      onDeclined: (ctx, outcome) => this.#renderDeclined(ctx, outcome),
    });

    this.#onCallback = createCallbackHandler({
      clock: this.#clock,
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

    const onLinkComplete = createLinkCompleteHandler({
      channel: CHANNEL,
      store: this.#store,
      dispatcher: this.#dispatcher,
      buildCallbackMeta: (ctx) => ({ threadId: ctx.discussion_id }),
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
      onLinkComplete,
      onInbox: createInboxHandler({
        client: discussionClient,
        logger,
        clock: this.#clock,
      }),
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

  /** @returns {import("@forwardimpact/libbridge").ResumeScheduler} */
  get resume() {
    return this.#resume;
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
    await this.#resume.rearm();
  }

  /** @returns {Promise<void>} */
  async stop() {
    this.#resume.clear();
    await this.#bridge.stop();
  }

  async #handleNewMessage(context) {
    const activity = context.activity;
    if (activity.type !== "message") return;

    if (activity.from?.id === this.#msAppId()) return;

    const threadId = activity.conversation?.id;
    const text = (activity.text ?? "").trim();
    if (!threadId || !text) return;

    const requester = activity.from?.id;
    if (!requester) return;

    const span = this.#tracer.startSpan("MsBridge.HandleNewMessage", {
      kind: "SERVER",
      attributes: { thread_id: threadId },
    });

    try {
      const ref = TurnContext.getConversationReference(activity);
      const ctx = await this.#loadOrCreateContext(threadId, ref);
      ctx.participants[0].metadata = ref;

      appendHistory(ctx.history, { role: "user", text, author: requester });
      ctx.last_active_at = this.#clock.now();
      await this.#store.add(ctx);

      const { freshDispatchAllowed } = await this.#resume.processInbound(ctx);
      if (!freshDispatchAllowed) {
        await this.#store.add(ctx);
        await this.#store.flush();
        span.setOk();
        return;
      }

      const inject = await this.#tryInject(ctx, requester, text, ref);
      if (inject) {
        await this.#store.add(ctx);
        await this.#store.flush();
        span.addEvent(inject.kind);
        span.setOk();
        return;
      }

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
        const result = await this.#dispatcher.dispatch({
          ctx,
          prompt: buildPrompt(text, ctx.history),
          requester,
          ackTarget: { ref, activityId: activity.id },
          callbackMeta: { threadId },
          workflowInputs: { discussionId: threadId },
        });
        if (result.kind === "dispatched") {
          span.addEvent("workflow_dispatched", {
            correlation_id: result.correlationId,
          });
        } else if (result.kind === "link_required") {
          await this.#stashAndPostLink(ctx, result, requester);
          span.addEvent("dispatch_declined", { kind: result.kind });
        } else {
          await this.#renderDeclined(ctx, result);
          span.addEvent("dispatch_declined", { kind: result.kind });
        }
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
    const unstreamed = (payload.replies ?? []).filter(
      (r) => r.kind === undefined,
    );
    await this.#postReplies(ref, unstreamed, ctx);
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
          await sendReply(this.#adapter, this.#msAppId, ref, payload.summary);
        }
        break;
      default:
        if (!payload.verdict) return;
        this.#resume.cancelRecess(ctx, meta.correlationId);
        if (payload.summary && !payload.replies?.length) {
          await sendReply(this.#adapter, this.#msAppId, ref, payload.summary);
          appendHistory(ctx.history, {
            role: "assistant",
            text: payload.summary,
          });
        }
        break;
    }

    if (payload.verdict !== "recessed") {
      await this.#reconcileInbox(ctx, meta, payload);
    }
  }

  async #tryInject(ctx, requester, text, ref) {
    if (
      Object.keys(ctx.pending_callbacks).length === 0 ||
      !ctx.active_requester
    ) {
      return null;
    }
    if (String(requester) === String(ctx.active_requester)) {
      const correlationId = Object.values(ctx.pending_callbacks)[0];
      await this.#client.EnqueueInbox(
        bridge.EnqueueInboxRequest.fromObject({
          message: {
            correlation_id: correlationId,
            text,
            author: String(requester),
            enqueued_at: this.#clock.now(),
          },
        }),
      );
      ctx.last_active_at = this.#clock.now();
      return { kind: "injected" };
    }
    await sendReply(
      this.#adapter,
      this.#msAppId,
      ref,
      "A session is in progress on this thread. Your message was not forwarded to the active run.",
    );
    return { kind: "noticed" };
  }

  async #reconcileInbox(ctx, meta, payload) {
    const lastActed = payload.last_acted_seq ?? -1;
    const remaining = await this.#client.DrainInbox(
      bridge.DrainInboxRequest.fromObject({
        correlation_id: meta.correlationId,
        since_seq: lastActed,
      }),
    );
    if (remaining.messages?.length > 0) {
      const coalesced = remaining.messages.map((m) => m.text).join("\n\n");
      await this.#dispatcher.dispatch({
        ctx,
        prompt: buildPrompt(coalesced, ctx.history),
        requester: remaining.messages[0].author,
        ackTarget: { ref: ctx.participants?.[0]?.metadata },
        callbackMeta: { threadId: ctx.discussion_id },
        workflowInputs: { discussionId: ctx.discussion_id },
      });
    }
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
      created_at: this.#clock.now(),
    });

    const ref = ctx.participants?.[0]?.metadata;
    if (ref) {
      await sendReply(
        this.#adapter,
        this.#msAppId,
        ref,
        `To dispatch, link your GitHub account: ${augmentedUrl}`,
      );
    }
  }

  async #renderDeclined(ctx, outcome) {
    const ref = ctx.participants?.[0]?.metadata;
    if (!ref) return;
    switch (outcome.kind) {
      case "link_required":
        await sendReply(
          this.#adapter,
          this.#msAppId,
          ref,
          `To dispatch, link your GitHub account: ${outcome.authorizeUrl}`,
        );
        break;
      case "reauth_required":
        await sendReply(
          this.#adapter,
          this.#msAppId,
          ref,
          "Your GitHub link has expired. Please re-link your account to dispatch.",
        );
        break;
      case "transient":
        await sendReply(
          this.#adapter,
          this.#msAppId,
          ref,
          "Unable to verify your GitHub identity right now. Please try again later.",
        );
        break;
    }
  }

  async #loadOrCreateContext(threadId, ref) {
    const existing = await this.#store.loadByChannel(CHANNEL, threadId);
    if (existing) return existing;
    return newDiscussionContext({
      clock: this.#clock,
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
