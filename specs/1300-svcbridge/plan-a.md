# Plan 1300-a — svcbridge

Execution plan for [design 1300-a](design-a.md). Stand up
`services/bridge/` as the canonical store, widen
`ResumeScheduler` so the resume lifecycle survives over a remote
backend, swap both bridges onto a `BridgeClient` through a
per-bridge `DiscussionAdapter`, and delete the two store classes from
`libbridge`. Clean break: no migration, no compat shim.

## Approach

The work is mechanical once three boundaries are settled: the proto
contract, the librpc throw-to-status mapping (one-line patch the
design's NOT_FOUND decision needs), and the `ResumeScheduler` store
contract. Stand the service package up first so the workspace symlink
exists before codegen runs (codegen scans
`node_modules/@forwardimpact/*/proto/`), then build the service
against `BufferedIndex` exactly as `libbridge` does today (same keys,
same cadences, same TTLs). The bridges keep their existing
composition — only the dependency they hand to `Dispatcher` and
`ResumeScheduler` changes (a thin `DiscussionAdapter` over the
generated client). `libbridge` loses two source files plus their
tests and the resume scheduler gains two adapter calls; everything
else in the package is untouched. Origin dedupe lands as direct
`client.HasOrigin`/`client.RecordOrigin` calls on ghbridge with no
adapter wrapper. Catalogs regenerate at the end.

## Sequencing

| # | Step | Touches |
|---|---|---|
| 1 | Propagate handler-thrown `.code` in librpc | `libraries/librpc/src/server.js`, `libraries/librpc/test/server.test.js` |
| 2 | Service package + proto + skeleton | `services/bridge/package.json`, `services/bridge/proto/bridge.proto`, `services/bridge/server.js`, `services/bridge/index.js`, `services/bridge/README.md` |
| 3 | `bun install` + `bunx fit-codegen --all` | `bun.lock`, `generated/` (regenerated artifacts) |
| 4 | Service implementation body | `services/bridge/index.js` (RPC bodies + sweep) |
| 5 | Service tests | `services/bridge/test/bridge.test.js` |
| 6 | `createMockDiscussionClient` in libmock | `libraries/libmock/src/mock/clients.js`, `libraries/libmock/src/mock/index.js` |
| 7 | Widen `ResumeScheduler` store contract + rewrite affected libbridge tests | `libraries/libbridge/src/resume-scheduler.js`, `libraries/libbridge/src/index.js` (typedef), `libraries/libbridge/test/{resume-scheduler,dispatcher,callback-handler}.test.js` |
| 8 | Delete the two store classes | `libraries/libbridge/src/{discussion-context,origin-index}.js`, `libraries/libbridge/test/{discussion-context,origin-index}.test.js`, `libraries/libbridge/src/index.js` exports |
| 9 | ghbridge: adapter + direct origin calls | `services/ghbridge/src/discussion-adapter.js` (new), `services/ghbridge/{index,server}.js`, `services/ghbridge/package.json`, `services/ghbridge/test/*.test.js` |
| 10 | msbridge: adapter | `services/msbridge/src/discussion-adapter.js` (new), `services/msbridge/{index,server}.js`, `services/msbridge/package.json`, `services/msbridge/test/*.test.js` |
| 11 | Documentation | `libraries/libbridge/{CLAUDE,README}.md`, `services/{gh,ms}bridge/README.md`, `services/CLAUDE.md` |
| 12 | Catalogs + test sweep | `bun run context:fix`, `bun test`, `bun run check` |

## Step 1 — Propagate handler-thrown `.code` in librpc

- **Modified:** `libraries/librpc/src/server.js`,
  `libraries/librpc/test/server.test.js`, `libraries/librpc/package.json`

In `wrapUnary` at `libraries/librpc/src/server.js:172-177`, replace the catch
arm with:

```js
} catch (error) {
  const code =
    typeof error?.code === "number"
      ? error.code
      : this.grpc().status.INTERNAL;
  callback({ code, message: error?.message || String(error) });
}
```

Add one test in `librpc/test/server.test.js`: a handler that throws
`Object.assign(new Error("nope"), { code: grpc.status.NOT_FOUND })` results in
the client observing `err.code === grpc.status.NOT_FOUND`. Existing tests with
handlers that throw a bare `Error` continue to see `INTERNAL` because `.code` is
undefined. `#wrapStreaming` at line 133-134 carries the same INTERNAL-rewrite
pattern; intentionally out of scope here (this service uses only unary RPCs).

Bump `librpc` minor (additive surface).

**Verify:** `bun test libraries/librpc/test/*.test.js` exits 0.

## Step 2 — Service package, proto, and skeleton

Stand up the service package so the workspace symlink resolves
before codegen runs. The skeleton compiles but throws "not
implemented" on each RPC; Step 4 fills in the bodies.

- **Created:**
  - `services/bridge/package.json`
  - `services/bridge/proto/bridge.proto`
  - `services/bridge/server.js`
  - `services/bridge/index.js`
  - `services/bridge/README.md`

`package.json` mirrors `services/trace/package.json`. Name
`@forwardimpact/svcbridge`, `bin.fit-svcbridge = ./server.js`, deps on
`libconfig`, `libindex`, `libpreflight`, `librpc`, `libstorage`, `libtelemetry`,
`libtype`; devDep on `libmock`. `description` ends in a noun phrase agents
recognise (e.g. "Canonical threaded-discussion store — single source of truth
for GitHub/Microsoft Teams bridge state."); `keywords` are five lowercase tokens
ending in `agent` (e.g. `["discussion","bridges","store","grpc","agent"]`). One
`jobs[*]` entry: user `Platform Builders`, goal
`Share threaded conversation state across bridges`, with `bigHire`/`littleHire`/
`competesWith`/`trigger` strings — copy the shape from
`services/trace/package.json:20-29`.

`proto/bridge.proto`:

```proto
syntax = "proto3";

package bridge;

import "common.proto";

service Bridge {
  rpc LoadDiscussion(LoadDiscussionRequest) returns (Discussion);
  rpc LoadDiscussionByCorrelation(LoadByCorrelationRequest) returns (Discussion);
  rpc ListOpenRecesses(common.Empty) returns (OpenRecessList);
  rpc SaveDiscussion(Discussion) returns (common.Empty);
  rpc HasOrigin(OriginKey) returns (HasOriginResponse);
  rpc RecordOrigin(Origin) returns (common.Empty);
  rpc Sweep(SweepRequest) returns (SweepResponse);
}

message Discussion {
  string id = 1;
  string channel = 2;
  string discussion_id = 3;
  string lead = 4;
  int64 last_active_at = 5;
  repeated int64 dispatches = 6;
  repeated HistoryEntry history = 7;
  repeated Participant participants = 8;
  map<string, OpenRfc> open_rfcs = 9;
  map<string, string> pending_callbacks = 10;
}

message HistoryEntry { string role = 1; string text = 2; }
message Participant {
  string name = 1; string kind = 2;
  optional string external_id = 3; string metadata_json = 4;
}
message ResumeTrigger {
  string kind = 1;
  optional int64 responses = 2;
  optional string elapsed = 3;
}
message OpenRfc {
  ResumeTrigger trigger = 1;
  int64 opened_at = 2;
  int64 history_index_at_open = 3;
  optional int64 due_at = 4;
}
message Origin { string id = 1; string discussion_id = 2; int64 posted_at = 3; }

message LoadDiscussionRequest { string channel = 1; string discussion_id = 2; }
message LoadByCorrelationRequest { string correlation_id = 1; }
message OriginKey { string id = 1; }
message HasOriginResponse { bool exists = 1; }
message OpenRecessRef { string correlation_id = 1; int64 due_at = 2; }
message OpenRecessList { repeated OpenRecessRef refs = 1; }
message SweepRequest { optional int64 now = 1; }
message SweepResponse { int32 evicted_discussions = 1; int32 evicted_origins = 2; }
```

`server.js` — defaults declared here, matching
`services/ghbridge/server.js:15-22`:

```js
#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { createServiceConfig } from "@forwardimpact/libconfig";
import { createLogger } from "@forwardimpact/libtelemetry";
import { Server, createTracer } from "@forwardimpact/librpc";
import { createStorage } from "@forwardimpact/libstorage";

import { BridgeService } from "./index.js";

const config = await createServiceConfig("bridge", {
  discussion_flush_interval_ms: 5_000,
  discussion_max_buffer_size: 1_000,
  origin_flush_interval_ms: 1_000,
  origin_max_buffer_size: 100,
  conversation_ttl_ms: 24 * 60 * 60 * 1000,
  origin_ttl_ms: 24 * 60 * 60 * 1000,
  sweep_interval_ms: 60_000,
});
const logger = createLogger("bridge");
const tracer = await createTracer("bridge");
const storage = createStorage("bridges");

const service = new BridgeService(config, { storage, logger, tracer });
await new Server(service, config).start();
```

`createServiceConfig("bridge")` roots the namespace at `service.bridge.*`; the
per-key names above land at `service.bridge.conversation_ttl_ms`, etc. The
`discussion_` / `origin_` prefixes on the buffer keys disambiguate the two
sub-stores within one config block (one service, two `BufferedIndex` instances).

`index.js` skeleton — RPC bodies stubbed to
`throw new Error("not implemented")`, ready for Step 4:

```js
import { services } from "@forwardimpact/librpc";

const { BridgeBase } = services;

export class BridgeService extends BridgeBase {
  constructor(config, { storage, logger, tracer }) {
    super(config);
    // Stored for Step 4
    this.storage = storage;
    this.logger = logger;
    this.tracer = tracer;
  }
  async LoadDiscussion(_req) { throw new Error("not implemented"); }
  async LoadDiscussionByCorrelation(_req) { throw new Error("not implemented"); }
  async ListOpenRecesses(_req) { throw new Error("not implemented"); }
  async SaveDiscussion(_req) { throw new Error("not implemented"); }
  async HasOrigin(_req) { throw new Error("not implemented"); }
  async RecordOrigin(_req) { throw new Error("not implemented"); }
  async Sweep(_req) { throw new Error("not implemented"); }
  async shutdown() {}
}
```

**Verify:** the package.json validates against `services/CLAUDE.md` §
package.json metadata (description ends with agent-recognisable phrase, keywords
end in `agent`, jobs entry is Little Hire shape).

## Step 3 — `bun install` and codegen

- **Modified:** `bun.lock`, `generated/` (regenerated)

Run:

```sh
bun install
bunx fit-codegen --all
```

`bun install` materialises the workspace symlink at
`node_modules/@forwardimpact/svcbridge`. `fit-codegen` then
discovers `services/bridge/proto/bridge.proto` (via
`libcodegen/bin/fit-codegen.js:140-147`) and emits:

- `generated/proto/bridge.proto`
- `generated/services/bridge/{service.js,client.js}`
- `generated/types/bridge/*`
- updated `generated/services/exports.js` (new `BridgeBase`, `BridgeClient`
  lines)
- updated `generated/definitions/exports.js`

**Verify:** `generated/services/exports.js` lists `BridgeBase` and
`BridgeClient`; the generated client (`generated/services/bridge/client.js`)
enforces `req instanceof bridge.<Request>` per the codegen pattern (see
`generated/services/trace/client.js:31-35`).

## Step 4 — Service implementation body

- **Modified:** `services/bridge/index.js`

Replace the stubs. Constructor builds two `BufferedIndex` instances against the
shared storage and starts the sweep timer:

```js
import { BufferedIndex } from "@forwardimpact/libindex";
import { services } from "@forwardimpact/librpc";
import grpc from "@grpc/grpc-js";
import { bridge } from "@forwardimpact/libtype";

const { BridgeBase } = services;

export class BridgeService extends BridgeBase {
  #discussions;
  #origins;
  #conversationTtlMs;
  #originTtlMs;
  #sweepTimer;

  constructor(config, { storage, logger, tracer }) {
    super(config);
    this.#discussions = new BufferedIndex(storage, "discussions.jsonl", {
      flush_interval: config.discussion_flush_interval_ms,
      max_buffer_size: config.discussion_max_buffer_size,
    });
    this.#origins = new BufferedIndex(storage, "origins.jsonl", {
      flush_interval: config.origin_flush_interval_ms,
      max_buffer_size: config.origin_max_buffer_size,
    });
    this.#conversationTtlMs = config.conversation_ttl_ms;
    this.#originTtlMs = config.origin_ttl_ms;
    this.#sweepTimer = setInterval(
      () => { this.#sweep(Date.now()).catch((e) => logger.error?.("sweep", e)); },
      config.sweep_interval_ms,
    );
    this.#sweepTimer.unref();
  }
  // ...
}
```

RPC bodies, one-to-one with the design's § RPC contract:

| RPC | Body |
|---|---|
| `LoadDiscussion` | `await this.#discussions.loadData(); const rec = this.#discussions.index.get(`${req.channel}:${req.discussion_id}`); if (!rec) throw Object.assign(new Error("not found"), { code: grpc.status.NOT_FOUND }); return bridge.Discussion.fromObject(rec);` |
| `LoadDiscussionByCorrelation` | `await this.#discussions.loadData(); for (const rec of this.#discussions.index.values()) if (rec.pending_callbacks?.[req.correlation_id] !== undefined \|\| rec.open_rfcs?.[req.correlation_id]) return bridge.Discussion.fromObject(rec); throw Object.assign(new Error("not found"), { code: grpc.status.NOT_FOUND });` |
| `ListOpenRecesses` | `await this.#discussions.loadData(); const refs = []; for (const rec of this.#discussions.index.values()) for (const [cid, rfc] of Object.entries(rec.open_rfcs ?? {})) if (typeof rfc.due_at === "number") refs.push({ correlation_id: cid, due_at: rfc.due_at }); return { refs };` |
| `SaveDiscussion` | `await this.#discussions.add(req); return {};` |
| `HasOrigin` | `return { exists: await this.#origins.has(req.id) };` |
| `RecordOrigin` | `await this.#origins.add(req); return {};` |
| `Sweep` | `const now = req.now ?? Date.now(); const { evicted_discussions, evicted_origins } = await this.#sweep(now); return { evicted_discussions, evicted_origins };` |

`#sweep(now)` walks both indexes:

- Discussions: evict where
  `now - (record.last_active_at ?? 0) > this.#conversationTtlMs`.
- Origins: evict where `now - (record.posted_at ?? 0) > this.#originTtlMs`.

`LoadByCorrelation` walks two map locations because the workflow path correlates
by `pending_callbacks` token-to-cid map and the resume path correlates by
`open_rfcs[cid]` — both surfaces lookups by correlation id.

`shutdown()` clears the sweep timer and awaits
`Promise.all([this.#discussions.flush(), this.#origins.flush()])`.

**Verify:** `bun test services/bridge/test/*.test.js` exits 0 (Step 5).

## Step 5 — Service tests

Mirror `services/trace/test/trace.test.js` shape.

- **Created:** `services/bridge/test/bridge.test.js`

Cases (test names quoted):

1. `"LoadDiscussion on unknown (channel, discussion_id) rejects with NOT_FOUND"`
   — assert `err.code === grpc.status.NOT_FOUND`.
2. `"SaveDiscussion then LoadDiscussion round-trips every field"` — covers `id`,
   `channel`, `discussion_id`, `lead`, `last_active_at`, `dispatches`,
   `history`, `participants[*].metadata_json` opaque JSON, `open_rfcs`,
   `pending_callbacks`.
3. `"HasOrigin returns false for unknown id; true after RecordOrigin"`.
4. `"LoadDiscussionByCorrelation finds record via pending_callbacks map"`.
5. `"LoadDiscussionByCorrelation finds record via open_rfcs map"`.
6. `"LoadDiscussionByCorrelation rejects with NOT_FOUND when no record owns the id"`.
7. `"ListOpenRecesses emits one entry per open_rfcs[*] with due_at; omits entries without due_at"`.
8. `"Sweep evicts discussions whose last_active_at is older than conversation_ttl_ms"`.
9. `"Sweep evicts origins whose posted_at is older than origin_ttl_ms"` — covers
   the new per-server origin TTL behaviour the design § Storage layout
   introduces.
10. `"Concurrent SaveDiscussion from two channels both land"`.

Use `createMockConfig("bridge", { …Step 2 defaults })`, `createMockStorage()`,
`createMockLogger()` from `libmock`. RPC bodies are called directly on the
service instance (in-process), same as the trace service tests.

**Verify:** all ten tests pass.

## Step 6 — `createMockDiscussionClient` in libmock

- **Modified:** `libraries/libmock/src/mock/clients.js`,
  `libraries/libmock/src/mock/index.js`, `libraries/libmock/package.json`

Add a factory shaped like `createMockTraceClient`. Spies resolve to plain
objects matching what the generated client returns after `toObject(...)` (the
bridges only consume `.exists`, `.refs`, and the record fields directly):

```js
import grpc from "@grpc/grpc-js";

function notFound() {
  return Object.assign(new Error("not found"), { code: grpc.status.NOT_FOUND });
}

export function createMockDiscussionClient(overrides = {}) {
  return {
    LoadDiscussion: spy(() => Promise.reject(notFound())),
    LoadDiscussionByCorrelation: spy(() => Promise.reject(notFound())),
    ListOpenRecesses: spy(() => Promise.resolve({ refs: [] })),
    SaveDiscussion: spy(() => Promise.resolve({})),
    HasOrigin: spy(() => Promise.resolve({ exists: false })),
    RecordOrigin: spy(() => Promise.resolve({})),
    Sweep: spy(() => Promise.resolve({ evicted_discussions: 0, evicted_origins: 0 })),
    ...overrides,
  };
}
```

Re-export from `libmock/src/mock/index.js`. Bump `libmock` minor (new public
export).

**Verify:** `bun test libraries/libmock/test/*.test.js` exits 0.

## Step 7 — Widen `ResumeScheduler` store contract

- **Modified:** `libraries/libbridge/src/resume-scheduler.js`,
  `libraries/libbridge/src/index.js` (typedef),
  `libraries/libbridge/test/{resume-scheduler,dispatcher,callback-handler}.test.js`

| Today | Replace with |
|---|---|
| `if (!this.#store.loaded) await this.#store.loadData();` in `rearm()` (line 140); `for (const record of this.#store.index.values()) { ... open.due_at }` (lines 141-149) | `const refs = await this.#store.listOpenRecesses();` then `for (const { correlationId, dueAt } of refs) this.#elapsed.schedule(correlationId, dueAt);` |
| `if (!this.#store.loaded) await this.#store.loadData();` + `for (const record of this.#store.index.values()) if (record?.open_rfcs?.[correlationId])` in `#findContextWithRfc()` (lines 222-230) | `const ctx = await this.#store.loadByCorrelation(correlationId); if (!ctx) return null; return { ctx, rfc: ctx.open_rfcs[correlationId] };` |

`processInbound`, `enterRecess`, `cancelRecess`, and `#fireElapsed`'s
`add`+`flush` tail are unchanged.

Add a `@typedef DiscussionAdapter` to `libraries/libbridge/src/index.js`'s
typedef block (next to `BridgeConfig`):

```js
/**
 * @typedef {object} DiscussionAdapter
 * @property {(channel: string, discussionId: string) => Promise<object|null>} loadByChannel
 * @property {(correlationId: string) => Promise<object|null>} loadByCorrelation
 * @property {() => Promise<Array<{correlationId: string, dueAt: number}>>} listOpenRecesses
 * @property {(ctx: object) => Promise<void>} add
 * @property {() => Promise<void>} flush
 * @property {() => Promise<void>} shutdown
 */
```

Update `dispatcher.js`, `callback-handler.js`, `token-resolver.js`, and
`resume-scheduler.js` JSDoc to reference this typedef in place of
`DiscussionContextStore`. The `token-resolver.js` file (added by spec 1320) has
no store dependency and is unaffected by the contract change; only its JSDoc
type reference in `dispatcher.js` needs the `DiscussionContextStore` →
`DiscussionAdapter` rename.

Rewrite `resume-scheduler.test.js`, `dispatcher.test.js`, and
`callback-handler.test.js` to drop `DiscussionContextStore`. Each builds a small
in-memory `FakeAdapter` keyed by `id` with `loadByChannel`, `loadByCorrelation`,
`listOpenRecesses`, `add`, `flush`, `shutdown` methods backed by a `Map`. Same
coverage, smaller surface.

**Verify:**
`bun test libraries/libbridge/test/resume-scheduler.test.js libraries/libbridge/test/dispatcher.test.js libraries/libbridge/test/callback-handler.test.js`
exits 0.

## Step 8 — Delete the two store classes from libbridge

- **Deleted:** `libraries/libbridge/src/discussion-context.js`,
  `libraries/libbridge/src/origin-index.js`,
  `libraries/libbridge/test/discussion-context.test.js`,
  `libraries/libbridge/test/origin-index.test.js`
- **Modified:** `libraries/libbridge/src/index.js`,
  `libraries/libbridge/package.json`

Drop the two export lines at `libraries/libbridge/src/index.js:19-20`
(`DiscussionContextStore` and `OriginIndex`). All other exports — including
`TokenResolver` (line 27, added by spec 1320), `ProgressTicker` (line 21), and
the typedef block — remain. Bump `libbridge` minor (`0.x` breaking surface
change).

**Verify:** `bun test libraries/libbridge/test/*.test.js` exits 0;
`bun run check` exits 0 (no orphan imports).

## Step 9 — ghbridge: adapter + direct origin calls

- **Created:** `services/ghbridge/src/discussion-adapter.js`
- **Modified:** `services/ghbridge/index.js`, `services/ghbridge/server.js`,
  `services/ghbridge/package.json`, `services/ghbridge/test/webhook.test.js`,
  `services/ghbridge/test/callback.test.js`,
  `services/ghbridge/test/resume.test.js`,
  `services/ghbridge/test/dispatch-auth.test.js`,
  `services/ghbridge/test/reply-path.test.js`,
  `services/ghbridge/test/startup.test.js`

`discussion-adapter.js` — typed-message construction at every call site (the
generated client throws `TypeError` if `req` is not an instance of the proto
message; see `generated/services/trace/client.js:31-35`):

```js
import grpc from "@grpc/grpc-js";
import { common, bridge } from "@forwardimpact/libtype";

const isNotFound = (err) => err?.code === grpc.status.NOT_FOUND;

export class DiscussionAdapter {
  #client;
  constructor(client) { this.#client = client; }

  async loadByChannel(channel, id) {
    try {
      return await this.#client.LoadDiscussion(
        bridge.LoadDiscussionRequest.fromObject({ channel, discussion_id: id }),
      );
    } catch (err) { if (isNotFound(err)) return null; throw err; }
  }
  async loadByCorrelation(correlationId) {
    try {
      return await this.#client.LoadDiscussionByCorrelation(
        bridge.LoadByCorrelationRequest.fromObject({ correlation_id: correlationId }),
      );
    } catch (err) { if (isNotFound(err)) return null; throw err; }
  }
  async listOpenRecesses() {
    const { refs } = await this.#client.ListOpenRecesses(
      common.Empty.fromObject({}),
    );
    return refs.map((r) => ({ correlationId: r.correlation_id, dueAt: r.due_at }));
  }
  async add(ctx) {
    await this.#client.SaveDiscussion(bridge.Discussion.fromObject(ctx));
  }
  async flush() {}
  async shutdown() {}
}
```

`ghbridge/index.js`:

- Drop `DiscussionContextStore` and `OriginIndex` from the libbridge import.
  Keep `TokenResolver` and all other imports (spec 1320 added `TokenResolver`;
  the full current import list is `Acknowledgement`, `CallbackRegistry`,
  `DiscussionContextStore`, `Dispatcher`, `OriginIndex`, `RateLimiter`,
  `ResumeScheduler`, `TokenResolver`, `appendHistory`, `buildPrompt`,
  `createBridgeServer`, `createCallbackHandler`, `newDiscussionContext`,
  `normalizeBaseUrl`, `validateCallbackPayload`).
- Add `import { DiscussionAdapter } from "./src/discussion-adapter.js";` and
  `import { bridge } from "@forwardimpact/libtype";`. No alias is needed:
  `#handleDiscussionCreated` and `#handleDiscussionComment` declare a
  `const discussion = body.discussion;` local, but the libtype namespace is now
  `bridge`, so it no longer collides with that local.
- Constructor signature: replace `storage` dep with `discussionClient`. Keep
  `ghauthClient` (added by spec 1320 — the constructor validates it at line 94
  and passes `new TokenResolver(deps.ghauthClient)` to `Dispatcher`). Wrap once:
  `this.#store = new DiscussionAdapter(discussionClient); this.#client = discussionClient;`.
  Hand `this.#store` to `Dispatcher`, `ResumeScheduler`, `createCallbackHandler`
  exactly as before. Drop `#origins` field entirely.
- In `#handleDiscussionComment`: replace `await this.#origins.has(commentId)`
  with
  `(await this.#client.HasOrigin(bridge.OriginKey.fromObject({ id: commentId }))).exists`.
- In `#handleReply`: the `recordOrigin` callback becomes
  `async (comment) => this.#client.RecordOrigin(bridge.Origin.fromObject({ id: comment.id, discussion_id: ctx.discussion_id, posted_at: Date.now() }))`.
  Drop the trailing `await this.#origins.flush()`. The `#renderDeclined` method
  (added by spec 1320) also has `recordOrigin` callbacks with
  `this.#origins.add` and `this.#origins.flush()` — apply the same
  transformation there.
- In `stop()`: the sequence is now
  `this.#resume.clear(); await this.#bridge.stop();` —
  `await this.#origins.shutdown()` and `await this.#store.shutdown()` both go
  away (the adapter's `shutdown()` is a no-op; the service owns buffer draining
  via librpc's SIGTERM handler).

`ghbridge/server.js`:

- Drop `createStorage` import (line 9) and the
  `const storage = createStorage("bridges/ghbridge");` line (line 26).
- The file already imports `{ clients, createTracer }` from
  `@forwardimpact/librpc` (line 10, added by spec 1320 for `GhauthClient`). Add
  `BridgeClient` to the destructured `clients` import:
  `const { GhauthClient, BridgeClient } = clients;`. Construct
  `const bridgeConfig = await createServiceConfig("bridge");` and
  `const discussionClient = new BridgeClient(bridgeConfig, logger, tracer);`
  alongside the existing `ghauthClient` construction (lines 46-48).
- Replace `storage` with `discussionClient` on the deps object (line 53). Keep
  `ghauthClient` (line 57).

`ghbridge/package.json`: drop `@forwardimpact/libstorage` dep; ensure
`@forwardimpact/libtype` is added (used by `discussion-adapter.js`). Bump minor.

Tests: swap `storage: createMockStorage()` for
`discussionClient: createMockDiscussionClient({ /* per-test overrides */ })`.
Keep the existing `ghauthClient` mock (added by spec 1320 — see
`dispatch-auth.test.js` and `startup.test.js`). The self-echo test in
`webhook.test.js` configures `HasOrigin` to resolve `{ exists: true }` for the
seeded comment id and asserts dispatch is skipped. `resume.test.js` configures
the mock `discussionClient` so `LoadDiscussion` returns the seeded record,
`LoadDiscussionByCorrelation` returns it under the open RFC's correlation id,
and `ListOpenRecesses` returns `{ refs: [{ correlation_id, due_at }] }` so
`rearm()` arms the elapsed timer. `dispatch-auth.test.js`, `reply-path.test.js`,
and `startup.test.js` (added by spec 1320) need the same `storage` →
`discussionClient` swap.

**Verify:** `bun test services/ghbridge/test/*.test.js` exits 0.

## Step 10 — msbridge: adapter

- **Created:** `services/msbridge/src/discussion-adapter.js` (same shape as Step
  9; extraction to a shared module is a follow-up if a third bridge ever lands)
- **Modified:** `services/msbridge/index.js`, `services/msbridge/server.js`,
  `services/msbridge/package.json`, `services/msbridge/test/msbridge.test.js`,
  `services/msbridge/test/resume.test.js`,
  `services/msbridge/test/dispatch-auth.test.js`,
  `services/msbridge/test/startup.test.js`

Mirror Step 9 minus the origin paths (msbridge has no `OriginIndex` import
today). msbridge already has the `ghauthClient` dependency (spec 1320 —
`server.js` imports `{ clients }` from librpc at line 6 and constructs
`GhauthClient` at lines 20-22; `index.js` constructor validates it at line 77
and passes `new TokenResolver(ghauthClient)` to `Dispatcher`). Add
`BridgeClient` alongside `GhauthClient` following the same pattern as Step 9.
Drop the libstorage dep from `package.json`; add `libtype`; bump minor.

**Verify:** `bun test services/msbridge/test/*.test.js` exits 0.

## Step 11 — Documentation

- **Modified:** `libraries/libbridge/CLAUDE.md`,
  `libraries/libbridge/README.md`, `services/ghbridge/README.md`,
  `services/msbridge/README.md`, `services/CLAUDE.md`

`libbridge/CLAUDE.md`:

- Drop the "Caller-injected storage" bullet from § Invariants — the
  caller-injected-storage invariant moves to `services/bridge`.
- Drop the `DiscussionContextStore` and `OriginIndex` rows from the § What lives
  where table.
- In § Bridge contract step 3 of the composition recipe, replace "construct a
  `Dispatcher` over a `CallbackRegistry` and `DiscussionContextStore`" with
  "construct a `Dispatcher` over a `CallbackRegistry` and a host-supplied object
  satisfying the `DiscussionAdapter` typedef — see `services/bridge`".

`libbridge/README.md`:

- Drop `DiscussionContextStore` from the example import.

`services/ghbridge/README.md` and `services/msbridge/README.md`:

- Replace the "Discussion context is persisted as JSONL under
  `data/bridges/{ghbridge,msbridge}/`" prose with: "Discussion state is owned by
  `services/bridge`; the bridge talks to it over gRPC. The bridge process keeps
  no on-disk discussion state of its own. Operators upgrading from a bridge that
  predates this service can safely delete legacy
  `data/bridges/{ghbridge,msbridge}/` files; conversations in flight at cutover
  are un-resumable on the new service and the legacy files expire under their
  existing 24-hour TTL on disk regardless."
- Add a § Service supervision note: "If you supervise `ghbridge`/`msbridge` via
  `fit-rc`, list `bridge` ahead of the bridge entries in `init.services` so
  `createClient('bridge', …)` resolves at startup."

`services/CLAUDE.md`:

- In § Runtime data, replace
  `indexes in `data/bridges/<name>/` (managed by `libindex`)` with:
  `bridge discussion + origin state at `data/bridges/discussions.jsonl` and `data/bridges/origins.jsonl` (owned by `services/bridge`)`.

**Verify:** `bun run context` exits 0 (no doc length / jsdoc breaks).

## Step 12 — Catalogs and full sweep

- **Modified (generated):** `services/README.md`, `JTBD.md`

Run:

```sh
bun run context:fix
bun test
bun run check
```

`context:fix` regenerates the services catalog row and the JTBD entry from the
new `services/bridge/package.json`. The full `bun test` sweep exercises the
cross-package boundary (`libbridge` ResumeScheduler against in-memory
FakeAdapter; bridges against `createMockDiscussionClient`; the bridge service
against `createMockStorage`).

The spec's "no shipped starter bundles the bridges today, so § Service
supervision support is vacuously satisfied" claim is verified mechanically:
`rg 'ghbridge|msbridge' products/*/starter/` returns no matches.

The spec's "per-bridge files are no longer written" criterion is verified
mechanically: `rg "createStorage\\(\"bridges/(gh|ms)bridge\"\\)"` returns no
matches after Step 9/10.

**Verify:** all checks green.

## Risks

- **Proto `int64` JSON shape.** The wire types `OpenRfc.due_at`,
  `Origin.posted_at`, and `OpenRfc.history_index_at_open` are `int64`.
  `protobuf.js` returns these as `Long` instances or strings depending on loader
  config; the existing protos already use `int64`
  (`trace.Span.start_time_unix_nano` etc.) and consumers treat them as numbers,
  so the prevailing loader config is `longs: Number` or equivalent — confirm by
  exercising case 7 in Step 5 (`ListOpenRecesses` returns `due_at` consumable as
  a `number` by `setTimeout`).
- **`bun.lock` churn from new workspace member.** `bun install` after adding
  `services/bridge/package.json` updates the lockfile to record the new
  workspace. Expected.

Libraries used: `@forwardimpact/libindex` (`BufferedIndex`),
`@forwardimpact/librpc` (`Server`, `createClient`, `createTracer`,
`services.BridgeBase`, `grpc.status`), `@forwardimpact/libstorage`
(`createStorage`), `@forwardimpact/libconfig` (`createServiceConfig`),
`@forwardimpact/libtelemetry` (`createLogger`), `@forwardimpact/libpreflight`
(`node22`), `@forwardimpact/libtype` (`bridge.*` typed messages),
`@forwardimpact/libmock` (`createMockConfig`, `createMockStorage`,
`createMockLogger`, `createMockDiscussionClient` — new in Step 6).

## Execution

Single agent, sequential. The steps share too much context for parallel
execution to pay off (Step 1's librpc patch unblocks Step 4's NOT_FOUND throws;
Step 2's package.json must exist before Step 3's codegen; Step 7's contract
change is consumed by Step 9/10's adapter wiring). Route to `staff-engineer` via
`kata-implement`. One PR titled
`feat(svcbridge): canonical store for both bridges`.

— Staff Engineer 🛠️
