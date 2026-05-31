import { Hono } from "hono";
import { bodyLimit as honoBodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { serve } from "@hono/node-server";

const DEFAULT_BODY_LIMIT = 1024 * 1024; // 1 MB — generous for JSON payloads.

/**
 * Create a standard HTTP service backed by Hono + `@hono/node-server`.
 *
 * This is the HTTP counterpart to `librpc`'s `Server`: it owns the transport
 * boilerplate (security headers, body-size limit, a global error envelope, a
 * health endpoint, port binding, `address()`, graceful `stop()`) so a service
 * only writes its routes. Routes are mounted by the caller through the
 * `configure` callback — the "app callback" — keeping the developer experience
 * a thin factory over Hono.
 *
 * Signal handling is intentionally NOT registered here. The entry point
 * (`server.js`, the bin shim) owns wiring `SIGINT`/`SIGTERM` to `stop()`,
 * keeping process-exit decisions at the composition root rather than buried in
 * a shared library.
 *
 * @param {object} options
 * @param {string} options.name - Service name, used for log tags (e.g. `"oauth"`).
 * @param {{host?: string, port: number}} options.config - Bind host/port.
 * @param {object} options.logger - Logger with `.info()` / `.error()`.
 * @param {object} [options.tracer] - Optional tracer, forwarded to `configure`.
 * @param {object} [options.runtime] - Optional ambient-collaborator bag. Unused
 *   by the core wiring (network I/O only); accepted and forwarded to
 *   `configure` so a host can inject runtime collaborators without changing the
 *   factory signature.
 * @param {(app: import("hono").Hono, ctx: {config: object, logger: object, tracer?: object, runtime?: object}) => void} options.configure
 *   Mounts the service's routes/middleware on `app`. Runs after the standard
 *   middleware so service routes inherit security headers and the body limit.
 * @param {number|false} [options.bodyLimit] - Max request body in bytes. Pass
 *   `0`/`false` to disable (required when a handler reads the raw request
 *   stream itself, e.g. an SDK transport). Defaults to 1 MB.
 * @param {string|false} [options.health] - Path for the auto-mounted health
 *   route, or `false` to disable. Defaults to `"/health"`.
 * @param {() => (void | Promise<void>)} [options.onStop] - Optional cleanup run
 *   during `stop()` before the socket closes (e.g. close sessions, clear timers).
 * @returns {{ app: import("hono").Hono, address: () => ({port: number} | null), start: () => Promise<void>, stop: () => Promise<void> }}
 */
export function createHttpService({
  name,
  config,
  logger,
  tracer,
  runtime,
  configure,
  bodyLimit = DEFAULT_BODY_LIMIT,
  health = "/health",
  onStop,
}) {
  if (!name) throw new Error("name is required");
  if (!config) throw new Error("config is required");
  if (!logger) throw new Error("logger is required");
  if (typeof configure !== "function") {
    throw new Error("configure is required");
  }

  const app = new Hono();

  // Global error envelope — any uncaught handler error becomes a 500.
  // `HTTPException`s (e.g. the body-limit 413, or an explicit `throw`) carry
  // their own status/response and render it directly.
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    logger.error(`${name}.error`, err.message);
    return c.json({ error: "server_error" }, 500);
  });

  // Security headers — standard hardening for a backend service.
  app.use("*", async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header("Cache-Control", "no-store");
  });

  // Request body size limit. Disabled when falsy so handlers that consume the
  // raw request stream themselves keep an untouched body.
  if (bodyLimit) {
    app.use("*", honoBodyLimit({ maxSize: bodyLimit }));
  }

  // Health endpoint — mounted before service routes so it always resolves
  // ahead of any catch-all the service registers in `configure`.
  if (health) {
    app.get(health, (c) => c.json({ status: "ok" }));
  }

  configure(app, { config, logger, tracer, runtime });

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
          logger.info(`${name}.server`, "listening", {
            host,
            port: info?.port ?? port,
          });
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
