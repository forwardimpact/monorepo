---
title: Collect Trace Spans from Any Product
description: Products that emit trace spans without managing storage — shared trace gRPC service with a single collection point.
---

You are building a product that generates trace spans -- recording what an agent
did, how long each step took, and whether it succeeded -- and you need those
spans stored somewhere queryable. Managing per-product trace files means each
product reinvents storage, indexing, and query logic. The trace gRPC service
accepts spans from any product, stores them in a shared JSONL-backed index, and
serves them back through a query interface. Your product sends a span; the
service handles persistence and retrieval.

This guide walks through connecting to the trace service, recording a span,
querying it back, and verifying the round trip works.

## Prerequisites

- Node.js 18+
- Generated client code available (run `npx fit-codegen --all` if not)
- The trace service running (`npx fit-rc start`)

Install the transport and type packages:

```sh
npm install @forwardimpact/librpc @forwardimpact/libtype
```

## Architecture overview

The trace service owns two RPCs:

| RPC           | Purpose                          | Request type          | Response type           |
| ------------- | -------------------------------- | --------------------- | ----------------------- |
| `RecordSpan`  | Store a span in the trace index  | `trace.Span`          | `trace.RecordResponse`  |
| `QuerySpans`  | Retrieve spans by query or filter| `trace.QueryRequest`  | `trace.QueryResponse`   |

The service stores spans in a `TraceIndex` backed by a JSONL file at
`data/traces/index.jsonl`. The index is append-only during the service
lifetime and flushed on shutdown.

```text
Product A ──┐                    ┌── data/traces/index.jsonl
            ├── gRPC ── trace ──┤
Product B ──┘                    └── (query interface)
```

The trace service intentionally does not trace itself -- connecting a tracer
to a service that records traces would create infinite recursion.

## Connect to the trace service

Create a trace client. Because the trace service cannot use distributed
tracing internally, the client connection is simpler than other services:

```js
import { createClient } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";

const logger = createLogger("my-product");
const traceClient = await createClient("trace", logger);
```

## Record a span

Build a `trace.Span` message and call `RecordSpan`. Every span requires a
`trace_id` and `span_id`:

```js
import { trace } from "@forwardimpact/libtype";

const span = trace.Span.fromObject({
  trace_id: "abc123",
  span_id: "span-001",
  parent_span_id: "",
  name: "evaluate-agent-output",
  kind: 1,  // INTERNAL
  start_time_unix_nano: BigInt(Date.now()) * 1_000_000n,
  end_time_unix_nano: BigInt(Date.now() + 1500) * 1_000_000n,
  attributes: {
    "agent.name": "staff-engineer",
    "eval.verdict": "pass",
  },
  events: [],
  status: { code: 1, message: "" },  // OK
  resource: {
    attributes: {
      "service.name": "my-product",
    },
  },
});

const result = await traceClient.RecordSpan(span);
console.log("Recorded:", result.success);
```

Expected output:

```text
Recorded: true
```

### Span fields

| Field                   | Required | Description                                        |
| ----------------------- | -------- | -------------------------------------------------- |
| `trace_id`              | yes      | Groups related spans into a single trace           |
| `span_id`               | yes      | Unique identifier for this span                    |
| `parent_span_id`        | no       | Links to the parent span in the same trace         |
| `name`                  | no       | Human-readable operation name                      |
| `kind`                  | no       | `INTERNAL` (1), `SERVER` (2), or `CLIENT` (3)      |
| `start_time_unix_nano`  | no       | Start time as nanoseconds since epoch              |
| `end_time_unix_nano`    | no       | End time as nanoseconds since epoch                |
| `attributes`            | no       | Key-value pairs for metadata                       |
| `events`                | no       | Timestamped events within the span                 |
| `status`                | no       | `UNSET` (0), `OK` (1), or `ERROR` (2) with message|
| `resource`              | no       | Resource attributes (service name, version)        |

### Add events to a span

Events mark points of interest within a span:

```js
const spanWithEvents = trace.Span.fromObject({
  trace_id: "abc123",
  span_id: "span-002",
  parent_span_id: "span-001",
  name: "analyze-trace",
  kind: 1,
  start_time_unix_nano: BigInt(Date.now()) * 1_000_000n,
  end_time_unix_nano: BigInt(Date.now() + 3000) * 1_000_000n,
  events: [
    {
      name: "observation-coded",
      time_unix_nano: BigInt(Date.now() + 1000) * 1_000_000n,
      attributes: { "code": "tool-retry", "count": "3" },
    },
    {
      name: "finding-written",
      time_unix_nano: BigInt(Date.now() + 2500) * 1_000_000n,
      attributes: { "finding.severity": "medium" },
    },
  ],
  status: { code: 1, message: "" },
  resource: {
    attributes: { "service.name": "my-product" },
  },
});

await traceClient.RecordSpan(spanWithEvents);
```

## Query spans

Retrieve spans using `QuerySpans`. You can query by text, trace ID, or
resource ID -- at least one must be provided:

### By trace ID

```js
const queryByTrace = trace.QueryRequest.fromObject({
  filter: { trace_id: "abc123" },
});

const result = await traceClient.QuerySpans(queryByTrace);
console.log("Spans found:", result.spans?.length ?? 0);

for (const span of result.spans ?? []) {
  console.log(`  ${span.name} (${span.span_id})`);
}
```

Expected output:

```text
Spans found: 2
  evaluate-agent-output (span-001)
  analyze-trace (span-002)
```

### By resource ID

```js
const queryByResource = trace.QueryRequest.fromObject({
  filter: { resource_id: "my-product" },
});

const result = await traceClient.QuerySpans(queryByResource);
console.log("Spans from my-product:", result.spans?.length ?? 0);
```

### By text query

```js
const queryByText = trace.QueryRequest.fromObject({
  query: "evaluate",
});

const result = await traceClient.QuerySpans(queryByText);
console.log("Matching spans:", result.spans?.length ?? 0);
```

### Combine query and filter

```js
const combined = trace.QueryRequest.fromObject({
  query: "evaluate",
  filter: { trace_id: "abc123" },
});

const result = await traceClient.QuerySpans(combined);
```

## Build a trace tree

Spans reference their parent via `parent_span_id`. To reconstruct the tree
structure from a query result:

```js
function buildTree(spans) {
  const byId = new Map(spans.map((s) => [s.span_id, s]));
  const roots = [];

  for (const span of spans) {
    if (!span.parent_span_id || !byId.has(span.parent_span_id)) {
      roots.push(span);
    }
  }

  function children(parentId) {
    return spans.filter((s) => s.parent_span_id === parentId);
  }

  function print(span, depth = 0) {
    const indent = "  ".repeat(depth);
    const durationMs = Number(
      (BigInt(span.end_time_unix_nano) - BigInt(span.start_time_unix_nano))
        / 1_000_000n
    );
    console.log(`${indent}${span.name} (${durationMs}ms)`);
    for (const child of children(span.span_id)) {
      print(child, depth + 1);
    }
  }

  for (const root of roots) {
    print(root);
  }
}

const result = await traceClient.QuerySpans(
  trace.QueryRequest.fromObject({ filter: { trace_id: "abc123" } })
);
buildTree(result.spans ?? []);
```

Expected output:

```text
evaluate-agent-output (1500ms)
  analyze-trace (3000ms)
```

## Verify

You have reached the outcome of this guide when:

- `createClient("trace")` connects without error.
- `RecordSpan` with a valid `trace_id` and `span_id` returns
  `{ success: true }`.
- `QuerySpans` with the same `trace_id` returns the recorded spans.
- Span attributes, events, and status are preserved in the round trip.

If the connection fails, confirm the trace service is running with
`npx fit-rc status`. If `RecordSpan` fails, check that both `trace_id` and
`span_id` are non-empty strings.

## What's next

<div class="grid">

<!-- part:card:send-spans -->

</div>
