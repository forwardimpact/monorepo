# 330 — API Surface Audit

The API surface that internal contributors and services consume is the
load-bearing centre of the product stack: every service crosses it on every
request, every library exports through it, and every product depends on the
shape it presents. It needs to be clean, consistent, and well-architected. It
isn't, yet.

This document is an audit, not a change proposal. It captures the current state
of the gRPC service contracts, the librpc framework, the package export
boundaries, and the tool routing config — with concrete file:line citations —
and lists the workstreams the findings imply. Each workstream should become its
own spec.

```
specs/330-api-surface-audit/
  spec.md   This document
```

## Why

Three layers make up the API surface:

1. **gRPC service contracts** —
   `services/{agent,graph,llm,memory,tool,trace,vector,pathway}/proto/*.proto` —
   the wire-level API between services.
2. **librpc base classes** — `libraries/librpc/{server,client,base,auth}.js` —
   the framework every service extends.
3. **`@forwardimpact/lib*` package exports** — what internal contributors
   `import` from in 33 libraries.

All three have meaningful problems. The biggest are at layer 1.

## What

### Critical findings

#### 1. Two competing return-type strategies, picked at random

Some RPCs return their natural typed response. Others stuff a stringified JSON
blob into `tool.ToolCallResult.content`. There is no rule for which gets which.

| Pattern                                 | Examples                                                                                                                                                                                                       |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Natural typed response                  | `Llm.CreateCompletions → CompletionsResponse` (`services/llm/proto/llm.proto:10`); `Memory.GetWindow → WindowResponse` (`services/memory/proto/memory.proto:11`); `Trace.QuerySpans → QueryResponse`           |
| `ToolCallResult` with JSON in `.content` | `Agent.ListSubAgents`, `RunSubAgent`, `ListHandoffs`, `RunHandoff` (`services/agent/proto/agent.proto:11-14`); all 3 `Graph.*` RPCs (`services/graph/proto/graph.proto:9-11`); `Vector.SearchContent`; all 6 `Pathway.*` RPCs |

The handler then does
`tool.ToolCallResult.fromObject({ content: JSON.stringify(agentList) })`
(`services/agent/index.js:77,134,164,206`) and the consumer must `JSON.parse` it
back. Generated proto types, IDE autocomplete, and `verify()` are all defeated.

11 of 23 RPCs return `tool.ToolCallResult` with stringified JSON.

**Why it happened**: Anything called by the Tool router via `CallTool` was given
`ToolCallResult` so the router didn't have to map per-RPC types. That decision
leaked back into the source-of-truth proto contract instead of staying as a
Tool-side adaptation.

**Cost**: Every consumer of these RPCs duplicates JSON parsing; type safety is
lost; protobuf field validation is wasted; renaming a field requires grep across
stringified JSON shapes.

#### 2. `llm_token` is a wire-level proto field, not gRPC metadata

`llm_token` appears as a regular message field in:

- `services/agent/proto/agent.proto:20` — `AgentRequest.llm_token`
- `services/agent/proto/agent.proto:37` — `RunSubAgentRequest.llm_token`
- `services/llm/proto/llm.proto:15` — `EmbeddingsRequest.llm_token`
- `services/llm/proto/llm.proto:21` — `CompletionsRequest.llm_token`
- `services/tool/proto/tool.proto:49` — `ToolCall.llm_token`
- `services/vector/proto/vector.proto:14` — `TextQuery.llm_token`

The Tool service then re-injects it into downstream calls
(`services/tool/index.js:162`). A credential is logged by every request-tracing
layer that prints request bodies and propagated through up to four service hops
before reaching `libllm`. gRPC has `Metadata` for exactly this: librpc already
uses metadata for HMAC auth (`libraries/librpc/auth.js`), so the plumbing
exists.

#### 3. The Tool service swallows every error

`services/tool/index.js:80-84`:

```javascript
} catch (error) {
  return { content: JSON.stringify({ error: error.message }) };
}
```

A failed downstream call returns `200 OK` with the error stuffed into `content`.
The gRPC status stays `OK`. Compare to every other service, which throws and
lets `librpc/server.js:165-169` translate to `INTERNAL`. Consumers branching on
success or failure must double-parse the result and string-match `"error"` keys.

#### 4. Tool routing is hand-maintained string config

`config/config.example.json:87-143` lists every tool the Tool service can
dispatch to:

```json
"get_ontology": {
  "method": "graph.Graph.GetOntology",
  "request": "common.Empty"
}
```

`services/tool/index.js:54-69` parses these strings at runtime. If a service is
renamed or an RPC removed, this fails on first invocation with
`Tool endpoint not found`. There is no startup validation, no codegen pass that
emits this from the proto files, and no test that asserts every endpoint is
reachable. The codegen pipeline (`libraries/libcodegen/`) already parses every
`.proto` and could emit this map for free.

#### 5. Proto field-number gaps suggest incomplete migrations

`services/llm/proto/llm.proto:19-23`:

```protobuf
message CompletionsRequest {
  string resource_id = 1;
  string llm_token = 4;       // fields 2 and 3 are gone
  optional string model = 5;
}
```

This is wire-compatible behaviour, but it's a public sign that something was
removed without a tombstone (`reserved 2, 3;`) — easy to recreate the conflict
later.

#### 6. `bool void` hacks leak LLM provider quirks into the schema

`services/agent/proto/agent.proto:42-43`:

```protobuf
message ListHandoffsRequest {
  string resource_id = 1;
  bool void = 2;  // Ensures non-empty schema for OpenAI function calling
}
```

`products/guide/proto/common.proto:8-10` has the same pattern in `Empty`. The
OpenAI function-calling JSON-Schema constraint is being satisfied at the proto
layer. The fix belongs in `libllm`'s tool-schema generator, not in the wire
contract every consumer sees.

#### 7. Pathway accepts both `from_level` and `fromLevel`

`services/pathway/index.js:236-237`:

```javascript
const fromLevel = this.#findLevel(req.from_level ?? req.fromLevel);
const toLevel = this.#findLevel(req.to_level ?? req.toLevel);
```

The proto only declares `from_level` (`services/pathway/proto/pathway.proto:41-42`).
The fallback exists because some caller used the JS-style name and was never
cleaned up. Right now it's invisible to the audit and to new consumers.

#### 8. `libtype` monkey-patches generated proto classes at module load

`libraries/libtype/index.js:76-184` mutates `common.Message`,
`common.Conversation`, `common.Agent`, `tool.ToolFunction`, and
`tool.ToolCallMessage` — adding `withIdentifier`, replacing `fromObject` with
wrappers that auto-generate UUIDs and run token-counting passes. Every importer
of `@forwardimpact/libtype` runs these side effects. There is no opt-in. A
consumer that calls `common.Message.fromObject(plain)` gets a UUID, a parent
traversal, and a token count — none of which is documented in the proto
contract. The "type" library is actually a "type + persistence-side-effects"
library.

#### 9. Validation is reinvented in every service

Each gRPC service implements its own field checks:

- `services/memory/index.js:52` —
  `if (!req.resource_id) throw new Error("resource_id is required");`
- `services/llm/index.js:28-29` — same shape, slightly different message
- `services/trace/index.js:32-33,47-49` — bespoke
  "either query, trace_id, or resource_id" check
- `services/tool/index.js:49-50` — `if (!req?.function) throw...`

`libraries/libweb/validation.js` exists and is well-built — but only for the
HTTP edge in `services/web/`. Generated handlers do call `verify()` (e.g.
`generated/services/agent/service.js:83-84`) but `verify()` only checks proto
field types, not required-field semantics. There's no shared layer between the
two.

#### 10. Library package exports are inconsistent at the foundation

Of 33 libraries, **17 have no `exports` field** — including the most-imported
ones: `librpc`, `libconfig`, `libstorage`, `libtype`, `libweb`, `libllm`,
`libagent`, `libutil`. Without `exports`, every internal `.js` file is publicly
importable. There is no enforced public surface.

```javascript
// Both work today; the first is intended, the second isn't:
import { createStorage } from "@forwardimpact/libstorage";
import { S3Storage } from "@forwardimpact/libstorage/s3.js";
```

The 16 libraries that *do* declare `exports` are inconsistent in turn —
`libresource`, `libgraph`, and `libtool` expose `./processor/*` paths that the
source describes as internal-only batch processors.

#### 11. `createXxx` factory pattern is unevenly applied

CLAUDE.md mandates `createXxx` factories for OO+DI libraries. Reality:

- `libconfig`: 5 well-formed factories — exemplary
  (`libraries/libconfig/index.js:15-98`)
- `libstorage`, `libtelemetry`, `libpolicy`, `libformat`, `libweb`, `librpc`:
  clean
- `libagent`: **no factory at all** — exports `AgentMind` and `AgentHands`
  classes directly (`libraries/libagent/index.js`). Every consumer constructs
  them by hand.
- `libllm`: exports both the class `LlmApi` and `createLlmApi` — two valid
  paths, no guidance on which to use
- `libgraph`: `createGraphIndex` (others use the noun form, e.g. `createPolicy`,
  `createStorage`)

#### 12. Streaming asymmetry forces consumer-side branching

Only `Agent.ProcessStream` is server-streaming. Everything else is unary. The
librpc client has separate `callUnary`/`callStream`
(`libraries/librpc/client.js:90-143`). The web service has special-case stream
wiring (`services/web/index.js:90-131`). If a second streaming RPC is ever
added, every client would need parallel handling — there is no abstraction over
"call this and yield results" that hides the difference.

#### 13. Smaller architectural drift

- **`shutdown()` lifecycle hook** is implemented only by
  `services/trace/index.js:59-61`, despite `librpc/server.js:203-205` calling it
  on every service. Memory, vector, etc. silently skip flush-on-shutdown.
- **`services/web/server.js:14`** is the only service that injects
  `{ auth_enabled: false }` defaults. Every other service inherits mandatory
  HMAC auth.
- **`common.proto` lives in `products/guide/proto/`**
  (`products/guide/proto/common.proto`), not in a neutral location. Services
  depend on a *product* for their shared types.
- **`Client.callUnary` and `Client.callStream` are dead from the consumer's
  perspective.** Service code uses the auto-generated client wrappers in
  `generated/services/`. The hand-written `Client` API
  (`libraries/librpc/client.js:90-143`) is shipped but not used.

### Service / RPC matrix

| Service   | RPCs                                                                                                       | Streaming           | Returns natural type? |
| --------- | ---------------------------------------------------------------------------------------------------------- | ------------------- | --------------------- |
| `agent`   | ProcessStream, ProcessUnary, ListSubAgents, RunSubAgent, ListHandoffs, RunHandoff                          | ProcessStream only  | 2 / 6                 |
| `graph`   | QueryByPattern, GetOntology, GetSubjects                                                                   | none                | 0 / 3                 |
| `llm`     | CreateCompletions, CreateEmbeddings                                                                        | none                | 2 / 2                 |
| `memory`  | AppendMemory, GetWindow                                                                                    | none                | 2 / 2                 |
| `tool`    | CallTool                                                                                                   | none                | 1 / 1 (swallows errors) |
| `trace`   | RecordSpan, QuerySpans                                                                                     | none                | 2 / 2                 |
| `vector`  | SearchContent                                                                                              | none                | 0 / 1                 |
| `pathway` | ListJobs, DescribeJob, ListAgentProfiles, DescribeAgentProfile, DescribeProgression, ListJobSoftware       | none                | 0 / 6                 |

Service dependency graph (verified by reading each `server.js`):

```
web ──▶ agent ──┬─▶ memory
                ├─▶ llm ──▶ memory
                └─▶ tool ──▶ {graph, vector, agent, pathway}
vector ──▶ llm
```

### Workstreams the findings imply

In rough priority order. Each should become its own spec.

1. **Stop using `tool.ToolCallResult` as the universal return type.** Each RPC
   returns its natural typed response. The Tool router shapes responses for the
   LLM tool-call protocol on its side, without polluting the underlying service
   contract. Touches `agent`, `graph`, `vector`, `pathway` proto and handler
   files.
2. **Move `llm_token` to gRPC `Metadata`.** Drop it from `AgentRequest`,
   `RunSubAgentRequest`, `EmbeddingsRequest`, `CompletionsRequest`, `ToolCall`,
   `TextQuery`. librpc's auth interceptor already shows the pattern.
3. **Generate `config.tool.endpoints` from the proto definitions** in
   `libcodegen`. Eliminate the hand-maintained string map.
4. **Make `services/tool/index.js` propagate gRPC errors** instead of stuffing
   them into `content`. Let `librpc/server.js` translate to `INTERNAL`.
5. **Standardise package `exports`** across all 17 libraries that lack one.
   `librpc`, `libconfig`, `libstorage`, `libtype` first. Remove
   `processor/*` subpath leaks from `libresource`, `libgraph`, `libtool`.
6. **Add `createAgentMind` / `createAgentHands` factories to `libagent`** and
   document a single canonical entry point for `libllm`.
7. **Extract a shared validation helper** that both gRPC handlers and
   `libweb/validation.js` use, so required-field checks live in one place.
8. **Move `bool void` hacks out of the proto** and into `libllm`'s OpenAI
   tool-schema generator.
9. **Implement `shutdown()` consistently** in every service that owns mutable
   storage (memory, vector, graph).
10. **Move `common.proto` and `resource.proto`** out of `products/guide/proto/`
    into a neutral location, so services don't reach into a product for shared
    types.
11. **Either delete `Client.callUnary`/`callStream` or use them** — don't ship
    dead public APIs from the framework library.
12. **Decide on `from_level` vs `fromLevel`** in `services/pathway/index.js:236-237`
    and remove the silent fallback.
13. **Document — and contain — the `libtype` monkey-patches**. Either move them
    behind an explicit opt-in factory or rename `libtype` so its actual
    behaviour matches its name.
