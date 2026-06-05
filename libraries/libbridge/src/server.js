import { createHttpService } from "@forwardimpact/libhttp";

/**
 * Create the channel-agnostic HTTP server that bridges (ghbridge, msbridge)
 * share. The server mounts two routes:
 *   - `OPTIONS|POST <webhookPath>` — channel-specific intake. The raw POST
 *     body is captured on `c.get("rawBody")` for signature verification.
 *   - `POST /api/callback/:tenant_id/:token` — workflow → bridge reply
 *     intake. Single-tenant deployments hit the same route with the literal
 *     `default` segment; multi-tenant deployments with the resolved tenant.
 *
 * Handlers receive Hono's context `c` (matching the monorepo standard) and
 * return a `Response` (or use `c.json` / `c.text` / `c.body`). The caller
 * owns lifecycle (start/stop). Returning the `app` exposes the underlying
 * Hono instance so adapters can mount additional health or diagnostic
 * routes. `address()` returns the bound `{ port }` once started (useful for
 * tests that bind to port 0).
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

  // Lifecycle, security headers, body limit, and the health route are owned by
  // `@forwardimpact/libhttp`. This factory only mounts the bridge routes (and
  // the raw-body capture they depend on) through the `configure` callback.
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
