# libhttp

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

HTTP service framework — ship a Hono service endpoint without reimplementing
lifecycle, security headers, or health checks.

<!-- END:description -->

## Getting Started

`createHttpService` owns the transport boilerplate. It sets the security
headers, limits the body, formats the error envelope, serves `/health`, binds
the port, and stops gracefully with `stop()`. The service mounts its routes
through the `configure` callback:

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

The library does not handle signals. Handle them in the entry point
(`server.js`):

```js
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => service.stop());
}
```

## Documentation

- [Ship an HTTP Service Endpoint](https://www.forwardimpact.team/docs/libraries/typed-contracts/ship-http-endpoint/index.md)
