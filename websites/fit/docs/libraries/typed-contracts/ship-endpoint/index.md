---
title: Ship a Service Endpoint
description: Ship a gRPC service with typed contracts, authentication, retries, and health checks — without reimplementing transport.
---

You need to expose business logic over gRPC or consume an existing gRPC service.
The transport layer -- connection management, authentication, retries, health
checks -- is the same every time, and copying it from the last project means
copying its bugs too. `@forwardimpact/librpc` gives you a typed server and
client that handle transport so you write only the business logic.

For the full workflow of defining proto contracts and generating typed base
classes and clients, see
[Typed Contracts](/docs/libraries/typed-contracts/).

## Prerequisites

- Node.js 18+
- `@forwardimpact/librpc` installed:

```sh
npm install @forwardimpact/librpc
```

- Generated service definitions produced by `npx fit-codegen --all` (this
  creates the typed base classes and client classes that `@forwardimpact/librpc`
  re-exports)
- The `SERVICE_SECRET` environment variable set (a string of at least 32
  characters, shared between server and client for HMAC authentication)

## Create a service

Every service follows the same three-step pattern: extend the generated base
class, construct a `Server`, and start it.

### Step 1 -- Implement the base class

The codegen pipeline produces a base class for each proto service definition.
The base class declares every RPC method as an abstract stub that throws
`"not implemented"`. Your service extends it and provides the real logic:

```js
import { services } from "@forwardimpact/librpc";

const { GraphBase } = services;

export class GraphService extends GraphBase {
  #graphIndex;

  constructor(config, graphIndex) {
    super(config);
    this.#graphIndex = graphIndex;
  }

  async GetSubjects(req) {
    const subjects = await this.#graphIndex.getSubjects(req.type || null);
    const lines = Array.from(subjects.entries())
      .map(([subject, type]) => `${subject}\t${type}`)
      .sort();
    return { content: lines.join("\n") };
  }

  // Override every RPC method declared in the proto definition.
  // Methods you skip will throw "not implemented" at runtime.
}
```

Each method receives a typed request object and returns a plain response object.
The generated `getHandlers()` method on the base class takes care of validating
inbound requests and converting them from wire format.

### Step 2 -- Bootstrap the server

The entry point creates config, observability, domain dependencies, and the
server:

```js
#!/usr/bin/env node
import { Server, createTracer } from "@forwardimpact/librpc";
import { createServiceConfig } from "@forwardimpact/libconfig";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createGraphIndex } from "@forwardimpact/libgraph";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { GraphService } from "./index.js";

const runtime = createDefaultRuntime();
const config = await createServiceConfig("graph");
const logger = createLogger("graph", runtime);
const tracer = await createTracer("graph");

const graphIndex = createGraphIndex("graphs");
const service = new GraphService(config, graphIndex);
const server = new Server(service, config, { runtime, logger, tracer });

await server.start();
```

`Server` takes the service, its config, and an options bag. The `runtime` is
required -- it carries the process collaborators the server reads, including the
`SERVICE_SECRET` used for authentication. The `logger` and `tracer` are
optional. Build the runtime once at the entry point with `createDefaultRuntime`
and thread it through.

`Server` wraps every handler with HMAC authentication, distributed tracing, and
error handling. It also registers the standard gRPC health check at
`grpc.health.v1.Health/Check` automatically -- no extra code needed.

### What you get for free

| Concern              | Handled by                                |
| -------------------- | ----------------------------------------- |
| Authentication       | HMAC-SHA256 via `SERVICE_SECRET`          |
| Distributed tracing  | Automatic spans per RPC call              |
| Health checks        | `grpc.health.v1.Health/Check` registered  |
| Keepalive            | 30s ping interval, 10s timeout            |
| Graceful shutdown    | `SIGINT` / `SIGTERM` handlers             |
| Request validation   | Generated `getHandlers()` verifies types  |

## Authenticate with SERVICE_SECRET

Every call between a `librpc` client and server is authenticated with an
HMAC-SHA256 token. Both sides read the same shared secret from the
`SERVICE_SECRET` environment variable, so authentication needs no code -- only a
secret that is present in both processes.

```sh
export SERVICE_SECRET="a-shared-secret-of-at-least-32-characters"
```

The secret must be at least 32 characters; a shorter value is rejected when the
server or client starts. How tokens flow:

- The client signs a `{serviceId}:{timestamp}` payload with the secret and sends
  it as an `Authorization: Bearer <token>` metadata header on every call. This
  happens inside a client interceptor, so you never construct a token by hand.
- The server verifies the signature with a timing-safe comparison and rejects
  the call with `UNAUTHENTICATED` if the header is missing, malformed, expired,
  or signed with a different secret.
- Tokens are time-limited (a 60-second lifetime by default), so a captured token
  cannot be replayed indefinitely. The client mints a fresh token per call, so
  short lifetimes are invisible to callers.

The health check at `grpc.health.v1.Health/Check` is mounted without
authentication, so an orchestrator can probe liveness without holding the
secret.

## Keepalive

Both the server and the client open the channel with the same keepalive
settings, so long-lived streams survive idle periods and dead connections are
detected promptly:

| Setting                    | Value      | Effect                                      |
| -------------------------- | ---------- | ------------------------------------------- |
| Ping interval              | 30 seconds | A keepalive ping is sent every 30 seconds   |
| Ping timeout               | 10 seconds | A missing ack within 10 seconds drops the connection |
| Ping without active calls  | permitted  | Idle channels are kept warm                 |

These are applied for you when you construct a `Server` or call
`createClient` -- there is nothing to configure.

## Call an existing service

When you need to reach a service that is already running, use `createClient`.
It resolves the service name to connection details via `libconfig`, attaches
authentication, and returns a typed client with built-in retries.

```js
import { createClient, createTracer } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

const logger = createLogger("my-script", createDefaultRuntime());
const tracer = await createTracer("my-script");

const graphClient = await createClient("graph", logger, tracer);
```

The `logger` and `tracer` arguments are optional. Pass a `tracer` to thread
distributed tracing across the call: the client opens a `CLIENT` span per RPC
and propagates the trace context to the server, which opens a matching
`SERVER` span. Build the tracer once at the entry point with `createTracer`,
hand it to every client and server in that process, and a single trace then
spans the whole call chain. Omit both arguments for an ad-hoc client that does
not log or trace -- authentication and retries still apply.

### Make a unary call

The generated client class exposes a typed method for each RPC. Pass a request
object and receive the response:

```js
import { graph } from "@forwardimpact/libtype";

const req = new graph.SubjectsQuery({ type: "schema:Person" });
const result = await graphClient.GetSubjects(req);

console.log(result.content);
```

```text
https://acme.example/people/jane-doe	https://schema.org/Person
https://acme.example/people/john-smith	https://schema.org/Person
```

### How retries work

Transient failures are retried for you. The client wraps every unary and
streaming call in a retry policy with these defaults:

- **Up to 10 retries** before the call rejects with the underlying error.
- **Exponential backoff** starting at a 1-second base delay -- the wait roughly
  doubles each attempt, so a struggling service is not hammered.
- **Jitter** added to each delay, so a fleet of clients that all failed at the
  same moment does not retry in lockstep and create a thundering herd.

For a streaming call the retry covers connection establishment: once the first
chunk arrives the stream is considered connected and later errors surface on the
stream's `error` event rather than triggering a reconnect. A retried unary call
is transparent -- your `await` resolves with the eventual response or rejects
once retries are exhausted.

### Make a streaming call

For server-streaming RPCs, use `callStream` on the base `Client` class. It
returns a Node.js readable stream with `data`, `end`, and `error` events. An
optional third argument accepts a mapper function that transforms each chunk
before it reaches the `data` event:

```js
const stream = client.callStream("StreamEvents", { filter: "audit" });
stream.on("data", (chunk) => console.log("event:", chunk));
stream.on("end", () => console.log("stream complete"));
```

## Quick test with fit-unary

`fit-unary` is a CLI bundled with `@forwardimpact/librpc` for ad-hoc unary
calls. Pass the service name, method, and an optional JSON request body:

```sh
npx fit-unary graph GetSubjects '{"type":"schema:Person"}'
```

```json
{
  "content": "https://acme.example/people/jane-doe\thttps://schema.org/Person"
}
```

This is useful for verifying a service is reachable before writing client code.

## Verify

You have reached the outcome of this guide when:

- Your service class extends the generated base and implements every RPC method
  declared in the proto definition.
- `Server.start()` binds to the configured host and port, and
  `grpc.health.v1.Health/Check` responds with `SERVING`.
- `createClient` connects to a running service and `callUnary` returns typed
  responses.
- `fit-unary` returns JSON for a known service and method.

## What's next

<div class="grid">

<!-- part:card:.. -->
<!-- part:card:../ship-http-endpoint -->

</div>
