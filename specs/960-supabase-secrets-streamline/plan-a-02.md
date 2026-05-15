# Plan 960-a, Part 02 — Bootstrap

Collapse the two-script split, bind the local Supabase CLI to `SUPABASE_JWT_SECRET`, and rewrite the three `.env.*.example` files. After this part `just env-setup` writes a full `.env` and `fit-map activity start` honors the secret it just wrote.

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

  const serviceSecret = generateSecret();
  const databasePassword = generateSecret(16);
  const mcpToken = generateSecret();
  const supabaseJwtSecret = await getOrGenerateSecret(
    "SUPABASE_JWT_SECRET",
    () => generateSecret(32),
  );
  const supabaseAnonKey = mintSupabaseAnonKey({ secret: supabaseJwtSecret });
  const supabaseServiceRoleKey = mintSupabaseServiceRoleKey({
    secret: supabaseJwtSecret,
  });
  const awsAccessKeyId = generateBase64Secret(16);
  const awsSecretAccessKey = generateBase64Secret(32);

  const entries = [
    ["SERVICE_SECRET", serviceSecret],
    ["DATABASE_PASSWORD", databasePassword],
    ["MCP_TOKEN", mcpToken],
    ["SUPABASE_JWT_SECRET", supabaseJwtSecret],
    ["SUPABASE_ANON_KEY", supabaseAnonKey],
    ["SUPABASE_SERVICE_ROLE_KEY", supabaseServiceRoleKey],
    ["AWS_ACCESS_KEY_ID", awsAccessKeyId],
    ["AWS_SECRET_ACCESS_KEY", awsSecretAccessKey],
  ];

  if (values.output) {
    const content = entries.map(([k, v]) => `${k.toLowerCase()}=${v}`).join("\n") + "\n";
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

Idempotency: `getOrGenerateSecret` returns the existing `SUPABASE_JWT_SECRET` on re-run, which yields the same anon and service-role JWTs (deterministic given identical `secret` + payload + `iat` … note: `iat` differs on re-mint, so anon/service-role keys rotate on every run unless we cache them too). To keep the anon/service-role keys stable across re-runs, wrap each in `getOrGenerateSecret` too:

```js
const supabaseAnonKey = await getOrGenerateSecret(
  "SUPABASE_ANON_KEY",
  () => mintSupabaseAnonKey({ secret: supabaseJwtSecret }),
);
const supabaseServiceRoleKey = await getOrGenerateSecret(
  "SUPABASE_SERVICE_ROLE_KEY",
  () => mintSupabaseServiceRoleKey({ secret: supabaseJwtSecret }),
);
```

If a contributor manually rotates `SUPABASE_JWT_SECRET` (deletes the line), the anon/service-role keys must also be deleted by hand — this is the same contract today's `JWT_SECRET` ↔ derived-keys pair carries.

`SERVICE_SECRET`, `DATABASE_PASSWORD`, `MCP_TOKEN`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` re-generate every run — match the current behaviour of `env-secrets.js:32-37` and `env-storage.js:22-27`.

Verification: `bun scripts/env-setup.js` against an empty `.env` writes all 8 keys; second run preserves every value; `--output /tmp/out` writes lowercase key=value pairs; `--add-mask --output /tmp/out` prints `::add-mask::` for each.

## Step 2 — Replace `just env-setup`, drop `env-secrets`/`env-storage`

Files modified: `justfile`.

Replace lines 357–370 (current `env-setup`, `env-reset`, `env-secrets`, `env-storage` recipes) with:

```just
# Set up all environment secrets and storage config
env-setup: env-reset
    bun scripts/env-setup.js

# Reset environment config from examples
env-reset PROFILE="local": config-reset
    cp -f .env.{{PROFILE}}.example .env
```

The two old recipes (`env-secrets`, `env-storage`) are deleted in full. The composite `env-setup: env-reset env-secrets env-storage` collapses to `env-setup: env-reset` plus the script invocation.

Verification: `just --list | rg env-` shows `env-reset` and `env-setup` only; `just env-setup` produces a fresh `.env` with all 8 keys; second run is idempotent.

## Step 3 — Delete the old scripts and their helper files

Files deleted:

- `scripts/env-secrets.js`
- `scripts/env-storage.js`
- `.env.storage.minio` (if present locally — gitignored)
- `.env.storage.supabase` (if present locally — gitignored)

`.gitignore` already excludes `.env.storage.*`; no edit needed.

Verification: `rg env-secrets|env-storage scripts justfile` returns zero matches; `find . -name '.env.storage.*' -not -path './node_modules/*'` returns no tracked files.

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

`env(VAR)` is the Supabase CLI's documented interpolation syntax (since CLI v1.110.0). The CLI substitutes the value at `supabase start` time from `process.env`.

Verification: starts the local stack (`bun fit-map activity start` after `just env-setup`) and one JWT signed with `SUPABASE_JWT_SECRET` from `.env` verifies against the CLI-issued anon key (same secret end-to-end). Part 03's `auth-issue` migration depends on this binding.

## Step 5 — Rewrite the three `.env.*.example` files

Files modified: `.env.local.example`, `.env.docker-native.example`, `.env.docker-supabase.example`.

Each file's "Service Authentication" + "Map Supabase" + storage-credential blocks reduce to a single Supabase block. Use the canonical block from design § `.env.local.example` Supabase block:

```
# ==========================================
# Supabase (single instance — all products)
# ==========================================
SUPABASE_URL=http://127.0.0.1:54321
# Generated by `just env-setup`:
# SUPABASE_JWT_SECRET=
# SUPABASE_ANON_KEY=
# SUPABASE_SERVICE_ROLE_KEY=
```

Per file:

| File | `SUPABASE_URL` value | Other diffs |
| --- | --- | --- |
| `.env.local.example` | `http://127.0.0.1:54321` | Delete `JWT_SECRET=` line, delete `MAP_SUPABASE_DB_PORT`, delete commented `MAP_SUPABASE_SERVICE_ROLE_KEY`, update quick-start comment to `just env-setup` |
| `.env.docker-native.example` | `http://supabase-kong.local:8000` | Same deletions; HTTPS/HTTP/NO_PROXY block unchanged |
| `.env.docker-supabase.example` | `http://supabase-kong.local:8000` | Same deletions; delete the commented `SUPABASE_SERVICE_ROLE_KEY` / `MAP_SUPABASE_*_KEY` triple under storage section (now generated by `just env-setup`) |

Update each file's header quick-start comment from `just env-secrets && just env-storage && just env-github` to `just env-setup && just env-github`.

Verification: `diff .env.local.example .env.docker-native.example | rg SUPABASE_` shows only the URL value differs; `rg MAP_SUPABASE .env.*.example` and `rg '^# JWT_SECRET' .env.*.example` and `rg MAP_SUPABASE_DB_PORT .env.*.example` each return zero matches.

## Step 6 — Bootstrap integration test

Files created: `scripts/test/env-setup.test.js`.

Test cases (run with `bun:test`, no fixtures except a tmpdir):

| Case | Assertion |
| --- | --- |
| Empty tmpdir | After `bun scripts/env-setup.js` (cwd=tmpdir), `.env` exists with the 8 keys and chmod 600 |
| Second run | Every value present after run 1 is byte-identical after run 2 |
| Anon key verifies | Decode `SUPABASE_ANON_KEY` header, payload, signature; HMAC the header.payload against `SUPABASE_JWT_SECRET`; signature matches |
| Service-role key verifies | Same as anon, with `role: "service_role"` |
| Demo literal absent | `rg 'super-secret-jwt-token-with-at-least-32-characters-long' scripts libraries products services` returns zero matches |
| `--output` shape | Lowercase keys, newline-terminated, eight rows |
| `--add-mask` | Each value printed once as `::add-mask::<value>` |

Verification: `bun test scripts/test/env-setup.test.js` green.

## Dependencies

- Depends on Part 01 (`mintSupabaseAnonKey`, `mintSupabaseServiceRoleKey` from libsecret).
- Blocks Part 03 (consumers expect `SUPABASE_*` in `.env` and the local CLI binding to land first so test gates pass).
