/* biome-ignore-all lint/nursery/noExcessiveLinesPerFile: file sits ~8 logical lines over the 530-line cap after the personal-conversation gate landed; the gate body is already extracted to `src/conversation-gate.js`, and the remaining headroom requires splitting `#stashAndPostLink` together with its `#renderDeclined` and `#handleReply` siblings — a follow-on change kept out of this scope. */
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
  assertMultiTenantDeps,
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
import { applyPersonalConversationGate } from "./src/conversation-gate.js";
import { DiscussionAdapter } from "./src/discussion-adapter.js";
import { handleConsent, isConsentActivity } from "./src/consent-handler.js";
import { createOnboardHandler } from "./src/onboard-handler.js";
import { extractTenant } from "./src/tenant-extractor.js";

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
  #trustedOrigins;
  #tenancyClient;
  #multiTenant;
  #tenantResolver;

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
      trustedOrigins,
      ticketSecret,
      tenantResolver: injectedTenantResolver,
      tenancyClient,
      authenticateTenant,
    },
  ) {
    if (!logger) throw new Error("logger is required");
    if (!tracer) throw new Error("tracer is required");
    if (!discussionClient) throw new Error("discussionClient is required");
    if (!ghuserClient) throw new Error("ghuserClient is required");
    if (!clock) throw new Error("clock is required");
    if (!(trustedOrigins instanceof Set))
      throw new Error("trustedOrigins is required");
    if (typeof ticketSecret !== "string" || ticketSecret.length === 0)
      throw new Error("ticketSecret is required");
    this.#logger = logger;
    this.#tracer = tracer;
    this.#clock = clock;
    this.#config = config;
    this.#msAppId = () => config.msAppId();
    this.#trustedOrigins = trustedOrigins;
    // Present only in multi-tenant mode; drives consent registration and the
    // /onboard repo mapping. Single-tenant deployments never reach tenancy.
    this.#tenancyClient = tenancyClient;
    // Deployment mode is config-driven — `tenancy_mode` is the single source of
    // truth; server.js injects the tenancy/ghserver clients only in "multi".
    this.#multiTenant = config.tenancy_mode === "multi";
    assertMultiTenantDeps(this.#multiTenant, tenancyClient);

    // One resolver instance is shared by the store adapter (tenant_id on
    // every gRPC) and the dispatcher (tenant_id in the callback URL). The
    // deployment mode picks the implementation in server.js; if none is
    // injected, default to the single-tenant `default` resolver.
    const tenantResolver =
      injectedTenantResolver ??
      new DefaultTenantResolver({
        channel: CHANNEL,
        repo: parseRepo(config.github_repo),
      });
    this.#tenantResolver = tenantResolver;

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

    this.#store = new DiscussionAdapter(discussionClient, { tenantResolver });
    this.#callbacks = new CallbackRegistry({ clock: this.#clock });
    this.#rateLimiter = new RateLimiter({ clock: this.#clock });
    this.#ack =
      acknowledgement ??
      new Acknowledgement({
        reactionAdapter: buildReactionAdapter(),
        typingAdapter: buildTypingAdapter(this.#adapter, this.#msAppId),
        logger,
      });
    // Dispatch identity is the dispatching user's per-user OAuth token via
    // services/ghuser in both tenancy modes (design § Unified dispatch
    // identity). The Bot Framework reply credential stays in-process.
    const dispatchTokenResolver = new TokenResolver(ghuserClient);
    this.#dispatcher = new Dispatcher({
      clock: this.#clock,
      callbacks: this.#callbacks,
      ack: this.#ack,
      store: this.#store,
      callbackBaseUrl: normalizeBaseUrl(config.callback_base_url),
      workflowFile: WORKFLOW_FILE,
      githubRepo: config.github_repo,
      tokenResolver: dispatchTokenResolver,
      tenantResolver,
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
      trustedOrigins: this.#trustedOrigins,
      ticketSecret,
      clock: this.#clock,
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
        callbacks: this.#callbacks,
      }),
    });

    // Hosted repo-mapping endpoint, mounted only in multi-tenant mode.
    if (this.#multiTenant) {
      this.#mountOnboard(authenticateTenant, logger);
    }
  }

  /**
   * Mount the multi-tenant `POST /onboard` endpoint. The caller's Microsoft
   * Entra tenant id is verified by `authenticateTenant` (injectable for
   * tests) and resolved to its registry row before any write. Multi-tenant
   * mode injects a real Bot Framework JWT verifier (`server.js` builds it from
   * the same authenticator the `/api/messages` path uses); a forged or absent
   * proof is rejected with 401. Single-tenant deployments never reach here, so
   * the endpoint is unrouted rather than default-denied. A missing verifier in
   * multi mode is a wiring error and fails fast in `createOnboardHandler`.
   *
   * @param {(c: object) => Promise<string | null> | (string | null)} authenticateTenant
   * @param {object} logger
   */
  #mountOnboard(authenticateTenant, logger) {
    const onboard = createOnboardHandler({
      authenticateTenant,
      tenancyClient: this.#tenancyClient,
      logger,
    });
    this.#bridge.app.post("/onboard", async (c) => {
      try {
        return await onboard(c);
      } catch (err) {
        logger.error("msbridge.onboard", err);
        return c.json({ error: "Onboarding failure" }, 500);
      }
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
    this.#callbacks.startSweepTimer();
    await this.#bridge.start();
    await this.#resume.rearm();
  }

  /** @returns {Promise<void>} */
  async stop() {
    this.#callbacks.stopSweepTimer();
    this.#resume.clear();
    await this.#bridge.stop();
  }

  /**
   * Consume a multi-tenant consent (`installationUpdate`/`add`) activity.
   * Single-tenant deployments have no tenancy client and never match.
   *
   * @param {object} activity
   * @returns {Promise<boolean>} true when the activity was a consent signal
   */
  async #maybeHandleConsent(activity) {
    if (!this.#multiTenant || !isConsentActivity(activity)) return false;
    await handleConsent(activity, {
      tenancyClient: this.#tenancyClient,
      logger: this.#logger,
    });
    return true;
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Teams intake branches on consent, inject, rate limit, and dispatch
  async #handleNewMessage(context) {
    const activity = context.activity;

    if (await this.#maybeHandleConsent(activity)) return;

    if (activity.type !== "message") return;

    if (activity.from?.id === this.#msAppId()) return;

    const threadId = activity.conversation?.id;
    const text = (activity.text ?? "").trim();
    if (!threadId || !text) return;

    const requester = activity.from?.id;
    if (!requester) return;

    // Multi-tenant per-request tenant extraction. Read the Entra tenant id
    // from `activity.channelData.tenant.id`, resolve it to an active tenant,
    // and bind `tenant_id`/`channel_tenant_key` on the context before any
    // store write or dispatch. Activities from unknown or non-active
    // (pending_consent) tenants are dropped. Single-tenant deployments skip
    // this branch and rely on the DefaultTenantResolver (`tenant_id = "default"`).
    let tenant;
    if (this.#multiTenant) {
      tenant = await extractTenant(activity, this.#tenantResolver);
      if (!tenant) {
        this.#logger.debug("intake", "no active tenant for activity");
        return;
      }
    }

    const span = this.#tracer.startSpan("MsBridge.HandleNewMessage", {
      kind: "SERVER",
      attributes: { thread_id: threadId },
    });

    try {
      const ref = TurnContext.getConversationReference(activity);
      const ctx = await this.#loadOrCreateContext(threadId, ref, tenant);
      ctx.participants[0].metadata = ref;
      if (tenant) {
        ctx.tenant_id = tenant.tenant_id;
        ctx.channel_tenant_key = tenant.channel_tenant_key;
      }

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
          const conversationType = activity.conversation?.conversationType;
          await this.#stashAndPostLink(
            ctx,
            result,
            requester,
            conversationType,
          );
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
          tenant_id: ctx.tenant_id,
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
        tenant_id: ctx.tenant_id,
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

  async #stashAndPostLink(ctx, result, requester, conversationType) {
    const gated = await applyPersonalConversationGate(
      conversationType,
      ctx,
      this.#adapter,
      this.#msAppId,
      this.#logger,
    );
    if (gated) return;
    const prepared = prepareLinkResume({
      authorizeUrl: result.authorizeUrl,
      callbackBaseUrl: this.#config.callback_base_url,
      trustedOrigins: this.#trustedOrigins,
      tenantId: result.tenant_id,
    });
    if (prepared.skipped) {
      this.#logger.info("link-resume", "skipped", {
        reason: prepared.reason,
        discussion_id: ctx.discussion_id,
      });
      return;
    }

    await this.#store.putPendingDispatch({
      link_token: prepared.linkToken,
      surface: CHANNEL,
      surface_user_id: requester,
      discussion_id: ctx.discussion_id,
      created_at: this.#clock.now(),
      tenant_id: result.tenant_id,
    });

    const ref = ctx.participants?.[0]?.metadata;
    if (ref) {
      await sendReply(
        this.#adapter,
        this.#msAppId,
        ref,
        `To dispatch, link your GitHub account: ${prepared.augmentedUrl}`,
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

  async #loadOrCreateContext(threadId, ref, tenant) {
    const existing = await this.#store.loadByChannel(
      CHANNEL,
      threadId,
      tenant?.tenant_id,
    );
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
