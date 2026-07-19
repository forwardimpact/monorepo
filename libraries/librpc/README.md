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

Every unary call carries one absolute gRPC deadline spanning all retry
attempts (default 60s, sized for the slowest unary in practice —
embedding model inference). A hung connection fails with
`DEADLINE_EXCEEDED`, and retryable errors (UNAVAILABLE and friends) keep
cycling only until the call's budget is spent — the first attempt past
the deadline fails immediately, and `DEADLINE_EXCEEDED` is not retried.
Override per service with the `deadline` config key (milliseconds) in
the service's config block; once the key exists there, the
`SERVICE_{NAME}_DEADLINE` env var overrides it. Streaming calls are
exempt: keepalive bounds them, and long-lived streams are legitimate.

## Documentation

- [Ship a Service Endpoint](https://www.forwardimpact.team/docs/libraries/typed-contracts/ship-endpoint/index.md)
  — ship and consume a gRPC service with typed contracts, authentication,
  retries, and health checks; `fit-unary` is the command-line client for it.
- [Keep Types Synced with Proto Definitions](https://www.forwardimpact.team/docs/libraries/typed-contracts/index.md)
  — the full workflow for defining proto contracts and generating typed base
  classes and clients.
