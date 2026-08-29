---
title: Collect Spans from Any Product
description: Products emit spans and do not manage storage. One shared span gRPC service collects them.
---

You build a product that generates spans. A span records what an agent did,
how long each step took, and whether it succeeded. You need to store those
spans somewhere queryable. Per-product span files make each product reinvent
storage, indexes, and query logic.

The span gRPC service accepts spans from any product. It stores them in a
shared JSONL-backed index. It serves them back through a query interface.
Your product sends a span, and the service stores and retrieves it.

This guide shows how to connect to the span service, record a span, query it
back, and verify that the round trip works.

## Prerequisites

- Node.js 18+
- Generated client code available (run `npx fit-codegen generate --all` if not)
- The span service running (`npx fit-rc start`)

Install the transport and type packages:

```sh
npm install @forwardimpact/librpc @forwardimpact/libtype
```

## Architecture overview

The span service owns two RPCs:

| RPC           | Purpose                          | Request type          | Response type           |
| ------------- | -------------------------------- | --------------------- | ----------------------- |
| `RecordSpan`  | Store a span in the span index  | `span.SpanItem`          | `span.RecordResponse`  |
| `QuerySpans`  | Retrieve spans by query or filter| `span.QueryRequest`  | `span.QueryResponse`   |

The service stores spans in a `TraceIndex` backed by a JSONL file at
`data/spans/index.jsonl`. The index is append-only during the service
lifetime. The service flushes it on shutdown.

```text
Product A ──┐                    ┌── data/spans/index.jsonl
            ├── gRPC ── span ──┤
Product B ──┘                    └── (query interface)
```

The span service does not trace itself on purpose. If you connect a tracer to
a service that records spans, you create infinite recursion.

## Connect to the span service

Create a span client. The span service cannot use distributed tracing
internally. The client connection is therefore simpler than for other
services:

```js
import { createClient } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";

const logger = createLogger("my-product");
const spanClient = await createClient("span", logger);
```

## Record a span

Build a `span.SpanItem` message and call `RecordSpan`. Every span requires a
`trace_id` and `span_id`:

```js
import { span } from "@forwardimpact/libtype";

const record = span.SpanItem.fromObject({
  trace_id: "abc123",
  span_id: "span-001",
  parent_span_id: "",
  name: "render-report",
  kind: 1,  // INTERNAL
  start_time_unix_nano: BigInt(Date.now()) * 1_000_000n,
  end_time_unix_nano: BigInt(Date.now() + 1500) * 1_000_000n,
  attributes: {
    "operation.name": "render-report",
    "operation.outcome": "success",
  },
  events: [],
  status: { code: 1, message: "" },  // OK
  resource: {
    attributes: {
      "service.name": "my-product",
    },
  },
});

const result = await spanClient.RecordSpan(record);
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
const spanWithEvents = span.SpanItem.fromObject({
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

await spanClient.RecordSpan(spanWithEvents);
```

## Query spans

Retrieve spans with `QuerySpans`. You can query by text, trace ID, or
resource ID. You must supply at least one:

### By trace ID

```js
const queryByTrace = span.QueryRequest.fromObject({
  filter: { trace_id: "abc123" },
});

const result = await spanClient.QuerySpans(queryByTrace);
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
const queryByResource = span.QueryRequest.fromObject({
  filter: { resource_id: "my-product" },
});

const result = await spanClient.QuerySpans(queryByResource);
console.log("Spans from my-product:", result.spans?.length ?? 0);
```

### By text query

```js
const queryByText = span.QueryRequest.fromObject({
  query: "evaluate",
});

const result = await spanClient.QuerySpans(queryByText);
console.log("Matching spans:", result.spans?.length ?? 0);
```

### Combine query and filter

```js
const combined = span.QueryRequest.fromObject({
  query: "evaluate",
  filter: { trace_id: "abc123" },
});

const result = await spanClient.QuerySpans(combined);
```

## Build a trace tree

Spans reference their parent through `parent_span_id`. To reconstruct the
tree structure from a query result:

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

const result = await spanClient.QuerySpans(
  span.QueryRequest.fromObject({ filter: { trace_id: "abc123" } })
);
buildTree(result.spans ?? []);
```

Expected output:

```text
evaluate-agent-output (1500ms)
  analyze-trace (3000ms)
```

## Verify

You reach the outcome of this guide when:

- `createClient("span")` connects without error.
- `RecordSpan` with a valid `trace_id` and `span_id` returns
  `{ success: true }`.
- `QuerySpans` with the same `trace_id` returns the recorded spans.
- The round trip preserves span attributes, events, and status.

If the connection fails, run `npx fit-rc status` to confirm that the span
service runs. If `RecordSpan` fails, check that both `trace_id` and `span_id`
are non-empty strings.

## What's next

<div class="grid">

<!-- part:card:send-spans -->

</div>
