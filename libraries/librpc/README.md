# librpc

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

gRPC server and client framework — ship service endpoints without reimplementing
transport.

<!-- END:description -->

## Getting Started

```js
import { Server, Client, createClient, createTracer } from '@forwardimpact/librpc';
```

## Unary deadlines

Every unary call carries one absolute gRPC deadline. The deadline spans
all retry attempts. The default is 60s. That default matches the slowest
unary in practice (embedding model inference). A hung connection fails
with `DEADLINE_EXCEEDED`. Retryable errors (UNAVAILABLE and friends)
cycle only until the call spends its budget. The first attempt past the
deadline fails immediately. `DEADLINE_EXCEEDED` gets no retry. Override
the deadline per service with the `deadline` config key (milliseconds)
in the service's config block. Once the key exists there, the
`SERVICE_{NAME}_DEADLINE` env var overrides it. Streaming calls are
exempt. Keepalive bounds them, and long-lived streams are legitimate.

## Documentation

- [Ship a Service Endpoint](https://www.forwardimpact.team/docs/libraries/typed-contracts/ship-endpoint/index.md)
  — ship and consume a gRPC service with typed contracts, authentication,
  retries, and health checks. `fit-unary` is the command-line client for it.
- [Keep Types Synced with Proto Definitions](https://www.forwardimpact.team/docs/libraries/typed-contracts/index.md)
  — the full workflow to define proto contracts and generate typed base
  classes and clients.
