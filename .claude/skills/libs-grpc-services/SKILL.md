---
name: libs-service-infrastructure
description: >
  Service infrastructure for gRPC microservices. librpc provides Server/Client
  base classes. libconfig loads service settings. libtelemetry provides
  structured logging and tracing. libtype provides Protocol Buffer types.
  libharness provides test mocks. Use when building, modifying, or testing gRPC
  services.
---

# Service Infrastructure

## When to Use

- Building or modifying gRPC service implementations and handlers
- Configuring services at startup with environment-specific settings
- Adding structured logging, tracing, or performance monitoring
- Writing unit tests for services with mocked dependencies

## Libraries

| Library      | Main API                                           | Purpose                                        |
| ------------ | -------------------------------------------------- | ---------------------------------------------- |
| librpc       | `RpcServer`, `RpcClient`, `createClientFactory`    | gRPC server/client base classes and factories  |
| libconfig    | `serviceConfig`, `extensionConfig`, `scriptConfig` | Load settings from files and environment       |
| libtelemetry | `Logger`, `Tracer`, `createLogger`                 | RFC 5424 structured logging and tracing        |
| libtype      | `agent`, `common`, `memory`, `graph`, …            | Generated Protocol Buffer types and namespaces |
| libharness   | `createMockConfig`, `createMockStorage`, …         | Test doubles for all infrastructure deps       |

## Decision Guide

- **librpc Server vs Client** — `RpcServer` for implementing service handlers
  that respond to requests. `RpcClient` / `createClientFactory` for calling
  other services.
- **libconfig `serviceConfig` vs `extensionConfig` vs `scriptConfig`** —
  `serviceConfig` for long-running daemons (gRPC services). `extensionConfig`
  for plugins and extensions. `scriptConfig` for CLI tools and one-off scripts.
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
import { serviceConfig } from "@forwardimpact/libconfig";
import { createLogger } from "@forwardimpact/libtelemetry";
import { RpcServer, createService } from "@forwardimpact/librpc";
import { Tracer } from "@forwardimpact/libtelemetry/tracer.js";

const config = serviceConfig("my-service");
const logger = createLogger("my-service");
const tracer = new Tracer(storage);

const service = createService(MyServiceImpl, proto);
const server = new RpcServer([service], config);
await server.start();
```

### Recipe 2: Call another service

```javascript
import { createClientFactory } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";

const logger = createLogger("caller");
const factory = createClientFactory(logger, tracer);
const agentClient = factory.createAgentClient("localhost", 50051);
const response = await agentClient.request(message);
```

### Recipe 3: Test a service handler

```javascript
import {
  createMockConfig,
  createMockStorage,
  createMockLogger,
  createMockGrpcCall,
  createMockLlmClient,
} from "@forwardimpact/libharness";

const config = createMockConfig("test-service");
const storage = createMockStorage();
const logger = createMockLogger();
const llmClient = createMockLlmClient({ completionResponse: { content: "Hello" } });

// Test handler directly with mock gRPC call
const call = createMockGrpcCall({ resourceId: "test:123" });
await handler(call, callback);
```

## DI Wiring

### librpc

```javascript
// RpcServer — accepts services and config
const server = new RpcServer(services, config);

// createClientFactory — accepts logger and tracer
const factory = createClientFactory(logger, tracer);
```

### libconfig

```javascript
// Factory functions return config object — no constructor injection
const config = serviceConfig("service-name");
const config = extensionConfig("extension-name");
const config = scriptConfig("script-name");
```

### libtelemetry

```javascript
// createLogger — factory, returns Logger instance
const logger = createLogger("domain");

// Tracer — accepts storage
const tracer = new Tracer(storage);
```

### libtype

```javascript
// Generated types — use fromObject() for creation
import { agent, common } from "@forwardimpact/libtype";
const request = agent.Request.fromObject({ content: "Hello" });
const resourceId = common.ResourceId.fromObject({ type: "conversation", id: "abc" });
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
const call = createMockGrpcCall(requestData);
```
