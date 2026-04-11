---
name: libs-grpc-services
description: >
  Use when building, modifying, or testing a gRPC service; creating service
  handlers; calling another service over gRPC; loading service, extension, or
  script configuration from environment and files; adding structured logging to
  stderr or tracing spans across service boundaries; working with generated
  Protocol Buffer types and namespaces; constructing mock storage, loggers,
  clients, or other test doubles for service unit tests.
---

# gRPC Services and Service Infrastructure

## When to Use

- Building or modifying gRPC service implementations and handlers
- Configuring services at startup with environment-specific settings
- Adding structured logging, tracing, or performance monitoring
- Writing unit tests for services with mocked dependencies

## Libraries

| Library      | Capabilities                                                                                                                 | Key Exports                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| librpc       | Build a gRPC server, call another service as a client, create a distributed tracer, register health handlers                 | `Server`, `Client`, `createClient`, `createTracer`, `createGrpc`, `createAuth`, `ServingStatus`   |
| libconfig    | Load service, extension, script, or init-level configuration from files and environment variables                            | `Config`, `createServiceConfig`, `createExtensionConfig`, `createScriptConfig`, `createConfig`    |
| libtelemetry | Emit structured log lines to stderr, wrap operations with timing, create trace spans across service boundaries               | `Logger`, `createLogger`, `Observer`, `createObserver`, `Tracer`                                  |
| libtype      | Construct and parse Protocol Buffer messages for the agent, llm, memory, tool, trace, vector, graph, and resource namespaces | `common`, `resource`, `agent`, `llm`, `memory`, `tool`, `trace`, `vector`, `graph`                |
| libharness   | Inject mock config, storage, logger, gRPC calls, and service clients into unit tests                                         | `createMockConfig`, `createMockStorage`, `createMockLogger`, `createMockLlmClient`, `MockStorage` |

## Decision Guide

- **librpc Server vs Client** — `Server` for implementing service handlers that
  respond to requests. `Client` / `createClient` for calling other services.
- **libconfig `createServiceConfig` vs `createExtensionConfig` vs
  `createScriptConfig`** — `createServiceConfig` for long-running daemons (gRPC
  services). `createExtensionConfig` for plugins and extensions.
  `createScriptConfig` for CLI tools and one-off scripts.
- **libtelemetry Logger vs Tracer** — `Logger` for structured log lines (always
  use instead of `console.log`). `Tracer` for distributed trace spans across
  service boundaries. Use `observe()` to wrap operations with timing.
- **Always use `logger.info` for operational output** — sends to stderr, keeps
  stdout clean for data. `logger.debug` only prints when `DEBUG=<domain>` is
  set. This is the standard pattern for all CLI tools and services across the
  monorepo.

## Composition Recipes

### Recipe 1: Create a new gRPC service

```javascript
import { createServiceConfig } from "@forwardimpact/libconfig";
import { createLogger } from "@forwardimpact/libtelemetry";
import { Server, createTracer } from "@forwardimpact/librpc";

const config = await createServiceConfig("my-service");
const logger = createLogger("my-service");
const tracer = await createTracer("my-service");

const server = new Server([service], config);
await server.start();
```

### Recipe 2: Call another service

```javascript
import { createClient } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";

const logger = createLogger("caller");
const agentClient = await createClient("agent", logger, tracer);
const response = await agentClient.request(message);
```

### Recipe 3: Test a service handler

```javascript
import {
  createMockConfig,
  createMockStorage,
  createMockLogger,
  createMockLlmClient,
} from "@forwardimpact/libharness";

const config = createMockConfig("test-service");
const storage = createMockStorage();
const logger = createMockLogger();
const llmClient = createMockLlmClient({
  completionResponse: { content: "Hello" },
});

await handler(call, callback);
```

## DI Wiring

### librpc

```javascript
// Server — accepts services and config
const server = new Server(services, config);

// createClient — async factory, returns initialized client
const agentClient = await createClient("agent", logger, tracer);
```

### libconfig

```javascript
// Async factory functions return Config instance
const config = await createServiceConfig("service-name");
const config = await createExtensionConfig("extension-name");
const config = await createScriptConfig("script-name");
```

### libtelemetry

```javascript
// createLogger — factory, returns Logger instance
const logger = createLogger("domain");

// Tracer — imported from subpath to avoid circular dep on generated code
import { Tracer } from "@forwardimpact/libtelemetry/tracer.js";
const tracer = new Tracer({ serviceName, traceClient, grpcMetadata });
```

### libtype

```javascript
// Generated types — use fromObject() for creation
import { agent, common } from "@forwardimpact/libtype";
const request = agent.Request.fromObject({ content: "Hello" });
const resourceId = common.ResourceId.fromObject({
  type: "conversation",
  id: "abc",
});
```

### libharness

```javascript
// All mocks are factory functions — no constructor injection needed
const config = createMockConfig("test");
const storage = createMockStorage();
const logger = createMockLogger();
const llmClient = createMockLlmClient(overrides);
const memoryClient = createMockMemoryClient(overrides);
const agentClient = createMockAgentClient(overrides);
```
