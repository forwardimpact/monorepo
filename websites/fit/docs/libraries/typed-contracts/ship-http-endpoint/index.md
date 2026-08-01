---
title: Ship an HTTP Service Endpoint
description: Mount Hono routes on a configured app and call start(). Security headers, a health check, body limits, and graceful shutdown come for free.
---

Not every service speaks gRPC. An OAuth callback, a webhook receiver, or an SDK
transport needs plain HTTP. The transport scaffolding is the same every time:
security headers, a `/health` endpoint, a request-size limit, a consistent error
response, a bound port, and a clean shutdown. `@forwardimpact/libhttp` owns that
scaffolding so you write only your routes.

`createHttpService` is the HTTP counterpart to the gRPC `Server` that
[Ship a Service Endpoint](/docs/libraries/typed-contracts/ship-endpoint/)
covers. It wraps [Hono](https://hono.dev) and `@hono/node-server`. You mount
routes through a `configure` callback. Then you call `start()`.

## Prerequisites

- Node.js 22+
- `@forwardimpact/libhttp` installed:

```sh
npm install @forwardimpact/libhttp
```

## Mount routes and start

A service is one call. Pass a name, a bind `config`, a logger, and a `configure`
callback that mounts your routes on the Hono `app`:

```js
import { createHttpService } from "@forwardimpact/libhttp";

const service = createHttpService({
  name: "greeter",
  config: { host: "127.0.0.1", port: 8080 },
  logger,
  configure(app, { logger }) {
    app.get("/greet/:name", (c) => {
      const name = c.req.param("name");
      logger.info("greeter.greet", name);
      return c.json({ message: `Hello, ${name}!` });
    });
  },
});

await service.start();
// greeter.server listening { host: "127.0.0.1", port: 8080 }
```

The `configure` callback runs *after* the standard middleware, so every route
you mount inherits the security headers and body limit automatically. The second
argument carries the injected `logger` and the `tracer` (when you supply one).
Handlers can then log and open spans without module-level globals.

The returned service object has four members:

| Member        | Purpose                                                       |
| ------------- | ------------------------------------------------------------- |
| `app`         | The underlying Hono instance, for tests or extra wiring       |
| `start()`     | Binds the socket and resolves after the server listens        |
| `stop()`      | Graceful shutdown. Runs `onStop`, then closes the socket      |
| `address()`   | The bound `{ port }`, or `null` before `start()`              |

Pass `port: 0` to let the OS pick a free port, then read it back with
`address()`. This is the usual pattern in tests:

```js
await service.start();
const { port } = service.address();
const res = await fetch(`http://127.0.0.1:${port}/health`);
```

## What you get for free

The standard middleware runs before your routes, so the following hold for every
request without any code in `configure`:

| Concern            | Behaviour                                                   |
| ------------------ | ---------------------------------------------------------- |
| Security headers   | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Cache-Control: no-store` |
| Health check       | `GET /health` returns `{ "status": "ok" }`                |
| Body limit         | The service rejects requests over the limit with `413`     |
| Error envelope     | An uncaught handler error becomes `{ "error": "server_error" }` with status `500` |
| Graceful shutdown  | `stop()` runs your `onStop`, then closes the socket        |

### Health check

`createHttpService` mounts `GET /health` before your routes. The route resolves
even if a route in `configure` registers a catch-all. A load balancer or an
orchestrator can poll it with no extra code:

```sh
curl -s http://127.0.0.1:8080/health
```

```json
{ "status": "ok" }
```

### Body limit

The default request-body limit is 1 MB. That is generous for JSON. Override it
with `bodyLimit` (in bytes). The service rejects a request whose body exceeds
the limit. It returns `413` before the request reaches your handler:

```js
const service = createHttpService({
  name: "echo",
  config,
  logger,
  bodyLimit: 64 * 1024, // 64 KB
  configure(app) {
    app.post("/echo", async (c) => c.json(await c.req.json()));
  },
});
```

Set `bodyLimit: 0` to disable the limit. Do this only when a handler reads the
raw request stream itself. An SDK transport that consumes the body directly is
one example. The body-limit middleware would otherwise drain the stream.

### Error envelope

The service catches any error a handler throws. It returns a 500 with a stable
shape. It logs the error message under the `{name}.error` tag:

```json
{ "error": "server_error" }
```

To return a specific status instead, throw an `HTTPException` from Hono. It
carries its own status and response. The envelope renders them directly. The
`413` from the body limit works the same way.

## Shut down cleanly

Signal handlers live at the entry point. They do not live in the library.
Process-exit decisions belong at the composition root. Wire `SIGINT` and
`SIGTERM` to `stop()` in your `server.js`:

```js
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => service.stop());
}
```

`stop()` runs the optional `onStop` callback first. Then it closes the socket it
listens on. Use `onStop` to release the resources your routes acquired. Close
database sessions, clear timers, and flush buffers:

```js
const service = createHttpService({
  name: "sessions",
  config,
  logger,
  configure(app) {
    /* routes that open sessions */
  },
  async onStop() {
    await sessionStore.closeAll();
  },
});
```

## A complete, runnable example

This service mounts one route. It starts on an OS-assigned port. It exercises
the free `/health` endpoint and the security headers. Then it shuts down:

```js
import { createHttpService } from "@forwardimpact/libhttp";

const logger = {
  info: (tag, msg, meta) => console.log(`[info] ${tag} ${msg}`, meta ?? ""),
  error: (tag, msg) => console.error(`[error] ${tag} ${msg}`),
};

const service = createHttpService({
  name: "greeter",
  config: { host: "127.0.0.1", port: 0 }, // 0 = pick a free port
  logger,
  bodyLimit: 64 * 1024,
  configure(app, { logger }) {
    app.get("/greet/:name", (c) => {
      logger.info("greeter.greet", c.req.param("name"));
      return c.json({ message: `Hello, ${c.req.param("name")}!` });
    });
  },
  async onStop() {
    logger.info("greeter.stop", "cleaning up");
  },
});

await service.start();
const { port } = service.address();

const health = await fetch(`http://127.0.0.1:${port}/health`);
console.log("GET /health ->", health.status, await health.json());
console.log("  X-Content-Type-Options:", health.headers.get("x-content-type-options"));

const greet = await fetch(`http://127.0.0.1:${port}/greet/Ada`);
console.log("GET /greet/Ada ->", greet.status, await greet.json());

await service.stop();
```

When you run it, the script prints:

```text
[info] greeter.server listening { host: '127.0.0.1', port: 51949 }
GET /health -> 200 { status: 'ok' }
  X-Content-Type-Options: nosniff
GET /greet/Ada -> 200 { message: 'Hello, Ada!' }
[info] greeter.stop cleaning up
stopped cleanly
```

## Verify

You reach the outcome of this guide when:

- `start()` logs `listening`. `address()` returns the bound port.
- `GET /health` returns `200` with `{ "status": "ok" }`.
- Every response carries `X-Content-Type-Options`, `X-Frame-Options`, and
  `Cache-Control` headers.
- The service rejects a request body over `bodyLimit` with `413`.
- `stop()` runs `onStop`. The process exits and leaves no open socket.

## What's next

<div class="grid">

<!-- part:card:.. -->
<!-- part:card:../ship-endpoint -->

</div>
