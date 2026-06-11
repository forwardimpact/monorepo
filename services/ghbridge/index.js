import {
  Acknowledgement,
  CallbackRegistry,
  DefaultTenantResolver,
  Dispatcher,
  GhServerTokenResolver,
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
  validateCallbackPayload,
} from "@forwardimpact/libbridge";
import { bridge } from "@forwardimpact/libtype";

import { DiscussionAdapter } from "./src/discussion-adapter.js";
import {
  postDiscussionReplies,
  postSingleDiscussionReply,
} from "./src/graphql.js";
import { tryInject, reconcileInbox } from "./src/injection.js";
import { handleInstall, isInstallEvent } from "./src/install-handler.js";
import { buildReactionAdapter, parseRepo } from "./src/reactions.js";
import { createReplyRender } from "./src/reply-render.js";
import { extractTenant } from "./src/tenant-extractor.js";

export { validateCallbackPayload };

const CHANNEL = "github-discussions";
const WEBHOOK_PATH = "/api/webhook";
const WORKFLOW_FILE = "kata-dispatch.yml";

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
  #clock;
  #trustedOrigins;
  #tenancyClient;
  #tenantResolver;
  #ghserverClient;
  #makeGraphqlClient;
  #multiTenant;
  #replyRender;

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
   * @param {import("@forwardimpact/libutil/runtime").Runtime["clock"]} deps.clock
   *   Injected clock collaborator (`now()` for discussion-context timestamps).
   * @param {Acknowledgement} [deps.acknowledgement] - Override (tests)
   */
  constructor(config, deps) {
    const {
      logger,
      tracer,
      discussionClient,
      verifyWebhook,
      clock,
      trustedOrigins,
      ticketSecret,
    } = deps;
    if (!logger) throw new Error("logger is required");
    if (!tracer) throw new Error("tracer is required");
    if (!discussionClient) throw new Error("discussionClient is required");
    if (typeof verifyWebhook !== "function") {
      throw new Error("verifyWebhook is required");
    }
    if (!deps.ghuserClient) throw new Error("ghuserClient is required");
    if (!clock) throw new Error("clock is required");
    if (!(trustedOrigins instanceof Set))
      throw new Error("trustedOrigins is required");
    if (typeof ticketSecret !== "string" || ticketSecret.length === 0)
      throw new Error("ticketSecret is required");
    this.#config = config;
    this.#logger = logger;
    this.#tracer = tracer;
    this.#verifyWebhook = verifyWebhook;
    this.#graphqlClient = deps.graphqlClient;
    // In multi-tenant mode the reply/reaction path mints a token for the
    // per-request resolved tenant repo; `makeGraphqlClient(repo)` returns a
    // client bound to that repo. Single-tenant uses the static `graphqlClient`.
    this.#makeGraphqlClient = deps.makeGraphqlClient;
    // Deployment mode is config-driven — `tenancy_mode` is the single source of
    // truth. server.js injects the tenancy/ghserver clients only in "multi";
    // guard against a multi config that is missing them.
    this.#multiTenant = config.tenancy_mode === "multi";
    assertMultiTenantDeps(this.#multiTenant, deps.tenancyClient);
    this.#clock = clock;
    this.#trustedOrigins = trustedOrigins;
    // Multi-tenant onboarding upserts repositories into the registry. The
    // raw tenancy client is present only in multi-tenant mode; single-tenant
    // deployments never reach services/tenancy.
    this.#tenancyClient = deps.tenancyClient;

    // One resolver instance is shared by the store adapter (tenant_id on
    // every gRPC) and the dispatcher (tenant_id in the callback URL). The
    // deployment mode picks the implementation in server.js; if none is
    // injected, default to the single-tenant `default` resolver derived
    // from the configured repo.
    const tenantResolver =
      deps.tenantResolver ??
      new DefaultTenantResolver({
        channel: CHANNEL,
        repo: parseRepo(config.github_repo),
      });
    this.#tenantResolver = tenantResolver;
    // Present only in multi-tenant mode; mints the per-tenant App
    // installation token for the reply/reaction path. Single-tenant
    // deployments use the static `graphqlClient` closure.
    this.#ghserverClient = deps.ghserverClient;

    this.#store = new DiscussionAdapter(discussionClient, { tenantResolver });
    this.#client = discussionClient;
    this.#replyRender = createReplyRender({
      graphqlClient: this.#graphqlClient,
      makeGraphqlClient: this.#makeGraphqlClient,
      multiTenant: this.#multiTenant,
      tenantResolver,
      client: this.#client,
      store: this.#store,
      clock: this.#clock,
      config,
      trustedOrigins: this.#trustedOrigins,
      logger,
    });
    this.#callbacks = new CallbackRegistry({ clock: this.#clock });
    this.#rateLimiter = new RateLimiter({ clock: this.#clock });
    this.#ack =
      deps.acknowledgement ??
      new Acknowledgement({
        reactionAdapter: buildReactionAdapter(
          this.#graphqlClient,
          this.#makeGraphqlClient,
        ),
        logger,
      });
    // Hosted dispatch identity: multi-tenant mode fires workflow_dispatch with
    // a repo-scoped GitHub App installation token minted by services/ghserver
    // for the resolved tenant repo (design § Hosted dispatch identity). This is
    // the SAME resolver msbridge uses in multi-tenant mode; sharing it removes
    // the per-user OAuth link path from hosted ghbridge entirely — and with it
    // the `putPendingDispatch` → bare-channel resolve that otherwise threw
    // `tenant_unresolved`. Single-tenant keeps the per-user OAuth token via
    // services/ghuser exactly as before.
    const dispatchTokenResolver =
      this.#multiTenant && this.#ghserverClient
        ? new GhServerTokenResolver(this.#ghserverClient, {
            requestedBy: "ghbridge",
          })
        : new TokenResolver(deps.ghuserClient);
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
      buildCallbackMeta: (ctx) => ({ discussionId: ctx.discussion_id }),
      buildResumeInputs: (ctx) => ({ discussionId: ctx.discussion_id }),
      onDeclined: (ctx, outcome) =>
        this.#replyRender.renderDeclined(ctx, outcome),
    });

    this.#onCallback = createCallbackHandler({
      clock: this.#clock,
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
      trustedOrigins: this.#trustedOrigins,
      ticketSecret,
      clock: this.#clock,
    });

    this.#bridge = createBridgeServer({
      config,
      logger,
      tracer,
      webhookPath: WEBHOOK_PATH,
      onWebhook: (c) => this.#handleWebhook(c),
      onCallback: (c) => this.#onCallback(c),
      onLinkComplete,
      onInbox: createInboxHandler({
        client: discussionClient,
        logger,
        clock: this.#clock,
        callbacks: this.#callbacks,
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

    // Multi-tenant onboarding: register repositories named by an
    // install-class delivery. Single-tenant deployments have no tenancy
    // client and skip this branch.
    if (this.#multiTenant && isInstallEvent(event, body)) {
      await handleInstall(body, {
        tenancyClient: this.#tenancyClient,
        logger: this.#logger,
      });
      return c.body(null, 200);
    }

    // Multi-tenant per-request tenant extraction. The inbound delivery names
    // one repository; resolve it to an active tenant before any store write or
    // dispatch so the downstream Dispatcher/DiscussionAdapter scope every RPC
    // by the resolved tenant. A delivery from an unknown or non-active tenant
    // is dropped (204). Single-tenant deployments skip this branch and rely on
    // the DefaultTenantResolver (`tenant_id = "default"`).
    let tenant;
    if (this.#multiTenant) {
      tenant = await extractTenant(body, this.#tenantResolver);
      if (!tenant) {
        this.#logger.debug("webhook", "no active tenant for delivery");
        return c.body(null, 204);
      }
    }

    if (event === "discussion" && body.action === "created") {
      return this.#handleDiscussionCreated(c, body, tenant);
    }
    if (event === "discussion_comment" && body.action === "created") {
      return this.#handleDiscussionComment(c, body, tenant);
    }
    return c.body(null, 204);
  }

  /**
   * Bind the resolved tenant onto a context so downstream store writes carry
   * the correct `tenant_id`. In single-tenant mode `tenant` is undefined and
   * the DiscussionAdapter resolves `"default"` itself.
   */
  #bindTenant(ctx, tenant) {
    if (tenant) {
      ctx.tenant_id = tenant.tenant_id;
      ctx.channel_tenant_key = tenant.channel_tenant_key;
    }
    return ctx;
  }

  async #handleDiscussionCreated(c, body, tenant) {
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
      const ctx = await this.#loadOrCreateContext(
        discussionId,
        discussion,
        tenant,
      );

      appendHistory(ctx.history, { role: "user", text, author: requester });
      ctx.last_active_at = this.#clock.now();
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
          ackTarget: { subjectId: discussionId, repo: tenant?.repo },
          callbackMeta: { discussionId },
          workflowInputs: { discussionId },
        });
        if (result.kind === "dispatched") {
          span.addEvent("workflow_dispatched", {
            correlation_id: result.correlationId,
          });
        } else {
          await this.#replyRender.handleDispatchResult(ctx, result, requester);
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
  async #handleDiscussionComment(c, body, tenant) {
    const discussion = body.discussion;
    const comment = body.comment;
    const commentId = comment?.node_id;
    const originTenantId =
      tenant?.tenant_id ?? (await this.#store.tenantForChannel(CHANNEL));
    if (
      commentId &&
      (
        await this.#client.HasOrigin(
          bridge.OriginKey.fromObject({
            id: commentId,
            tenant_id: originTenantId,
          }),
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
      let ctx = await this.#store.loadByChannel(
        CHANNEL,
        discussionId,
        tenant?.tenant_id,
      );
      if (!ctx)
        ctx = await this.#loadOrCreateContext(discussionId, discussion, tenant);
      this.#bindTenant(ctx, tenant);

      appendHistory(ctx.history, { role: "user", text, author: requester });
      ctx.last_active_at = this.#clock.now();
      await this.#store.add(ctx);

      const { freshDispatchAllowed } = await this.#resume.processInbound(ctx);

      if (freshDispatchAllowed) {
        const inject = await tryInject(ctx, requester, text, {
          client: this.#client,
          graphqlClient: await this.#replyRender.graphqlFor(ctx),
          recordOrigin: this.#replyRender.recordOrigin(ctx),
          clock: this.#clock,
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
          ackTarget: { subjectId: comment?.node_id, repo: tenant?.repo },
          callbackMeta: { discussionId: ctx.discussion_id },
          workflowInputs: { discussionId: ctx.discussion_id },
        });
        if (result.kind !== "dispatched") {
          await this.#replyRender.handleDispatchResult(ctx, result, requester);
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
    const graphqlClient = await this.#replyRender.graphqlFor(ctx);
    const recordOrigin = this.#replyRender.recordOrigin(ctx);
    const unstreamed = (payload.replies ?? []).filter(
      (r) => r.kind === undefined,
    );
    await postDiscussionReplies(graphqlClient, ctx, unstreamed, recordOrigin);
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
            graphqlClient,
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
            graphqlClient,
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

  async #loadOrCreateContext(discussionId, discussion, tenant) {
    const existing = await this.#store.loadByChannel(
      CHANNEL,
      discussionId,
      tenant?.tenant_id,
    );
    if (existing) return existing;
    return this.#bindTenant(
      newDiscussionContext({
        clock: this.#clock,
        channel: CHANNEL,
        discussionId,
        participant: {
          name: discussion?.user?.login ?? "github-user",
          kind: "human",
          external_id: discussion?.user?.id?.toString(),
          metadata: { node_id: discussion?.node_id },
        },
      }),
      tenant,
    );
  }
}
