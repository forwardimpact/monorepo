import { randomUUID } from "node:crypto";

import { dispatchWorkflow } from "./dispatch.js";
import { appendHistory } from "./history.js";

/**
 * The standard "dispatch dance" both bridges perform: generate a
 * correlation ID, register the callback token, start the acknowledgement
 * (if `ackTarget` is supplied), fire the kata-dispatch workflow, append
 * history, push the dispatch timestamp, and flush the store. On failure
 * the acknowledgement is finished and the callback registration is rolled
 * back before the error rethrows.
 *
 * The caller still owns: loading/creating the context, checking the rate
 * limiter, and deciding the user-facing action when `dispatch()` throws.
 *
 * @example
 *   const { token, correlationId } = await dispatcher.dispatch({
 *     ctx,
 *     prompt,
 *     ackTarget: { subjectId: nodeId },
 *     historyText: text,
 *     callbackMeta: { discussionId },
 *     workflowInputs: { discussionId },
 *   });
 */
export class Dispatcher {
  #callbacks;
  #ack;
  #store;
  #callbackBaseUrl;
  #workflowFile;
  #githubRepo;
  #getGithubToken;

  /**
   * @param {object} options
   * @param {import("./callback-registry.js").CallbackRegistry} options.callbacks
   * @param {import("./acknowledgement.js").Acknowledgement} options.ack
   * @param {import("./discussion-context.js").DiscussionContextStore} options.store
   * @param {string} options.callbackBaseUrl - Already normalised
   * @param {string} options.workflowFile
   * @param {string} options.githubRepo
   * @param {() => Promise<string> | string} options.getGithubToken
   */
  constructor({
    callbacks,
    ack,
    store,
    callbackBaseUrl,
    workflowFile,
    githubRepo,
    getGithubToken,
  }) {
    if (!callbacks) throw new Error("callbacks is required");
    if (!ack) throw new Error("ack is required");
    if (!store) throw new Error("store is required");
    if (typeof callbackBaseUrl !== "string") {
      throw new Error("callbackBaseUrl is required");
    }
    if (!workflowFile) throw new Error("workflowFile is required");
    if (!githubRepo) throw new Error("githubRepo is required");
    if (typeof getGithubToken !== "function") {
      throw new Error("getGithubToken is required");
    }
    this.#callbacks = callbacks;
    this.#ack = ack;
    this.#store = store;
    this.#callbackBaseUrl = callbackBaseUrl;
    this.#workflowFile = workflowFile;
    this.#githubRepo = githubRepo;
    this.#getGithubToken = getGithubToken;
  }

  /**
   * @param {object} args
   * @param {object} args.ctx - Discussion context record (mutated)
   * @param {string} args.prompt
   * @param {object} args.callbackMeta - Stored on the callback token
   * @param {unknown} [args.ackTarget] - If omitted, no acknowledgement is started
   * @param {string} [args.historyText] - Appended to ctx.history as the user turn on success
   * @param {object} [args.workflowInputs] - Extra fields for `dispatchWorkflow`
   * @returns {Promise<{token: string, correlationId: string}>}
   */
  async dispatch({
    ctx,
    prompt,
    callbackMeta,
    ackTarget,
    historyText,
    workflowInputs,
  }) {
    if (!ctx) throw new Error("ctx is required");
    if (typeof prompt !== "string") throw new Error("prompt is required");

    const correlationId = randomUUID();
    const token = this.#callbacks.register(correlationId, callbackMeta ?? {});
    ctx.pending_callbacks[token] = correlationId;
    const callbackUrl = `${this.#callbackBaseUrl}/api/callback/${token}`;

    if (ackTarget !== undefined) await this.#ack.start(token, ackTarget);
    try {
      const ghToken = await this.#getGithubToken();
      await dispatchWorkflow({
        workflowFile: this.#workflowFile,
        repo: this.#githubRepo,
        token: ghToken,
        prompt,
        callbackUrl,
        correlationId,
        ...(workflowInputs ?? {}),
      });
      if (historyText !== undefined) {
        appendHistory(ctx.history, { role: "user", text: historyText });
      }
      ctx.dispatches.push(Date.now());
      ctx.last_active_at = Date.now();
      await this.#store.add(ctx);
      await this.#store.flush();
      return { token, correlationId };
    } catch (err) {
      if (ackTarget !== undefined) await this.#ack.finish(token, ackTarget);
      this.#callbacks.consume(token);
      delete ctx.pending_callbacks[token];
      throw err;
    }
  }
}
