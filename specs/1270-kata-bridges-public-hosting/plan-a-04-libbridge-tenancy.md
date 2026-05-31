# Plan 1270 — Part 04: `libraries/libbridge` `TenantResolver`

Adds the channel-agnostic `TenantResolver` interface to `libbridge`
plus a `DefaultTenantResolver` for single-tenant mode and a
`RegistryTenantResolver` that wraps a `services/tenancy` client.
Channel-specific extraction of `(channel, channel_tenant_key)` stays
in the calling bridge per [design § Tenant resolver placement](design-a.md#key-decisions).
Independent of parts 02/03; can run in parallel with part 01.

## Step 1 — Open the STATUS sub-row

Append `1270/libbridge-tenancy\tplan\tapproved` to `wiki/STATUS.md`.
Verification: `rg "^1270/libbridge-tenancy" wiki/STATUS.md`.

## Step 2 — Add the `TenantResolver` interface

Created files: `libraries/libbridge/src/tenant-resolver.js`.

Defines two classes that share a shape:

```js
class DefaultTenantResolver {
  #default;
  constructor({ channel, channel_tenant_key = "default", repo }) {
    this.#default = {
      tenant_id: "default", channel, channel_tenant_key, repo, state: "active",
    };
  }
  async resolve({ channel, key }) { return this.#default; }
  async resolveByRepo({ owner, name }) { return this.#default; }
  async resolveByTenantId({ tenant_id }) {
    return tenant_id === "default" ? this.#default : null;
  }
}

class RegistryTenantResolver {
  #client;
  constructor({ client }) { this.#client = client; }
  async resolve({ channel, key }) {
    const t = await this.#client.ResolveByChannelKey({ channel, key });
    return t?.state === "active" ? t : null;
  }
  async resolveByRepo({ owner, name }) {
    const t = await this.#client.ResolveByRepo({ owner, name });
    return t?.state === "active" ? t : null;
  }
  async resolveByTenantId({ tenant_id }) {
    return this.#client.ResolveByTenantId({ tenant_id });
  }
}
```

Both classes implement the same interface — duck-typed, no shared
base — so the bridges depend on the surface, not the implementation.

Verification: `bun test libraries/libbridge` includes new tests in
`libraries/libbridge/test/tenant-resolver.test.js` covering both
classes' `resolve`/`resolveByRepo`/`resolveByTenantId` outcomes.

## Step 3 — Export from `libraries/libbridge/src/index.js`

Modified files: `libraries/libbridge/src/index.js` (the package
entrypoint per `libraries/libbridge/package.json` `main`).

Add the two classes to the named exports list (alphabetical position
between existing entries). No other change to the public API.

Verification: `rg "DefaultTenantResolver|RegistryTenantResolver"
libraries/libbridge/src/index.js` returns the two exports; `bun run check`
clean.

## Step 4 — Update `CallbackRegistry` to bind `tenant_id`

Modified files: `libraries/libbridge/src/callback-registry.js`.

`CallbackRegistry.register(correlationId, meta)` today returns a
token and stores `{ correlationId, meta, createdAt }`. Extend the
stored record to include `tenant_id` (carried inside `meta`) and add
a new `consume(token, { tenant_id })` overload. The change:

- `register(correlationId, meta)` is unchanged at the call site —
  callers wishing to tenant-bind pass `meta.tenant_id`. The stored
  record carries the value through.
- `consume(token, options = {})` accepts an optional
  `options.tenant_id`; when set, the registry compares against the
  stored `meta.tenant_id` and returns `null` on mismatch (same
  shape as a missing token). When `options.tenant_id` is absent
  (single-tenant callers) the check is skipped.

Verification: `libraries/libbridge/test/callback-registry.test.js`
adds three cases: tenant-bound consume with matching tenant succeeds;
tenant-bound consume with mismatched tenant returns null; legacy
consume without `options.tenant_id` succeeds against an unbound
record.

## Step 5 — Add the tenant-aware callback route to `createBridgeServer`

Modified files: `libraries/libbridge/src/server.js`.

`createBridgeServer` today mounts `POST /api/callback/:token` (see
`libraries/libbridge/src/server.js` (the `/api/callback/:token` mount)). Add an optional
`tenancyMode` option (`"single"` default, `"multi"` opt-in). In
`"multi"` mode the server mounts `POST /api/callback/:tenant_id/:token`
exclusively (in addition to the existing webhook routes — the
multi-tenant bridge does not register the two-segment legacy route).
In `"single"` mode the existing `/api/callback/:token` registration
is unchanged. The handler in `onCallback` receives Hono's path
parameters (`c.req.param("tenant_id")`, `c.req.param("token")`) and
calls `registry.consume(token, { tenant_id })`. Clean break per
plan-a.md § Callback URL routing — no dual-shape handler.

Verification: `libraries/libbridge/test/server.test.js` adds two
cases: `tenancyMode: "single"` mounts only `/api/callback/:token`;
`tenancyMode: "multi"` mounts only `/api/callback/:tenant_id/:token`.

## Step 6 — Update `Dispatcher` to construct tenant-bound callback URLs

Modified files: `libraries/libbridge/src/dispatcher.js`.

The `Dispatcher` constructor today builds the callback URL as
`${this.#callbackBaseUrl}/api/callback/${token}` (see
`libraries/libbridge/src/dispatcher.js` (the `callbackUrl` construction)). Extend the constructor
to accept an optional `tenantResolver` argument; when present (i.e.
the calling bridge supplies a resolver and the bridge is in
multi-tenant mode), the dispatcher resolves the tenant on each
dispatch and builds the URL as
`${this.#callbackBaseUrl}/api/callback/${tenant_id}/${token}`. The
resolved `tenant_id` is also written into the `mergedMeta` argument
to `this.#callbacks.register(correlationId, mergedMeta)` so the
registry can tenant-bind on consume (Step 4).

`dispatchWorkflow` (src/dispatch.js) is unchanged — it owns
workflow-dispatch mechanics only, not callback registration.

Verification: `libraries/libbridge/test/dispatcher.test.js` adds two
cases: no resolver → legacy URL + no tenant binding; resolver returns
`tenant_id: "t-1"` → tenant URL `/api/callback/t-1/${token}` and
`meta.tenant_id: "t-1"` written to the registry.

## Step 7 — Close the STATUS sub-row

Update `wiki/STATUS.md`: `1270/libbridge-tenancy\tplan\tapproved` →
`1270/libbridge-tenancy\tplan\timplemented`.

## Risks

- **Existing tests that construct `CallbackRegistry` without
  `tenant_id`.** `tenant_id` is optional; existing tests continue to
  pass. The bridge tests (part 05) cover the wiring; part 04 only
  introduces the surface.

- **Channel SDKs in `libbridge`.** The design's
  [Key decision on tenant resolver placement](design-a.md#key-decisions)
  forbids channel SDK imports in `libbridge`. `RegistryTenantResolver`
  imports only the typed gRPC client from `@forwardimpact/svctenancy`,
  not a channel SDK. Verification: `rg "@octokit|botbuilder"
  libraries/libbridge/src/tenant-resolver.js` returns nothing.

## Libraries used

`libtype` (for the `TenantResolver` typedef in JSDoc). The
`RegistryTenantResolver` accepts a `TenancyClient` instance via
constructor injection — `libbridge`'s own `package.json` does not
gain a dependency on `@forwardimpact/svctenancy` (the duck-typed
client surface keeps `libbridge` SDK-free). Each bridge constructs
the client in its `server.js` and passes it in.
