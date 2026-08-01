---
name: fit-unary
description: >
  Make a single unary gRPC call to a live service from the command line, with
  a JSON request and a JSON response. Use when you need to probe or smoke-test
  a gRPC endpoint and you do not want to write a client.
---

# Call a gRPC Service

`fit-unary` makes one unary gRPC call to a named service method. It sends a
JSON request body and prints the JSON response. It reuses the typed client
transport, which covers authentication, tracing, and retries. So a quick call
behaves like the real client. You do not write one.

## When to Use

- Probe a gRPC method by hand —
  `npx fit-unary memory GetWindow '{"resource_id":"..."}'`
- Smoke-test an endpoint after you deploy it
- Inspect a method's response shape during development

## Usage

```sh
npx fit-unary <service> <method> '<json-request>'
```

Example:

```sh
npx fit-unary memory GetWindow '{"resource_id":"..."}'
```

The first two positionals name the service and the method. The optional third
positional is the request body as JSON (it defaults to `{}`). `fit-unary`
prints the response as pretty JSON. The call resolves the service endpoint and
credentials from the same configuration the typed client uses.

## Documentation

- [Ship a Service Endpoint](https://www.forwardimpact.team/docs/libraries/typed-contracts/ship-endpoint/index.md)
  — Ship and consume a gRPC service with typed contracts, authentication,
  retries, and health checks. `fit-unary` is the command-line client for it.
- [Keep Types Synced with Proto Definitions](https://www.forwardimpact.team/docs/libraries/typed-contracts/index.md)
  — The full workflow to define proto contracts and to generate typed base
  classes and clients.
