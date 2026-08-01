---
title: Query the Engineering Standard from Any Product
description: Products that access derived roles and profiles and do not embed derivation logic — shared pathway gRPC service.
---

You build a product feature that needs career paths, skill matrices, or agent
profiles derived from the engineering standard. The derivation logic resolves
modifiers, clamps proficiency, classifies tiers, and specializes tracks. That
logic lives in `@forwardimpact/libskill`. You do not want to embed that library
in every product. The pathway gRPC service runs the derivation on a shared
backend. It returns Turtle RDF over a typed interface. Your product sends a
discipline, level, and optional track. The service returns the full derived
role or agent profile.

In this guide you connect to the pathway service. You call its RPCs. You then
check that the responses contain the derived data your feature needs.

## Prerequisites

- Node.js 18+
- Generated client code available (run `npx fit-codegen generate --all` if not)
- Services running (`npx fit-rc start`)
- Standard data initialized at `data/pathway/`. If that data does not exist
  yet, run `npx fit-pathway init`. Then follow the prompts.

Install the transport and type packages:

```sh
npm install @forwardimpact/librpc @forwardimpact/libtype
```

## Architecture overview

The pathway service is a thin gRPC transport over `@forwardimpact/libskill`.
It loads the standard data once at startup. It then serves derivation requests
from any connected product. Products get derived data. They do not import the
derivation library. They do not load YAML files themselves.

```text
Product A ──┐                     ┌── data/pathway/disciplines/
            ├── gRPC ── pathway ──┼── data/pathway/levels.yaml
Product B ──┘                     ├── data/pathway/tracks/
                                  ├── data/pathway/capabilities/
                                  └── data/pathway/behaviours/
```

The service exposes seven RPCs:

| RPC                    | Purpose                                                    | Request type                          |
| ---------------------- | ---------------------------------------------------------- | ------------------------------------- |
| `ListJobs`             | Enumerate all valid discipline/level/track combinations    | `pathway.ListJobsRequest`             |
| `DescribeJob`          | Derive a full role at a specific coordinate                | `pathway.DescribeJobRequest`          |
| `ListAgentProfiles`    | Enumerate all valid discipline/track combinations          | `pathway.ListAgentProfilesRequest`    |
| `DescribeAgentProfile` | Derive an agent profile for a discipline and track         | `pathway.DescribeAgentProfileRequest` |
| `DescribeProgression`  | Compute the delta between two levels                       | `pathway.DescribeProgressionRequest`  |
| `ListJobSoftware`      | Derive the software toolkit for a role                     | `pathway.ListJobSoftwareRequest`      |
| `GetMarkersForProfile` | List skill markers expected at a discipline/level/track    | `pathway.GetMarkersForProfileRequest` |

All RPCs return `tool.ToolCallResult` with a `content` field that contains
Turtle RDF.

## Connect to the pathway service

Create a pathway client with the generated `PathwayClient` class:

```js
import { createClient, createTracer } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";

const logger = createLogger("my-product");
const tracer = await createTracer("my-product");

const pathwayClient = await createClient("pathway", logger, tracer);
```

`createClient("pathway")` resolves the host and port from `config/config.json`,
creates a `PathwayClient` instance, and establishes the gRPC channel with
automatic retry.

## List all valid roles

Enumerate every valid discipline/level/track combination in the standard:

```js
import { pathway } from "@forwardimpact/libtype";

const request = pathway.ListJobsRequest.fromObject({});
const result = await pathwayClient.ListJobs(request);
console.log(result.content.substring(0, 300));
```

The response is a Turtle RDF string that lists each valid role. To filter by
discipline:

```js
const request = pathway.ListJobsRequest.fromObject({
  discipline: "software-engineering",
});

const result = await pathwayClient.ListJobs(request);
```

## Describe a specific role

Derive the full role definition for a discipline, level, and optional track.
The definition holds the skill matrix, the behaviour profile, the
responsibilities, and the expectations:

```js
const request = pathway.DescribeJobRequest.fromObject({
  discipline: "software-engineering",
  level: "J070",
  track: "platform",
});

const result = await pathwayClient.DescribeJob(request);
console.log(result.content.substring(0, 500));
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

The Turtle content includes the full skill matrix, behaviour profile, and
derived responsibilities. Parse it as RDF or extract fields with string
matching, as your product needs.

### Invalid combinations

If the combination is not valid, the service returns a gRPC error. One example
is a call that omits a track for a discipline that requires one:

```js
try {
  const request = pathway.DescribeJobRequest.fromObject({
    discipline: "software-engineering",
    level: "J070",
    // no track -- may be invalid depending on your standard
  });
  await pathwayClient.DescribeJob(request);
} catch (err) {
  console.error("Invalid combination:", err.message);
}
```

## Describe an agent profile

Agent profiles follow the same derivation path as roles. They also apply
agent-specific policies. The service excludes human-only skills. It keeps only
the highest-proficiency skills. It sorts skills and behaviours by strength
descending. To derive one:

```js
const request = pathway.DescribeAgentProfileRequest.fromObject({
  discipline: "software-engineering",
  track: "platform",
});

const result = await pathwayClient.DescribeAgentProfile(request);
console.log(result.content.substring(0, 500));
```

Agent profiles require the `track` field. The service derives the level
automatically. It uses the reference level for the standard.

## Analyze career progression

Compute the delta between two levels to see which skills and behaviours change:

```js
const request = pathway.DescribeProgressionRequest.fromObject({
  discipline: "software-engineering",
  from_level: "J060",
  to_level: "J070",
  track: "platform",
});

const result = await pathwayClient.DescribeProgression(request);
console.log(result.content.substring(0, 500));
```

The response describes which skills gain proficiency levels, which behaviours
gain maturity levels, and what new responsibilities appear at the target level.

## List the software toolkit

Derive the expected software tools for a role from its skill matrix:

```js
const request = pathway.ListJobSoftwareRequest.fromObject({
  discipline: "software-engineering",
  level: "J070",
  track: "platform",
});

const result = await pathwayClient.ListJobSoftware(request);
console.log(result.content.substring(0, 300));
```

The response is Turtle RDF that lists each software tool, its category, and the
skills that reference it.

## Verify

You reach the outcome of this guide when:

- `createClient("pathway")` connects without error.
- `ListJobs` returns Turtle RDF that lists all valid role combinations.
- `DescribeJob` returns a full role definition for a given discipline, level,
  and track.
- `DescribeAgentProfile` returns an agent-optimized profile for a discipline
  and track.
- `DescribeProgression` returns the delta between two levels.
- Invalid combinations produce a gRPC error. They do not produce a silent
  empty response.

If any connection fails, confirm the services run with `npx fit-rc status`.
Then check that `config/config.json` lists the correct host and port for the
pathway service.

## What's next

<div class="grid">

<!-- part:card:fetch-profile -->

</div>
