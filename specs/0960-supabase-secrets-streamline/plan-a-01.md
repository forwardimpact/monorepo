# Plan 0960-a, Part 01 — Foundation

Land the helpers and accessors every other part depends on. No call sites change
yet.

## Step 1 — Add `mintSupabaseAnonKey` and `mintSupabaseServiceRoleKey` to libsecret

Long-lived role JWTs with the `{iss: "supabase", iat, exp}` envelope used by
today's `env-storage.js` lines 30–34.

Files modified: `libraries/libsecret/src/index.js`,
`libraries/libsecret/test/libsecret.test.js`.

Append after `mintSupabaseJwt`:

```js
const SUPABASE_ROLE_EXP_SECONDS = 10 * 365 * 24 * 60 * 60;

function mintSupabaseRoleKey({ role, secret }) {
  if (!secret) throw new Error(`mintSupabase${role === "anon" ? "Anon" : "ServiceRole"}Key: secret required`);
  const now = Math.floor(Date.now() / 1000);
  return generateJWT(
    { iss: "supabase", iat: now, exp: now + SUPABASE_ROLE_EXP_SECONDS, role },
    secret,
  );
}

export function mintSupabaseAnonKey({ secret }) {
  return mintSupabaseRoleKey({ role: "anon", secret });
}

export function mintSupabaseServiceRoleKey({ secret }) {
  return mintSupabaseRoleKey({ role: "service_role", secret });
}
```

Add unit tests covering: returns a 3-segment HS256 JWT; payload contains `role`
and `iss: "supabase"`; `exp − iat` equals the 10-year constant; rejects empty
`secret` with the named error.

Verification: `bun test libraries/libsecret/test/libsecret.test.js` green.

## Step 2 — Extend `Config.#CREDENTIAL_KEYS` and add four Supabase accessors

Files modified: `libraries/libconfig/src/config.js`,
`libraries/libconfig/test/config.test.js`.

In `libraries/libconfig/src/config.js`, replace the `#CREDENTIAL_KEYS` set
(currently lines 48–53):

```js
static #CREDENTIAL_KEYS = new Set([
  "ANTHROPIC_API_KEY",
  "GH_TOKEN",
  "GITHUB_TOKEN",
  "MCP_TOKEN",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_JWT_SECRET",
]);
```

Add four accessor methods next to `mcpToken()` (currently lines 161–163):

```js
/** @returns {string} Supabase base URL (trailing slashes stripped) */
supabaseUrl() {
  return this.#resolve(["SUPABASE_URL"], stripTrailingSlashes);
}

/** @returns {string} Supabase anon key JWT */
supabaseAnonKey() {
  return this.#resolve(["SUPABASE_ANON_KEY"]);
}

/** @returns {string} Supabase service-role key JWT */
supabaseServiceRoleKey() {
  return this.#resolve(["SUPABASE_SERVICE_ROLE_KEY"]);
}

/** @returns {string} Supabase HS256 JWT signing secret */
supabaseJwtSecret() {
  return this.#resolve(["SUPABASE_JWT_SECRET"]);
}
```

`SUPABASE_URL` is **not** in `#CREDENTIAL_KEYS` — design § Key Decisions row 7.
The URL must remain on `process.env` so docker-compose's `${SUPABASE_URL}`
interpolation works at the shell level.

## Step 3 — Cover the four accessors with libconfig unit tests

Files modified: `libraries/libconfig/test/libconfig-getters.test.js` (accessor
round-trips + throw shape),
`libraries/libconfig/test/libconfig-credentials.test.js` (the `process.env`
isolation assertions, mirroring the existing `ANTHROPIC_API_KEY` block).

Cover, against a stub `process.env`:

| Test | Assertion |
| --- | --- |
| `supabaseUrl()` returns the value with trailing slashes stripped | `new Config(...).load(); supabaseUrl()` returns `http://127.0.0.1:54321` when env has `SUPABASE_URL=http://127.0.0.1:54321/` |
| `supabaseAnonKey()` returns the env value | Plain string round-trip |
| `supabaseServiceRoleKey()` returns the env value | Plain string round-trip |
| `supabaseJwtSecret()` returns the env value | Plain string round-trip |
| Three secrets are not on `process.env` after `Config.load()` reads them from `.env` | Mirror the existing `ANTHROPIC_API_KEY` credential-isolation test |
| `SUPABASE_URL` remains on `process.env` after `Config.load()` | Mirror the existing non-credential test |
| Each accessor throws `<KEY> not found in environment` when unset | Match the existing `#resolve` throw shape |

Verification:
`bun test libraries/libconfig/test/libconfig-getters.test.js libraries/libconfig/test/libconfig-credentials.test.js`
green.

## Step 4 — Publish the new libsecret exports

Files modified: `libraries/libsecret/README.md`.

Update the exports table / example block to list `mintSupabaseAnonKey` and
`mintSupabaseServiceRoleKey` next to `mintSupabaseJwt`. One-line description
each. No new top-level section.

Verification: visually inspect; no test gate.

## Step 5 — Regenerate catalog and run integration check

Files modified: none (verification only — version bumps are owned by
`kata-release-cut`, not this PR).

Verification: `bun run context:fix` produces no diff;
`bun test libraries/libsecret libraries/libconfig` green.

## Dependencies

None — this part is the foundation. Lands as PR #1.
