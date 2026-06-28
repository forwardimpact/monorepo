# Plan 1270 — Part 02: `services/ghserver`

Implements the gRPC App-key custody service that mints repo-scoped
installation tokens. Calls `services/tenancy.resolveByRepo` to confirm
the request maps to an `active` tenant before minting; enforces a
per-tenant rate ceiling. Depends on the protos and `services/tenancy`
skeleton from part 01.

## Step 1 — Open the STATUS sub-row

Append `1270/ghserver\tplan\tapproved` to `wiki/STATUS.md` as the first
commit of this PR. Verification: `rg "^1270/ghserver" wiki/STATUS.md`.

## Step 2 — Scaffold `services/ghserver/`

Created files:

- `services/ghserver/package.json` (mirror `services/ghuser/package.json`
  shape — `name: "@forwardimpact/svcghserver"`, `bin: { "fit-svcghserver":
  "./server.js" }`).
  - Dependencies declared explicitly in this `package.json`:
    `@forwardimpact/libconfig`, `@forwardimpact/librpc`,
    `@forwardimpact/libstorage`, `@forwardimpact/libtelemetry`,
    `@forwardimpact/libtype`, `@forwardimpact/libpreflight`,
    `@octokit/auth-app` (workspace dependencies are not transitively
    available — every dep the service imports must be in its own
    `dependencies` block).
- `services/ghserver/index.js` (exports `GhserverService` extending
  `GhserverBase` from `@forwardimpact/librpc`).
- `services/ghserver/server.js` (`createServiceConfig("ghserver", { ... })`,
  `createLogger`, `createTracer`, instantiate
  `new clients.TenancyClient(tenancyConfig, logger, tracer)` per the
  `services/ghbridge/server.js` direct-class pattern (`clients` is the
  `@forwardimpact/librpc` re-export of generated clients; see
  `services/ghbridge/server.js` (the `clients` destructure) as the canonical
  reference), bind-address guard from Step 7, wire `Server`).
- `services/ghserver/src/app-auth.js` (`createAppAuth` from
  `@octokit/auth-app`; constructor `(app_id, private_key)` returns
  `{ mintInstallationToken({ owner, name, installation_id }): Promise<{ token,
  expires_at }> }`; reuses the `services/ghbridge/server.js` pattern).
- `services/ghserver/src/rate-ceiling.js` (`RateCeiling`
  per-`tenant_id` sliding-window counter; methods `record(tenant_id):
  void`, `exceeds(tenant_id): boolean`; backed by an in-process map —
  durability across restarts is not required for the rate ceiling).
- `services/ghserver/src/service.js` (`MintInstallationToken` handler
  — see Step 3).
- `services/ghserver/CLAUDE.md` (service one-paragraph).
- `services/ghserver/README.md` (jobs declaration).
- `services/ghserver/test/ghserver.test.js` (mint happy path; tenancy
  inactive → `NOT_FOUND`; rate-ceiling exceeded → `RATE_LIMITED`;
  unknown repo → `NOT_FOUND`).

Verification: `bun test services/ghserver` passes; `bun run check`
clean.

## Step 3 — Implement `MintInstallationToken`

Modified files: `services/ghserver/src/service.js`.

```js
async MintInstallationToken({ owner, name, requested_by }) {
  const tenant = await this.tenancy.ResolveByRepo({ owner, name });
  if (!tenant || tenant.state !== "active") {
    throw new RpcError("NOT_FOUND", "no active tenant for repo");
  }
  if (this.rateCeiling.exceeds(tenant.tenant_id)) {
    throw new RpcError("RATE_LIMITED", "per-tenant ceiling exceeded");
  }
  const installation_id = parseInstallationId(tenant.channel_tenant_key);
  const { token, expires_at } = await this.appAuth.mintInstallationToken({
    owner, name, installation_id,
  });
  this.rateCeiling.record(tenant.tenant_id);
  this.logger.event("token.minted", { tenant_id: tenant.tenant_id, repo: `${owner}/${name}`, requested_by });
  return { installation_token: token, expires_at };
}
```

`parseInstallationId` splits the GitHub `channel_tenant_key`
(`"{installation_id}:{owner}/{name}"`) and is local to this service.
Throws a typed `MALFORMED_CHANNEL_TENANT_KEY` error if the input does
not match — caller maps to gRPC `INTERNAL` since a malformed key in
the registry is the registry's invariant violation, not the mint
caller's fault.

Verification: unit tests cover the four outcomes above; `bun test
services/ghserver` passes.

## Step 4 — Config defaults

Modified files: `services/ghserver/server.js`.

`createServiceConfig` `defaults` object:

```js
{
  app_id: "",
  private_key: "",
  port: 9201,
  bind_address: "127.0.0.1",
  allow_public_bind: false,
  rate_ceiling_per_tenant_per_minute: 10,
}
```

`private_key` resolves from `SERVICE_GHSERVER_PRIVATE_KEY` env (the documented
runtime; substrate hardening — KMS/HSM — is the deferred follow-on per
[design § What this design does not cover](design-a.md#what-this-design-does-not-cover)).
`bind_address` and `allow_public_bind` enforce the loopback / private default;
see Step 7.

Verification: `services/ghserver/test/config.test.js` covers each
default and the env override.

## Step 5 — Tenancy client wiring

Modified files: `services/ghserver/server.js`.

Instantiate `new clients.TenancyClient(tenancyConfig, logger, tracer)` where
`tenancyConfig = await createServiceConfig("tenancy")` — mirrors the
`GhuserClient`/`BridgeClient` wiring at `services/ghbridge/server.js` (the
`GhuserClient`/`BridgeClient` wiring block). The typed `TenancyClient` is
generated by `bunx fit-codegen --all` from
`services/tenancy/proto/tenancy.proto` (part 01) and re-exported through
`@forwardimpact/librpc`'s `clients` namespace. The client is passed to
`GhserverService` constructor as `deps.tenancy`.

Verification: integration test starts both services in-process via
the standard `libmock` test harness and confirms
`MintInstallationToken` reaches the tenancy backend.

## Step 6 — Per-tenant rate ceiling

Modified files: `services/ghserver/src/rate-ceiling.js`.

In-process sliding window: keep an array of timestamps per tenant_id;
on every `record`, append `clock.now()` and drop entries older than
60 seconds. `exceeds` returns
`length >= rate_ceiling_per_tenant_per_minute`. Inject `{ clock }`
via the constructor per spec 1370 convention; durability across
restarts is not required for a rate ceiling.

Verification: `services/ghserver/test/rate-ceiling.test.js` covers
under-limit allow, over-limit block, and a 60-second-rollover reset.

## Step 7 — Bind-address guard

Modified files: `services/ghserver/server.js`.

Before `server.start()`, refuse to bind if `bind_address` is not a loopback
(`127.0.0.0/8`) or private (`10/8`, `172.16/12`, `192.168/16`, `fd00::/8`)
address and `allow_public_bind` is `false`. The constraint enforces the
[design § gRPC peer authentication](plan-a.md#grpc-peer-authentication-inside-the-control-plane)
"private network only" property in the initial delivery.

Verification: `services/ghserver/test/bind-guard.test.js` covers
loopback OK, public IP refused, public IP + `allow_public_bind`
allowed.

## Step 8 — Register in `services/README.md`

Modified files: `services/README.md`. Add catalog row matching the
existing `ghuser` / `oauth` shape. Operator step: add
`services/ghserver` to `config/config.json` `init.services` per
`services/CLAUDE.md` § Running services; the service README documents
the requirement. No monorepo `package.json` workspaces edit (the
`services/*` glob covers it).

Verification: `bun install` clean; `rg "services/ghserver" services/README.md`.

## Step 9 — Close the STATUS sub-row

Update `wiki/STATUS.md`: `1270/ghserver\tplan\tapproved` →
`1270/ghserver\tplan\timplemented`. Commit the wiki edit.

## Risks

- **`@octokit/auth-app` caches installation tokens in-process.** The
  library memoizes tokens by `installation_id` for the duration of
  the token's validity. Reuse is fine for the same repo; cross-repo
  reuse is prevented by the `installation_id` keying. Step 3
  `mintInstallationToken` explicitly threads `installation_id` from
  the resolved tenant, so the memoization key tracks the per-repo
  installation.

- **Tenancy lookup adds one in-control-plane RTT per mint.** Every
  mint pays one extra gRPC call. For per-run mint counts on the
  order of single digits per workflow, the cost is negligible; if a
  workflow re-mints aggressively, the rate ceiling activates first.

## Libraries used

`libconfig`, `librpc`, `libstorage`, `libtelemetry`, `libtype`,
`libpreflight`, `@octokit/auth-app`.
