import { createHttpService } from "@forwardimpact/libhttp";

/**
 * Create the channel-agnostic HTTP server that bridges (ghbridge, msbridge)
 * share. The server mounts two routes:
 *   - `OPTIONS|POST <webhookPath>` — channel-specific intake. The server
 *     captures the raw POST body on `c.get("rawBody")` for signature
 *     verification.
 *   - `POST /api/callback/:tenant_id/:token` — workflow → bridge reply
 *     intake. Single-tenant deployments hit the same route with the literal
 *     `default` segment. Multi-tenant deployments hit it with the resolved
 *     tenant.
 *
 * Handlers receive Hono's context `c`, which matches the monorepo standard.
 * Handlers return a `Response`, or they use `c.json` / `c.text` / `c.body`.
 * The caller owns the lifecycle (start/stop). The factory returns the
 * `app`, which exposes the underlying Hono instance. Adapters can then
 * mount extra health or diagnostic routes. `address()` returns the bound
 * `{ port }` after the server starts. This helps tests that bind to port 0.
 *
 * @param {object} options
 * @param {{host?: string, port: number}} options.config - host/port
 * @param {object} options.logger
 * @param {object} [options.tracer]
 * @param {string} options.webhookPath - e.g. `/api/messages` or `/api/webhooks/github`
 * @param {(c: import("hono").Context) => Promise<Response> | Response} options.onWebhook
 * @param {(c: import("hono").Context) => Promise<Response> | Response} options.onCallback
 * @param {((c: import("hono").Context) => Promise<Response> | Response)} [options.onLinkComplete]
 * @param {(c: import("hono").Context) => Promise<Response> | Response} [options.onInbox] - Long-poll inbox handler
 * @returns {{ start: () => Promise<void>, stop: () => Promise<void>, app: import("hono").Hono, address: () => ({port: number} | null) }}
 */
export function createBridgeServer({
  config,
  logger,
  tracer,
  webhookPath,
  onWebhook,
  onCallback,
  onLinkComplete,
  onInbox,
}) {
  if (!config) throw new Error("config is required");
  if (!logger) throw new Error("logger is required");
  if (!webhookPath) throw new Error("webhookPath is required");
  if (typeof onWebhook !== "function") {
    throw new Error("onWebhook is required");
  }
  if (typeof onCallback !== "function") {
    throw new Error("onCallback is required");
  }

  // `@forwardimpact/libhttp` owns the lifecycle, the security headers, the
  // body limit, and the health route. This factory only mounts the bridge
  // routes through the `configure` callback. It also mounts the raw-body
  // capture that those routes depend on.
  return createHttpService({
    name: "bridge",
    config,
    logger,
    tracer,
    configure(app) {
      // Capture the raw POST body once, before downstream handlers parse it.
      // Channel adapters use this buffer to verify HMAC signatures.
      app.use("*", async (c, next) => {
        if (c.req.method === "POST") {
          const buf = Buffer.from(await c.req.raw.clone().arrayBuffer());
          c.set("rawBody", buf);
        }
        await next();
      });

      app.options(webhookPath, (c) => c.body(null, 200));

      app.post(webhookPath, async (c) => {
        try {
          return await onWebhook(c);
        } catch (err) {
          logger.error("bridge.webhook", err);
          return c.json({ error: "Webhook failure" }, 500);
        }
      });

      app.post("/api/callback/:tenant_id/:token", async (c) => {
        try {
          return await onCallback(c);
        } catch (err) {
          logger.error("bridge.callback", err);
          return c.json({ error: "Callback failure" }, 500);
        }
      });

      if (onLinkComplete) {
        app.get("/api/link-complete", async (c) => {
          try {
            return await onLinkComplete(c);
          } catch (err) {
            logger.error("bridge.link-complete", err);
            return c.json({ error: "Link completion failure" }, 500);
          }
        });
      }

      if (onInbox) {
        app.get("/api/inbox/:tenant_id/:correlationId", async (c) => {
          try {
            return await onInbox(c);
          } catch (err) {
            logger.error("bridge.inbox", err);
            return c.json({ error: "Inbox failure" }, 500);
          }
        });
      }
    },
  });
}
