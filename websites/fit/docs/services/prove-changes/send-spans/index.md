---
title: Send Spans from a Product
description: Spans emitted and immediately queryable — without managing storage infrastructure.
---

You need to record spans from within a product -- what happened, how long
it took, whether it succeeded -- and trust that those spans are stored and
queryable afterward. This page walks through the bounded task of connecting to
the span service, building a span, sending it, and querying it back to
confirm the round trip.

For the full setup including architecture context, the query interface, and
tree reconstruction, see
[Collect Spans from Any Product](/docs/services/prove-changes/).

## Prerequisites

- Completed the
  [Collect Spans from Any Product](/docs/services/prove-changes/) guide --
  you have `@forwardimpact/librpc` and `@forwardimpact/libtype` installed, and
  the span service is running.

## Connect

```js
import { createClient } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";
import { span } from "@forwardimpact/libtype";

const logger = createLogger("my-product");
const spanClient = await createClient("span", logger);
```

## Send a span

Build a `span.SpanItem` and call `RecordSpan`. Every span needs a `trace_id`
(grouping related spans) and a `span_id` (unique to this span):

```js
const record = span.SpanItem.fromObject({
  trace_id: "eval-run-042",
  span_id: "step-01",
  name: "generate-output",
  kind: 1,  // INTERNAL
  start_time_unix_nano: BigInt(Date.now()) * 1_000_000n,
  end_time_unix_nano: BigInt(Date.now() + 2000) * 1_000_000n,
  attributes: {
    "agent.name": "release-engineer",
    "step.type": "generation",
  },
  status: { code: 1, message: "" },  // OK
  resource: {
    attributes: { "service.name": "my-product" },
  },
});

const result = await spanClient.RecordSpan(record);
console.log("Sent:", result.success);
```

Expected output:

```text
Sent: true
```

## Send a child span

Link a child span to its parent using `parent_span_id`:

```js
const childSpan = span.SpanItem.fromObject({
  trace_id: "eval-run-042",
  span_id: "step-02",
  parent_span_id: "step-01",
  name: "verify-output",
  kind: 1,
  start_time_unix_nano: BigInt(Date.now()) * 1_000_000n,
  end_time_unix_nano: BigInt(Date.now() + 800) * 1_000_000n,
  attributes: {
    "agent.name": "release-engineer",
    "step.type": "verification",
    "verdict": "pass",
  },
  status: { code: 1, message: "" },
  resource: {
    attributes: { "service.name": "my-product" },
  },
});

await spanClient.RecordSpan(childSpan);
```

## Send an error span

When a step fails, set the status code to `ERROR` (2) with a message:

```js
const errorSpan = span.SpanItem.fromObject({
  trace_id: "eval-run-042",
  span_id: "step-03",
  parent_span_id: "step-01",
  name: "publish-results",
  kind: 1,
  start_time_unix_nano: BigInt(Date.now()) * 1_000_000n,
  end_time_unix_nano: BigInt(Date.now() + 500) * 1_000_000n,
  attributes: {
    "agent.name": "release-engineer",
  },
  status: { code: 2, message: "Connection refused on port 3005" },
  resource: {
    attributes: { "service.name": "my-product" },
  },
});

await spanClient.RecordSpan(errorSpan);
```

## Query to confirm

After sending spans, query them back by trace ID to confirm storage:

```js
const query = span.QueryRequest.fromObject({
  filter: { trace_id: "eval-run-042" },
});

const result = await spanClient.QuerySpans(query);
console.log("Stored spans:", result.spans?.length ?? 0);

for (const s of result.spans ?? []) {
  const status = s.status?.code === 2 ? "ERROR" : "OK";
  console.log(`  ${s.name} [${status}]`);
}
```

Expected output:

```text
Stored spans: 3
  generate-output [OK]
  verify-output [OK]
  publish-results [ERROR]
```

## Handle send failures

`RecordSpan` validates that `trace_id` and `span_id` are present. Missing
either produces a gRPC error:

```js
try {
  const bad = span.SpanItem.fromObject({
    trace_id: "",
    span_id: "orphan",
    name: "missing-trace-id",
  });
  await spanClient.RecordSpan(bad);
} catch (err) {
  console.error(err.message);
  // "trace_id is required"
}
```

If the span service is unreachable, the client retries up to 10 times with
exponential backoff (1-second base delay, doubling each attempt, plus jitter)
before surfacing the connection error.

## Verify

You have reached the outcome of this guide when:

- `RecordSpan` with a valid `trace_id` and `span_id` returns
  `{ success: true }`.
- Child spans reference their parent and appear in the same trace query.
- Error spans preserve their status code and message.
- `QuerySpans` returns all spans sent under the same `trace_id`.

## What's next

<div class="grid">

<!-- part:card:.. -->

</div>
