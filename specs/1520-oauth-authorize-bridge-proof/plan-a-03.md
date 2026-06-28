# Plan 1520-a Part 03 — ghuser identity-proof registry + atomic three-removal + migration

See [plan-a.md](plan-a.md) for overview. This part lands the structural
fix: a per-surface identity-proof registry that replaces the surface
allowlist triad; `BridgeClient` wiring in `services/ghuser`; the
pre-fix binding migration; and the atomic removal of the kill-switch,
the `GetToken` quarantine, and the hardcoded `github-discussions`
identity-mismatch path. Merges **after** Parts 01 and 02 are on `main`.
Release tag must be cut the same day this merges.

## Step 03.1 — Add the identity-proof registry

A frozen `Map<string, ContractRecord>` keyed by surface. Lookup miss
returns the same `proof_missing` outcome as a failed proof (no
side-channel for enumerating configured surfaces).

**Created:** `services/ghuser/src/identity-contracts.js`

```js
/**
 * @typedef {object} BeginContractArgs
 * @property {object} req - Inbound BeginRequest fields (surface, surface_user_id, client_state, …).
 * @property {object} bridgeClient - Injected bridge gRPC client.
 *
 * @typedef {object} CompleteContractArgs
 * @property {object} flow - Consumed flow row from FlowStore.
 * @property {string} authorizedGithubId - Authenticated GitHub user id from token exchange.
 *
 * @typedef {object} ContractRecord
 * @property {"Begin" | "Complete"} evaluatedAt
 * @property {(args: BeginContractArgs | CompleteContractArgs) => Promise<{outcome: "ok" | "proof_missing" | "identity_mismatch"}>} evaluate
 *   The dispatch in `index.js` picks the right argument bag by reading
 *   `contract.evaluatedAt`; each contract destructures only the fields
 *   it needs.
 */

/**
 * `bridge_pending_dispatch_proof` — cross-validates the asserted
 * `(surface, surface_user_id, client_state)` against a single-use
 * pending entry held by `services/bridge`. Evaluates at `Begin`. Fail-closed
 * on any non-OK bridge return: NOT_FOUND, FAILED_PRECONDITION, transport
 * error, malformed response all collapse to `proof_missing`.
 *
 * @type {ContractRecord}
 */
export const bridgePendingDispatchProof = {
  evaluatedAt: "Begin",
  async evaluate({ req, bridgeClient }) {
    if (!req.client_state) return { outcome: "proof_missing" };
    try {
      await bridgeClient.VerifyPendingDispatch({
        link_token: req.client_state,
        expected_surface: req.surface,
        expected_surface_user_id: req.surface_user_id,
        tenant_id: "",
        // Empty string is the documented design choice
        // (design-a.md § Key decisions row `tenant_id` plumbing).
        // Threading a real tenant through `/authorize` is deferred to a
        // future multi-tenant spec; the proto field is carried for idiom
        // parity so that future change updates one site, not three.
      });
      return { outcome: "ok" };
    } catch {
      return { outcome: "proof_missing" };
    }
  },
};

/**
 * `github_account_equality` — preserves today's account-id check for
 * `github-discussions`. Evaluates at `Complete`; needs `flow.surface_user_id`
 * and the authorized GitHub account id.
 *
 * @type {ContractRecord}
 */
export const githubAccountEquality = {
  evaluatedAt: "Complete",
  async evaluate({ flow, authorizedGithubId }) {
    if (authorizedGithubId !== flow.surface_user_id)
      return { outcome: "identity_mismatch" };
    return { outcome: "ok" };
  },
};

/**
 * Surface → contract registry. Lookup miss is **not** distinguishable
 * from a failed proof — both routes collapse to `proof_missing`
 * (design key decision § Default for new surfaces).
 *
 * Adding a new surface requires registering one record here. There is
 * no boot-time validation of "configured surface set" because surfaces
 * are discovered from request fields, not config.
 */
export const IDENTITY_CONTRACTS = new Map([
  ["github-discussions", githubAccountEquality],
]);

// Every other surface (today: `msteams`, future channels) falls back
// here via the lookup-miss path.
export const DEFAULT_CONTRACT = bridgePendingDispatchProof;

/**
 * @param {string} surface
 * @returns {ContractRecord}
 */
export function lookupContract(surface) {
  return IDENTITY_CONTRACTS.get(surface) ?? DEFAULT_CONTRACT;
}
```

**Note:** `evaluate` signatures differ between the two contracts —
`bridge_pending_dispatch_proof` reads `{req, bridgeClient}`, while
`github_account_equality` reads `{flow, authorizedGithubId}`. The
single-object-arg shape makes "callsite passes the wrong bag" a
loud `undefined`-property failure rather than a silent positional
swap. The dispatch in `index.js` (Step 03.3) picks the right bag based
on `contract.evaluatedAt`.

**Verify:** import works;
`lookupContract("github-discussions") === githubAccountEquality`;
`lookupContract("msteams") === bridgePendingDispatchProof`;
`lookupContract("unknown") === bridgePendingDispatchProof`.

## Step 03.2 — Add `BridgeClient` to `GhuserService` and wire in `server.js`

Use the canonical `await createServiceConfig("bridge")` pattern (matches
`services/ghbridge/server.js:64` and `services/msbridge/server.js:38`).
No new ghuser config keys; the bridge collaborator is located via the
existing `service.bridge` config block consumed by both other bridges.
This supersedes the design's "Bridge client wiring" row note about
`bridge_host`/`bridge_port` on ghuser — `assertNonEmpty` does not accept
numeric values (`libraries/libpreflight/src/assert-non-empty.js:10-13`
rejects everything but non-empty strings, arrays, and Sets), and adding
two ghuser-only env keys would diverge from the established pattern with
no functional benefit. Design row is treated as a deviation in this plan.

**Modified:** `services/ghuser/server.js`

```js
// new imports alongside server.js:4-13
import { clients, Server, createTracer } from "@forwardimpact/librpc";
const { BridgeClient } = clients;

// add after existing client/storage init, before GhuserService construction
const bridgeConfig = await createServiceConfig("bridge");
const bridgeClient = new BridgeClient(bridgeConfig, runtime, logger, tracer);

// thread into service constructor
const service = new GhuserService(config, {
  bindings,
  flows,
  grants,
  github,
  clock,
  idpOrigin: config.idp_origin,
  trustedOrigins,
  ticketSecret: config.link_completion_ticket_secret,
  bridgeClient,
});
```

No additions to the ghuser `createServiceConfig` defaults block; no new
`assertNonEmpty` calls. Existing `services/bridge` config drives the
client (host/port resolved by `createServiceConfig("bridge")` from
`config/config.json` and `SERVICE_BRIDGE_*` env vars).

**Modified:** `services/ghuser/index.js` constructor — accept
`bridgeClient` in the deps object and store as `#bridgeClient`:

```js
// add to private fields (alongside services/ghuser/index.js:33-41)
#bridgeClient;

// add to constructor deps destructure at index.js:64-73
constructor(config, { bindings, flows, grants, github, clock, idpOrigin,
                      trustedOrigins, ticketSecret, bridgeClient }) {
  // ... existing asserts ...
  if (!bridgeClient) throw new Error("bridgeClient is required");
  this.#bridgeClient = bridgeClient;
  // ... existing assignments ...
}
```

**Verify:** `bun test services/ghuser/test/` passes after fixture
updates in Step 03.6a.

## Step 03.3 — Rewrite `Begin` and `Complete` to dispatch through the registry

Atomic with Steps 03.4 (kill-switch removal) and 03.5 (quarantine
removal): the kill-switch / quarantine constants disappear from
`index.js` in the same commit that lands the registry dispatch.

**Modified:** `services/ghuser/index.js`

Replace the `Begin` body at `services/ghuser/index.js:92-116`:

```js
async Begin(req) {
  const contract = lookupContract(req.surface);
  if (contract.evaluatedAt === "Begin") {
    const { outcome } = await contract.evaluate({
      req,
      bridgeClient: this.#bridgeClient,
      flow: null,
    });
    if (outcome !== "ok") return { outcome };
  }

  const state = crypto.randomUUID();
  const redirectUri = `${this.#linkBaseUrl}/callback`;

  await this.#flows.add({
    id: state,
    surface: req.surface,
    surface_user_id: req.surface_user_id,
    code_challenge: req.code_challenge ?? null,
    redirect_uri: req.redirect_uri ?? null,
    client_state: req.client_state ?? null,
    created_at: this.#clock.now(),
  });

  const upstreamUrl = this.#github.authorizeUrl({
    state,
    redirectUri,
    scopes: req.scopes ?? [],
  });

  return { upstream_authorize_url: upstreamUrl, state };
}
```

Replace the `Complete` body at `services/ghuser/index.js:122-186`,
folding the hardcoded `GITHUB_ID_SURFACES` check into the registry
dispatch:

```js
async Complete(req) {
  const flow = await this.#flows.consume(req.state);
  if (!flow) throw new Error("Unknown or expired flow state");

  const redirectUri = `${this.#linkBaseUrl}/callback`;
  const tokens = await this.#github.exchangeCode(req.code, redirectUri);

  const authorizedGithubId = String(
    await this.#github.getUser(tokens.access_token),
  );

  const contract = lookupContract(flow.surface);
  if (contract.evaluatedAt === "Complete") {
    const { outcome } = await contract.evaluate({
      flow,
      authorizedGithubId,
    });
    if (outcome !== "ok") return { outcome };
  }

  if (!isTrusted(this.#idpOrigin, this.#trustedOrigins)) {
    return { outcome: "untrusted_origin" };
  }

  // ... rest of Complete unchanged (bindings.upsert + grants.add +
  // completion ticket mint + return) — index.js:144-185
}
```

The `untrusted_origin` invariant is **independent of the registry** and
untouched (design-a.md Components row "`github_account_equality`
contract"); it continues to guard `bindings.upsert` at `Complete`.

**Imports:** add to the top of `services/ghuser/index.js`:

```js
import { lookupContract } from "./src/identity-contracts.js";
```

**Verify:** unit tests in Step 03.7 pass.

## Step 03.4 — Remove the kill-switch (`BEGIN_ALLOWED_SURFACES`)

**Modified:** `services/ghuser/index.js`

Delete the comment block + `const` at
`services/ghuser/index.js:12-18`. The `Begin` check that referenced it
is already gone (replaced by the registry dispatch in Step 03.3).

```js
// DELETE:
// Begin only links surfaces whose `surface_user_id` is a verifiable GitHub
// identity. ...
const BEGIN_ALLOWED_SURFACES = new Set(["github-discussions"]);
```

**Verify:** `grep -n BEGIN_ALLOWED_SURFACES services/ghuser/` returns
no matches; `bun test services/ghuser/test/` passes (no test references
this constant after Step 03.7).

## Step 03.5 — Remove the `GetToken` quarantine (`DISPATCH_ALLOWED_SURFACES`)

**Modified:** `services/ghuser/index.js`

Delete the comment block + `const` at
`services/ghuser/index.js:20-26`. Update the `GetToken` body at
`services/ghuser/index.js:228-240` to drop the `DISPATCH_ALLOWED_SURFACES.has`
clause:

```js
// before, index.js:234-240
if (!binding || !DISPATCH_ALLOWED_SURFACES.has(req.surface)) {
  const authorizeUrl = `${this.#linkBaseUrl}/authorize?surface=${encodeURIComponent(req.surface)}&surface_user_id=${encodeURIComponent(req.surface_user_id)}`;
  return {
    result: "link_required",
    link_required: { authorize_url: authorizeUrl },
  };
}
```

```js
// after
if (!binding) {
  const authorizeUrl = `${this.#linkBaseUrl}/authorize?surface=${encodeURIComponent(req.surface)}&surface_user_id=${encodeURIComponent(req.surface_user_id)}`;
  return {
    result: "link_required",
    link_required: { authorize_url: authorizeUrl },
  };
}
```

**Verify:** `grep -n DISPATCH_ALLOWED_SURFACES services/ghuser/`
returns no matches.

## Step 03.6 — Remove the hardcoded `GITHUB_ID_SURFACES` check

`Complete`'s `if (GITHUB_ID_SURFACES.has(flow.surface) && ...)` block
at `services/ghuser/index.js:133-138` is replaced by the registry
dispatch in Step 03.3. Delete the constant declaration at
`services/ghuser/index.js:10`:

```js
// DELETE:
const GITHUB_ID_SURFACES = new Set(["github-discussions"]);
```

**Verify:** `grep -n GITHUB_ID_SURFACES services/ghuser/` returns no
matches; `bun test services/ghuser/test/identity-verification.test.js`
passes after rewrite (Step 03.7).

## Step 03.6a — Update other ghuser test fixtures for the new `bridgeClient` dep

Step 03.2 makes `bridgeClient` a hard constructor requirement
(`if (!bridgeClient) throw new Error("bridgeClient is required")`). Every
ghuser test that constructs `GhuserService` must inject a stub.

**Modified:** six files under `services/ghuser/test/`
(`grep -l "new GhuserService" services/ghuser/test/` enumerates them
after Step 03.8's `query-quarantine.test.js` deletion;
`identity-verification.test.js` already covered by Step 03.7's full
rewrite):

| File | Stub shape |
|---|---|
| `smoke.test.js` | `bridgeClient: { VerifyPendingDispatch: async () => ({}) }` — never reached, smoke only |
| `completion-ticket.test.js` | same default stub; tests only `github-discussions` (Complete-time contract) |
| `query-contract.test.js` | same default stub |
| `query-linked.test.js` | same default stub |
| `query-reauth.test.js` | same default stub |
| `query-unlinked.test.js` | same default stub |

Pattern (apply to each file's `new GhuserService(config, { … })` call):

```js
const service = new GhuserService(config, {
  // ... existing deps ...
  bridgeClient: { VerifyPendingDispatch: async () => ({}) },
});
```

No assertion changes — the stub returns success and the tests that
exercise `github-discussions` never reach the bridge proof path
(contract evaluates at `Complete` for github-discussions, not `Begin`).

**Verify:** `bun test services/ghuser/test/` runs all files green.

## Step 03.7 — Rewrite `services/ghuser/test/identity-verification.test.js`

Replace the file. Cover the post-fix invariants per
[design-a.md § Test contract](design-a.md#test-contract).

**Modified:** `services/ghuser/test/identity-verification.test.js`

Test cases:

| Test name | Surface | Setup | Assertion |
|---|---|---|---|
| `bridge-proof surface with no pending entry returns proof_missing` | `msteams` | `bridgeClient.VerifyPendingDispatch` throws NOT_FOUND | `outcome === "proof_missing"`; no flow row; no binding |
| `bridge-proof surface with mismatched user returns proof_missing` | `msteams` | `bridgeClient.VerifyPendingDispatch` throws FAILED_PRECONDITION | `outcome === "proof_missing"`; no flow; no binding |
| `bridge-proof surface with valid proof binds exactly once` | `msteams` | `bridgeClient.VerifyPendingDispatch` resolves `{}` on first call, throws FAILED_PRECONDITION on second | first `Begin`→`Complete` writes one binding; second `Begin` returns `proof_missing` |
| `bridge transport error fails closed` | `msteams` | `bridgeClient.VerifyPendingDispatch` throws generic Error | `outcome === "proof_missing"` |
| `github-discussions matching id binds` | `github-discussions` | `getUser` returns `"42"`, `surface_user_id` = `"42"` | binding written with `github_user_id: "42"` |
| `github-discussions mismatched id returns identity_mismatch` | `github-discussions` | `getUser` returns `"999"`, `surface_user_id` = `"42"` | `outcome === "identity_mismatch"`; no binding |
| `client_state round-trip carried through to completion` | `github-discussions` | `client_state: "tok-abc"`, `redirect_uri` set | `result.client_state === "tok-abc"` |

The pre-#1399
`"non-github-discussions surface creates binding regardless of id difference"`
test stays gone (was deleted by #1399). The

## 1399 kill-switch test (`"non-github-discussions surface is rejected at Begin"` at lines 81-97 of the current file) is **removed**

Helper update: `createService` adds a `bridgeClient` mock:

```js
function createService(storage, opts = {}) {
  const {
    getUserId = "12345",
    idpOrigin = "https://github.com",
    bridgeClient = {
      VerifyPendingDispatch: async () => ({}), // default success
    },
  } = opts;
  // ... existing config + clock + stores ...
  return {
    service: new GhuserService(config, {
      bindings,
      flows: new FlowStore(storage, { clock }),
      grants: new GrantStore(storage, { clock }),
      clock,
      idpOrigin,
      trustedOrigins: TRUSTED,
      ticketSecret: "test-secret",
      bridgeClient,
      github: {
        // unchanged from the existing file: authorizeUrl, exchangeCode,
        // getUser, refresh, revoke (see today's
        // services/ghuser/test/identity-verification.test.js:29-39).
        // Preserve verbatim — proof_missing tests exercise the
        // bridgeClient path, not GitHub.
      },
    }),
    bindings,
  };
}
```

Per-test overrides pass a stub `bridgeClient` to drive the
proof-failure paths.

**Verify:** `bun test services/ghuser/test/identity-verification.test.js`
passes; ≤200 LOC; no allow-list entry needed.

### Step 03.8 — Delete `services/ghuser/test/query-quarantine.test.js`

**Deleted:** `services/ghuser/test/query-quarantine.test.js`

The `DISPATCH_ALLOWED_SURFACES` gate is gone (Step 03.5); this entire
file is obsolete. No coverage gap — `GetToken` now uniformly returns
`link_required` when no binding exists, which is already covered by
`services/ghuser/test/query-unlinked.test.js`.

**Verify:** `bun test services/ghuser/test/` runs without the file.

### Step 03.9 — Add `services/ghuser/test/registry.test.js`

**Created:** `services/ghuser/test/registry.test.js`

Cover registry behaviour the `identity-verification` test does not
exercise directly:

| Test | Assertion |
|---|---|
| `lookup miss returns proof_missing` | `Begin({surface: "slack", surface_user_id: "U123", client_state: "tok"})` with `bridgeClient.VerifyPendingDispatch` throwing NOT_FOUND → `{outcome: "proof_missing"}`; no flow row written. (`client_state` must be set so the contract reaches `VerifyPendingDispatch`; absent `client_state` short-circuits in the contract before the mock is consulted.) |
| `registry surface count` | `IDENTITY_CONTRACTS.size === 1` and `IDENTITY_CONTRACTS.has("github-discussions")` — pins the "every other surface goes through DEFAULT_CONTRACT" invariant |
| `DEFAULT_CONTRACT evaluatedAt is Begin` | `DEFAULT_CONTRACT.evaluatedAt === "Begin"` — pins fail-fast point |
| `github_account_equality evaluatedAt is Complete` | `IDENTITY_CONTRACTS.get("github-discussions").evaluatedAt === "Complete"` |

**Verify:** `bun test services/ghuser/test/registry.test.js` passes;
≤100 LOC.

### Step 03.10 — Add the `migrations.jsonl` index and the migration

A separate `BufferedIndex` namespace records run migrations.

**Created:** `services/ghuser/src/migrations/index.js`

```js
import { BufferedIndex } from "@forwardimpact/libindex";

/**
 * Ledger of run data migrations. Separate namespace from `bindings.jsonl`
 * — prevents collision with `BindingStore.keyOf("surface:userId")`
 * (design-a.md § Migration marker location). `has(id)` and lazy load
 * inherit from `IndexBase` (`libraries/libindex/src/base.js:157-160`);
 * the only addition is the `record` convenience that pairs `add` with
 * an explicit `flush` so the marker is durable before boot proceeds.
 */
export class MigrationLedger extends BufferedIndex {
  constructor(storage, { clock } = {}) {
    super(
      storage,
      "migrations.jsonl",
      { flush_interval: 1_000, max_buffer_size: 10 },
      { clock },
    );
  }

  async record(id, now) {
    await this.add({ id, ran_at: now });
    await this.flush();
  }
}
```

**Created:**
`services/ghuser/src/migrations/drop-pre-fix-bridge-proof-bindings.js`

```js
const MIGRATION_ID = "1520-drop-pre-fix-bridge-proof-bindings";

/**
 * Drops every binding whose surface is not `github-discussions`.
 * Predicate is independent of the identity-contracts registry's current
 * state — a surface added then removed between binding write and
 * migration is still covered (design-a.md § Pre-fix binding migration).
 */
export async function dropPreFixBridgeProofBindings({
  bindings,
  migrations,
  clock,
  logger,
}) {
  // Marker check first so the skip path is constant-time on every
  // subsequent boot — no bindings.loadData() when the migration has
  // already run.
  if (await migrations.has(MIGRATION_ID)) {
    logger?.info?.("migration", "skip", { id: MIGRATION_ID });
    return { dropped: 0, skipped: true };
  }

  await bindings.loadData();
  let dropped = 0;
  for (const binding of [...bindings.index.values()]) {
    const surface = binding.id.split(":")[0];
    if (surface !== "github-discussions") {
      // BindingStore.delete writes a {id, deleted:true} tombstone
      // (services/ghuser/src/stores.js:66-69); loadData filters
      // tombstoned rows on next boot (stores.js:37-42). Tombstone
      // semantics — not file replacement — is the intended shape
      // per design-a.md § Test contract row "marked deleted:true".
      // Spec § Success Criteria uses "drops" loosely; tombstones
      // satisfy "drops every such record" because the record is
      // unreadable through the BindingStore API after delete.
      await bindings.delete(binding.id);
      dropped++;
    }
  }
  await bindings.flush();
  // Marker write is the **last** step. A crash mid-iteration re-runs
  // the migration on next boot — safe, because re-running over an
  // already-cleared keyspace is a no-op. Marker-then-iteration would
  // leak surviving non-github-discussions bindings if a crash landed
  // between marker and iteration.
  await migrations.record(MIGRATION_ID, clock.now());
  logger?.info?.("migration", "complete", { id: MIGRATION_ID, dropped });
  return { dropped, skipped: false };
}
```

**Note on `binding.id.split(":")[0]`:** safe because
`BindingStore.keyOf(surface, userId)` returns `${surface}:${userId}`
(`services/ghuser/src/stores.js:30-32`), and surface vocabularies
(`github-discussions`, `msteams`, future channels) do not contain `:`.
A future surface name with a colon would need a corresponding
`keyOf` change — flagged in design-a.md as forward-looking.

**Verify:** unit test in Step 03.12 passes.

### Step 03.11 — Invoke the migration from `server.js` before `start()`

**Modified:** `services/ghuser/server.js`

```js
// new import at services/ghuser/server.js:13
import { MigrationLedger } from "./src/migrations/index.js";
import { dropPreFixBridgeProofBindings } from "./src/migrations/drop-pre-fix-bridge-proof-bindings.js";

// after existing store inits at services/ghuser/server.js:46-49
const migrations = new MigrationLedger(storage, { clock });
await dropPreFixBridgeProofBindings({
  bindings,
  migrations,
  clock,
  logger,
});

// existing service + server construction continues unchanged.
await server.start();
```

**Failure mode:** any throw from `dropPreFixBridgeProofBindings`
propagates out of the top-level `await`, terminating the process
before `server.start()` is reached. `fit-rc` observes the down
service via its standard service-down path. The migration is
idempotent on the marker check, so restart cycles are safe.

Add `await migrations.shutdown()` to the signal-handler cleanup at
`services/ghuser/server.js:65-70`:

```js
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    await service.shutdown();
    await migrations.shutdown();
    process.exit(0);
  });
}
```

**Verify:** `services/ghuser` starts cleanly on a fresh storage dir
(no pre-fix bindings → migration is a no-op, marker written);
restarting the service skips the migration (`grep` migration ledger
shows `1520-drop-pre-fix-bridge-proof-bindings` present).

### Step 03.12 — Add `services/ghuser/test/migration.test.js`

**Created:** `services/ghuser/test/migration.test.js`

Cover:

| Test | Setup | Assertion |
|---|---|---|
| `drops every msteams binding on first boot` | Seed 2 msteams bindings + 1 github-discussions binding | After migration: 0 msteams bindings (`loadBinding` returns null), 1 github-discussions binding preserved; marker present |
| `skips on second boot via marker` | Seed bindings, run migration once, seed a *new* msteams binding, run again | Second run returns `{skipped: true, dropped: 0}`; new msteams binding survives (only fresh-boot bindings get the migration) |
| `crash before marker re-runs safely` | Simulate "crash mid-iteration" by directly appending tombstones for some pre-fix bindings to `bindings.jsonl` via `storage.append(...)`, then run the migration on the resulting state (no marker present in `migrations.jsonl` because the crash happened before Step 03.10's marker write) | Migration runs (`skipped: false`); any surviving pre-fix bindings are dropped; marker written. (Mechanism: marker is the **last** step of the migration, so absence of the marker is the canonical "crashed" signal; iterating-then-marker order is idempotent because re-iterating over already-tombstoned bindings is a no-op.) |
| `empty bindings is a no-op` | No bindings seeded | `dropped: 0`; marker written |

**Verify:** `bun test services/ghuser/test/migration.test.js` passes;
≤200 LOC.

### Step 03.13 — Update `services/oauth/test/authorize.test.js` for the new outcome shape

`services/oauth` has **two distinct** outcome-to-HTTP mappings:

- **`/authorize`** (`services/oauth/index.js:89-91`): every `outcome`
  → JSON `{error: <outcome>}` with HTTP 503.
- **`/callback`** (`services/oauth/index.js:105-106`): looked up in
  `OUTCOME_PAGES` → HTML page (`identity_mismatch`, `untrusted_origin`).

`proof_missing` flows through the `/authorize` JSON-503 path — the
existing catch-all handles it without code change. The existing test
at `services/oauth/test/authorize.test.js` that mocks
`outcome: "surface_not_supported"` must be **rewritten** to mock
`outcome: "proof_missing"` (the kill-switch outcome is gone after
Step 03.4). The test still asserts the same JSON-503 shape, only the
mocked outcome string changes.

**Modified:** `services/oauth/test/authorize.test.js`

Search the file for `surface_not_supported` (R1 confirmed two
occurrences around lines 124 and 135) and replace each with
`proof_missing`. The existing kill-switch test
(`"/authorize maps Begin outcome to 503 (#1397 kill-switch)"` at
line 114 in today's file) becomes the bridge-proof-missing test —
update the test title to drop the `#1397 kill-switch` qualifier and
name the new contract instead. Both `outcome` mock value and
asserted body shape update analogously.

The `proof_missing` collapse (design-a.md Data flow § attacker)
intentionally denies an enumeration oracle — no test should
distinguish between `proof_missing`, `NOT_FOUND`, `FAILED_PRECONDITION`
at this layer.

**Verify:** `bun test services/oauth/test/authorize.test.js` passes;
`grep -n surface_not_supported services/oauth/test/` returns zero
matches.

### Step 03.14 — Run the full test suite and confirm clean break

```sh
bun test
bun run check
```

**Verify:**

- All tests pass.
- `grep -rn "GITHUB_ID_SURFACES\|BEGIN_ALLOWED_SURFACES\|DISPATCH_ALLOWED_SURFACES\|surface_not_supported\|query-quarantine" services/ libraries/`
  returns no matches.
- `grep -rn "kill-switch\|#1397\|#1399" services/ libraries/` returns
  only release-notes / changelog references, not code or test code.
- `grep -rn "bridge_pending_dispatch_proof\|lookupContract\|MigrationLedger" services/ghuser/`
  returns the expected hits.

### Step 03.15 — Hand off to `kata-release-cut`

Once Part 03 PR is merged on `main`, post a release-cut hand-off to
the `release-engineer` inbox via `kata-dispatch` (or, if the merging
agent has the release-engineer routing, directly cut the release):

> Spec 1520 structural fix merged at `<sha>`. Cut a release tag covering
> `ghuser`, `bridge`, `msbridge`, and any libraries with deferred bumps.
> The release tag must contain Parts 01 + 02 + 03 together. Per
> [spec.md § Success Criteria](spec.md), the same tag removes the
> kill-switch (`Begin` `surface_not_supported`) and the `GetToken`
> quarantine. Production msteams users will need to re-link on first
> message after deploy (the migration drops their pre-fix bindings on
> ghuser boot). No new env vars required — ghuser now reaches bridge
> via the existing `service.bridge` config block already consumed by
> ghbridge and msbridge.

The hand-off is part of the plan only because the atomic-release
coupling is a release-cut concern, not an implementation concern.
`staff-engineer` can post the memo; `release-engineer` executes.

### Risks specific to Part 03

- **Bridge unavailable at boot.** `BridgeClient` is constructed in
  `server.js` but does not connect synchronously (gRPC channel is
  lazy). First `Begin` call will fail with a transport error → falls
  through to `proof_missing` outcome. Production behaviour: legitimate
  users see `proof_missing` during a bridge outage; msbridge mints
  fresh `link_token`s on subsequent inbound messages, so transient
  outages clear on retry.
- **Migration over a large `bindings.jsonl`.** Realistic pre-fix
  binding count is bounded by the kill-switch window (#1399 →
  release-cut). The migration loads the entire index in memory
  (existing `BufferedIndex.loadData` shape) and iterates with one
  `delete()` per record. For 10,000 bindings, that's 10,000 tombstone
  writes — acceptable at boot. If real production carries >100,000
  pre-fix bindings (it does not), `bindings.compact()` after the
  iteration would replace the file with the live in-memory set in one
  storage write — flagged as a follow-up if observed.
- **Multi-instance migration race.** `services/ghuser` is documented
  single-instance per tenant (`services/CLAUDE.md` § Running
  services; bridge has the same posture per
  `services/bridge/index.js:234-239`). A rolling-restart of two
  concurrent instances would race the migration: both load bindings,
  both iterate, both call `delete` (idempotent — last tombstone
  wins), both call `migrations.record` writing one ledger entry per
  instance under the same id (collapses to one row because
  `BufferedIndex.add` keys by `item.id`). End state is consistent.
  If `services/ghuser` ever becomes multi-instance under a different
  posture, the migration would need a leader-elected runner — flag
  here, not block.

— Staff Engineer 🛠️
