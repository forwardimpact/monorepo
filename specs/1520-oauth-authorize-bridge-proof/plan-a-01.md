# Plan 1520-a Part 01 — Bridge `VerifyPendingDispatch` RPC + single-use ledger

See [plan-a.md](plan-a.md) for overview. This part adds the gRPC method
and storage ledger that Part 03's `bridge_pending_dispatch_proof`
contract calls. No consumer in this part — pure addition; safe to merge
on its own.

## Step 01.1 — Add `VerifyPendingDispatch` to the bridge proto

Add the RPC method and request shape. The response is `common.Empty`
(success is the absence of error).

**Modified:** `services/bridge/proto/bridge.proto`

```proto
service Bridge {
  // ... existing rpcs ...
  rpc VerifyPendingDispatch(VerifyPendingDispatchRequest) returns (common.Empty);
}

message VerifyPendingDispatchRequest {
  string link_token = 1;
  string expected_surface = 2;
  string expected_surface_user_id = 3;
  string tenant_id = 4;
}
```

Place the message definition adjacent to `ResolvePendingDispatchRequest`
(`services/bridge/proto/bridge.proto:71-75`) and the RPC declaration
between `ResolvePendingDispatch` and `EnqueueInbox`
(`services/bridge/proto/bridge.proto:16-17`).

**Verify:** `just codegen` regenerates without error;
`generated/services/bridge/client.js` contains a typed `VerifyPendingDispatch`
method on `BridgeClient`.

## Step 01.2 — Add the `claimed_dispatches.jsonl` index to `BridgeService`

A sibling `BufferedIndex` instance ledgering claimed `link_token`s.
Append-only; load eagerly so the handler's check-and-append runs under
the same single-instance event-loop serialisation
`ResolvePendingDispatch.compact()` already depends on
(`services/bridge/index.js:234-239`).

**Modified:** `services/bridge/index.js`

Add private field and initialiser inside the constructor, parallel to
`#pendingDispatches` at `services/bridge/index.js:54-62`:

```js
#claimedDispatches;
// ...inside constructor, after #pendingDispatches init...
this.#claimedDispatches = new BufferedIndex(
  storage,
  "claimed_dispatches.jsonl",
  {
    flush_interval: config.pending_flush_interval_ms ?? 1_000,
    max_buffer_size: 100,
  },
  { clock: this.#clock },
);
```

Add `await this.#claimedDispatches.loadData()` to `#sweep` (alongside
the other `loadData()` calls at `services/bridge/index.js:272-275`) and
include it in the `shutdown()` `Promise.all` at
`services/bridge/index.js:312-320`. The claimed ledger has no TTL —
`link_token`s are 16-byte UUIDs; the on-disk growth is bounded by the
pending-dispatch TTL window (10 min) multiplied by realistic claim
rate. Periodic compaction is a future concern, called out as a risk
below.

**Verify:** `services/bridge` boots without error;
`data/bridges/claimed_dispatches.jsonl` is created lazily on first
write (existing storage semantics).

## Step 01.3 — Implement the `VerifyPendingDispatch` handler

The handler:

1. Loads `pending_dispatches` and `claimed_dispatches` indices.
2. Looks up `link_token`. If absent → `NOT_FOUND`.
3. Compares `expected_surface` and `expected_surface_user_id` against
   the pending entry. Mismatch → `FAILED_PRECONDITION`.
4. Checks `claimed_dispatches.has(link_token)`. Already claimed →
   `FAILED_PRECONDITION`.
5. Appends `{id: link_token, claimed_at: now}` to
   `claimed_dispatches`. Flushes (`max_buffer_size: 100` is the
   buffered-flush threshold; explicit `flush()` here ensures
   durability before responding OK).
6. Returns `common.Empty`.

**Modified:** `services/bridge/index.js`

Place the method between `ResolvePendingDispatch`
(`services/bridge/index.js:213-248`) and `Sweep`
(`services/bridge/index.js:253-258`):

```js
async VerifyPendingDispatch(req) {
  await this.#pendingDispatches.loadData();
  await this.#claimedDispatches.loadData();
  const rec = this.#pendingDispatches.index.get(req.link_token);
  if (!rec)
    throw Object.assign(new Error("not found"), {
      code: grpc.status.NOT_FOUND,
    });
  if (
    rec.surface !== req.expected_surface ||
    rec.surface_user_id !== req.expected_surface_user_id
  )
    throw Object.assign(new Error("surface or surface_user_id mismatch"), {
      code: grpc.status.FAILED_PRECONDITION,
    });
  if (this.#claimedDispatches.index.has(req.link_token))
    throw Object.assign(new Error("already claimed"), {
      code: grpc.status.FAILED_PRECONDITION,
    });
  await this.#claimedDispatches.add({
    id: req.link_token,
    claimed_at: this.#clock.now(),
  });
  await this.#claimedDispatches.flush();
  return {};
}
```

**Concurrency invariant:** the `has` check and the `add` are not atomic
on their own, but `services/bridge` runs single-instance per tenant and
gRPC handlers serialise on the event loop. Two concurrent
`VerifyPendingDispatch` calls for the same `link_token` cannot both
observe "unclaimed" — the first call's `await this.#claimedDispatches.add(...)`
synchronously updates `this.#claimedDispatches.index` (via
`BufferedIndex.add` at `libraries/libindex/src/buffered.js:39-46`) before
the second call's `has(...)` synchronously reads it. The first `add`'s
flush completes before the second `add` is reached, so both calls
observe consistent state. This matches the documented invariant at
`services/bridge/index.js:234-239`.

**Verify:** `bun test services/bridge/test/` passes including the new
test below.

## Step 01.4 — Add `services/bridge/test/verify-pending.test.js`

**Created:** `services/bridge/test/verify-pending.test.js`

Cover the five outcomes:

| Case | Assertion |
|---|---|
| No pending entry for `link_token` | gRPC error with `code: NOT_FOUND` |
| Pending entry exists but `expected_surface` differs | gRPC error with `code: FAILED_PRECONDITION` |
| Pending entry exists but `expected_surface_user_id` differs | gRPC error with `code: FAILED_PRECONDITION` |
| Valid pending entry, first claim | resolves `{}`; `claimed_dispatches.jsonl` carries the `link_token` |
| Same `link_token` claimed twice | second call errors `FAILED_PRECONDITION` |

Use `createMockStorage` + `createMockClock` from `@forwardimpact/libmock`
(pattern: `services/bridge/test/bridge-dispatch.test.js`). Seed pending entries
via `PutPendingDispatch` rather than reaching into private indices — test
through the public RPC surface.

For the concurrency case, drive two `VerifyPendingDispatch` calls with
`Promise.all([call1, call2])` and assert exactly one resolves and one
rejects with `FAILED_PRECONDITION`. The single-instance event-loop
invariant makes the resolution order deterministic per invocation; the
test asserts the outcome shape, not the order.

**Verify:** `bun test services/bridge/test/verify-pending.test.js`
passes. File ≤200 LOC; no allow-list entry needed.

## Step 01.5 — Confirm proto regen and lockstep

After Steps 01.1 + 01.2 + 01.3 are committed, run:

```sh
just codegen
bun run context:fix
```

`just codegen` regenerates `generated/services/bridge/client.js` so
`BridgeClient.VerifyPendingDispatch` is callable by Part 03's
ghuser-side code. `bun run context:fix` refreshes any catalog rows.

**Verify:** `bun test` repo-wide passes;
`generated/services/bridge/client.js` contains the new method; no
diffs in unrelated catalog files.

## Risks specific to Part 01

- **Unbounded `claimed_dispatches.jsonl` growth.** No TTL on claims.
  Realistic bound: `pending_ttl_ms (10min)` × claim-rate. At 1 claim/sec
  sustained for a year, the file would carry ~31M entries (~3 GB at
  ~100 B per line). Realistic claim rate is much lower (per-user
  link-binding, not per-message). Periodic compaction or a sweep
  matching `pending_ttl_ms` is a follow-up if file size becomes a
  concern — not a hot-path concern for the security fix.
- **Bridge restart between claim and binding write.** If the bridge
  crashes after appending to `claimed_dispatches` but before ghuser's
  `Begin` returns, the pending entry is consumed (from ghuser's view)
  and the user sees a `proof_missing` on retry. Recovery: msbridge
  mints a fresh `link_token` on the next inbound message — same flow
  as a bridge outage (see plan-a cross-cutting risks).

— Staff Engineer 🛠️
