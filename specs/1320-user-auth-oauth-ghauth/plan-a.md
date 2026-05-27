# Plan 1320-a: oauth + ghauth

Implements [spec.md](spec.md) per [design-a.md](design-a.md).

## Approach

Build `ghauth` first (proto → codegen → state → GitHub client → service →
server → tests), then `oauth` on top of the generated `ghauth` client. `ghauth`
is a standard `librpc` gRPC service whose three JSONL stores reuse
`libindex`'s `BufferedIndex` exactly as `libbridge`'s `DiscussionContextStore`
does; the GitHub user-to-server exchange/refresh/revoke is a small
`fetch`-based module (no new dependency, mirroring how `libconfig` already
refreshes OAuth tokens). `oauth` is a protocol-only Hono adapter (the repo's
HTTP standard, used by both bridges via `libbridge`'s `createBridgeServer`):
every endpoint maps to one gRPC call on a backend client constructed by name
from config (`createClient(config.provider, …)`), so its source stays
GitHub-free (SC#3). `ghauth` owns the Kata Agent User App credentials
end-to-end via its own `service.ghauth` config — mirroring how `ghbridge` owns
the Team App's credentials — with no `libconfig` accessor.

## Step 1 — ghauth proto + codegen

Define the provider-agnostic RPC contract and generate its base/client/types.
(`AuthProvider` in design-a is the conceptual contract name; the concrete proto
service is `Ghauth`, so `createClient("ghauth")` resolves `GhauthClient`.)

- **Created:** `services/ghauth/proto/ghauth.proto`
- **Modified (generated):** `generated/**` (via `just codegen`)

```proto
syntax = "proto3";
package ghauth;
import "common.proto";

service Ghauth {
  rpc Begin(BeginRequest) returns (BeginResponse);
  rpc Complete(CompleteRequest) returns (CompleteResponse);
  rpc Redeem(RedeemRequest) returns (RedeemResponse);
  rpc GetToken(GetTokenRequest) returns (GetTokenResponse);
  rpc Revoke(RevokeRequest) returns (common.Empty);
}

message BeginRequest {
  string surface = 1;
  string surface_user_id = 2;
  optional string redirect_uri = 3;     // client-initiated only
  optional string code_challenge = 4;   // downstream PKCE; client-initiated only
  repeated string scopes = 5;
}
message BeginResponse { string upstream_authorize_url = 1; string state = 2; }

message CompleteRequest { string code = 1; string state = 2; }
message CompleteResponse {
  optional string downstream_code = 1;  // absent for bridge-initiated link
  optional string redirect_uri = 2;
  optional string client_state = 3;
}

message RedeemRequest { string code = 1; string code_verifier = 2; }
message RedeemResponse { string access_token = 1; string token_type = 2; int64 expires_in = 3; }

message GetTokenRequest { string surface = 1; string surface_user_id = 2; }
message LinkRequired { string authorize_url = 1; }
message ReAuthRequired {}
message GetTokenResponse {
  oneof result {
    string token = 1;
    LinkRequired link_required = 2;
    ReAuthRequired re_auth_required = 3;
  }
}

message RevokeRequest { string surface = 1; string surface_user_id = 2; }
```

Verify: `just codegen` succeeds and `generated/services/exports.js` exports
`GhauthBase` and `GhauthClient`.

## Step 2 — ghauth state stores

Three `BufferedIndex`-backed stores over one injected `libstorage` store.

- **Created:** `services/ghauth/src/stores.js`

- `BindingStore extends BufferedIndex` — `indexKey: "bindings.jsonl"`, no
  sweep; `static keyOf(surface, userId)`, `loadBinding(surface, userId)`,
  `upsert(record)`. Record: `{ id, github_user_id, access_token,
  refresh_token, expires_at, scopes }`. Server shutdown (Step 5) calls
  `shutdown()` on all three stores to flush buffered writes — required for
  SC#7 (a binding written before restart must survive).
- `TtlStore extends BufferedIndex` — generic short-TTL store mirroring
  `DiscussionContextStore`'s `#sweep`/`sweepNow(now)`/`stopSweep()`/
  `shutdown()`, evicting on `created_at` older than `ttlMs`.
- `FlowStore = TtlStore` over `flows.jsonl` keyed by outer `state`; record
  `{ id: state, surface, surface_user_id, code_challenge?, redirect_uri?,
  client_state?, created_at }`.
- `GrantStore = TtlStore` over `grants.jsonl` keyed by `downstream_code`;
  record `{ id: downstream_code, binding_id, code_challenge, redirect_uri,
  client_state, created_at }`; `consume(code)` reads-then-deletes.

**Deletion semantics (no base primitive).** `BufferedIndex`/`IndexBase` are
append-only and expose no `delete`; `DiscussionContextStore.#sweep` only
mutates the in-memory `this.index` Map, which does **not** survive restart
(`loadData` re-reads every JSONL row). That is fine for short-TTL `flows`
(re-swept on reload) but wrong for `Revoke` — a revoked binding would
reappear after a restart. So `BindingStore.delete(id)` and
`GrantStore.consume(code)` must write a durable **tombstone** row
(`{ id, deleted: true }`) and override `loadData` to drop tombstoned ids on
load (last-write-wins by append order already gives `upsert` its update
semantics). `GrantStore.consume` additionally deletes from the in-memory Map
so a second `Redeem` in the same process fails before the tombstone flushes.

Verify: `node --input-type=module -e "import('./services/ghauth/src/stores.js')"`
imports cleanly and `BindingStore.keyOf('teams','u1') === 'teams:u1'`; a
`createMockStorage`-backed `BindingStore` `delete`d then rebuilt over the same
storage no longer returns the binding (the Revoke-durability case, also
exercised by Step 7's persistence test).

## Step 3 — ghauth GitHub OAuth client

Encapsulate the Kata Agent User App authorization-code exchange/refresh/revoke.

- **Created:** `services/ghauth/src/github-oauth.js`

`createGithubOAuth({ clientId, clientSecret, fetchImpl = fetch })` returning:

| Method | GitHub call |
| --- | --- |
| `authorizeUrl({ state, redirectUri, scopes })` | builds `https://github.com/login/oauth/authorize?…` |
| `exchangeCode(code, redirectUri)` | `POST https://github.com/login/oauth/access_token` → `{ access_token, refresh_token, expires_in }` |
| `refresh(refreshToken)` | `POST …/access_token` `grant_type=refresh_token` → same shape; throws `RevokedError` on GitHub `bad_refresh_token`/`unauthorized` |
| `revoke(accessToken)` | `DELETE https://api.github.com/applications/{clientId}/token` — basic auth `clientId:clientSecret`, token in JSON body `{ "access_token": … }` |

Use `Accept: application/json` + `URLSearchParams`, mirroring
`libconfig`'s `#refreshOAuthToken`. `code_challenge`/`code_verifier` are
**not** forwarded to GitHub (downstream-only PKCE).

Verify: with a stub `fetchImpl` returning `{access_token,refresh_token,expires_in}`,
`exchangeCode` resolves that shape and a `bad_refresh_token` body makes `refresh`
throw `RevokedError`.

## Step 4 — ghauth service implementation

Implement the five RPCs against the stores and GitHub client.

- **Created:** `services/ghauth/index.js`

```js
import { services } from "@forwardimpact/librpc";
const { GhauthBase } = services;
export class GhauthService extends GhauthBase {
  constructor(config, { bindings, flows, grants, github }) { super(config); /* assign */ }
  // Begin: write flows row, return { upstream_authorize_url: github.authorizeUrl(...), state }
  // Complete: consume flows row; github.exchangeCode; bindings.upsert;
  //   if flow had redirect_uri → mint grants row + return downstream_code, else "linked"
  // Redeem: grants.consume(code); verify code_verifier vs grant.code_challenge;
  //   return stored binding's access_token, token_type, expires_in
  // GetToken: bindings.loadBinding; missing → { link_required: { authorize_url } };
  //   near-expiry → github.refresh (RevokedError → { re_auth_required:{} });
  //   else { token }
  // Revoke: github.revoke + bindings delete → common.Empty
}
```

`LinkRequired.authorize_url` is composed from `config.link_base_url` +
`/authorize?surface=…&surface_user_id=…` (one URL shape). `link_base_url` is
**`oauth`'s externally-reachable origin** (its `/authorize` is the user-facing
endpoint, per design-a's oauth-HTTP-surface table and the LinkRequired-URL
decision), not `ghauth`'s own address. Verify code-challenge
match with `crypto.createHash("sha256")` base64url (S256).

Verify: importing `../index.js` exposes `GhauthService` with `Begin`/`Complete`/
`Redeem`/`GetToken`/`Revoke` methods (full behaviour in Step 7).

## Step 5 — ghauth server.js

Bootstrap config, storage, stores, GitHub client, and the gRPC server.

- **Created:** `services/ghauth/server.js`

```js
#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";
import { Server, createTracer } from "@forwardimpact/librpc";
import { createServiceConfig } from "@forwardimpact/libconfig";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createStorage } from "@forwardimpact/libstorage";
import { GhauthService } from "./index.js";
import { BindingStore, FlowStore, GrantStore } from "./src/stores.js";
import { createGithubOAuth } from "./src/github-oauth.js";

const config = await createServiceConfig("ghauth", {
  protocol: "grpc", port: 3006, link_base_url: "http://localhost:3007",
  client_id: "", client_secret: "",
});
const logger = createLogger("ghauth");
const tracer = await createTracer("ghauth");
const storage = createStorage("ghauth");                 // → data/ghauth/
const github = createGithubOAuth({ clientId: config.client_id, clientSecret: config.client_secret });
const service = new GhauthService(config, {
  bindings: new BindingStore(storage), flows: new FlowStore(storage), grants: new GrantStore(storage), github,
});
const server = new Server(service, config, logger, tracer);
await server.start();
```

The Kata Agent User App `client_id`/`client_secret` come from `service.ghauth`
config (env `SERVICE_GHAUTH_CLIENT_ID`/`SERVICE_GHAUTH_CLIENT_SECRET`), exactly
as `ghbridge` reads the Team App's `app_id`/`app_private_key`/
`app_installation_id` from `service.ghbridge` — no `libconfig` accessor.
Verify: `bunx fit-rc start ghauth` then `services/ghauth/test/smoke.test.js`.

## Step 6 — ghauth package.json + README

Service metadata + contributor docs per `services/CLAUDE.md`.

- **Created:** `services/ghauth/package.json`, `services/ghauth/README.md`

`@forwardimpact/svcghauth`, ESM, `bin.fit-svcghauth: ./server.js`, `files`
listing `index.js`/`server.js`/`src`/`proto`, `description`, `keywords`
(last `agent`), one `jobs` entry. Deps: `librpc`, `libconfig`, `libstorage`,
`libindex`, `libtelemetry`, `libpreflight`, `libtype`; dev `libmock`.
README documents the `service.ghauth` config block (`host`, `port`,
`link_base_url`, `client_id`, `client_secret`) + `init.services` entry +
`SERVICE_GHAUTH_CLIENT_ID`/`SERVICE_GHAUTH_CLIENT_SECRET` env.

Verify: `bun run context:fix` regenerates `services/README.md` cleanly.

## Step 7 — ghauth tests

Cover SC#1,4,5,6,7,8 with `node:test` + `libmock` mocks.

- **Created:** `services/ghauth/test/smoke.test.js`,
  `services/ghauth/test/query-linked.test.js`,
  `services/ghauth/test/query-unlinked.test.js`,
  `services/ghauth/test/query-reauth.test.js`,
  `services/ghauth/test/persistence.test.js`,
  `services/ghauth/test/query-contract.test.js`

| Test | Asserts |
| --- | --- |
| `smoke` | service constructs; a gRPC `GetToken` returns a response object, not a connection error (SC#1) |
| `query-linked` | linked user + valid token → `result.token === stored` (SC#4) |
| `query-unlinked` | unlinked → `result.link_required.authorize_url` set, no token (SC#5) |
| `query-reauth` | expired + `refresh` throws `RevokedError` → `result.re_auth_required` (SC#6) |
| `persistence` | write binding via `createMockStorage`-backed `BindingStore`, build a fresh store over the same storage, read it back (SC#7) |
| `query-contract` | `GetToken({surface, surface_user_id})` token arm is `typeof === "string"` (SC#8) |

Use a stub `github` (`{ refresh: async () => { throw new RevokedError() } }`
etc.) injected via the constructor. Verify: `bun test services/ghauth/test/*.test.js`.

## Step 8 — oauth service implementation

Protocol-only Hono adapter delegating to the configured provider client.

- **Created:** `services/oauth/index.js`

Factory `createOauthService({ config, logger, providerClient })` building a
`new Hono()` app and returning `{ app, address, start, stop }` (the exact shape
`createBridgeServer` returns). Replicate the bridge server's inline
security-headers middleware (`X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Cache-Control: no-store`) — it is a closure inside
`createBridgeServer`, not an exported unit, so copy the three `app.use("*", …)`
header lines rather than importing them. Routes registered on the Hono app:

| Route | Handler |
| --- | --- |
| `GET /.well-known/oauth-authorization-server` | `c.json(metadata)` from `config.issuer` |
| `GET /authorize` | `providerClient.Begin(query)` → `c.redirect(upstream_authorize_url, 302)` |
| `GET /callback` | `providerClient.Complete({code,state})` → `c.redirect(redirect_uri w/ downstream_code, 302)`, else render "linked" page via `c.html` |
| `POST /token` | `providerClient.Redeem({code,code_verifier})` → `c.json(tokenResponse)` |
| `GET /health` | `c.json({status:"ok"})` |

`start()` calls `serve({ fetch: app.fetch, port: config.port, hostname: config.host })`
from `@hono/node-server` (the `createBridgeServer` pattern — it maps config
`host` onto `hostname`; libconfig defaults `host` to `0.0.0.0`), retaining the
returned handle; `stop()` wraps `handle.close()` in a promise; `address()`
returns `{ port }` from the handle. No `github`/`octokit` identifiers anywhere
in this file (SC#3). Verify: SC#3 `rg` check in Step 11.

## Step 9 — oauth server.js

Bootstrap config + provider client by name, start the HTTP service.

- **Created:** `services/oauth/server.js`

```js
const config = await createServiceConfig("oauth", {
  protocol: "http", port: 3007, issuer: "http://localhost:3007", provider: "ghauth",
});
const logger = createLogger("oauth");
const tracer = await createTracer("oauth");
const providerClient = await createClient(config.provider, logger, tracer);  // "ghauth" → GhauthClient
const service = createOauthService({ config, logger, providerClient });
await service.start();
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => service.stop());
```

`createClient("ghauth", …)` resolves `GhauthClient` and dials the `service.ghauth`
config (grpc, port 3006 per Step 5 defaults), so client and server agree on the
port without a committed `config.json`. Verify: `bunx fit-rc start oauth` boots
both services (ghauth listed first) and `GET /health` returns `{status:"ok"}`.

## Step 10 — oauth package.json + README

Service metadata + docs per `services/CLAUDE.md`.

- **Created:** `services/oauth/package.json`, `services/oauth/README.md`

`@forwardimpact/svcoauth`, `bin.fit-svcoauth: ./server.js`, deps `librpc`,
`libconfig`, `libtelemetry`, `libpreflight`, `libtype`, `hono`,
`@hono/node-server` (no octokit). Declare the `hono`/`@hono/node-server`
ranges compatible with the **root `package.json` `overrides` block**
(`hono ^4.12.18`, `@hono/node-server ^2.0.2`) — that block governs hono
resolution repo-wide, so Bun resolves to the override regardless of the
workspace range; declare `^4.12.18`/`^2.0.2` to match what actually ships, not
a higher pin. README documents `service.oauth` config (`issuer`, `provider`,
`port`) + `init.services` ordering (`ghauth` before `oauth`).

Verify: `bun run context:fix`.

## Step 11 — oauth tests

Cover SC#2 and SC#3.

- **Created:** `services/oauth/test/{metadata,authorize,no-github}.test.js`

Drive routes through the returned Hono `app` via `app.request(path)` (no live
socket needed).

- `metadata` — `app.request("/.well-known/oauth-authorization-server")` returns
  valid AS metadata derived from `config.issuer` (SC#2).
- `authorize` — `app.request("/authorize?…")` with a stub `providerClient.Begin`
  returns a 302 `Location` of the returned `upstream_authorize_url` (SC#2).
- `no-github` — asserts `rg -i 'github|octokit' services/oauth/ -g '!test/'
  -g '!*.md'` yields no matches (SC#3), via a `child_process` exec.

Verify: `bun test services/oauth/test/*.test.js`.

## Step 12 — config docs + catalog regen

Document the two `init.services`/`service.*` blocks and regenerate catalogs.

- **Modified:** `services/README.md` (generated), root catalog via `context:fix`

`config/config.json` is gitignored, so runnable defaults live in the
`createServiceConfig(name, defaults)` argument in each `server.js` (Steps 5,
9), with the documented `service.*`/`init.services` blocks in each README; no
committed `config.json` to edit.

Verify: `bun run context` passes (catalog + workspace-imports guards green).

Libraries used: librpc (Server, createClient, services), libconfig (createServiceConfig), libstorage (createStorage), libindex (BufferedIndex), libtelemetry (createLogger), libtype (message types), libpreflight, hono (Hono), @hono/node-server (serve); libmock (dev). GitHub OAuth uses built-in `fetch` (no octokit added).

## Risks

- **GitHub App token-expiration setting.** Refresh tokens + `expires_in` are
  only issued when the Kata Agent User App has "Expire user authorization
  tokens" enabled. If disabled, `refresh_token` is absent and tokens never
  expire; `GetToken`/`Redeem` must treat absent `refresh_token`/`expires_in`
  as a non-expiring binding rather than erroring.
- **PKCE scope.** `code_challenge`/`code_verifier` are the downstream
  (client↔`oauth`) PKCE only and are verified inside `ghauth.Redeem`; they
  must not be forwarded to GitHub's upstream exchange.
- **Client resolution order.** `oauth`'s `createClient(config.provider)`
  resolves `GhauthClient` from `generated/`; Step 1 codegen must land before
  `oauth` boots or the client lookup fails at startup.
- **Port collisions.** `config/config.json` is gitignored; the suggested
  defaults (ghauth 3006, oauth 3007) must not collide with a contributor's
  existing service ports — confirm against the local `init.services` set.
- **User App secret is not masked.** `client_secret` is a plain `service.ghauth`
  config value (mirroring `ghbridge`'s `app_private_key`), so — unlike libconfig
  `#CREDENTIAL_KEYS` secrets, which load into a private map — a `.env`-supplied
  `SERVICE_GHAUTH_CLIENT_SECRET` is written to `process.env` and inherited by
  sibling `fit-rc`-spawned services. Accepted here to keep `ghauth`
  self-contained; masking both apps' GitHub secrets uniformly is a separate
  cross-cutting follow-up (track as its own security issue), not in scope here.

## Execution

Single engineering agent (`staff-engineer`), sequential. Steps 1–7 (ghauth)
must complete before Steps 8–11 (oauth), since `oauth` constructs the generated
`ghauth` client. Step 12 last. READMEs in Steps 6/10 are within the engineering
agent's scope; no separate `technical-writer` pass required.
