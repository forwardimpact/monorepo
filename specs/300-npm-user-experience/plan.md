# Plan 300: npm User Experience

## Approach

Five independent fixes that together make `npx fit-guide --help` work from a
clean npm install. The dynamic import change makes `--help`/`--version` work
without service dependencies. The codegen documentation tells users how to
generate the installation-specific code that librpc and other packages require.
The engines, README, and smoke test changes round out the experience.

## Changes

### 1. Convert static imports to dynamic imports in fit-guide CLI

**Why**: ES module static `import` declarations are resolved before any code
executes. The current `bin/fit-guide.js` places `--help`/`--version` checks
(lines 17-44) before the service imports (lines 66-72) in source order, but
the module loader resolves all static imports first, so `process.exit(0)` never
runs if any import fails.

**File**: `products/guide/bin/fit-guide.js`

Replace the static imports on lines 66-72:

```js
import { createServiceConfig } from "@forwardimpact/libconfig";
import { Repl } from "@forwardimpact/librepl";
import { createClient, createTracer } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";
import { agent, common } from "@forwardimpact/libtype";
import { createStorage } from "@forwardimpact/libstorage";
import { Finder } from "@forwardimpact/libutil";
```

With dynamic imports inside the `try` block (around line 101):

```js
try {
  const { createServiceConfig } = await import("@forwardimpact/libconfig");
  const { Repl } = await import("@forwardimpact/librepl");
  const { createClient, createTracer } = await import("@forwardimpact/librpc");
  const { createLogger } = await import("@forwardimpact/libtelemetry");
  const { agent, common } = await import("@forwardimpact/libtype");
  const { createStorage } = await import("@forwardimpact/libstorage");
  const { Finder } = await import("@forwardimpact/libutil");

  // ... rest of the existing try block body
```

Also move the `usage` constant (lines 74-82), `dataArg` parsing (lines 85-99),
and all service connection logic inside the `try` block, since they depend on
these imports.

**Verify**: Without running any services or setting `SERVICE_SECRET`:
- `node products/guide/bin/fit-guide.js --help` prints help and exits 0
- `node products/guide/bin/fit-guide.js --version` prints version and exits 0
- `node products/guide/bin/fit-guide.js` prints the SERVICE_SECRET onboarding
  message and exits 1

### 2. Document `fit-codegen` as a required post-install step

**Why**: `librpc/index.js:7` and `librpc/base.js:6` import from `./generated/`,
which is produced by `npx fit-codegen --all` (libcodegen). The generated code is
installation-specific — it depends on the service definitions at each site — so
it must not be committed to the repo or bundled in npm tarballs. The root
`.gitignore` correctly excludes `generated/`. Users must run codegen after
installing.

**Files**:
- `CLAUDE.md` (canonical — Product Distribution section, already updated)
- `website/docs/getting-started/engineers/index.md`

`CLAUDE.md` § Product Distribution is already updated to establish the policy:
generated code is installation-specific, never committed or distributed. The
getting-started guide adds `npx fit-codegen --all` as a step after `npm install`.
The root README also includes codegen in its quick start (see step 4).

In the getting-started guide, add the step after line 86 (`npm install`):

```markdown
```sh
npm install @forwardimpact/guide
npx fit-codegen --all
```
```

**Verify**: Follow the documented steps in a clean directory and confirm
`node_modules/@forwardimpact/librpc/generated/` is created.

### 3. Add `node` to `engines` in all package.json files

**Why**: All 46 `package.json` files declare `"engines": { "bun": ">=1.2.0" }`
with no `node` entry. The established policy (CLAUDE.md: "All CLIs use
`#!/usr/bin/env node` — no Bun required") means node is the distribution
runtime. Missing `node` in engines causes npm warnings and signals bun-only
support.

**Files**: All 46 `package.json` files listed below.

Change every `engines` field from:

```json
"engines": {
  "bun": ">=1.2.0"
}
```

To:

```json
"engines": {
  "bun": ">=1.2.0",
  "node": ">=18.0.0"
}
```

**Complete file list** (46 files):

Root:
- `package.json`

Products (4):
- `products/basecamp/package.json`
- `products/guide/package.json`
- `products/map/package.json`
- `products/pathway/package.json`

Libraries (33):
- `libraries/libagent/package.json`
- `libraries/libcodegen/package.json`
- `libraries/libconfig/package.json`
- `libraries/libdoc/package.json`
- `libraries/libeval/package.json`
- `libraries/libformat/package.json`
- `libraries/libgraph/package.json`
- `libraries/libharness/package.json`
- `libraries/libindex/package.json`
- `libraries/libllm/package.json`
- `libraries/libmemory/package.json`
- `libraries/libpolicy/package.json`
- `libraries/libprompt/package.json`
- `libraries/librc/package.json`
- `libraries/librepl/package.json`
- `libraries/libresource/package.json`
- `libraries/librpc/package.json`
- `libraries/libsecret/package.json`
- `libraries/libskill/package.json`
- `libraries/libstorage/package.json`
- `libraries/libsupervise/package.json`
- `libraries/libsyntheticgen/package.json`
- `libraries/libsyntheticprose/package.json`
- `libraries/libsyntheticrender/package.json`
- `libraries/libtelemetry/package.json`
- `libraries/libtemplate/package.json`
- `libraries/libtool/package.json`
- `libraries/libtype/package.json`
- `libraries/libui/package.json`
- `libraries/libuniverse/package.json`
- `libraries/libutil/package.json`
- `libraries/libvector/package.json`
- `libraries/libweb/package.json`

Services (8):
- `services/agent/package.json`
- `services/graph/package.json`
- `services/llm/package.json`
- `services/memory/package.json`
- `services/tool/package.json`
- `services/trace/package.json`
- `services/vector/package.json`
- `services/web/package.json`

**Verify**: `grep -r '"engines"' --include='package.json' -A2 | grep -v node`
returns only closing braces — no `engines` block lacks a `node` entry.

### 4. Delete Guide README, rewrite root README Quick Start

**Why**: `products/guide/README.md` is the only per-package README in the
monorepo — no other product or library ships one. It duplicates the
getting-started guide and drifts out of sync. Committing to per-package READMEs
would require one for every product and library. Instead, the root `README.md`
Quick Start should serve external users directly.

**Delete**: `products/guide/README.md`

**File**: `CLAUDE.md`

Remove the "Product READMEs" row from the Documentation Map table and update the
"Contributor Workflow" paragraph that tells external users to "consult the
product READMEs or Getting Started guides" — change to just "Getting Started
guides".

**File**: `products/guide/package.json`

Remove `README.md` from the `files` field:

```json
"files": [
  "bin/"
],
```

**File**: `README.md` (root)

Rewrite the Quick Start section for external users. The current Quick Start
shows the monorepo clone path, which belongs in CONTRIBUTING.md (where it
already exists). Replace it with the npm install path:

```markdown
## Quick Start

Install Pathway and Guide from npm, then generate installation-specific service
code:

\`\`\`sh
npm install @forwardimpact/pathway @forwardimpact/guide
npx fit-codegen --all
\`\`\`

Browse your engineering framework:

\`\`\`sh
npx fit-pathway discipline --list
npx fit-pathway job software_engineering L3
\`\`\`

Guide requires a running service stack — see the
[getting started guide](website/docs/getting-started/engineers/index.md) for
setup.
```

**Verify**:
- `products/guide/README.md` does not exist
- Root `README.md` Quick Start mentions both Pathway and Guide
- `npm pack --workspace=@forwardimpact/guide --dry-run` does not list README.md

### 5. Add smoke test to publish workflow

**Why**: Packaging errors have reached npm because nothing tested the tarball
outside the workspace. A smoke test after `npm pack` catches issues before
they reach users.

**File**: `.github/workflows/publish-npm.yml`

Add a step between the existing "Run tests" step and "Copy LICENSE" step:

```yaml
- name: Smoke test npm package
  run: |
    PACK_DIR=$(mktemp -d)
    TARBALL=$(npm pack --workspace=${{ steps.package.outputs.npm_name }} --pack-destination="$PACK_DIR")
    cd "$PACK_DIR"
    npm init -y
    npm install "$TARBALL"
    # Verify the CLI entry point loads (--help exits 0 without services)
    BIN=$(node -e "const p=require('./${{ steps.package.outputs.dir_name }}/package.json'); const b=Object.values(p.bin||{})[0]; if(b) console.log(b)")
    if [ -n "$BIN" ]; then
      node "node_modules/${{ steps.package.outputs.npm_name }}/$BIN" --help
    fi
    rm -rf "$PACK_DIR"
```

This step:
1. Packs the workspace package into a tarball
2. Creates an isolated temp directory with a fresh `package.json`
3. Installs the tarball (not from the workspace — from the packed archive)
4. Runs `--help` on the CLI entry point if one exists
5. Cleans up

The smoke test only validates packages that declare a `bin` field with a `--help`
flag. Packages without a CLI (libraries) are validated by the tarball installing
without error.

**Verify**: Trigger the workflow locally with `act` or verify by reading the
workflow YAML and confirming the step appears in the correct position.

## Ordering

```
Step 1 (dynamic imports)              ─┐
Step 2 (codegen documentation)        ├─ can be done in parallel
Step 3 (engines field, 46 files)      │
Step 4 (delete Guide README, root QS) ─┘
         │
         ▼
Step 5 (smoke test)  ← depends on step 1 to pass
```

Steps 1-4 are independent of each other. Step 5 should be done last because
the smoke test will fail unless the dynamic import fix (step 1) is in place.

## Files Modified

| File | Change |
|------|--------|
| `CLAUDE.md` | Remove "Product READMEs" from Documentation Map; codegen policy already done |
| `products/guide/bin/fit-guide.js` | Static imports → dynamic `await import()` |
| `products/guide/package.json` | Remove `README.md` from `files` |
| `README.md` | Quick Start rewritten for external users |
| `website/docs/getting-started/engineers/index.md` | Add codegen step |
| 46× `package.json` | Add `"node": ">=18.0.0"` to `engines` |
| `.github/workflows/publish-npm.yml` | Add smoke test step |

## Files Created

None.

## Files Deleted

| File | Reason |
|------|--------|
| `products/guide/README.md` | Only per-package README; duplicates getting-started guide |
