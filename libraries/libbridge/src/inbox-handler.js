import { bridge } from "@forwardimpact/libtype";
import { createDefaultClock } from "@forwardimpact/libutil/runtime";

/**
 * Long-poll handler for the per-correlation inbox. The run's InboxPoller
 * fetches injected messages via this endpoint.
 *
 * @param {object} deps
 * @param {object} deps.client - Bridge gRPC client with DrainInbox
 * @param {object} deps.logger
 * @param {number} [deps.pollTimeoutMs] - Max wait before returning empty (default 30s)
 * @param {number} [deps.pollIntervalMs] - Poll interval (default 1s)
 * @param {import("@forwardimpact/libutil/runtime").Runtime["clock"]} [deps.clock]
 * @returns {(c: import("hono").Context) => Promise<Response>}
 */
export function createInboxHandler({
  client,
  logger,
  pollTimeoutMs = 30_000,
  pollIntervalMs = 1_000,
  clock = createDefaultClock(),
}) {
  return async (c) => {
    const correlationId = c.req.param("correlationId");
    const sinceSeq = parseInt(c.req.query("since") ?? "0", 10);
    const deadline = clock.now() + pollTimeoutMs;

    while (clock.now() < deadline) {
      try {
        const result = await client.DrainInbox(
          bridge.DrainInboxRequest.fromObject({
            correlation_id: correlationId,
            since_seq: sinceSeq,
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
