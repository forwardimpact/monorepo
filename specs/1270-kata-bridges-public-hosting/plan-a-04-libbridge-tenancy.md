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
stored record to include `tenant_id` (carried inside `meta`, required)
and tighten `consume(token, { tenant_id })` to require it. The change:

- `register(correlationId, meta)` requires `meta.tenant_id` (throws
  if absent). Single-tenant callers pass `meta.tenant_id = "default"`;
  multi-tenant callers pass the resolved tenant. The stored record
  carries the value through.
- `consume(token, { tenant_id })` requires `tenant_id` (throws if
  absent). The registry compares against the stored `meta.tenant_id`
  and returns `null` on mismatch (same shape as a missing token).

Existing call sites are updated in this step to thread the required
`tenant_id`. There is no optional/legacy path.

Verification: `libraries/libbridge/test/callback-registry.test.js`
adds three cases: matching `tenant_id` succeeds; mismatched `tenant_id`
returns null; missing `tenant_id` throws on both `register` and
`consume`.

## Step 5 — Update `createBridgeServer` to mount the tenant-aware callback route

Modified files: `libraries/libbridge/src/server.js`.

`createBridgeServer` today mounts `POST /api/callback/:token` (see
`libraries/libbridge/src/server.js` (the `/api/callback/:token` mount)).
Replace with `POST /api/callback/:tenant_id/:token` — single mount,
no mode flag, no dual-route logic. The handler in `onCallback`
receives Hono's path parameters
(`c.req.param("tenant_id")`, `c.req.param("token")`) and calls
`registry.consume(token, { tenant_id })`. Single-tenant deployments
hit the same route with the literal `default` segment; multi-tenant
deployments hit it with the resolved tenant.

Verification: `libraries/libbridge/test/server.test.js` is updated:
the existing two-segment callback test is rewritten to assert the
three-segment route; a new case asserts that a missing `:tenant_id`
path segment returns 404 (Hono's router miss); a new case asserts
that a mismatched `tenant_id` returns 404 via the registry consume
path.

## Step 6 — Update `Dispatcher` to construct tenant-bound callback URLs

Modified files: `libraries/libbridge/src/dispatcher.js`.

The `Dispatcher` constructor today builds the callback URL as
`${this.#callbackBaseUrl}/api/callback/${token}` (see
`libraries/libbridge/src/dispatcher.js` (the `callbackUrl` construction)).
Tighten the constructor to require a `tenantResolver` argument
(throws if absent). On each dispatch the dispatcher resolves the
tenant and builds the URL as
`${this.#callbackBaseUrl}/api/callback/${tenant_id}/${token}`. The
resolved `tenant_id` is also written into the `mergedMeta` argument
to `this.#callbacks.register(correlationId, mergedMeta)` so the
registry tenant-binds on consume (Step 4). Single-tenant bridges
construct the `Dispatcher` with a `DefaultTenantResolver` and produce
the same URL shape with `default` in the tenant slot.

`dispatchWorkflow` (src/dispatch.js) is unchanged — it owns
workflow-dispatch mechanics only, not callback registration.

Verification: `libraries/libbridge/test/dispatcher.test.js` is
updated to construct the `Dispatcher` with a `tenantResolver` in
every test case; the legacy "no resolver" case is replaced by a
`DefaultTenantResolver` case asserting URL
`/api/callback/default/${token}` and `meta.tenant_id: "default"`;
a `RegistryTenantResolver` case asserts URL
`/api/callback/t-1/${token}` and `meta.tenant_id: "t-1"`; a new
case asserts the constructor throws when `tenantResolver` is omitted.

## Step 7 — Close the STATUS sub-row

Update `wiki/STATUS.md`: `1270/libbridge-tenancy\tplan\tapproved` →
`1270/libbridge-tenancy\tplan\timplemented`.

## Risks

- **Existing tests that construct `CallbackRegistry` /
  `createBridgeServer` / `Dispatcher` without `tenant_id` /
  `tenantResolver`.** The new fields are required and existing tests
  must be updated in this PR. Sweep `libraries/libbridge/test/` and
  any consumer that exercises the surface (search for `new Dispatcher`,
  `new CallbackRegistry`, `createBridgeServer`); update each
  construction site to thread the required `tenant_id` /
  `DefaultTenantResolver`. No optional/legacy path remains — failing
  to thread the value is a test bug, not a regression.

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
