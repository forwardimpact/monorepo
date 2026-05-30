# Plan 1271-a — Rename `services/ghauth` to `services/ghuser`

Implementation plan for [spec 1271](spec.md) following
[design 1271-a](design-a.md).

## Approach

One coordinated change: rename the directory, proto source, package identity,
and all source-level name strings; regenerate codegen; update every consumer
and configuration surface; add a one-shot boot migration for the binding store
namespace. Steps are ordered so the tree builds after each logical group.
Codegen regeneration (step 2) must follow the proto/package rename (step 1);
consumer updates (steps 3–5) follow codegen; config/docs (steps 6–7) are
independent of each other but depend on the directory existing at the new
path.

Libraries used: none.

## Steps

### Step 1 — Rename the service directory, proto, package, and source names

Rename the service from `ghauth` to `ghuser` — directory, proto, package
identity, and all name strings in source files.

| Action | Path |
|---|---|
| rename dir | `services/ghauth/` → `services/ghuser/` |
| rename file | `services/ghuser/proto/ghauth.proto` → `services/ghuser/proto/ghuser.proto` |
| modify | `services/ghuser/proto/ghuser.proto` |
| modify | `services/ghuser/package.json` |
| modify | `services/ghuser/server.js` |
| modify | `services/ghuser/index.js` |
| modify | `services/ghuser/README.md` |

**Proto** (`ghuser.proto`): `package ghauth` → `package ghuser`;
`service Ghauth` → `service Ghuser`. RPCs and messages unchanged.

**`package.json`**: `name` → `@forwardimpact/svcghuser`; `bin` →
`fit-svcghuser`; `repository.directory` → `services/ghuser`.

**`server.js`**: every `"ghauth"` string arg → `"ghuser"`
(`createServiceConfig`, `createLogger`, `createTracer`, `createStorage`);
`GhauthService` import → `GhuserService`.

**`index.js`**: class `GhauthService` → `GhuserService`; destructure
`GhauthBase` → `GhuserBase`; JSDoc `@augments` → `GhuserBase`.

**`README.md`**: update title and any `ghauth` references to `ghuser`.

**Test files** under `services/ghuser/test/`: update `describe` strings,
`createMockConfig` name arg, and `GhauthService` → `GhuserService` imports
across all seven test files.

Verification: `ls services/ghuser/proto/ghuser.proto` exists; `rg ghauth services/ghuser/` returns nothing.

### Step 2 — Regenerate codegen

Regenerate all generated artifacts so the `ghauth` namespace ceases to exist
and `ghuser` takes its place.

| Action | Path |
|---|---|
| delete | `generated/definitions/ghauth.js` |
| delete | `generated/services/ghauth/` |
| delete | `generated/proto/ghauth.proto` |
| regenerate | all `generated/` via `just codegen` |

Run `just codegen`. Verify no `ghauth` artifact remains:
`rg ghauth generated/` returns nothing; `ls generated/services/ghuser/client.js` exists.

### Step 3 — Update `libraries/libbridge` token-resolver

Update the token-resolver to import and use the renamed type namespace.

| Action | Path |
|---|---|
| modify | `libraries/libbridge/src/token-resolver.js` |
| modify | `libraries/libbridge/test/token-resolver.test.js` |

**`token-resolver.js`**: `import { ghauth }` → `import { ghuser }`;
`ghauth.GetTokenRequest` → `ghuser.GetTokenRequest`; update JSDoc comment
and error message from `ghauth` to `ghuser`.

**`token-resolver.test.js`**: error message assertions `"ghauth client is required"` → `"ghuser client is required"`.

Verification: `rg ghauth libraries/libbridge/` returns nothing.

### Step 4 — Update consumer services (`ghbridge`, `msbridge`, `oauth`)

Rename all `ghauth` identifiers in the three consumer services.

| Action | Path |
|---|---|
| modify | `services/ghbridge/server.js` |
| modify | `services/ghbridge/index.js` |
| modify | `services/msbridge/server.js` |
| modify | `services/msbridge/index.js` |
| modify | `services/oauth/server.js` |

**`ghbridge/server.js`**: `GhauthClient` → `GhuserClient`;
`createServiceConfig("ghauth")` → `createServiceConfig("ghuser")`;
`ghauthConfig` → `ghuserConfig`; `ghauthClient` → `ghuserClient`.

**`ghbridge/index.js`**: `deps.ghauthClient` → `deps.ghuserClient`;
error message → `"ghuserClient is required"`.

**`msbridge/server.js`**: same pattern as ghbridge/server.js.

**`msbridge/index.js`**: `ghauthClient` param/destructure → `ghuserClient`;
error message → `"ghuserClient is required"`; JSDoc comment updated.

**`oauth/server.js`**: `provider: "ghauth"` → `provider: "ghuser"`.

**`oauth/README.md`**: update all `ghauth` references — provider name,
`fit-rc restart ghauth`, `SERVICE_GHAUTH_LINK_BASE_URL`, and the link to
`../ghauth/README.md` → their `ghuser` equivalents.

Also update all test files in these services that reference `ghauth`:

| Action | Path |
|---|---|
| modify | `services/ghbridge/test/startup.test.js` |
| modify | `services/ghbridge/test/callback.test.js` |
| modify | `services/ghbridge/test/webhook.test.js` |
| modify | `services/ghbridge/test/reply-path.test.js` |
| modify | `services/ghbridge/test/dispatch-auth.test.js` |
| modify | `services/ghbridge/test/resume.test.js` |
| modify | `services/msbridge/test/startup.test.js` |
| modify | `services/msbridge/test/msbridge.test.js` |
| modify | `services/msbridge/test/dispatch-auth.test.js` |
| modify | `services/msbridge/test/resume.test.js` |
| modify | `services/oauth/test/authorize.test.js` |
| modify | `services/oauth/test/metadata.test.js` |
| modify | `services/ghbridge/README.md` |
| modify | `services/msbridge/README.md` |
| modify | `services/oauth/README.md` |

Verification: `rg ghauth services/ghbridge/ services/msbridge/ services/oauth/` returns nothing.

### Step 5 — Add boot migration for binding store namespace

Add a one-shot idempotent migration in `server.js` that moves
`data/ghauth/bindings.jsonl` to `data/ghuser/bindings.jsonl` before
serving, plus a migration test. Flows and grants are not migrated (10-min
TTL ephemera).

| Action | Path |
|---|---|
| modify | `services/ghuser/server.js` |
| create | `services/ghuser/test/migration.test.js` |

**`server.js`** — after `createStorage("ghuser")`, before constructing
stores: check whether the `ghuser` binding store is empty/absent and a
legacy `data/ghauth/bindings.jsonl` exists. If so, read the legacy file and
write its contents into the new namespace. Use `createStorage("ghauth")` to
read and `storage` (the `ghuser` one) to write. Guard so a second boot is a
no-op (the new file already has data).

**`migration.test.js`** — seed a binding under the `ghauth` namespace,
construct the service (which triggers migration), and verify `GetToken`
resolves the binding without re-link. Also test idempotency (second
construction is a no-op) and the no-legacy-data path.

Verification: `bun test services/ghuser/test/migration.test.js` passes.

### Step 6 — Update configuration surfaces

Move env var names and config documentation.

| Action | Path |
|---|---|
| modify | `.env.local.example` |
| modify | `.env.docker-native.example` |
| modify | `.env.docker-supabase.example` |
| modify | `config/CLAUDE.md` |
| modify | `scripts/check-ambient-deps.deny.json` |

**`.env.*.example`** (all three): `SERVICE_GHAUTH_*` →
`SERVICE_GHUSER_*` (`CLIENT_ID`, `CLIENT_SECRET`, `URL`, `LINK_BASE_URL`);
comments `services/ghauth` → `services/ghuser`; `SERVICE_OAUTH_PROVIDER=ghauth` →
`SERVICE_OAUTH_PROVIDER=ghuser`; cross-references in ghbridge/msbridge
sections `SERVICE_GHAUTH_URL` → `SERVICE_GHUSER_URL`.

**`config/CLAUDE.md`**: `"ghauth"` → `"ghuser"` in the name field;
`svcghauth` → `svcghuser` in the import path.

**`scripts/check-ambient-deps.deny.json`**: key
`services/ghauth/src/stores.js` → `services/ghuser/src/stores.js`.

Verification: `rg -i ghauth .env.*.example config/CLAUDE.md scripts/check-ambient-deps.deny.json` returns nothing.

### Step 7 — Update documentation and regenerate catalog

Update external docs and regenerate the services catalog.

| Action | Path |
|---|---|
| modify | `websites/fit/docs/getting-started/contributors/index.md` |
| modify | `websites/fit/docs/services/bridge-conversations/index.md` |
| modify | `websites/fit/docs/services/bridge-discussions/index.md` |
| regenerate | `services/README.md` via `bun run context:fix` |

**`getting-started/contributors/index.md`**: `ghauth` → `ghuser` in the
services directory listing.

**`bridge-conversations/index.md`** and **`bridge-discussions/index.md`**:
all `ghauth` / `GhauthClient` / `data/ghauth/` references → `ghuser` /
`GhuserClient` / `data/ghuser/`.

**`services/README.md`**: regenerate via `bun run context:fix` (reads
`package.json` metadata); verify `ghuser` row appears.

Verification: `rg -i ghauth services/README.md websites/fit/docs/getting-started/contributors/ websites/fit/docs/services/bridge-conversations/ websites/fit/docs/services/bridge-discussions/` returns nothing.

### Step 8 — Reinstall and final verification

| Action | Command |
|---|---|
| install | `bun install` (regenerates `bun.lock` workspace entry) |
| check | `bun run check` |
| test | `bun run test` |
| sweep | `rg -i ghauth -g '!specs/**' -g '!wiki/**'` returns nothing |

## Risks

- **Consumer test fixtures hardcode `ghauth` strings** — test files in
  `ghbridge`, `msbridge`, and `oauth` may embed `ghauth` in mock configs,
  error messages, or assertions beyond what a simple grep reveals. Step 4
  includes test files but the implementer should verify each test passes
  individually after the rename.
- **`bun.lock` merge conflicts** — if another branch modifies `bun.lock`
  concurrently, the lockfile will conflict on the workspace rename. Resolution
  is mechanical: re-run `bun install` on the merged tree.

## Execution

Single engineering agent, sequential. The rename graph has too many
cross-cutting dependencies for parallel execution — codegen must follow the
proto rename, and consumer updates must follow codegen.
