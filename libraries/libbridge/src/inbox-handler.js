import { bridge } from "@forwardimpact/libtype";

/**
 * Long-poll handler for the per-correlation inbox. The run's InboxPoller
 * fetches injected messages via this endpoint.
 *
 * The handler verifies the path `tenant_id` against the tenant bound to
 * the `correlationId` in `callbacks` (the `CallbackRegistry`) before
 * entering the poll loop. Unknown or mismatched correlations return
 * `404 {error: "Unknown correlation"}` — the same shape the sister
 * callback route emits for an unknown token (`callback-handler.js:100`).
 *
 * @param {object} deps
 * @param {object} deps.client - Bridge gRPC client with DrainInbox
 * @param {object} deps.logger
 * @param {import("./callback-registry.js").CallbackRegistry} deps.callbacks
 * @param {number} [deps.pollTimeoutMs] - Max wait before returning empty (default 30s)
 * @param {number} [deps.pollIntervalMs] - Poll interval (default 1s)
 * @param {import("@forwardimpact/libutil/runtime").Runtime["clock"]} [deps.clock]
 * @returns {(c: import("hono").Context) => Promise<Response>}
 */
export function createInboxHandler({
  client,
  logger,
  callbacks,
  pollTimeoutMs = 30_000,
  pollIntervalMs = 1_000,
  clock,
}) {
  if (!clock) throw new Error("clock is required");
  if (!callbacks) throw new Error("callbacks is required");
  return async (c) => {
    const tenant_id = c.req.param("tenant_id");
    const correlationId = c.req.param("correlationId");
    const bound = callbacks.tenantOf(correlationId);
    if (!bound || bound !== tenant_id) {
      logger.debug?.("inbox", "unknown correlation");
      return c.json({ error: "Unknown correlation" }, 404);
    }
    const sinceSeq = parseInt(c.req.query("since") ?? "0", 10);
    const deadline = clock.now() + pollTimeoutMs;

    while (clock.now() < deadline) {
      try {
        const result = await client.DrainInbox(
          bridge.DrainInboxRequest.fromObject({
            correlation_id: correlationId,
            since_seq: sinceSeq,
            tenant_id,
          }),
        );
        if (result.messages?.length > 0) {
          return c.json({ messages: result.messages });
        }
      } catch (err) {
        logger.error?.("inbox", err);
        return c.json({ error: "Inbox failure" }, 500);
      }
      await clock.sleep(pollIntervalMs);
    }
    return c.json({ messages: [] });
  };
}
