# Plan 0960-a, Part 02 — Bootstrap

Collapse the two-script split, bind the local Supabase CLI to
`SUPABASE_JWT_SECRET`, and rewrite the three `.env.*.example` files. After this
part `just env-setup` writes a full `.env` and `fit-map activity start` honors
the secret it just wrote.

## Step 1 — Write `scripts/env-setup.js`

Files created: `scripts/env-setup.js`.

```js
#!/usr/bin/env bun
import {
  generateBase64Secret,
  generateSecret,
  getOrGenerateSecret,
  mintSupabaseAnonKey,
  mintSupabaseServiceRoleKey,
  updateEnvFile,
} from "@forwardimpact/libsecret";
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

async function main() {
  const { values } = parseArgs({
    options: {
      output: { type: "string" },
      "add-mask": { type: "boolean", default: false },
    },
  });

  const supabaseJwtSecret = await getOrGenerateSecret(
    "SUPABASE_JWT_SECRET",
    () => generateSecret(32),
  );
  const get = (key, gen) => getOrGenerateSecret(key, gen);
  const entries = [
    ["SERVICE_SECRET", await get("SERVICE_SECRET", () => generateSecret())],
    ["DATABASE_PASSWORD", await get("DATABASE_PASSWORD", () => generateSecret(16))],
    ["MCP_TOKEN", await get("MCP_TOKEN", () => generateSecret())],
    ["SUPABASE_JWT_SECRET", supabaseJwtSecret],
    ["SUPABASE_ANON_KEY", await get("SUPABASE_ANON_KEY", () => mintSupabaseAnonKey({ secret: supabaseJwtSecret }))],
    ["SUPABASE_SERVICE_ROLE_KEY", await get("SUPABASE_SERVICE_ROLE_KEY", () => mintSupabaseServiceRoleKey({ secret: supabaseJwtSecret }))],
    ["AWS_ACCESS_KEY_ID", await get("AWS_ACCESS_KEY_ID", () => generateBase64Secret(16))],
    ["AWS_SECRET_ACCESS_KEY", await get("AWS_SECRET_ACCESS_KEY", () => generateBase64Secret(32))],
  ];

  if (values.output) {
    const content =
      entries.map(([k, v]) => `${k.toLowerCase()}=${v}`).join("\n") + "\n";
    await writeFile(values.output, content);
    if (values["add-mask"]) {
      for (const [, v] of entries) console.log(`::add-mask::${v}`);
    }
    return;
  }

  for (const [k, v] of entries) await updateEnvFile(k, v);
  for (const [k] of entries) console.log(`${k} is set in .env`);
}

main();
```

All 8 values are wrapped in `getOrGenerateSecret` so a re-run preserves every
value byte-identical (spec § Success Criteria: "every value written by the first
run is preserved verbatim by the second"). Manual rotation: delete the line for
the value the operator wants to rotate; for `SUPABASE_JWT_SECRET`, also delete
`SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` so they re-mint against the
new secret.

Verification: `bun scripts/env-setup.js` against an empty `.env` writes all 8
keys; second run preserves every value byte-identical; `--output /tmp/out`
writes lowercase key=value pairs; `--add-mask --output /tmp/out` prints
`::add-mask::` for each.

## Step 2 — Replace `just env-setup`, drop `env-secrets`/`env-storage`

Files modified: `justfile`.

Replace lines 357–370 (current `env-setup`, `env-reset`, `env-secrets`,
`env-storage` recipes) with:

```just
# Generate every secret in .env (idempotent — preserves all values across runs)
env-setup:
    bun scripts/env-setup.js

# Reset environment config from examples (wipes .env)
env-reset PROFILE="local": config-reset
    cp -f .env.{{PROFILE}}.example .env
```

Update `quickstart` (currently line 35 — `quickstart: env-setup synthetic …`) to
invoke `env-reset` explicitly so a fresh checkout still wipes-and-regenerates:

```just
quickstart: env-reset env-setup synthetic data-init codegen process-fast _quickstart-seed
```

The two old recipes (`env-secrets`, `env-storage`) are deleted in full.

Verification: `just --list | rg env-` shows `env-reset` and `env-setup` only;
`just env-reset && just env-setup` produces a fresh `.env`; a second
`just env-setup` preserves every value byte-identical; `just quickstart` still
wipes-and-regenerates on a fresh checkout.

## Step 3 — Delete the old scripts and their helper files

Files deleted:

- `scripts/env-secrets.js`
- `scripts/env-storage.js`
- `.env.storage.minio` (if present locally — gitignored)
- `.env.storage.supabase` (if present locally — gitignored)

`.gitignore` already excludes `.env.storage.*`; no edit needed.

Verification: `rg env-secrets|env-storage scripts justfile` returns zero
matches; `find . -name '.env.storage.*' -not -path './node_modules/*'` returns
no tracked files.

## Step 4 — Bind the local Supabase CLI to `SUPABASE_JWT_SECRET`

Files modified: `products/map/supabase/config.toml`.

Inside the existing `[auth]` block (currently lines 19–27), add one line:

```toml
[auth]
enabled = true
site_url = "http://localhost:3000"
jwt_secret = "env(SUPABASE_JWT_SECRET)"
jwt_expiry = 3600
enable_signup = false
additional_redirect_urls = ["http://127.0.0.1/*"]
```

`env(VAR)` is the Supabase CLI's documented interpolation syntax (since CLI
v1.110.0). The CLI substitutes the value at `supabase start` time from
`process.env`.

Verification: starts the local stack (`bun fit-map activity start` after
`just env-setup`) and one JWT signed with `SUPABASE_JWT_SECRET` from `.env`
verifies against the CLI-issued anon key (same secret end-to-end). Part 03's
`auth-issue` migration depends on this binding.

## Step 5 — Rewrite the three `.env.*.example` files

Files modified: `.env.local.example`, `.env.docker-native.example`,
`.env.docker-supabase.example`.

Each file's "Service Authentication" + "Map Supabase" + storage-credential
blocks reduce to a single Supabase block. Use the canonical block from design §
`.env.local.example` Supabase block:

```text
# ==========================================
# Supabase (single instance — all products)
# ==========================================
SUPABASE_URL=http://127.0.0.1:54321
# Generated by `just env-setup`:
# SUPABASE_JWT_SECRET=
# SUPABASE_ANON_KEY=
# SUPABASE_SERVICE_ROLE_KEY=
```

Per file (additions and deletions explicit):

| File | `SUPABASE_URL` | Additions | Deletions |
| --- | --- | --- | --- |
| `.env.local.example` | `http://127.0.0.1:54321` | Three commented placeholder lines for `SUPABASE_JWT_SECRET`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | `JWT_SECRET=` (line 34), `MAP_SUPABASE_DB_PORT` (line 65), commented `MAP_SUPABASE_SERVICE_ROLE_KEY` (line 67), quick-start comment swap to `just env-setup` |
| `.env.docker-native.example` | `http://supabase-kong.local:8000` | Same three placeholder lines | Same deletions; HTTPS/HTTP/NO_PROXY block unchanged |
| `.env.docker-supabase.example` | `http://supabase-kong.local:8000` | Same three placeholder lines | Same deletions plus commented `SUPABASE_SERVICE_ROLE_KEY` / `MAP_SUPABASE_SERVICE_ROLE_KEY` / `MAP_SUPABASE_ANON_KEY` triple (lines 72–74) under storage section |

Update each file's header quick-start comment from
`just env-secrets && just env-storage && just env-github` to
`just env-setup && just env-github`.

Verification:
`diff .env.local.example .env.docker-native.example | rg SUPABASE_` shows only
the URL value differs; `rg MAP_SUPABASE .env.*.example` and
`rg '^# JWT_SECRET' .env.*.example` and `rg MAP_SUPABASE_DB_PORT .env.*.example`
each return zero matches.

## Step 6 — Bootstrap integration test

Files created: `tests/env-setup.test.js`.

Test location is `tests/` (not `scripts/test/`) because `package.json:31`'s test
command runs `find ./tests ./libraries ./products ./services -name '*.test.js'`
— anything under `scripts/` is invisible to CI.

Each test case spawns the script with `cwd` set to a fresh tmpdir
(`mkdtempSync`), via
`child_process.spawnSync("bun", [path.resolve("scripts/env-setup.js")], { cwd: tmpdir })`,
so the script's `.env` reads and writes hit the isolated tmpdir, not the repo
root.

Test cases (run with `bun:test`):

| Case | Assertion |
| --- | --- |
| Empty tmpdir | After `bun scripts/env-setup.js` (cwd=tmpdir), `.env` exists with the 8 keys and chmod 600 |
| Second run | All 8 values present after run 1 are byte-identical after run 2 (spec § Success Criteria § idempotency) |
| Anon key verifies | Decode `SUPABASE_ANON_KEY` header, payload, signature; HMAC the header.payload against `SUPABASE_JWT_SECRET`; signature matches |
| Service-role key verifies | Same as anon, with `role: "service_role"` |
| Demo literal absent | `rg 'super-secret-jwt-token-with-at-least-32-characters-long' scripts libraries products services` returns zero matches |
| `--output` shape | Lowercase keys, newline-terminated, eight rows |
| `--add-mask` | Each value printed once as `::add-mask::<value>` |

Verification: `bun test tests/env-setup.test.js` green; `bun run test` (the
repo-wide CI command) discovers and runs the new file.

## Dependencies

- Depends on Part 01 (`mintSupabaseAnonKey`, `mintSupabaseServiceRoleKey` from
  libsecret).
- Blocks Part 03 (consumers expect `SUPABASE_*` in `.env` and the local CLI
  binding to land first so test gates pass).
