# Plan 960-a, Part 04 — Compose + static-inspection gate

Close the loop: rewrite `docker-compose.yml`, retarget the two existing static-inspection tests, and add the new test that asserts no consumer reads Supabase env vars directly.

## Step 1 — Rewrite `docker-compose.yml` Supabase wiring

Files modified: `docker-compose.yml`.

Four services touch Supabase variables; all four migrate identically. Drop `env_file: [.env, .env.storage.supabase]` to `env_file: .env` (since the storage env-files were deleted in Part 02). Rewrite each interpolation:

| Service | Line(s) | Before → After |
| --- | --- | --- |
| `storage-supabase` | 173–175 | `env_file: [.env, .env.storage.supabase]` → `env_file: .env` |
| `storage-supabase` | 178 | `PGRST_JWT_SECRET: ${JWT_SECRET}` → `PGRST_JWT_SECRET: ${SUPABASE_JWT_SECRET}` |
| `supabase-db` | 211–213 | `env_file: [.env, .env.storage.supabase]` → `env_file: .env` |
| `supabase-kong` | 234–236 | `env_file: [.env, .env.storage.supabase]` → `env_file: .env` |
| `supabase-kong` | 240 | `SUPABASE_ANON_KEY: ${MAP_SUPABASE_ANON_KEY}` → `SUPABASE_ANON_KEY: ${SUPABASE_ANON_KEY}` |
| `supabase-kong` | 241 | `SUPABASE_SERVICE_KEY: ${MAP_SUPABASE_SERVICE_ROLE_KEY}` → `SUPABASE_SERVICE_KEY: ${SUPABASE_SERVICE_ROLE_KEY}` |
| `supabase-map-storage` | 259–261 | `env_file: [.env, .env.storage.supabase]` → `env_file: .env` |
| `supabase-map-storage` | 264 | `PGRST_JWT_SECRET: ${JWT_SECRET}` → `PGRST_JWT_SECRET: ${SUPABASE_JWT_SECRET}` |

Verification: `rg MAP_SUPABASE docker-compose.yml` returns zero matches; `rg JWT_SECRET docker-compose.yml` returns zero matches (the only `JWT_SECRET` substring left is inside `PGRST_JWT_SECRET` and `SUPABASE_JWT_SECRET`, which are distinct identifiers — assert `rg '\bJWT_SECRET\b' docker-compose.yml` returns zero); `docker compose --profile map-supabase config` with a `.env` produced by `just env-setup` resolves every variable with no warnings.

## Step 2 — Retarget `service-role-still-used.test.js`

Files modified: `products/map/test/activity/service-role-still-used.test.js`.

Rename the test description, the body's `body.includes("MAP_SUPABASE_SERVICE_ROLE_KEY")` (line 35) → `body.includes("supabaseServiceRoleKey")`, and the failure message. The new assertion: at least one src file calls `config.supabaseServiceRoleKey()` — that is the new write-path credential signal.

Rationale: post-migration, src code does not contain the env-var name as a string literal; it contains the accessor call. The test's *intent* (catch a silent migration of ingestion away from the write-path credential) survives intact under the accessor shape.

Verification: `bun test products/map/test/activity/service-role-still-used.test.js` green; a synthetic test that removes every `supabaseServiceRoleKey()` from src fails the test.

## Step 3 — Retarget `no-service-role-in-src.test.js`

Files modified: `products/landmark/test/lib/no-service-role-in-src.test.js`.

Change the regex on line 38 from `/MAP_SUPABASE_SERVICE_ROLE_KEY/` to a regex that matches both the env literal (which must never appear) and the new accessor (which must never appear in Landmark src):

```js
const hits = await grepRoots(/SUPABASE_SERVICE_ROLE_KEY|supabaseServiceRoleKey/);
```

Update the failure-message string accordingly. The two other tests in the file (`auth.admin.` and `from "...test..."`) are unchanged.

Verification: `bun test products/landmark/test/lib/no-service-role-in-src.test.js` green; a synthetic re-introduction of either literal in Landmark src fails the test.

## Step 4 — Add the new static-inspection test

Files created: `libraries/libconfig/test/no-supabase-env-in-src.test.js`.

```js
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");
const ROOTS = ["products", "services", "libraries"];

// Permanent exemptions. Both are documented in spec 960 design § Per-module
// injection seams. Do not add entries without a corresponding design-doc note.
const ALLOW = new Set([
  // libstorage: libconfig depends on libstorage; threading Config would cycle.
  "libraries/libstorage/src/index.js",
  // Deno edge runtime injects SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY itself.
  "products/map/supabase/functions/_shared/supabase.ts",
]);

async function* walkSrcBin(dir) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch { return; }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Recurse into src/ and bin/ wherever they appear under products/services/libraries.
      if (entry.name === "test" || entry.name === "node_modules") continue;
      yield* walkSrcBin(full);
    } else if (/\.(m?js|cjs|ts)$/.test(entry.name)) {
      const rel = full.slice(REPO_ROOT.length + 1);
      if (ALLOW.has(rel)) continue;
      yield full;
    }
  }
}

describe("Spec 960: no direct Supabase env reads in src/bin", () => {
  test("no process.env.SUPABASE_ or process.env.MAP_SUPABASE_ literals", async () => {
    const re = /process\.env\.(MAP_)?SUPABASE_/;
    const hits = [];
    for (const root of ROOTS) {
      for await (const file of walkSrcBin(join(REPO_ROOT, root))) {
        const body = await readFile(file, "utf8");
        if (re.test(body)) hits.push(file);
      }
    }
    assert.deepEqual(hits, [], `Direct Supabase env reads found: ${hits.join(", ")}`);
  });
});
```

Restrict the walker to `src/` and `bin/` subtrees (the spec criterion's boundary). The walker `continue`s on `test` and `node_modules` and follows `src`/`bin`/anything else, so it covers `products/<p>/src/`, `products/<p>/bin/`, `services/<s>/server.js`-style flat files, and `libraries/<l>/src/` + `libraries/<l>/bin/`.

Verification: `bun test libraries/libconfig/test/no-supabase-env-in-src.test.js` green after Part 03 lands; a synthetic re-introduction of `process.env.SUPABASE_URL` in any src file fails the test; the libstorage and Deno-edge-function exemptions pass.

## Step 5 — Repo-wide grep gates

Files modified: none (verification only — confirm Part 03 left nothing behind).

| Grep | Expected | Notes |
| --- | --- | --- |
| `rg MAP_SUPABASE_ products services libraries scripts justfile docker-compose.yml .env.*.example` | 0 | Wiki and specs excluded |
| `rg '\bJWT_SECRET\b' products services libraries scripts justfile docker-compose.yml .env.*.example` | 0 | Word boundary so `SUPABASE_JWT_SECRET` is not flagged |
| `rg 'super-secret-jwt-token-with-at-least-32-characters-long' .` | 0 | Demo literal must not survive |
| `rg 'process\.env\.JWT_SECRET' products services libraries` | 0 | The unprefixed read is dead |
| `rg 'MAP_SUPABASE_DB_PORT' .env.*.example docker-compose.yml products services libraries` | 0 | Variable was unused |
| `rg 'deprecated.*[Ss]upabase|legacy.*[Ss]upabase|backward.?compat.*[Ss]upabase' products services libraries scripts` | 0 | No shim comments |
| `rg 'MAP_SUPABASE_.*\|\||MAP_SUPABASE_.*\?\?' products services libraries` | 0 | No fallback chains |

If any of these returns a hit, fix the offender and re-run the suite before tagging the PR for review. The grep checks are a final correctness gate, not a CI test (the static-inspection test in step 4 covers the load-bearing case).

## Dependencies

- Depends on Part 03 completing (the new static-inspection test fails if any consumer still reads `process.env.SUPABASE_`).
- Independent of Part 05 (docs).
