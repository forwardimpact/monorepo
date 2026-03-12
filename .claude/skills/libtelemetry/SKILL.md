---
name: libtelemetry
description: >
  libtelemetry - OpenTelemetry-based logging and tracing. createLogger and
  Logger provide RFC 5424 structured logging. Tracer creates distributed trace
  spans. TraceVisualizer renders trace diagrams. TraceIndex stores trace data.
  observe function wraps operations with timing. Use for logging, distributed
  tracing, and performance monitoring.
---

# libtelemetry Skill

## When to Use

- Adding structured logging to services or CLI tools
- Providing progress output during long-running CLI operations
- Implementing distributed tracing across microservices
- Visualizing trace data for debugging
- Monitoring operation timing and performance

**Always use libtelemetry for logging** — never use bare `console.log` /
`console.error` for operational or progress output. `logger.info` always prints
(to stderr), while `logger.debug` only prints when `DEBUG=<domain>` is set. This
keeps stdout clean for data output and gives users consistent, structured log
lines everywhere.

## Key Concepts

**Logger**: RFC 5424 compliant structured logging with severity levels. `info()`
always outputs. `debug()` only outputs when `DEBUG` env var matches the domain.
All output goes to stderr, keeping stdout free for data.

**Tracer**: Creates spans for distributed tracing across service boundaries.

**TraceVisualizer**: Renders trace spans as visual diagrams.

## Usage Patterns

### Pattern 1: Structured logging (services)

```javascript
import { createLogger } from "@forwardimpact/libtelemetry";

const logger = createLogger("my-service");
logger.info("request", "Request received", { requestId: "123" });
logger.error("request", "Operation failed", { error: err.message });
```

### Pattern 2: CLI progress output

```javascript
import { createLogger } from "@forwardimpact/libtelemetry";

const log = createLogger("my-tool");
log.info("pipeline", "Starting generation");
log.info("pipeline", `[${i}/${total}] Processing ${name}`);
log.info("pipeline", "Done", { files: count });
```

### Pattern 3: Distributed tracing

```javascript
import { Tracer } from "@forwardimpact/libtelemetry/tracer.js";

const tracer = new Tracer(storage);
const span = tracer.startSpan("processRequest");
// ... do work ...
span.end();
```

## Integration

Used by all services and extensions. Traces stored via Trace service.
