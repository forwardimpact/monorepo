# Plan 0990-a Part 01 — libconfig override-loop fix + `PRODUCT_LANDMARK_TOKEN`

Implements the design-c rows for libconfig, `Config.token`, the
`resolveIdentity()` read-site swap, the `createProductConfig("landmark")`
callsite, and the docs/test sweep. Closes the layering anomaly identified
in design-c § Architectural insight.

## Inter-step dependency

Steps 1–4 are atomic: tests for individual steps (Steps 2, 3, 4) cannot
run green until Steps 1+2+3+4+5+6 all land together — the change spans
the loop, the credential-key set, the callsite, the read site, and the
two test files. Treat Steps 1–6 as one commit; Steps 7–10 follow as
separate commits.

## Step 1 — Extend the libconfig override loop to read `#envOverrides`

Let credential keys with a registered default in `data` resolve through
both shell env and the `.env`-loaded `#envOverrides` map (today the loop
reads only `process.env`). Treat empty string as absent so the
workflow's `${{ … || '' }}` ternary in Part 03 does not clobber a
`.env`-supplied value.

- **Modified**: `libraries/libconfig/src/config.js` (override loop at
  lines 125–134; verify by `rg "for \(const param of Object.keys\(data\)\)"
  libraries/libconfig/src/config.js`)

Replace the loop with (preserving precedence: shell `process.env` > `.env`
`#envOverrides`). Empty-string-as-absent semantics are **scoped to
credential keys only** — non-credential service params (`url`, `host`,
`port`, `protocol`, `path`) retain today's empty-string-wins behaviour
so existing callers that set `SERVICE_X_HOST=""` to mean "explicitly
empty" do not regress:

```js
for (const param of Object.keys(data)) {
  const varName = `${namespaceUpper}_${nameUpper}_${param.toUpperCase()}`;
  const isCredential = Config.#CREDENTIAL_KEYS.has(varName);
  const shellValue = this.#process.env[varName];
  // For credentials, treat empty string as absent so a workflow ternary
  // emitting '' (Part 03 § Step 4) cannot clobber a .env value.
  // For non-credentials, preserve today's behaviour: empty string wins.
  const shellOk = isCredential
    ? shellValue !== undefined && shellValue !== ""
    : shellValue !== undefined;
  const raw = shellOk ? shellValue : this.#envOverrides[varName];
  const rawOk = isCredential
    ? raw !== undefined && raw !== ""
    : raw !== undefined;
  if (rawOk) {
    try {
      data[param] = JSON.parse(raw);
    } catch {
      data[param] = raw;
    }
  }
}
```

Verify: `bun test libraries/libconfig/test/` passes unchanged. Existing
non-credential `SERVICE_*_*=""` cases retain today's behaviour because
the new branch's empty-string-as-absent only applies when `varName` is
in `#CREDENTIAL_KEYS`. The new credential-side branch fires only for
params registered in a `createProductConfig` default (today, only
`token` after Step 3).

## Step 2 — Add `PRODUCT_LANDMARK_TOKEN` to `#CREDENTIAL_KEYS`

- **Modified**: `libraries/libconfig/src/config.js` (`#CREDENTIAL_KEYS` set;
  locate via `rg "static #CREDENTIAL_KEYS" libraries/libconfig/src/config.js`)

Add the literal `"PRODUCT_LANDMARK_TOKEN"` to the set. Keys are sorted
alphabetically; the new entry slots between `MCP_TOKEN` and
`SUPABASE_ANON_KEY`.

## Step 3 — Register `token` default on the Landmark product config

- **Modified**: `products/landmark/bin/fit-landmark.js` (the
  `createProductConfig` callsite; locate via
  `rg 'createProductConfig\("landmark"' products/landmark/bin/`)

Change:

```js
const config = await createProductConfig("landmark");
```

to:

```js
const config = await createProductConfig("landmark", { token: undefined });
```

Registers `token` as a known param so the libconfig override loop iterates
over it; resolution becomes `process.env.PRODUCT_LANDMARK_TOKEN` >
`.env` `PRODUCT_LANDMARK_TOKEN` (via `#envOverrides`) > `config.json`
`product.landmark.token` > `undefined`.

## Step 4 — Point `resolveIdentity()` at `config.token`

- **Modified**: `products/landmark/src/lib/identity.js` (the
  `resolveIdentity` entry-point check; locate via
  `rg "env\.LANDMARK_AUTH_TOKEN" products/landmark/src/lib/identity.js`)

Replace the entry-point check:

```js
// before
if (env.LANDMARK_AUTH_TOKEN) {
  return resolveFromJwt(env.LANDMARK_AUTH_TOKEN, config);
}

// after
if (config?.token) {
  return resolveFromJwt(config.token, config);
}
```

`env` is still threaded for `LANDMARK_CREDENTIALS_FILE` (the credentials-
file path is unchanged).

Then sweep every `LANDMARK_AUTH_TOKEN` literal in `identity.js` — error
messages and JSDoc — to `PRODUCT_LANDMARK_TOKEN`. Locate them with
`rg "LANDMARK_AUTH_TOKEN" products/landmark/src/lib/identity.js`; the
sweep must leave zero matches in this file after the edit. The JSDoc
block on `resolveIdentity` (the precedence-and-fallback documentation)
must reflect the new resolution source.

## Step 5 — Rewrite identity tests for the new env-var name

- **Modified**: `products/landmark/test/lib/identity.test.js`

Two transformations:

1. **Helper extension.** Extend `makeConfig` to carry the JWT directly:

   ```js
   function makeConfig({ url, anonKey, jwtSecret, token } = {}) {
     return {
       token,
       supabaseUrl: () => { /* unchanged */ },
       supabaseAnonKey: () => { /* unchanged */ },
       supabaseJwtSecret: () => { /* unchanged */ },
     };
   }
   ```

2. **Sweep every test case** that sets `env: { LANDMARK_AUTH_TOKEN: <jwt> }`:
   move the JWT into `makeConfig({ token: <jwt>, … })` and drop the env
   entry. Sweep regex assertions matching the literal `LANDMARK_AUTH_TOKEN`
   to `PRODUCT_LANDMARK_TOKEN`. Verify with
   `rg "LANDMARK_AUTH_TOKEN" products/landmark/test/lib/identity.test.js`
   returning zero matches after the edit.

The test named "env LANDMARK_AUTH_TOKEN takes precedence over the store"
renames to "config.token takes precedence over the store"; the JWT passes
via config rather than env.

Verify: `bun test products/landmark/test/lib/identity.test.js` exits 0
with the same test count as on `main`.

## Step 6 — Rewrite the dispatcher test for the new env-var name

- **Modified**: `products/landmark/test/dispatcher.test.js`

Locate the test named "exits 3 when token present but SUPABASE_URL is
unset" (`rg "exits 3 when token present" products/landmark/test/
dispatcher.test.js`). Rename its env key from `LANDMARK_AUTH_TOKEN` to
`PRODUCT_LANDMARK_TOKEN`. The "exits 4 when no identity" test is
unchanged.

Verify: `bun test products/landmark/test/dispatcher.test.js` exits 0
with all three tests passing.

## Step 7 — Add libconfig unit test for `.env`-routed credential override

- **Created**: `libraries/libconfig/test/credential-env-override.test.js`

Single test file (~80 lines). Use the existing test pattern from
`libraries/libconfig/test/libconfig-env-file.test.js` — a mocked
`storageFn` keeps the test hermetic (the default `createStorage` would
walk `findUpward("config")` from the tmpdir and may discover the
monorepo's own `config/` directory):

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createProductConfig } from "@forwardimpact/libconfig";

// Mocked storage that always returns no config file (no findUpward walk).
function mockStorageFn() {
  return {
    get: async () => null,
    put: async () => {},
    delete: async () => {},
    path: () => "/dev/null/config",
  };
}

async function setup(envContent) {
  const tmpdir = await mkdtemp(path.join(os.tmpdir(), "credenv-"));
  if (envContent !== null) {
    await writeFile(path.join(tmpdir, ".env"), envContent, { mode: 0o600 });
  }
  return tmpdir;
}

describe("PRODUCT_LANDMARK_TOKEN credential override", () => {
  it("loads token from .env when no shell value is set", async () => {
    const tmpdir = await setup("PRODUCT_LANDMARK_TOKEN=test-jwt-value\n");
    const config = await createProductConfig(
      "landmark",
      { token: undefined },
      { ...process, cwd: () => tmpdir, env: { PATH: process.env.PATH } },
      mockStorageFn,
    );
    assert.equal(config.token, "test-jwt-value");
    await rm(tmpdir, { recursive: true });
  });

  it("shell env wins over .env", async () => {
    const tmpdir = await setup("PRODUCT_LANDMARK_TOKEN=env-value\n");
    const config = await createProductConfig(
      "landmark",
      { token: undefined },
      { ...process, cwd: () => tmpdir,
        env: { PATH: process.env.PATH, PRODUCT_LANDMARK_TOKEN: "shell-jwt" } },
      mockStorageFn,
    );
    assert.equal(config.token, "shell-jwt");
    await rm(tmpdir, { recursive: true });
  });

  it("empty-string shell value falls through to .env", async () => {
    const tmpdir = await setup("PRODUCT_LANDMARK_TOKEN=env-value\n");
    const config = await createProductConfig(
      "landmark",
      { token: undefined },
      { ...process, cwd: () => tmpdir,
        env: { PATH: process.env.PATH, PRODUCT_LANDMARK_TOKEN: "" } },
      mockStorageFn,
    );
    assert.equal(config.token, "env-value");  // .env wins, not ""
    await rm(tmpdir, { recursive: true });
  });
});
```

The empty-string case covers the Part 03 workflow ternary that emits
`''` for non-Landmark runs; it must not clobber a `.env`-supplied
value. The mocked `storageFn` ensures the test does not depend on
disk layout outside the tmpdir.

Verify: `bun test libraries/libconfig/test/credential-env-override.test.js`
passes.

## Step 8 — Update `fit-map auth issue` output line for the new env-var

- **Modified**: `products/map/src/commands/auth-issue.js`

Locate `LANDMARK_AUTH_TOKEN` occurrences with
`rg "LANDMARK_AUTH_TOKEN" products/map/src/commands/auth-issue.js`.
Two matches today: the file-header comment and the operator-facing
`Export:` banner line. Both rewrite to `PRODUCT_LANDMARK_TOKEN`.

Verify: `rg "LANDMARK_AUTH_TOKEN" products/map/src/commands/auth-issue.js`
returns zero matches. The existing test surface
(`products/map/test/activity/auth-issue.test.js`) does not match the
old literal today (`rg "LANDMARK_AUTH_TOKEN"
products/map/test/activity/auth-issue.test.js` returns empty), so no
test-file edit is required.

## Step 9 — Docs sweep across `websites/`

- **Modified**:
  - `websites/fit/docs/getting-started/leaders/landmark/index.md`
  - `websites/fit/docs/products/engineering-data-sources/index.md`
  - `websites/fit/docs/products/issuing-service-account-tokens/index.md`
  - `websites/fit/docs/products/signing-in-to-landmark/index.md`

Replace every `LANDMARK_AUTH_TOKEN` literal with `PRODUCT_LANDMARK_TOKEN`
and update surrounding prose so it still parses (e.g. "exported as
`LANDMARK_AUTH_TOKEN`" → "exported as `PRODUCT_LANDMARK_TOKEN`"). Inline
code blocks (the four `export LANDMARK_AUTH_TOKEN=…` examples) flip
identically. The docs already cover the shell-env and config.json paths;
no new prose about `.env` is required.

Verify (forward-only invariant — does not break if a future doc adds a
new mention):

```sh
rg LANDMARK_AUTH_TOKEN websites/    # must return empty
```

## Step 10 — Verify contract-preservation suite green

Run the full set of tests covered by spec § Success Criteria row 11.
Note: row 11 literally names `products/map/test/activity/activity.test.js`
but that file does not exist on `main` — verify via `git ls-tree -r
origin/main -- products/map/test/activity/`. The literal command is a
spec inaccuracy; the intent is the whole activity test directory, which
this step runs:

```sh
bun test products/map/test/activity/auth-issue.test.js
bun test products/map/test/activity/people-provision.test.js
bun test products/map/test/activity/         # whole directory; covers row 11's intent
bun test products/landmark/test/lib/identity.test.js
bun test libraries/libconfig/test/
bun run check  # full check suite
```

Verify: all green. The PR description lists the env-var rename and the
override-loop extension as the spec-§-deferred fold-in that closes the
identity layering anomaly.
