# libhttp

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

HTTP service framework — ship a Hono service endpoint without reimplementing
lifecycle, security headers, or health checks.

<!-- END:description -->

## Getting Started

`createHttpService` owns the transport boilerplate (security headers, body
limit, error envelope, `/health`, port binding, graceful `stop()`). The service
mounts its routes through the `configure` callback:

```js
import { createHttpService } from "@forwardimpact/libhttp";

const service = createHttpService({
  name: "example",
  config, // { host, port }
  logger,
  configure(app) {
    app.get("/hello", (c) => c.json({ hello: "world" }));
  },
});

await service.start();
// service.address() -> { port }
// service.stop()    -> graceful shutdown (runs optional onStop first)
```

Signal handling stays in the entry point (`server.js`), not the library:

```js
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => service.stop());
}
```

## Documentation

- [Ship an HTTP Service Endpoint](https://www.forwardimpact.team/docs/libraries/typed-contracts/ship-http-endpoint/index.md)
