# Plan 1600 — Part 02: Manifest declarations

Declare each in-scope service's listen URL in its `createServiceConfig`
defaults so the manifest becomes the source of truth. Depends on Part 01 (uses
`expected-url.mjs` to verify each declared URL).

Libraries used: libconfig (the declared keys flow through its derivation),
librpc/libhttp (the transports that consume `host`/`port`).

## Per-service decision rule

For each service in the canonical table ([plan-a.md](plan-a.md) § Canonical URL
scheme), edit its `services/<name>/server.js` `createServiceConfig` defaults to
add the keys that make libconfig produce the canonical URL:

- **Scheme.** Add `protocol: "http"` for the http services (oidc, oauth, mcp,
  ghbridge, msbridge); grpc services need no `protocol` (it is the default).
- **Port.** Set `port: <canonical>` (3001–3015 per the table).
- **Host.** Do **not** add a `host` key for services that lack one — leave the
  bind-default `0.0.0.0`; the gate normalizes `0.0.0.0`↔`localhost` (Part 01)
  and the librpc/libhttp client normalizes `0.0.0.0` for connection, so the
  `localhost` consumers stay correct. **Exception: ghserver keeps its existing
  `host: "127.0.0.1"`** — its `assertBindAllowed` (`src/bind-guard.js`) throws
  on `0.0.0.0`; `127.0.0.1` normalizes to `localhost` in the gate too, so the
  3007 consumers still match.
- **No `url` key.** libconfig overwrites `url` from `protocol://host:port`
  (`config.js:154`), so declaring a `url` string is inert — use the triple's
  components only.

## Step 1 — Services with no existing network key

Intent: add `port` (and `protocol` for http) to services whose defaults declare
no network key today.

Files modified:
`services/{trace,vector,graph,map,pathway,tenancy,ghuser,bridge}/server.js`
(grpc: add `port`), `services/{oauth,mcp,ghbridge,msbridge}/server.js` (http:
add `protocol: "http"` + `port`).

Concrete change (example, `services/mcp/server.js`):

```js
const config = await createServiceConfig("mcp", {
  protocol: "http",
  port: 3011,
  system_prompt: "",
  tools: "",
});
```

Verification: for each, `expectedUrl("services/<name>/server.js", "<name>")`
(Part 01 helper) equals the canonical URL; the service's own test suite
(`bun test services/<name>`) still passes.

## Step 2 — Services with an existing listen `port` (ghserver, oidc)

Intent: reconcile the existing **listen** `port` (ghserver 9201, oidc 9202 — the
same `port` field libconfig re-parses `SERVICE_*_URL` into, `config.js:167-174`,
so this IS the listen port, not a separate backend concern) to the canonical
URL the consumer surfaces advertise (3007, 3008). This is a deliberate
default-listen-port change, justified by the spec's source-of-truth intent.

Files modified: `services/ghserver/server.js`, `services/oidc/server.js`, plus
any test pinning 9201/9202 as the listen port, plus the README port rows (see
Step 2a).

Concrete change: set `port: 3007` (ghserver, grpc; keep `host: "127.0.0.1"`)
and `protocol: "http"` + `port: 3008` (oidc). Trace every `port` consumer
(`librpc`/`libhttp` bind, ghserver `bind-guard`, tests) and update each that
asserts the old listen port to the canonical port. There is no backend-rename
branch — 9201/9202 are listen ports.

Verification: `bun test services/ghserver services/oidc` passes; `expectedUrl`
returns `grpc://127.0.0.1:3007` (normalizes to `localhost`) and
`http://0.0.0.0:3008`; `rg '9201|9202'` over `services/{ghserver,oidc}` and
their READMEs returns nothing in any listen-port position.

## Step 2a — README listen-port rows (ghserver, oidc)

Intent: each service README restates the listen port
(`ghserver/README.md:61` `SERVICE_GHSERVER_PORT | 9201 | Listen port`,
`oidc/README.md:65` `SERVICE_OIDC_PORT | 9202 | Listen port`). Changing the
manifest makes these stale. READMEs are not one of the spec's four registry
surface kinds, so they are swept by hand here but not gated.

Files modified: `services/ghserver/README.md`, `services/oidc/README.md`.

Concrete change: update the listen-port rows to `3007` / `3008` to match the new
manifest defaults.

Verification:
`rg '9201|9202' services/ghserver/README.md services/oidc/README.md` returns
nothing.

## Step 3 — embedding

Intent: embedding declares `backend_port: 8090` (the Python backend, unrelated
to the grpc listen URL). Add the grpc listen `port: 3015`; leave `backend_port`
untouched.

Files modified: `services/embedding/server.js`.

Concrete change: add `port: 3015` alongside the existing `backend_port: 8090`
and `model` keys.

Verification: `expectedUrl(..., "embedding")` === `grpc://0.0.0.0:3015`
(normalizes to `:3015` localhost); `bun test services/embedding` passes.

## Step 4 — Non-literal-defaults audit

Intent: confirm every in-scope service passes a static object literal to
`createServiceConfig` (the helper's extraction precondition).

Files modified: none (read-only check; record findings in the implementation
PR description).

Concrete change: run `node scripts/audit-service-urls.mjs`; if the helper
throws "not a static object literal" for any service, that service either gets
a literal-defaults refactor (preferred) or is excluded from the registry with a
one-line rationale in the registry comment.

Verification: the audit runs to completion (no extraction throw) across every
registered service.
