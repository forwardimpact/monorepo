# Plan 1271-a — Rename `services/ghauth` to `services/ghuser`

Executes [design 1271-a](design-a.md) for [spec 1271](spec.md): a nominal,
behaviour-preserving rename of the shipped gRPC service.

## Approach

Apply the design's "one coordinated change" in a single PR: rename the source
identifiers (proto package/service, package name/bin, the service's own name
strings), regenerate every derived artifact with `bun install` + `just
codegen`, then move the derived consumers (`libbridge`, `ghbridge`, `msbridge`,
`oauth`) and the tracked config/policy/doc surfaces onto the new names. Every
substitution is the case-aware map in § Rename substitutions; the storage
namespace moves to `data/ghuser/` with no read-back of the old path.

## Relationship to spec & design — clean-break storage (deliberate departure)

Per explicit human direction during planning, the storage move is a **clean
break**: `createStorage("ghuser")` roots durable state at `data/ghuser/` and
nothing reads `data/ghauth/`. There is **no boot migration, no migration
module, and no `migration.test.js`.** Bindings written under the pre-rename
`data/ghauth/` namespace are abandoned; affected users re-link.

This supersedes the design's "Storage-namespace migration" section and spec
**success criterion 8** ("a pre-rename link survives"). It also removes the
criterion-2-vs-8 tension, because no tracked file references the old namespace.
**Reconciliation required:** spec criterion 8 and the design's migration
section/decisions should be updated to record the clean break — a `kata-spec` /
`kata-design` follow-up, out of this plan's lane.

## Rename substitutions

Case-aware, applied everywhere they occur on the surfaces named below:

| Old | New | Where it appears |
|---|---|---|
| `ghauth` | `ghuser` | proto `package`; `createServiceConfig`/`createStorage`/`createLogger`/`createTracer` name args; `oauth` `provider` value; lowercase config-key fragments; `services/ghauth`, `data/ghauth/` path text |
| `Ghauth` | `Ghuser` | proto `service Ghauth`; generated `GhauthBase`/`GhauthClient`; `GhauthService`; `makeGhauthClient` |
| `GHAUTH` | `GHUSER` | `SERVICE_GHAUTH_*` env keys |
| `svcghauth` | `svcghuser` | package `name`; bin `fit-svcghauth` |
| `ghauthClient` / `ghauthConfig` | `ghuserClient` / `ghuserConfig` | bridge local symbols + `deps.*` keys |

Test-fixture values already spelled `ghuser-*` (e.g. `github_user_id`) and
`ghs_*` tokens contain no `ghauth` and are untouched.

Libraries used: none new — preserves existing use of librpc, libconfig,
libstorage, libtelemetry, libtype; regeneration via libcodegen (`just codegen`).

## Step 1 — Move the service tree and rename the proto file

Relocate the directory and the proto source; content edits follow in later
steps.

- Moved: `services/ghauth/` → `services/ghuser/` (whole tree, incl. `src/`,
  `test/`); `services/ghuser/proto/ghauth.proto` →
  `services/ghuser/proto/ghuser.proto`

```sh
git mv services/ghauth services/ghuser
git mv services/ghuser/proto/ghauth.proto services/ghuser/proto/ghuser.proto
```

Verify: `services/ghauth/` is gone and `services/ghuser/proto/ghuser.proto`
exists (`git status` shows renames).

## Step 2 — Rename the renamed service's own source identifiers

Apply § Rename substitutions inside the moved tree; move storage to
`data/ghuser/` with no migration. `src/stores.js` and `src/github-oauth.js`
carry no `ghauth` token — they move unchanged (the only reference to `stores.js`
is the `check-ambient-deps.deny.json` key path, handled in Step 6).

- Modified: `services/ghuser/proto/ghuser.proto`,
  `services/ghuser/package.json`, `services/ghuser/server.js`,
  `services/ghuser/index.js`, `services/ghuser/README.md`

Concrete changes:

- **proto**: `package ghuser;`, `service Ghuser { … }` — five RPCs (`Begin`,
  `Complete`, `Redeem`, `GetToken`, `Revoke`) and all message fields unchanged;
  `import "common.proto";` unchanged.
- **package.json**: `"name": "@forwardimpact/svcghuser"`, bin
  `"fit-svcghuser": "./server.js"`. Leave `repository.directory` for Step 7's
  `context:fix` to sync; `description`/`jobs`/`keywords` already carry no
  `ghauth`.
- **server.js**: `createServiceConfig("ghuser", …)`, `createLogger("ghuser")`,
  `createTracer("ghuser")`, `createStorage("ghuser")` (clean break — no legacy
  read), `import { GhuserService } from "./index.js"`, `new GhuserService(…)`.
- **index.js**: `const { GhuserBase } = services;`,
  `class GhuserService extends GhuserBase`, JSDoc `@augments GhuserBase` — RPC
  bodies unchanged.
- **README.md**: prose only — `SERVICE_GHUSER_*` env table,
  `createServiceConfig("ghuser")`, `data/ghuser/bindings.jsonl` paths,
  `services/ghuser/README.md` references.

Verify: `rg -i ghauth services/ghuser` (excluding `test/`) returns nothing.

## Step 3 — Update the service's own tests

Migrate the seven criterion-7 tests in place (describe strings,
`createMockConfig` args, `import { GhuserService }`). Create no migration test.

- Modified:
  `services/ghuser/test/{smoke,persistence,query-contract,query-linked,query-unlinked,query-reauth,identity-verification}.test.js`

Concrete change: apply § Rename substitutions (`ghauth`→`ghuser`,
`Ghauth`→`Ghuser`).

Verify: `rg -i ghauth services/ghuser/test` returns nothing (tests run in Step 4
after codegen).

## Step 4 — Regenerate derived artifacts

`bun install` re-symlinks the workspace package under the new name and rewrites
the `bun.lock` entry; `just codegen` regenerates `generated/**` (libtype
`ghuser`, `GhuserBase`, `GhuserClient`, `ghuser.js` definition, metadata) from
the renamed proto. Remove the stale generated tree first so no `ghauth`
artifact lingers.

- Regenerated (gitignored, not hand-edited): `generated/**`; `bun.lock`

```sh
rm -rf generated && bun install && just codegen
```

Verify: `rg -l ghuser generated/` lists the new artifacts and `rg -li ghauth
generated/` returns nothing; `bun test services/ghuser/test/*.test.js` passes.

## Step 5 — Update the derived consumers

Point every consumer at the regenerated `ghuser` types/client and rename their
local symbols (§ Rename substitutions). Behaviour-preserving — only identifiers
move.

- Modified: `libraries/libbridge/src/token-resolver.js`,
  `libraries/libbridge/test/token-resolver.test.js`,
  `libraries/libbridge/CLAUDE.md`, `services/ghbridge/server.js`,
  `services/ghbridge/index.js`, `services/ghbridge/README.md`,
  `services/ghbridge/test/*.test.js`, `services/msbridge/server.js`,
  `services/msbridge/index.js`, `services/msbridge/README.md`,
  `services/msbridge/test/*.test.js`, `services/oauth/server.js`,
  `services/oauth/README.md`, `services/oauth/test/{authorize,metadata}.test.js`

Concrete changes:

- **libbridge token-resolver**:
  `import { ghuser } from "@forwardimpact/libtype"`,
  `new ghuser.GetTokenRequest(…)`, comments and the
  `"ghuser client is required"` error; test asserts the new error string.
  **`libbridge/CLAUDE.md`**: the `TokenResolver` row `… via ghuser gRPC`.
- **ghbridge / msbridge** `server.js`:
  `const { GhuserClient, BridgeClient } = clients;`,
  `createServiceConfig("ghuser")`, locals `ghuserConfig`/`ghuserClient`.
  `index.js` — the two bridges differ in symbol shape, both covered by the
  `ghauthClient → ghuserClient` map: ghbridge reads `deps.ghuserClient`
  directly; msbridge destructures a bare `ghuserClient` (incl. the JSDoc
  `@param deps.ghuserClient - ghuser gRPC client`); both end with
  `"ghuserClient is required"` and `new TokenResolver(ghuserClient)`. Tests:
  `makeGhuserClient`, `ghuserClient:` keys, describe/assert strings. **READMEs**
  (both): every `ghauth`/`SERVICE_GHAUTH_*` prose + dependency-table occurrence
  → `ghuser`/`SERVICE_GHUSER_*`.
- **oauth** `server.js`: `provider: "ghuser"` (resolves the renamed backend
  definition by name). Tests: `provider: "ghuser"`. **README**: every `ghauth`
  occurrence → `ghuser` (provider-default prose/table, tunnel-ordering text,
  `SERVICE_GHUSER_LINK_BASE_URL`, `fit-rc restart ghuser`) plus the relative
  link `../ghauth/README.md#smoke-test` → `../ghuser/README.md#smoke-test`
  (retargets to the moved directory).

Verify:
`rg -i ghauth services/ghbridge services/msbridge services/oauth libraries/libbridge`
and `rg -i ghauth libraries/libbridge/CLAUDE.md` (named explicitly, since
`.rgignore` skips `CLAUDE.md`) both return nothing; `bun test` over those four
passes.

## Step 6 — Update tracked configuration and policy

- Modified: `.env.local.example`, `.env.docker-native.example`,
  `.env.docker-supabase.example`, `config/CLAUDE.md`,
  `scripts/check-ambient-deps.deny.json`

Concrete changes:

- **`.env.*.example`** (all three):
  `SERVICE_GHAUTH_{URL,CLIENT_ID,CLIENT_SECRET,LINK_BASE_URL}` →
  `SERVICE_GHUSER_*`; `SERVICE_OAUTH_PROVIDER=ghuser`; comment refs
  `services/ghauth` / `services/ghauth/README.md` → `ghuser`.
- **`config/CLAUDE.md`**: the documented `init.services` row →
  `{ "name": "ghuser", "command": "node -e \"import('@forwardimpact/svcghuser/server.js')\"" }`.
- **`scripts/check-ambient-deps.deny.json`**: key
  `services/ghauth/src/stores.js` → `services/ghuser/src/stores.js` (value
  `["date-now"]` unchanged).

Verify:
`rg -i ghauth .env.local.example .env.docker-native.example .env.docker-supabase.example config/CLAUDE.md scripts/check-ambient-deps.deny.json`
returns nothing.

## Step 7 — Update external docs and regenerate the catalog

Hand-edit the three website pages; regenerate `services/README.md` (catalog +
jobs blocks are generated from package metadata, not hand-edited).

- Modified: `websites/fit/docs/getting-started/contributors/index.md`,
  `websites/fit/docs/services/bridge-conversations/index.md`,
  `websites/fit/docs/services/bridge-discussions/index.md`
- Regenerated: `services/README.md`; `services/ghuser/package.json`
  `repository.directory`

Concrete changes:

- Website pages: `services/ghauth` → `services/ghuser`, `GhauthClient` →
  `GhuserClient`, `data/ghauth/` → `data/ghuser/`, `ghauth` in the service list
  and `init.services` prose → `ghuser`.
- Run `bun run context:fix` — rewrites the `ghuser` catalog/jobs rows in
  `services/README.md` and syncs `repository.directory` to `services/ghuser`.

Verify: `rg -i ghauth websites/fit/docs services/README.md` returns nothing.

## Step 8 — Full verification

- No files modified — gate only.

```sh
bun run check && bun run test
rg -i 'ghauth' -g '!specs/**' -g '!wiki/**'                    # spec criterion 2 — must return nothing
rg -i 'ghauth' config/CLAUDE.md libraries/libbridge/CLAUDE.md  # .rgignore-skipped files — must return nothing
```

The first grep mirrors spec criterion 2 verbatim; it is clean only after Step 4
lands (`bun.lock` is regenerated to `svcghuser`; `generated/**` is gitignored
and auto-excluded). The second grep names the two `CLAUDE.md` files explicitly —
`rg` searches files given on the command line even though `.rgignore` lists
`CLAUDE.md`, so the criterion-2 sweep never reaches them; this plan edits them
for correctness (Steps 5–6) beyond criterion 2's reach. Do **not** add
`--no-ignore` to a directory sweep: it would descend into gitignored trees
(`.claude/worktrees/`, the abandoned `data/ghauth/`, `node_modules/`) and report
spurious matches.

Verify: all three commands succeed and both greps are empty — satisfying spec
criteria 1–7 and 9. (Criterion 8 is superseded by the clean break; see
§ Relationship to spec & design.)

## Risks

- **`bun install` must precede `just codegen`.** Codegen discovers protos by
  scanning `node_modules/@forwardimpact/*/proto/`; until `bun install`
  re-symlinks the workspace package under `svcghuser`, codegen would not see the
  renamed proto. Removing `generated/` first prevents a stale
  `GhauthClient`/`ghauth` definition from surviving the regen.
- **Criterion 1's `fit-rc start ghuser` needs the runtime `config/config.json`
  refreshed.** That file is gitignored and lists `init.services` by name; a
  local tree still naming `ghauth` must be re-seeded (`just env-setup`) before
  the start smoke check passes. The tracked `config/CLAUDE.md` entry (Step 6) is
  the reviewable surface.
- **Clean break drops live bindings.** Any deployment with bindings under
  `data/ghauth/` loses them on cutover; affected users must re-link. This is the
  intended departure from criterion 8 — flag for the spec/design reconciliation
  noted above.

## Execution

One coordinated change, **one PR**, steps run **sequentially** (each depends on
the prior; Step 4's regen gates Steps 5–8). The design mandates a single
consistent state, so this plan is **not decomposed**. Route the whole plan to an
engineering agent (`staff-engineer`); the doc edits are small and interleaved
with the rename (the catalog is auto-regenerated), so no separate
`technical-writer` handoff is needed.
