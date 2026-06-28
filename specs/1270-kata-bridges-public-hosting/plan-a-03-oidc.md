# Plan 1270 — Part 03: `services/oidc`

Stateless HTTP front for GitHub Actions OIDC exchange. Validates the
inbound OIDC token, extracts the `repository` claim, calls
`services/ghserver.MintInstallationToken({ owner, name })` over gRPC,
returns the resulting installation token. Holds no signing material —
mirrors the `services/oauth` → `services/ghuser` pattern.

## Step 1 — Open the STATUS sub-row

Append `1270/oidc\tplan\tapproved` to `wiki/STATUS.md` as the first
commit of this PR. Verification: `rg "^1270/oidc" wiki/STATUS.md`.

## Step 2 — Scaffold `services/oidc/`

Created files:

- `services/oidc/package.json` (mirror `services/oauth/package.json`:
  `name: "@forwardimpact/svcoidc"`, `bin: { "fit-svcoidc":
  "./server.js" }`, dependencies on `libconfig`, `librpc`,
  `libtelemetry`, `libtype`, `libpreflight`, `@hono/node-server`,
  `hono`).
- `services/oidc/index.js` (exports `createOidcService({ config,
  logger, providerClient })`).
- `services/oidc/server.js` (mirror `services/oauth/server.js`:
  `createServiceConfig`, `createClient(config.provider, logger)`,
  `createOidcService({ ... }).start()`).
- `services/oidc/src/jwks-cache.js` (JWKS fetch + cache with
  config-driven TTL; injected `{ clock, fetch }` per spec 1370
  convention).
- `services/oidc/src/oidc-validator.js` (`validate(token, { issuer,
  audience, jwks })`: verify signature, exp, nbf, iss, aud; extract
  `repository` claim as `"{owner}/{name}"`; throws typed errors for
  invalid token, expired, wrong issuer, wrong audience, missing
  `repository` claim).
- `services/oidc/src/handlers.js` (`POST /token` handler: extract
  `Authorization: bearer <token>`, validate via `oidc-validator`,
  call `providerClient.MintInstallationToken({ owner, name,
  requested_by: "oidc" })`, return `{ installation_token, expires_at
  }` as JSON).
- `services/oidc/CLAUDE.md`, `services/oidc/README.md` (jobs
  declaration).
- `services/oidc/test/handlers.test.js` (happy path; invalid
  signature → 401; expired → 401; wrong audience → 403; wrong issuer
  → 403; missing `repository` claim → 400; provider `NOT_FOUND` →
  404; provider `RATE_LIMITED` → 429).

Verification: `bun test services/oidc` passes; `bun run check` clean.

## Step 3 — Implement JWKS cache

Modified files: `services/oidc/src/jwks-cache.js`.

```js
class JwksCache {
  #clock; #fetch; #issuer; #ttl_ms; #cached_at = 0; #keys = null;
  constructor({ clock, fetch, issuer, ttl_ms = 600_000 }) { ... }
  async getKeys() {
    if (this.#keys && (this.#clock.now() - this.#cached_at) < this.#ttl_ms) {
      return this.#keys;
    }
    const wellKnown = await this.#fetch(`${this.#issuer}/.well-known/openid-configuration`);
    const { jwks_uri } = await wellKnown.json();
    const jwksRes = await this.#fetch(jwks_uri);
    this.#keys = (await jwksRes.json()).keys;
    this.#cached_at = this.#clock.now();
    return this.#keys;
  }
  invalidate() { this.#keys = null; this.#cached_at = 0; }
}
```

`invalidate()` is called by the validator on signature verification
failure to force a re-fetch on the next call (handles JWKS rotation
without a forced restart).

Verification: `services/oidc/test/jwks-cache.test.js` covers
in-window cache hit, TTL expiry refetch, and `invalidate` →
refetch.

## Step 4 — Implement OIDC validator

Modified files: `services/oidc/src/oidc-validator.js`.

Use `jose` (declared in `services/oidc/package.json` per Step 7
below). Validate: signature against JWKS, `exp` not past, `nbf` not
future, `iss === expected_issuer`, `aud === expected_audience`,
`payload.repository` present as `"{owner}/{name}"`. On signature
failure, call `jwks.invalidate()` once and retry once before
rejecting. Throws a typed `OidcError` carrying a `code` field
(`INVALID_SIGNATURE`, `EXPIRED`, `WRONG_ISSUER`, `WRONG_AUDIENCE`,
`MISSING_REPOSITORY_CLAIM`). The handler (Step 6) maps codes to HTTP
status: `INVALID_SIGNATURE`/`EXPIRED` → 401, `WRONG_ISSUER`/`WRONG_AUDIENCE`
→ 403, `MISSING_REPOSITORY_CLAIM` → 400.

Verification: `services/oidc/test/oidc-validator.test.js` covers each
failure mode with a tampered token and asserts the typed `code`.

## Step 5 — Config defaults

Modified files: `services/oidc/server.js`.

```js
createServiceConfig("oidc", {
  provider: "ghserver",
  issuer: "https://token.actions.githubusercontent.com",
  audience: "fit-ghserver",
  jwks_ttl_ms: 600_000,
  port: 9202,
});
```

`provider` mirrors `services/oauth`'s `provider: "ghuser"` pattern —
provider is swappable via config and resolved through
`createClient(config.provider, logger)` per the
`services/oauth/server.js` shape.

Verification: `services/oidc/test/config.test.js` covers each default
and the env override.

## Step 6 — HTTP token handler

Modified files: `services/oidc/src/handlers.js`.

```js
app.post("/token", async (c) => {
  const auth = c.req.header("authorization");
  if (!auth?.startsWith("bearer ")) return c.json({ error: "missing bearer" }, 401);
  const token = auth.slice(7);
  let claims;
  try { claims = await validator.validate(token); }
  catch (e) { return c.json({ error: e.code }, statusForError(e)); }
  const [owner, name] = claims.repository.split("/");
  try {
    const { installation_token, expires_at } =
      await providerClient.MintInstallationToken({ owner, name, requested_by: "oidc" });
    return c.json({ installation_token, expires_at });
  } catch (e) {
    if (e.code === "NOT_FOUND") return c.json({ error: "not provisioned" }, 404);
    if (e.code === "RATE_LIMITED") return c.json({ error: "rate limited" }, 429);
    throw e;
  }
});
```

Verification: `services/oidc/test/handlers.test.js` exercises each
HTTP status mapping.

## Step 7 — Register in `services/README.md`

Modified files: `services/README.md`. Add catalog row matching the
existing `oauth` shape. Operator step: add `services/oidc` to
`config/config.json` `init.services` per
`services/CLAUDE.md` § Running services; the service README
documents the requirement. No monorepo `package.json` workspaces
edit (the `services/*` glob covers it). Add `jose` to
`services/oidc/package.json` `dependencies` explicitly — the lib
is present transitively via other services but every direct
importer must declare it.

Verification: `bun install` clean; `rg "services/oidc" services/README.md`;
`rg '"jose"' services/oidc/package.json` returns one match.

## Step 8 — Close the STATUS sub-row

Update `wiki/STATUS.md`: `1270/oidc\tplan\tapproved` →
`1270/oidc\tplan\timplemented`.

## Risks

- **Forging OIDC tokens.** The validator must verify the signature against the
  JWKS published at GitHub's discovery endpoint. Skipping signature verification
  (e.g. decode-only) would let any caller mint tokens for any repo. Step 4
  explicitly requires signature verification before claim extraction;
  `services/oidc/test/oidc-validator.test.js` covers a tampered-token rejection.

- **`audience` claim drift.** GitHub Actions runners may emit OIDC
  tokens with the audience configured by the customer's workflow
  step. The hosted-path workflow templates (part 06) emit `id-token:
  write` and request the audience `fit-ghserver`; the validator
  rejects mismatched audiences. Step 5 records the audience as a
  config knob so it can be rotated.

## Libraries used

`libconfig`, `librpc`, `libtelemetry`, `libtype`, `libpreflight`,
`@hono/node-server`, `hono`, `jose` (verify presence; add if absent).
