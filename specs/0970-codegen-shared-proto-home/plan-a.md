# Plan 0970 — Published Home for Shared Protos

## Approach

Create `@forwardimpact/libproto` carrying `proto/{tool,common,resource}.proto`
as a new workspace library, declare it as a runtime dep on the four service
packages whose shipped `.proto` imports a shared file
(`svcgraph`/`svcmap`/`svcvector`/`svcpathway`), delete the legacy copies at
`/proto/` and `products/guide/proto/`, drop `"proto/"` from
`@forwardimpact/guide`'s `files` array, and update the `fit-codegen` CLI
description to mention the proto-discovery behavior. Workspace symlinks make
internal codegen pick libproto up with no `libcodegen` code change; external
installs pull libproto transitively. The six steps land in one PR — they
are sequential, and the legacy copies must be deleted in the same PR that
introduces libproto so `origin/main` never carries a half-applied tree.
`just codegen` stays runnable at every step boundary.

## Libraries used

none.

## Steps

### 1. Create `libraries/libproto/`

**Created:**

- `libraries/libproto/package.json` — `@forwardimpact/libproto` v0.1.0,
  `main: "./src/index.js"`, `files: ["proto/", "src/index.js", "README.md"]`,
  `description`/`keywords`/`jobs` matching the design (Platform Builders →
  *Ground Service Contracts in One Source*), `devDependencies` empty,
  `dependencies` empty.
- `libraries/libproto/src/index.js` — one line: `export {};`
- `libraries/libproto/proto/tool.proto` — byte-for-byte copy of
  `proto/tool.proto`.
- `libraries/libproto/proto/common.proto` — byte-for-byte copy of
  `products/guide/proto/common.proto`.
- `libraries/libproto/proto/resource.proto` — byte-for-byte copy of
  `products/guide/proto/resource.proto`.
- `libraries/libproto/README.md` — purpose, file list, note that no JS export
  surface exists; consumers reach the schemas via codegen, not by importing
  the package.
- `libraries/libproto/test/libproto.test.js` — single smoke test, written
  against `node:test` + `node:assert` (runner-independent per
  `libraries/CLAUDE.md`; `bun test` and `node --test` both execute it). Two
  assertions: (a) `fs.existsSync` returns true for each of
  `proto/tool.proto`, `proto/common.proto`, `proto/resource.proto` relative
  to the package directory; (b) `Object.keys(await import("@forwardimpact/libproto"))`
  has length 0 (ESM Module Namespace, not `{}`, so use `Object.keys` —
  not `assert.deepStrictEqual`).

Required `package.json` block:

```json
{
  "name": "@forwardimpact/libproto",
  "version": "0.1.0",
  "description": "Shared protobuf schemas — one editable source for the service contracts every product imports.",
  "keywords": ["proto", "protobuf", "schema", "contract", "agent"],
  "jobs": [
    {
      "user": "Platform Builders",
      "goal": "Ground Service Contracts in One Source",
      "trigger": "Shipping a proto that imports tool.proto and discovering the published copy lives in another package the consumer never installed.",
      "bigHire": "publish service protos that resolve on any external `npm install` without coordinating multiple package homes.",
      "littleHire": "import a shared proto and trust the consumer of my service can read it.",
      "competesWith": "duplicating .proto files across packages; embedding shared schemas inside transport or codegen libraries; tolerating ENOENT for non-Guide installs"
    }
  ],
  "type": "module",
  "main": "./src/index.js",
  "files": ["proto/", "src/index.js", "README.md"],
  "scripts": { "test": "bun test test/*.test.js" }
}
```

`check-metadata.mjs --fix` (step 5) backfills `homepage`, `repository`,
`license`, `author`, `engines`, and `publishConfig`; the plan only specifies
the per-package fields here.

**Verify:** `bun install` succeeds and creates the
`node_modules/@forwardimpact/libproto` workspace symlink. Capture a baseline
*before* this step lands locally:

```sh
git stash -u && bunx fit-codegen --all
find generated -type f | sort > /tmp/codegen-before.txt
git stash pop
```

Then re-run codegen and diff:

```sh
bunx fit-codegen --all
find generated -type f | sort > /tmp/codegen-after.txt
diff /tmp/codegen-before.txt /tmp/codegen-after.txt   # must be empty
```

The legacy copies under `/proto/` and `products/guide/proto/` are still
present at this step; `collectProtoFiles` dedupes by basename last-wins via
`Map.set` (`libraries/libcodegen/src/base.js:103-112`) and step 1 mandates
byte-identical copies, so the file *set* under `generated/` is invariant.
The diff command is the gate, not the prose.

### 2. Wire libproto into the four service packages

**Modified:** Add `"@forwardimpact/libproto": "^0.1.0"` to `dependencies` in
each manifest. Sort key is alphabetical on the package name; insertion point
differs per file:

| File                            | Insert between           |
| ------------------------------- | ------------------------ |
| `services/graph/package.json`   | `libgraph` and `libresource`  |
| `services/map/package.json`     | `libconfig` and `librpc`      |
| `services/vector/package.json`  | `libconfig` and `libresource` |
| `services/pathway/package.json` | `libconfig` and `librpc`      |

(`check-metadata.mjs --fix` in step 5 also normalises ordering if any slot
is off.)

No other consumer (`@forwardimpact/guide`, `svcmcp`, `svctrace`) gains a
libproto dep — Guide reaches libproto transitively via its existing
`svcgraph`/`svcpathway`/`svcvector`/`svcmcp(→svcmap)` deps, `svcmcp` ships no
`proto/`, and `svctrace`'s `trace.proto` imports nothing shared.

**Verify:** `bun install` succeeds; `bunx fit-codegen --all` still exits 0.

### 3. Delete legacy copies

**Modified:**

- `products/guide/package.json` — remove `"proto/"` from the `files` array.

**Deleted:**

- `proto/tool.proto`
- `proto/` (now-empty directory)
- `products/guide/proto/common.proto`
- `products/guide/proto/resource.proto`
- `products/guide/proto/` (now-empty directory)

**Verify:** `git ls-files '*tool.proto' '*resource.proto' '*common.proto'`
from the repo root returns exactly:

```
libraries/libproto/proto/common.proto
libraries/libproto/proto/resource.proto
libraries/libproto/proto/tool.proto
```

`bunx fit-codegen --all` continues to exit 0 from the repo root;
`ls generated/types generated/proto generated/services generated/definitions
generated/metadata` is identical to a `git stash`-reverted clean run on
`origin/main`.

### 4. Update `fit-codegen` description

**Modified:**

- `libraries/libcodegen/bin/fit-codegen.js` — change
  `definition.description` (line 34) from
  `"Generate protobuf types, service clients, and definitions"` to
  `"Generate protobuf types, service clients, and definitions from .proto files in installed @forwardimpact/* packages (node_modules/@forwardimpact/*/proto/) and an optional project-local proto/ directory."`

No other code change. Discovery logic (`discoverProtoDirs`,
`fit-codegen.js:134-159`) is unchanged; the project-local `proto/` fallback
remains for future project-specific protos even though it is unused after
step 3.

**Verify:** `bunx fit-codegen --help` includes the new description text;
`bunx fit-codegen --help --json` exposes the same string in the
`description` field.

### 5. Regenerate catalogs

Run `bun run context:fix` to refresh:

- `libraries/README.md` catalog table (libproto row).
- `libraries/README.md` Platform-Builder jobs block (libproto job entry).
- Any other auto-generated metadata files
  (`scripts/check-metadata.mjs --fix` canonicalises libproto's
  `package.json`).

**Verify:** `bun run check` exits 0; `git diff --stat` for the auto-generated
files is limited to the libproto-introduced rows.

### 6. Packaged-tarball shape and clean-install check

The spec's primary user-facing criteria ("External `@forwardimpact/guide`
install can codegen", per-service external installs, Getting Started
walkthrough) are post-publish gates and cannot be exercised against an
unpublished package. The implementer runs the strongest pre-publish proxy:

```sh
# Repo root. bun pm pack writes the tarball to ./libraries/libproto/.
cd libraries/libproto && bun pm pack && cd -

# Inspect the tarball shape — must list all six entries and nothing else.
tar tzf libraries/libproto/forwardimpact-libproto-0.1.0.tgz | sort
# Expected (subset, plus npm-injected package/ prefix):
#   package/README.md
#   package/package.json
#   package/proto/common.proto
#   package/proto/resource.proto
#   package/proto/tool.proto
#   package/src/index.js

# Install the tarball into a clean throw-away project and verify shape.
TMP=$(mktemp -d) && cd "$TMP" && npm init -y >/dev/null
npm install --no-audit --no-fund \
  "$OLDPWD/libraries/libproto/forwardimpact-libproto-0.1.0.tgz"
ls node_modules/@forwardimpact/libproto/proto/
# Expected: common.proto  resource.proto  tool.proto
cd - && rm -rf "$TMP" libraries/libproto/forwardimpact-libproto-0.1.0.tgz
```

Both checks must pass before the PR is marked ready. Post-publish
verification of the full Getting Started walkthrough is owned by the
release engineer per the spec's "Documentation is accurate" criterion;
this plan does not add a CI gate for it (out of scope per design § Out
of scope, "A `fit-codegen --doctor` … diagnostic subcommand"-class
tooling).

## Risks

- **Symlink dedup hazard during step 1.** Between step 1 and step 3, three
  proto basenames exist in two directories that `discoverProtoDirs` finds.
  `CodegenBase.collectProtoFiles` dedupes by basename with last-occurrence-wins
  (`libraries/libcodegen/src/base.js:103`), so the chosen copy depends on
  `node_modules` readdir order. Both copies are byte-for-byte identical (step
  1 mandates byte-for-byte copies), so codegen output is identical either
  way — but if step 1 or step 2 accidentally diverges the content, the wrong
  copy may silently win. Mitigation: keep the copies byte-identical until
  step 3 deletes the legacy versions in the same commit.

- **Release ordering for the first cut.** Step 2 pins
  `"@forwardimpact/libproto": "^0.1.0"` in four service manifests against a
  package that has never been published. `kata-release-cut` walks workspace
  packages in dependency order, so libproto naturally goes first — but the
  release engineer must not pull any of `svcgraph`/`svcmap`/`svcvector`/
  `svcpathway` into the cut without libproto in the same release. The PR
  body must end with a `## Release coordination` block stating exactly:
  *"First-time publish of `@forwardimpact/libproto@0.1.0`. Must publish
  before `svcgraph`/`svcmap`/`svcvector`/`svcpathway` in the same release
  cut; consumer `^0.1.0` pins resolve only against the new libproto."*
  `kata-release-merge` and `kata-release-cut` both read PR bodies for
  coordination notes; the heading is the signal they look for.

## Execution

Single PR on the existing claimed branch
`plan/spec-0970-codegen-shared-proto-home`. Steps 1 → 6 are strictly
sequential — each `bun install` and each verify gate depends on the previous
step. Best fit: `staff-engineer` via `kata-implement`.

— Staff Engineer 🛠️
