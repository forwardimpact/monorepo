---
title: Ship a Service Endpoint
description: Ship a gRPC service with typed contracts, authentication, retries, and health checks. You do not reimplement the transport.
---

You need to expose business logic over gRPC or consume an existing gRPC service.
The transport layer is the same every time. It holds the connections, the
authentication, the retries, and the health checks. If you copy it from the last
project, you copy its bugs too. `@forwardimpact/librpc` gives you a typed server
and a typed client that handle transport. You write only the business logic.

To define proto contracts and generate typed base classes and clients, see
[Typed Contracts](/docs/libraries/typed-contracts/) for the full workflow.

## Prerequisites

- Node.js 22+
- `@forwardimpact/librpc` installed:

```sh
npm install @forwardimpact/librpc
```

- Service definitions that `npx fit-codegen generate --all` produces (the
  command creates the typed base classes and client classes that
  `@forwardimpact/librpc` re-exports)
- The `SERVICE_SECRET` environment variable set (a string of at least 32
  characters that the server and the client share for HMAC authentication)

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
The generated `getHandlers()` method on the base class validates inbound
requests. It also converts them from wire format.

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
required. It carries the process collaborators the server reads. These include
the `SERVICE_SECRET` for authentication. The `logger` and `tracer` are optional.
Build the runtime once at the entry point with `createDefaultRuntime`. Thread it
through.

`Server` wraps every handler with HMAC authentication, distributed tracing, and
error handling. It also registers the standard gRPC health check at
`grpc.health.v1.Health/Check` automatically. You write no extra code.

### What you get for free

| Concern              | Handled by                                |
| -------------------- | ----------------------------------------- |
| Authentication       | HMAC-SHA256 with `SERVICE_SECRET`         |
| Distributed tracing  | Automatic spans per RPC call              |
| Health checks        | `grpc.health.v1.Health/Check` registered  |
| Keepalive            | 30s ping interval, 10s timeout            |
| Graceful shutdown    | `SIGINT` / `SIGTERM` handlers             |
| Request validation   | Generated `getHandlers()` verifies types  |

## Authenticate with SERVICE_SECRET

`librpc` authenticates every call between a client and a server with an
HMAC-SHA256 token. Both sides read the same shared secret from the
`SERVICE_SECRET` environment variable. Authentication needs no code. It needs
only a secret that is present in both processes.

```sh
export SERVICE_SECRET="a-shared-secret-of-at-least-32-characters"
```

The secret must be at least 32 characters. The server or the client rejects a
shorter value at start. How tokens flow:

- The client signs a `{serviceId}:{timestamp}` payload with the secret. It sends
  the payload as an `Authorization: Bearer <token>` metadata header on every
  call. This happens inside a client interceptor, so you never construct a token
  by hand.
- The server verifies the signature with a timing-safe comparison. It rejects
  the call with `UNAUTHENTICATED` if the header is missing, malformed, expired,
  or signed with a different secret.
- Tokens are time-limited, with a 60-second lifetime by default. Nobody can
  replay a captured token indefinitely. The client mints a fresh token per
  call, so callers do not notice the short lifetimes.

`Server` mounts the health check at `grpc.health.v1.Health/Check` without
authentication. An orchestrator can then probe liveness without the secret.

## Keepalive

Both the server and the client open the channel with the same keepalive
settings. Long-lived streams then survive idle periods. The keepalive also finds
dead connections promptly:

| Setting                    | Value      | Effect                                      |
| -------------------------- | ---------- | ------------------------------------------- |
| Ping interval              | 30 seconds | The channel sends a keepalive ping every 30 seconds |
| Ping timeout               | 10 seconds | A missing ack within 10 seconds drops the connection |
| Ping without active calls  | permitted  | Idle channels stay warm                     |

`Server` and `createClient` apply these settings for you. You configure nothing.

## Call an existing service

Use `createClient` when you need to reach a service that already runs. It
resolves the service name to connection details through `libconfig`. It attaches
authentication. It returns a typed client with built-in retries.

```js
import { createClient, createTracer } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

const logger = createLogger("my-script", createDefaultRuntime());
const tracer = await createTracer("my-script");

const graphClient = await createClient("graph", logger, tracer);
```

The `logger` and `tracer` arguments are optional. Pass a `tracer` to thread
distributed tracing across the call. The client opens a `CLIENT` span per RPC.
It propagates the trace context to the server. The server opens a matching
`SERVER` span. Build the tracer once at the entry point with `createTracer`.
Hand it to every client and server in that process. A single trace then spans
the whole call chain. Omit both arguments for an ad-hoc client that does not log
or trace. Authentication and retries still apply.

### Make a unary call

The generated client class exposes a typed method for each RPC. Pass a request
object. The call returns the response:

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

The client retries transient failures for you. It wraps every unary and
streaming call in a retry policy with these defaults:

- **Up to 10 retries** before the call rejects with the underlying error.
- **Exponential backoff** that starts at a 1-second base delay. The wait roughly
  doubles each attempt, so the client does not overload a service in trouble.
- **Jitter** that the client adds to each delay. A fleet of clients that all
  failed at the same moment then does not retry in lockstep. The clients create
  no thundering herd.

For a streaming call the retry covers the connection attempt. After the first
chunk arrives, the stream counts as connected. Later errors then surface on the
stream's `error` event. The stream does not reconnect. A retried unary call is
transparent. Your `await` resolves with the eventual response, or it rejects
after the client exhausts the retries.

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

`@forwardimpact/librpc` bundles the `fit-unary` CLI for ad-hoc unary calls. Pass
the service name, the method, and an optional JSON request body:

```sh
npx fit-unary graph GetSubjects '{"type":"schema:Person"}'
```

```json
{
  "content": "https://acme.example/people/jane-doe\thttps://schema.org/Person"
}
```

Use this to check that a service is reachable before you write client code.

## Verify

You reach the outcome of this guide when:

- Your service class extends the generated base and implements every RPC method
  declared in the proto definition.
- `Server.start()` binds to the configured host and port.
  `grpc.health.v1.Health/Check` responds with `SERVING`.
- `createClient` connects to a service that already runs. `callUnary` returns
  typed responses.
- `fit-unary` returns JSON for a known service and method.

## What's next

<div class="grid">

<!-- part:card:.. -->
<!-- part:card:../ship-http-endpoint -->

</div>
