---
title: Fetch a Derived Role or Agent Profile
description: Get a derived role or agent profile without reimplementing derivation — pass coordinates to the pathway service, receive Turtle RDF.
---

You have a discipline, level, and optional track, and you need the derived role
definition or agent profile as structured data from the pathway service. This
page walks through the bounded task of going from those coordinates to a
Turtle RDF response you can parse, render, or pass downstream -- without
embedding derivation logic in your product.

For the full setup including all seven RPCs and architecture context, see
[Query the Engineering Standard](/docs/services/integrate-standard/).

## Prerequisites

- Completed the
  [Query the Engineering Standard](/docs/services/integrate-standard/) guide --
  you have `@forwardimpact/librpc` and `@forwardimpact/libtype` installed, the
  pathway service is running, and `createClient("pathway")` connects
  successfully.

## Connect

```js
import { createClient, createTracer } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";
import { pathway } from "@forwardimpact/libtype";

const logger = createLogger("my-product");
const tracer = await createTracer("my-product");
const pathwayClient = await createClient("pathway", logger, tracer);
```

## Fetch a role definition

Call `DescribeJob` with a discipline, level, and optional track:

```js
const request = pathway.DescribeJobRequest.fromObject({
  discipline: "software-engineering",
  level: "J070",
  track: "platform",
});

const result = await pathwayClient.DescribeJob(request);
console.log(result.content.substring(0, 400));
```

Expected output (Turtle RDF, abbreviated):

```text
@prefix fit: <https://www.forwardimpact.team/schema/rdf/> .
@prefix schema: <https://schema.org/> .

<urn:fit:job:software-engineering:J070:platform> a fit:Job ;
  schema:title "Senior Engineer Software Engineer - Platform Engineering" ;
  fit:discipline "software-engineering" ;
  fit:level "J070" ;
  fit:track "platform" ;
  fit:skillCount 16 ;
  fit:behaviourCount 5 .
```

The response includes the full skill matrix (each skill with its type,
proficiency, and description), the behaviour profile, derived responsibilities,
and expectation dimensions (scope, autonomy, influence, complexity).

### Without a track

Omit the `track` field for the generalist role:

```js
const request = pathway.DescribeJobRequest.fromObject({
  discipline: "software-engineering",
  level: "J070",
});

const result = await pathwayClient.DescribeJob(request);
```

If the discipline requires a track and you omit it, the service returns a gRPC
error. Check valid combinations first with `ListJobs` if you are unsure.

## Fetch an agent profile

Agent profiles use `DescribeAgentProfile` instead. The `track` field is
required:

```js
const request = pathway.DescribeAgentProfileRequest.fromObject({
  discipline: "software-engineering",
  track: "platform",
});

const result = await pathwayClient.DescribeAgentProfile(request);
console.log(result.content.substring(0, 400));
```

Expected output (Turtle RDF, abbreviated):

```text
@prefix fit: <https://www.forwardimpact.team/schema/rdf/> .

<urn:fit:agent:software-engineering:platform> a fit:AgentProfile ;
  fit:discipline "software-engineering" ;
  fit:track "platform" ;
  fit:skillCount 14 ;
  fit:behaviourCount 5 .
```

The agent profile is smaller than the full role because human-only skills are
removed and lower-proficiency duplicates are collapsed. Skills and behaviours
are sorted by strength descending, which is useful when generating agent
instructions where the most important capabilities should lead.

## Handle errors

Invalid coordinates produce a gRPC error with a descriptive message:

```js
try {
  const request = pathway.DescribeJobRequest.fromObject({
    discipline: "nonexistent_discipline",
    level: "J070",
  });
  await pathwayClient.DescribeJob(request);
} catch (err) {
  console.error(err.message);
  // "Unknown discipline: nonexistent_discipline"
}
```

Common error cases:

| Input                         | Error                                                |
| ----------------------------- | ---------------------------------------------------- |
| Unknown discipline ID         | `Unknown discipline: <id>`                           |
| Unknown level ID              | `Unknown level: <id>`                                |
| Unknown track ID              | `Unknown track: <id>`                                |
| Missing required track        | `Invalid job combination: discipline=... level=...`  |
| Agent profile without track   | `track is required for DescribeAgentProfile`         |

To discover valid values before calling, use `ListJobs` (for roles) or
`ListAgentProfiles` (for agent profiles).

## Verify

You have reached the outcome of this guide when:

- `DescribeJob` with a valid discipline, level, and track returns Turtle RDF
  containing the role title, skill matrix, and behaviour profile.
- `DescribeAgentProfile` with a valid discipline and track returns a filtered
  agent profile with human-only skills removed.
- Invalid coordinates produce a gRPC error with a message that names the
  invalid entity.

## What's next

<div class="grid">

<!-- part:card:.. -->

</div>
