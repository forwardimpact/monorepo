import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { serve } from "@hono/node-server";

/**
 * Create the channel-agnostic HTTP server that bridges (ghbridge, msbridge)
 * share. The server mounts two routes:
 *   - `OPTIONS|POST <webhookPath>` — channel-specific intake. The raw POST
 *     body is captured on `c.get("rawBody")` for signature verification.
 *   - `POST /api/callback/:token` — workflow → bridge reply intake.
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
  tracer: _tracer,
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

  const app = new Hono();

  // Security headers — standard hardening for a backend service.
  app.use("*", async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header("Cache-Control", "no-store");
  });

  // Request body size limit — 1 MB is generous for JSON callback payloads.
  app.use("*", bodyLimit({ maxSize: 1024 * 1024 }));

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

  app.post("/api/callback/:token", async (c) => {
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
    app.get("/api/inbox/:correlationId", async (c) => {
      try {
        return await onInbox(c);
      } catch (err) {
        logger.error("bridge.inbox", err);
        return c.json({ error: "Inbox failure" }, 500);
      }
    });
  }

  let server = null;

  return {
    app,
    address() {
      if (!server || typeof server.address !== "function") return null;
      const addr = server.address();
      if (!addr || typeof addr === "string") return null;
      return { port: addr.port };
    },
    async start() {
      const { host, port } = config;
      await new Promise((resolve) => {
        server = serve({ fetch: app.fetch, port, hostname: host }, (info) => {
          logger.info("bridge.server", "listening", {
            host,
            port: info?.port ?? port,
          });
          resolve();
        });
      });
    },
    async stop() {
      if (!server) return;
      await new Promise((resolve) => server.close(() => resolve()));
      server = null;
    },
  };
}
