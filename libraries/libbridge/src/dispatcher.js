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

  /**
   * @param {object} options
   * @param {import("./callback-registry.js").CallbackRegistry} options.callbacks
   * @param {import("./acknowledgement.js").Acknowledgement} options.ack
   * @param {import("./index.js").DiscussionAdapter} options.store
   * @param {string} options.callbackBaseUrl - Already normalised
   * @param {string} options.workflowFile
   * @param {string} options.githubRepo
   * @param {import("./token-resolver.js").TokenResolver} options.tokenResolver
   */
  constructor({
    callbacks,
    ack,
    store,
    callbackBaseUrl,
    workflowFile,
    githubRepo,
    tokenResolver,
  }) {
    if (!callbacks) throw new Error("callbacks is required");
    if (!ack) throw new Error("ack is required");
    if (!store) throw new Error("store is required");
    if (typeof callbackBaseUrl !== "string") {
      throw new Error("callbackBaseUrl is required");
    }
    if (!workflowFile) throw new Error("workflowFile is required");
    if (!githubRepo) throw new Error("githubRepo is required");
    if (!tokenResolver) throw new Error("tokenResolver is required");
    this.#callbacks = callbacks;
    this.#ack = ack;
    this.#store = store;
    this.#callbackBaseUrl = callbackBaseUrl;
    this.#workflowFile = workflowFile;
    this.#githubRepo = githubRepo;
    this.#tokenResolver = tokenResolver;
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

    const auth = await this.#tokenResolver.resolve(ctx.channel, requester);
    if (auth.kind !== "token") return auth;

    const correlationId = randomUUID();
    const mergedMeta = { ...(callbackMeta ?? {}), requester };
    const token = this.#callbacks.register(correlationId, mergedMeta);
    ctx.pending_callbacks[token] = correlationId;
    const callbackUrl = `${this.#callbackBaseUrl}/api/callback/${token}`;

    if (ackTarget !== undefined) await this.#ack.start(token, ackTarget);
    try {
      await dispatchWorkflow({
        workflowFile: this.#workflowFile,
        repo: this.#githubRepo,
        token: auth.token,
        prompt,
        callbackUrl,
        correlationId,
        ...(workflowInputs ?? {}),
      });
      ctx.dispatches.push(Date.now());
      ctx.last_active_at = Date.now();
      await this.#store.add(ctx);
      await this.#store.flush();
      return { kind: "dispatched", token, correlationId };
    } catch (err) {
      if (ackTarget !== undefined) await this.#ack.finish(token, ackTarget);
      this.#callbacks.consume(token);
      delete ctx.pending_callbacks[token];
      throw err;
    }
  }
}
