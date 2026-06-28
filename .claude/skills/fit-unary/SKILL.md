---
name: fit-unary
description: >
  Make a single unary gRPC call to a running service from the command line, with
  a JSON request and a JSON response. Use when you need to probe or smoke-test a
  gRPC endpoint without writing a client.
---

# Call a gRPC Service

`fit-unary` makes one unary gRPC call to a named service method, sends a JSON
request body, and prints the JSON response. It reuses the typed client transport
— authentication, tracing, retries — so a quick call behaves like the real
client without you writing one.

## When to Use

- Probe a gRPC method by hand —
  `npx fit-unary memory GetWindow '{"resource_id":"..."}'`
- Smoke-test an endpoint after deploying it
- Inspect a method's response shape during development

## Usage

```sh
npx fit-unary <service> <method> '<json-request>'
```

Example:

```sh
npx fit-unary memory GetWindow '{"resource_id":"..."}'
```

The first two positionals name the service and method; the optional third is the
request body as JSON (defaults to `{}`). The response is printed as pretty JSON.
The call resolves the service endpoint and credentials from the same
configuration the typed client uses.

## Documentation

- [Ship a Service Endpoint](https://www.forwardimpact.team/docs/libraries/typed-contracts/ship-endpoint/index.md)
  — Ship and consume a gRPC service with typed contracts, authentication,
  retries, and health checks; `fit-unary` is the command-line client for it.
- [Keep Types Synced with Proto Definitions](https://www.forwardimpact.team/docs/libraries/typed-contracts/index.md)
  — The full workflow for defining proto contracts and generating typed base
  classes and clients.
