---
title: Send Spans from a Product
description: Emit spans and query them immediately, with no storage infrastructure to manage.
---

You need to record spans from within a product. A span records what happened,
how long it took, and whether it succeeded. You also need to trust that the
service stores those spans and keeps them queryable.

This page covers one bounded task. Connect to the span service. Build a
span. Send it. Query it back to confirm the round trip.

See [Collect Spans from Any Product](/docs/services/collect-spans/) for the
full setup with architecture context, the query interface, and tree
reconstruction.

## Prerequisites

- Completed the
  [Collect Spans from Any Product](/docs/services/collect-spans/) guide. You
  installed `@forwardimpact/librpc` and `@forwardimpact/libtype`. The span
  service runs.

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
and a `span_id`. The `trace_id` groups related spans. The `span_id` is unique
to this span:

```js
const record = span.SpanItem.fromObject({
  trace_id: "job-run-042",
  span_id: "step-01",
  name: "generate-output",
  kind: 1,  // INTERNAL
  start_time_unix_nano: BigInt(Date.now()) * 1_000_000n,
  end_time_unix_nano: BigInt(Date.now() + 2000) * 1_000_000n,
  attributes: {
    "operation.name": "output-pipeline",
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

Link a child span to its parent with `parent_span_id`:

```js
const childSpan = span.SpanItem.fromObject({
  trace_id: "job-run-042",
  span_id: "step-02",
  parent_span_id: "step-01",
  name: "verify-output",
  kind: 1,
  start_time_unix_nano: BigInt(Date.now()) * 1_000_000n,
  end_time_unix_nano: BigInt(Date.now() + 800) * 1_000_000n,
  attributes: {
    "operation.name": "output-pipeline",
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
  trace_id: "job-run-042",
  span_id: "step-03",
  parent_span_id: "step-01",
  name: "publish-results",
  kind: 1,
  start_time_unix_nano: BigInt(Date.now()) * 1_000_000n,
  end_time_unix_nano: BigInt(Date.now() + 500) * 1_000_000n,
  attributes: {
    "operation.name": "output-pipeline",
  },
  status: { code: 2, message: "Connection refused on port 3005" },
  resource: {
    attributes: { "service.name": "my-product" },
  },
});

await spanClient.RecordSpan(errorSpan);
```

## Query to confirm

After you send spans, query them back by trace ID to confirm that the service
stored them:

```js
const query = span.QueryRequest.fromObject({
  filter: { trace_id: "job-run-042" },
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

`RecordSpan` validates that `trace_id` and `span_id` are present. If you omit
either one, `RecordSpan` produces a gRPC error:

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
exponential backoff. The base delay is 1 second. The delay doubles on each
attempt and includes jitter. Every attempt shares one absolute deadline of 60
seconds, so the retries stop when the call spends that budget. The client then
reports the connection error.

## Verify

You reach the outcome of this guide when:

- `RecordSpan` with a valid `trace_id` and `span_id` returns
  `{ success: true }`.
- Child spans reference their parent and appear in the same trace query.
- Error spans preserve their status code and message.
- `QuerySpans` returns all spans sent under the same `trace_id`.

## What's next

<div class="grid">

<!-- part:card:.. -->

</div>
