import { Hono } from "hono";
import { bodyLimit as honoBodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { serve } from "@hono/node-server";

const DEFAULT_BODY_LIMIT = 1024 * 1024; // 1 MB, generous for JSON payloads.

/**
 * Create a standard HTTP service on top of Hono and `@hono/node-server`.
 *
 * This is the HTTP counterpart to `librpc`'s `Server`. It owns the transport
 * boilerplate (security headers, body-size limit, a global error envelope, a
 * `/health` endpoint, the port bind, `address()`, graceful `stop()`) so a
 * service only writes its routes. The caller mounts routes through the
 * `configure` callback, the "app callback". The developer experience stays a
 * thin factory over Hono.
 *
 * This factory intentionally does NOT register signal handlers. The entry
 * point (`server.js`, the bin shim) wires `SIGINT`/`SIGTERM` to `stop()`.
 * Process-exit decisions stay at the composition root. A shared library does
 * not bury them.
 *
 * @param {object} options
 * @param {string} options.name - Service name for log tags (e.g. `"oauth"`).
 * @param {{host: string, port: number}} options.config - Bind host/port.
 * @param {object} options.logger - Logger with `.info()` / `.error()`.
 * @param {object} [options.tracer] - Tracer. Pass it alongside `logger`. The
 *   factory forwards it to `configure` so route handlers can open spans.
 * @param {(app: import("hono").Hono, deps: {logger: object, tracer?: object}) => void} options.configure
 *   Mounts the service's routes/middleware on `app`. Runs after the standard
 *   middleware so service routes inherit security headers and the body limit.
 * @param {number} [options.bodyLimit] - Max request body in bytes. Pass `0` to
 *   disable (required when a handler reads the raw request stream itself, e.g.
 *   an SDK transport). Defaults to 1 MB.
 * @param {() => (void | Promise<void>)} [options.onStop] - Optional cleanup.
 *   `stop()` runs it before the socket closes (e.g. close sessions, clear
 *   timers).
 * @returns {{ app: import("hono").Hono, address: () => ({port: number} | null), start: () => Promise<void>, stop: () => Promise<void> }}
 */
export function createHttpService({
  name,
  config,
  logger,
  tracer,
  configure,
  bodyLimit = DEFAULT_BODY_LIMIT,
  onStop,
}) {
  if (!name) throw new Error("name is required");
  if (!config) throw new Error("config is required");
  if (!logger) throw new Error("logger is required");
  if (typeof configure !== "function") {
    throw new Error("configure is required");
  }

  const app = new Hono();

  // Global error envelope. Any uncaught handler error becomes a 500.
  // `HTTPException`s (e.g. the body-limit 413, or an explicit `throw`) carry
  // their own status/response and render it directly.
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    logger.error(`${name}.error`, err.message);
    return c.json({ error: "server_error" }, 500);
  });

  // Security headers. This is standard hardening for a backend service.
  app.use("*", async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header("Cache-Control", "no-store");
  });

  // Request-body size limit. A value of 0 disables it, so handlers that
  // consume the raw request stream themselves keep an untouched body.
  if (bodyLimit) {
    app.use("*", honoBodyLimit({ maxSize: bodyLimit }));
  }

  // Health endpoint. This factory mounts it before service routes, so it
  // resolves ahead of any catch-all the service registers in `configure`.
  app.get("/health", (c) => c.json({ status: "ok" }));

  configure(app, { logger, tracer });

  let server = null;

  return {
    app,
    address() {
      const addr = server?.address();
      return addr ? { port: addr.port } : null;
    },
    async start() {
      const { host, port } = config;
      await new Promise((resolve) => {
        server = serve({ fetch: app.fetch, port, hostname: host }, (info) => {
          logger.info(`${name}.server`, "listening", { host, port: info.port });
          resolve();
        });
      });
    },
    async stop() {
      if (!server) return;
      if (onStop) await onStop();
      await new Promise((resolve) => server.close(() => resolve()));
      server = null;
    },
  };
}
