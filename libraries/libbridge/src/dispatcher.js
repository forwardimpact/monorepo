import { randomUUID } from "node:crypto";

import { dispatchWorkflow } from "./dispatch.js";

/** Dispatch dance: resolve per-user token, register callback, ack, fire workflow, flush. */
export class Dispatcher {
  #callbacks;
  #ack;
  #store;
  #callbackBaseUrl;
  #workflowFile;
  #githubRepo;
  #tokenResolver;
  #tenantResolver;
  #clock;

  /**
   * @param {object} options
   * @param {import("./callback-registry.js").CallbackRegistry} options.callbacks
   * @param {import("./acknowledgement.js").Acknowledgement} options.ack
   * @param {import("./index.js").DiscussionAdapter} options.store
   * @param {string} options.callbackBaseUrl - Already normalised
   * @param {string} options.workflowFile
   * @param {string} options.githubRepo
   * @param {import("./token-resolver.js").TokenResolver} options.tokenResolver
   * @param {import("./tenant-resolver.js").TenantResolver} options.tenantResolver
   * @param {import("@forwardimpact/libutil/runtime").Runtime["clock"]} [options.clock]
   */
  constructor({
    callbacks,
    ack,
    store,
    callbackBaseUrl,
    workflowFile,
    githubRepo,
    tokenResolver,
    tenantResolver,
    clock,
  }) {
    if (!callbacks) throw new Error("callbacks is required");
    if (!ack) throw new Error("ack is required");
    if (!store) throw new Error("store is required");
    if (typeof callbackBaseUrl !== "string") {
      throw new Error("callbackBaseUrl is required");
    }
    if (!workflowFile) throw new Error("workflowFile is required");
    // A non-empty static repo is required in single-tenant mode; multi-tenant
    // mode derives the repo per request from the resolved tenant, so an empty
    // string is accepted (the dispatch falls back to `tenant.repo`).
    if (typeof githubRepo !== "string") {
      throw new Error("githubRepo is required");
    }
    if (!tokenResolver) throw new Error("tokenResolver is required");
    if (!tenantResolver) throw new Error("tenantResolver is required");
    if (!clock) throw new Error("clock is required");
    this.#callbacks = callbacks;
    this.#ack = ack;
    this.#store = store;
    this.#callbackBaseUrl = callbackBaseUrl;
    this.#workflowFile = workflowFile;
    this.#githubRepo = githubRepo;
    this.#tokenResolver = tokenResolver;
    this.#tenantResolver = tenantResolver;
    this.#clock = clock;
  }

  /**
   * @param {object} args
   * @param {object} args.ctx - Discussion context record (mutated)
   * @param {string} args.prompt
   * @param {string} args.requester - Surface user id of the triggering human
   * @param {object} args.callbackMeta - Stored on the callback token
   * @param {unknown} [args.ackTarget] - If omitted, no acknowledgement is started
   * @param {object} [args.workflowInputs] - Extra fields for `dispatchWorkflow`
   * @returns {Promise<{kind: "dispatched", token: string, correlationId: string} | {kind: "link_required", authorizeUrl: string} | {kind: "reauth_required"} | {kind: "transient", error: Error}>}
   */
  async dispatch({
    ctx,
    prompt,
    requester,
    callbackMeta,
    ackTarget,
    workflowInputs,
  }) {
    if (!ctx) throw new Error("ctx is required");
    if (typeof prompt !== "string") throw new Error("prompt is required");
    if (typeof requester !== "string") throw new Error("requester is required");

    // Resolve the tenant before the dispatch credential. The hosted dispatch
    // identity is a repo-scoped App installation token (see design § Hosted
    // dispatch identity), so a token resolver that mints per repo needs the
    // resolved tenant's `repo`. The third argument is additive — the
    // self-hosted `TokenResolver` (per-user OAuth) ignores it.
    const tenant = await this.#tenantResolver.resolve({
      channel: ctx.channel,
      key: ctx.channel_tenant_key,
    });
    if (!tenant) {
      return { kind: "transient", error: new Error("tenant_unresolved") };
    }
    const tenant_id = tenant.tenant_id;

    const auth = await this.#tokenResolver.resolve(
      ctx.channel,
      requester,
      tenant,
    );
    if (auth.kind !== "token") return { ...auth, tenant_id };

    const correlationId = randomUUID();
    const mergedMeta = { ...(callbackMeta ?? {}), requester, tenant_id };
    const token = this.#callbacks.register(correlationId, mergedMeta);
    ctx.pending_callbacks[token] = correlationId;
    ctx.active_requester = requester;
    const callbackUrl = `${this.#callbackBaseUrl}/api/callback/${tenant_id}/${token}`;
    const inboxUrl = `${this.#callbackBaseUrl}/api/inbox/${tenant_id}/${correlationId}`;

    // The workflow_dispatch targets the resolved tenant's repository when the
    // resolver supplies one (multi-tenant); otherwise the static configured
    // repo (single-tenant). Both modes fire against the customer's runner.
    const dispatchRepo = tenant.repo
      ? `${tenant.repo.owner}/${tenant.repo.name}`
      : this.#githubRepo;

    if (ackTarget !== undefined) await this.#ack.start(token, ackTarget);
    try {
      await dispatchWorkflow({
        workflowFile: this.#workflowFile,
        repo: dispatchRepo,
        token: auth.token,
        prompt,
        callbackUrl,
        correlationId,
        inboxUrl,
        ...(workflowInputs ?? {}),
      });
      ctx.dispatches.push(this.#clock.now());
      ctx.last_active_at = this.#clock.now();
      await this.#store.add(ctx);
      await this.#store.flush();
      return { kind: "dispatched", token, correlationId };
    } catch (err) {
      if (ackTarget !== undefined) await this.#ack.finish(token, ackTarget);
      this.#callbacks.consume(token, { tenant_id });
      delete ctx.pending_callbacks[token];
      ctx.active_requester = null;
      throw err;
    }
  }
}
