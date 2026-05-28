import { validateCallbackPayload } from "./callback-payload.js";

/**
 * Thrown from a `handleReply` callback to short-circuit `createCallbackHandler`
 * with a specific HTTP status (e.g. 410 when a conversation reference is
 * missing). The handler emits the response without logging the throw as an
 * error.
 */
export class CallbackHandlerError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   */
  constructor(status, message) {
    super(message);
    this.name = "CallbackHandlerError";
    this.status = status;
  }
}

/**
 * Build the Hono `onCallback` handler that both bridges share. The handler:
 *
 *   1. Consumes the callback token from `CallbackRegistry`.
 *   2. Finishes the acknowledgement.
 *   3. Validates the JSON body with the lenient libbridge validator.
 *   4. Checks the `correlation_id` matches the consumed token.
 *   5. Loads the discussion context for `(channel, discussionId)`.
 *   6. Hands `(ctx, payload, meta)` to the caller's `handleReply` to post
 *      replies, append history, and apply the verdict.
 *   7. Flushes the store and emits a span.
 *
 * `handleReply` may throw `new CallbackHandlerError(status, message)` to
 * short-circuit with a specific HTTP status.
 *
 * @param {object} options
 * @param {string} options.channel
 * @param {import("./callback-registry.js").CallbackRegistry} options.callbacks
 * @param {import("./acknowledgement.js").Acknowledgement} options.ack
 * @param {import("./index.js").DiscussionAdapter} options.store
 * @param {{debug?: Function, error?: Function}} options.logger
 * @param {{startSpan: Function}} options.tracer
 * @param {string} options.spanName
 * @param {(meta: object) => string} options.loadDiscussionId
 * @param {(meta: object) => unknown} [options.ackFinishTarget]
 * @param {(ctx: object, payload: object, meta: object) => Promise<void>} options.handleReply
 * @returns {(c: object) => Promise<Response>}
 */
export function createCallbackHandler({
  channel,
  callbacks,
  ack,
  store,
  logger,
  tracer,
  spanName,
  loadDiscussionId,
  ackFinishTarget,
  handleReply,
}) {
  if (!channel) throw new Error("channel is required");
  if (!callbacks) throw new Error("callbacks is required");
  if (!ack) throw new Error("ack is required");
  if (!store) throw new Error("store is required");
  if (!logger) throw new Error("logger is required");
  if (!tracer) throw new Error("tracer is required");
  if (!spanName) throw new Error("spanName is required");
  if (typeof loadDiscussionId !== "function") {
    throw new Error("loadDiscussionId is required");
  }
  if (typeof handleReply !== "function") {
    throw new Error("handleReply is required");
  }

  return async (c) => {
    const prelude = await resolveContext(c, {
      callbacks,
      ack,
      store,
      channel,
      logger,
      loadDiscussionId,
      ackFinishTarget,
    });
    if (prelude.error) return c.json({ error: prelude.error }, prelude.status);

    const { token, ctx, meta, payload } = prelude;
    delete ctx.pending_callbacks[token];
    return runHandleReply(c, {
      ctx,
      meta,
      payload,
      handleReply,
      store,
      logger,
      tracer,
      spanName,
    });
  };
}

async function resolveContext(
  c,
  { callbacks, ack, store, channel, logger, loadDiscussionId, ackFinishTarget },
) {
  const token = c.req.param("token");
  const meta = callbacks.consume(token);
  if (!meta) {
    logger.debug?.("callback", "unknown token");
    return { status: 404, error: "Unknown callback token" };
  }
  await ack.finish(token, ackFinishTarget ? ackFinishTarget(meta) : undefined);

  let body;
  try {
    body = await c.req.json();
  } catch {
    return { status: 400, error: "Invalid JSON" };
  }
  const payload = validateCallbackPayload(body);
  if (!payload) return { status: 400, error: "Invalid payload" };
  if (payload.correlation_id !== meta.correlationId) {
    return { status: 400, error: "Correlation ID mismatch" };
  }

  const discussionId = loadDiscussionId(meta);
  const ctx = await store.loadByChannel(channel, discussionId);
  if (!ctx) {
    logger.error?.("callback", "context missing", {
      discussion_id: discussionId,
    });
    return { status: 410, error: "Discussion context missing" };
  }
  return { token, ctx, meta, payload };
}

const STATUS_MESSAGES = {
  400: "Bad request",
  404: "Not found",
  410: "Gone",
  429: "Too many requests",
  500: "Internal error",
};

/** Map a CallbackHandlerError status to a safe generic message. */
function sanitizeErrorMessage(status) {
  return STATUS_MESSAGES[status] ?? `Error ${status}`;
}

async function runHandleReply(
  c,
  { ctx, meta, payload, handleReply, store, logger, tracer, spanName },
) {
  const span = tracer.startSpan(spanName, {
    kind: "SERVER",
    attributes: { correlation_id: meta.correlationId },
  });
  try {
    await handleReply(ctx, payload, meta);
    ctx.last_active_at = Date.now();
    await store.add(ctx);
    await store.flush();
    span.addEvent("reply_delivered", { verdict: payload.verdict });
    span.setOk();
    return c.json({ ok: true }, 200);
  } catch (err) {
    if (err instanceof CallbackHandlerError) {
      span.addEvent("short_circuit", { status: err.status });
      span.setOk();
      return c.json({ error: sanitizeErrorMessage(err.status) }, err.status);
    }
    logger.error?.("callback", err, {
      correlation_id: meta.correlationId,
    });
    span.setError(err);
    return c.json({ error: "Failed to deliver reply" }, 500);
  } finally {
    await span.end();
  }
}
