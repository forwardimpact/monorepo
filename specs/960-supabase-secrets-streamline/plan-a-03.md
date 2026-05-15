# Plan 960-a, Part 03 — Consumer migration

Migrate every consumer that today reads `process.env.MAP_SUPABASE_*` to use `Config` accessors (or, for the one exempted library, the canonical unprefixed name). Each step lands one consumer plus its tests so the suite stays green between steps.

## Step 0 — Bootstrap `Config` in the three product bins

None of `products/{map,landmark,summit}/bin/fit-*.js` builds a `Config` today. Add an import and a top-level `await` to each before any consumer step runs. Pattern reference: `bin/fit-guide.js:15-16` (`createProductConfig` + `createServiceConfig`), `bin/fit-terrain.js:14,184` (`createScriptConfig`), `services/map/server.js:9` (`createServiceConfig`).

Files modified: `products/map/bin/fit-map.js`, `products/landmark/bin/fit-landmark.js`, `products/summit/bin/fit-summit.js`.

Per file, add near the existing libcli/libtelemetry imports:

```js
import { createProductConfig } from "@forwardimpact/libconfig";
// …
const config = await createProductConfig("<product-name>");
```

Where `<product-name>` is `"map"`, `"landmark"`, or `"summit"`. The `config` binding sits at module top scope so every dispatcher and handler can reference it.

Per-bin wiring shape (each bin has a different dispatch surface):

| Bin | Current dispatch | Threading |
| --- | --- | --- |
| `products/map/bin/fit-map.js` | `switch (command)` with helpers `dispatchAuth`, `dispatchActivity`, etc., calling handlers like `runAuthIssueCommand({supabase, options})` | Pass `config` alongside `supabase` into each handler invocation (e.g. `runAuthIssueCommand({supabase, config, options})`). Steps 2–4 then read it. |
| `products/landmark/bin/fit-landmark.js` | `buildContext({dataDir, options, needsSupabase, identity})` near line 292 + `resolveIdentity()` at line 291 | Pass `config` into `resolveIdentity({config})` (Step 6) and into `buildContext({…, config})` (Step 5b). |
| `products/summit/bin/fit-summit.js` | Each handler imports `createSummitClient` directly via `options.supabase ?? (await createSummitClient())` (six call sites: `src/index.js`, `src/roster/loader.js`, `src/commands/coverage.js`, `src/commands/risks.js`, `src/commands/growth.js` ×2) | Bin builds `config` and passes through handler `options`; each call site changes to `options.supabase ?? (await createSummitClient({config}))` once Step 8 lands. |

Verification: each bin starts (`bun products/<p>/bin/fit-<p>.js --help`) with a `.env` produced by Part 02; the `config` binding is reachable from every handler. Test suites still green (no behaviour change yet — `config` is unused until subsequent steps).

## Step 1 — `services/map/server.js`

Files modified: `services/map/server.js`.

Replace the dead-property + `process.env` fallback chain (lines 13–20):

```js
const supabaseUrl = config.supabaseUrl();
const supabaseKey = config.supabaseServiceRoleKey();
```

Delete the unused `process.env.SUPABASE_URL` / `process.env.SUPABASE_SERVICE_ROLE_KEY` fallback branches.

Verification: `bun test services/map` green; `node services/map/server.js` starts with a `.env` produced by Part 02.

## Step 2 — `products/map/src/lib/client.js`

Files modified: `products/map/src/lib/client.js`, `products/map/test/lib/client.test.js` (if absent, create).

Replace function body. Accept a required `config`:

```js
import { createClient } from "@supabase/supabase-js";

export function createMapClient({ config, schema = "activity" } = {}) {
  if (!config) throw new Error("createMapClient: config required");
  return createClient(
    config.supabaseUrl(),
    config.supabaseServiceRoleKey(),
    { db: { schema } },
  );
}
```

Update callers (`products/map/bin/fit-map.js` — find via `rg createMapClient products/map`) to pass `config` from the already-built `createProductConfig("map")` instance.

Verification: `bun test products/map/test/lib` green.

## Step 3 — `products/map/src/commands/auth-issue.js`

Files modified: `products/map/src/commands/auth-issue.js`, `products/map/test/activity/auth-issue.test.js`.

Replace inline `process.env.MAP_SUPABASE_JWT_SECRET` read (lines 53–60) with `config` resolved from the handler `params` object:

```js
export async function runAuthIssueCommand({ supabase, config, options }) {
  // … existing validation …
  const secret = config.supabaseJwtSecret();
  // … rest unchanged …
}
```

Update `products/map/bin/fit-map.js` to pass `config` to the handler context (mirrors how `supabase` is already threaded). Tests swap `process.env.MAP_SUPABASE_JWT_SECRET = "test-secret"` setup for a fake `config` stub with a `supabaseJwtSecret()` method.

Verification: `bun test products/map/test/activity/auth-issue.test.js` green.

## Step 4 — `products/map/src/commands/activity.js` (`start()` rewrite)

Files modified: `products/map/src/commands/activity.js`, `products/map/test/activity-start.test.js`.

In `activity.js`:

- Delete the module-level `const supabaseCli = createSupabaseCli();` (line 20). Construct it inside each handler that uses it (`start`, `stop`, `status`, `migrate`).
- Rewrite `start()` (lines 23–39) to drop the `export MAP_SUPABASE_*` block in full. Keep `await cli.run(["start"])` and `await cli.capture(["status", "--output", "json"])` (used to extract `api_url`). New output:

```js
export async function start({ cli, out = process.stdout, config } = {}) {
  cli = cli ?? createSupabaseCli();
  await cli.run(["start"]);
  const json = await cli.capture(["status", "--output", "json"]);
  const status = JSON.parse(json);
  out.write("\n" + formatSuccess(`Supabase ready at ${status.api_url}`) + "\n");
  return 0;
}
```

Keep the `formatSubheader` import — the in-file `report` helper at line 339 still uses it.

In `activity-start.test.js`:

- Delete the four `assert.match(text, /export MAP_SUPABASE_*/)` assertions and the order check (lines 46–55).
- Replace with a single assertion: `assert.match(text, /Supabase ready at http:\/\/127\.0\.0\.1:54321/)`.
- Drop the `jwt_secret` and `anon_key` fields from the stub JSON (no longer asserted).

Verification: `bun test products/map/test/activity-start.test.js` green; the four old `export` patterns are gone from both src and test.

## Step 5 — `products/landmark/src/lib/supabase.js`

Files modified: `products/landmark/src/lib/supabase.js`, `products/landmark/test/lib/supabase.test.js`.

The test file exercises `createLandmarkClient` directly with the old `{ jwt, url, anonKey }` shape; rewrite every test invocation to pass a fake `config` stub returning `"http://supabase.local"` and `"anon"` (mirror Step 6's identity-test stub). The "throws when URL missing" test asserts the new wording (`/just env-setup/` matches the post-migration error message).

Replace function signature and body:

```js
export function createLandmarkClient({ jwt, config, schema = "activity" } = {}) {
  if (!config)
    throw new SupabaseUnavailableError(
      "Supabase URL + anon key not set. Run `just env-setup`.",
    );
  if (!jwt)
    throw new SupabaseUnavailableError(
      "missing JWT — resolveIdentity must run first",
    );
  return createClient(config.supabaseUrl(), config.supabaseAnonKey(), {
    db: { schema },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}
```

Error message removes `MAP_SUPABASE_*` and `fit-map activity start` and names the new bootstrap recipe.

Update the JSDoc `@param` lines accordingly. Callers update in step 5b.

Verification: tested transitively in steps 5b, 6, and 7.

## Step 5b — `products/landmark/src/lib/context.js`

Files modified: `products/landmark/src/lib/context.js`.

The sole caller of `createLandmarkClient` outside Landmark's own login flow is `buildContext` at line 28, currently `createLandmarkClient({ jwt: identity?.jwt })`. After Step 5 makes `config` required, this call breaks every `needsSupabase` command.

Add `config` to the `buildContext` parameter object and thread it through:

```js
export async function buildContext({
  dataDir,
  config,
  options,
  needsSupabase,
  identity = null,
}) {
  const mapData = await loadMapData(dataDir);
  const supabase = needsSupabase
    ? createLandmarkClient({ jwt: identity?.jwt, config })
    : null;
  // …
}
```

Update the bin caller `products/landmark/bin/fit-landmark.js` (the `buildContext({ … })` call near line 295) to pass `config` from Step 0's `createProductConfig("landmark")` instance.

Verification: `bun test products/landmark` green.

## Step 6 — `products/landmark/src/lib/identity.js`

Files modified: `products/landmark/src/lib/identity.js`, `products/landmark/test/lib/identity.test.js`.

Change `resolveIdentity` signature from `(env = process.env, opts = {})` to `({config, env = process.env, ...opts} = {})`. Thread `config` through `resolveFromJwt` and `refreshSession`.

In `resolveFromJwt`, replace the `if (env.MAP_SUPABASE_JWT_SECRET)` gate (line 71) with:

```js
let secret;
try { secret = config?.supabaseJwtSecret(); } catch { /* operator install only */ }
if (secret) {
  // existing HMAC verify, using `secret` instead of env.MAP_SUPABASE_JWT_SECRET
}
```

In `refreshSession`, replace `env.MAP_SUPABASE_URL` / `env.MAP_SUPABASE_ANON_KEY` reads (lines 98–103) with:

```js
let url, anonKey;
try {
  url = config.supabaseUrl();
  anonKey = config.supabaseAnonKey();
} catch (err) {
  throw new IdentityUnresolvedError(
    `session refresh needs SUPABASE_URL and SUPABASE_ANON_KEY: ${err.message}`,
  );
}
```

Update `products/landmark/bin/fit-landmark.js:291` from `resolveIdentity()` to `resolveIdentity({config})`, where `config` is the existing `createProductConfig("landmark")` instance.

Update `identity.test.js`: every `env: { MAP_SUPABASE_JWT_SECRET: SECRET, ... }` block becomes a fake `config` stub:

```js
const config = {
  supabaseJwtSecret: () => SECRET,
  supabaseUrl: () => "http://supabase.local",
  supabaseAnonKey: () => "anon",
};
await resolveIdentity({ config, env: { LANDMARK_AUTH_TOKEN: jwt } });
```

The test that asserts the "refresh needs URL" error message updates from `/MAP_SUPABASE_URL/` to `/SUPABASE_URL/`.

Verification: `bun test products/landmark/test/lib/identity.test.js` green.

## Step 7 — `products/landmark/src/commands/login.js`

Files modified: `products/landmark/src/commands/login.js`, `products/landmark/test/commands/login.test.js`, `products/landmark/test/dispatcher.test.js`.

In `login.js`, replace `resolveAnonClient({env, createClient, flowType})` (lines 116–134):

```js
function resolveAnonClient({ config, createClient, flowType = "implicit" }) {
  let url, anonKey;
  try {
    url = config.supabaseUrl();
    anonKey = config.supabaseAnonKey();
  } catch (err) {
    throw new Error(
      `fit-landmark login: SUPABASE_URL and SUPABASE_ANON_KEY must be set. ` +
        `Run \`just env-setup\` (local) or copy them from your Supabase ` +
        `project settings (hosted). Underlying: ${err.message}`,
    );
  }
  return createClient(url, anonKey, {
    auth: {
      flowType,
      storage: createPkceStorage(),
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
```

Update `runLoginCommand` to accept `config` alongside `env` (env still carries `LANDMARK_CREDENTIALS_FILE`). Pass `config` into `resolveAnonClient`.

In `login.test.js`:

- Each `env` block keeps `LANDMARK_CREDENTIALS_FILE`; drop `MAP_SUPABASE_URL` and `MAP_SUPABASE_ANON_KEY`.
- Add a `config` stub returning `"http://supabase.local"` and `"anon"`.
- The "rejects when …missing" test renames to `"rejects when SUPABASE_URL is missing"`; the regex changes to `/SUPABASE_URL and SUPABASE_ANON_KEY/`.

In `dispatcher.test.js`:

- Test docstring at line 7: `MAP_SUPABASE_*` → `SUPABASE_*`.
- Test name at line 50: `MAP_SUPABASE_URL is unset` → `SUPABASE_URL is unset`.
- Comment at line 59: `MAP_SUPABASE_URL or MAP_SUPABASE_ANON_KEY` → `SUPABASE_URL or SUPABASE_ANON_KEY`.
- Regex at line 63: `/MAP_SUPABASE_URL/` → `/just env-setup/`. (The new `SupabaseUnavailableError` message Step 5 introduces — `"Supabase URL + anon key not set. Run \`just env-setup\`."` — does not contain the literal `SUPABASE_URL`; pinning the regex to the recipe name matches both the new wording and any future variant that keeps the bootstrap instruction.)

Verification: `bun test products/landmark` green.

## Step 8 — `products/summit/src/lib/supabase.js`

Files modified: `products/summit/src/lib/supabase.js` and any callers passing `url`/`serviceRoleKey` (find via `rg createSummitClient products/summit`).

Replace `createSummitClient`:

```js
export async function createSummitClient({ config, schema = "activity" } = {}) {
  if (!config)
    throw new SupabaseUnavailableError(
      "config required — pass createProductConfig('summit') from the entrypoint",
    );
  let url, key;
  try {
    url = config.supabaseUrl();
    key = config.supabaseServiceRoleKey();
  } catch (err) {
    throw new SupabaseUnavailableError(
      `SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set. ` +
        `Run \`just env-setup\` or use --roster <path> instead. ` +
        `Underlying: ${err.message}`,
    );
  }
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, key, { db: { schema } });
}
```

Update any callers and their tests.

Verification: `bun test products/summit` green.

## Step 9 — `libraries/libterrain/src/cli-helpers.js`

Files modified: `libraries/libterrain/src/cli-helpers.js`, `libraries/libterrain/bin/fit-terrain.js` (caller), any related tests.

Replace `resolveSupabaseClient()`:

```js
export async function resolveSupabaseClient({ config }) {
  if (!config) throw new Error("resolveSupabaseClient: config required");
  let createClient;
  try {
    ({ createClient } = await import("@supabase/supabase-js"));
  } catch {
    throw new Error(
      "build --load requires @supabase/supabase-js. Install with: bun add @supabase/supabase-js",
    );
  }
  let url, key;
  try {
    url = config.supabaseUrl();
    key = config.supabaseServiceRoleKey();
  } catch (err) {
    throw new Error(
      `SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set. ` +
        `Run \`just env-setup\` to generate them. Underlying: ${err.message}`,
    );
  }
  return createClient(url, key);
}
```

`libraries/libterrain/bin/fit-terrain.js:14,184` already imports and builds `createScriptConfig("terrain")`; no new bootstrap needed. The only edits here are: extend `selectOutputSink`'s parameter object to include `config` (currently `{verb, load, monorepoRoot, prettierFn, logger}`), thread `config` from the bin call site through into `resolveSupabaseClient({config})`, and update the bin caller to pass `config` into `selectOutputSink({…, config})`.

Verification: `bun test libraries/libterrain` green.

## Step 10 — libstorage: rename the env var only

Files modified: `libraries/libstorage/src/index.js` (line 201).

The exemption is permanent (design § Per-module injection seams, libstorage row — `libconfig` already depends on `libstorage`). The env var name is already canonical (`SUPABASE_SERVICE_ROLE_KEY`); no rename needed. Add a one-line comment above the read so future static-inspection allow-list maintenance has explicit anchor text:

```js
// libstorage exemption (spec 960): libconfig depends on libstorage; threading
// Config here would create a runtime cycle. Allow-listed in
// libraries/libconfig/test/no-supabase-env-in-src.test.js.
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
```

Verification: `bun test libraries/libstorage` green; visual confirmation that no other `MAP_SUPABASE_*` substring appears under `libraries/libstorage/src/`.

## Step 11 — `products/landmark/test/lib/sign-test-token.js`

Files modified: `products/landmark/test/lib/sign-test-token.js`, `products/landmark/test/lib/sign-test-token.test.js`.

In `sign-test-token.js` (lines 12–20), rename the env var read:

```js
export function signTestToken({
  email,
  secret = process.env.SUPABASE_JWT_SECRET,
  ttlSeconds = 900,
}) {
  if (!secret)
    throw new Error("signTestToken: SUPABASE_JWT_SECRET not set");
  return mintSupabaseJwt({ email, secret, ttlSeconds });
}
```

In `sign-test-token.test.js`: every `MAP_SUPABASE_JWT_SECRET` substring → `SUPABASE_JWT_SECRET`. Test name and regex update accordingly.

Verification: `bun test products/landmark/test/lib/sign-test-token.test.js` green.

## Step 12 — Live-Postgres test skip-gates rename

Files modified: `products/map/test/activity/{migration-rls,rls-scope,people-provision}.test.js`, `products/map/test/activity/lib/live.js`, `products/landmark/test/sources.test.js`.

(`products/landmark/test/dispatcher.test.js` is owned by Step 7, not Step 12.) Mechanical substring rename in the remaining test files under `products/{map,landmark}/test/`:

- `MAP_SUPABASE_URL` → `SUPABASE_URL`
- `MAP_SUPABASE_ANON_KEY` → `SUPABASE_ANON_KEY`
- `MAP_SUPABASE_SERVICE_ROLE_KEY` → `SUPABASE_SERVICE_ROLE_KEY`
- `MAP_SUPABASE_JWT_SECRET` → `SUPABASE_JWT_SECRET`

These tests are live-skip-gated and remain `process.env` direct readers (the static-inspection rule scopes to `src/` + `bin/`). Skip-test docstrings and test names update in lockstep.

Verification: `rg MAP_SUPABASE products/{map,landmark}/test` returns zero matches.

## Dependencies

- Depends on Part 01 (Config accessors) and Part 02 (env shape + local-CLI binding).
- Blocks Part 04 (static-inspection test would fail if any consumer still reads `MAP_SUPABASE_*` or `process.env.SUPABASE_*` in src/bin).

## Sequencing within Part 03

Steps 1–11 each touch a different consumer and can land as separate commits or one squashed commit, but in this order so that every commit boundary leaves the suite green: services (1), Map (2–4), Landmark (5–7), Summit (8), Terrain (9), libstorage rename-only (10), test helper (11). Step 12 (test skip-gate rename) lands last in this part because it touches files across products and is mechanical.
