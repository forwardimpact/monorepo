import express from "express";

/**
 * Create the channel-agnostic HTTP server that bridges (ghbridge, msbridge)
 * share. The server mounts two routes:
 *   - `OPTIONS|POST <webhookPath>` — channel-specific intake (raw body
 *     available on `req.rawBody` for signature verification).
 *   - `POST /api/callback/:token` — workflow → bridge reply intake.
 *
 * The caller owns lifecycle (start/stop). Returning the `app` exposes the
 * underlying express instance so adapters can mount additional health or
 * diagnostic routes. `address()` returns the bound `{ port }` once started
 * (useful for tests that bind to port 0).
 *
 * @param {object} options
 * @param {{host?: string, port: number}} options.config - host/port
 * @param {object} options.logger
 * @param {object} [options.tracer]
 * @param {string} options.webhookPath - e.g. `/api/messages` or `/api/webhooks/github`
 * @param {(req: import("express").Request, res: import("express").Response) => Promise<void> | void} options.onWebhook
 * @param {(req: import("express").Request, res: import("express").Response) => Promise<void> | void} options.onCallback
 * @returns {{ start: () => Promise<void>, stop: () => Promise<void>, app: import("express").Express, address: () => ({port: number} | null) }}
 */
export function createBridgeServer({
  config,
  logger,
  tracer: _tracer,
  webhookPath,
  onWebhook,
  onCallback,
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

  const app = express();
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.options(webhookPath, (_req, res) => {
    res.status(200).end();
  });

  app.post(webhookPath, async (req, res) => {
    try {
      await onWebhook(req, res);
    } catch (err) {
      logger.error("bridge.webhook", err);
      if (!res.headersSent) res.status(500).json({ error: "Webhook failure" });
    }
  });

  app.post("/api/callback/:token", async (req, res) => {
    try {
      await onCallback(req, res);
    } catch (err) {
      logger.error("bridge.callback", err);
      if (!res.headersSent) res.status(500).json({ error: "Callback failure" });
    }
  });

  let server = null;

  return {
    app,
    address() {
      if (!server) return null;
      const addr = server.address();
      if (!addr || typeof addr === "string") return null;
      return { port: addr.port };
    },
    async start() {
      const { host, port } = config;
      await new Promise((resolve) => {
        server = app.listen(port, host, () => {
          logger.info("bridge.server", "listening", { host, port });
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
