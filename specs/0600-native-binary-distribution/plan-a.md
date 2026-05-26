# Plan 0600-A — Native Binary Distribution via Homebrew

See [`spec.md`](./spec.md) for WHAT/WHY and [`design-a.md`](./design-a.md) for
WHICH/WHERE. This plan captures HOW to implement and WHEN to sequence changes.

## Approach

The implementation has six steps: libmacos extraction (1a), bundle build recipes
(1b), release workflow (2), basecamp TCC verification (2b), tap repository (3),
and documentation (4). Step 1a lands first and blocks all other bundle-assembly
work. Steps 1b and 2 are strictly sequential. Step 3 (tap repo) can run in
parallel with steps 1–2 since it creates an external repo with placeholder
casks. Step 4 (docs) can run in parallel with step 3. Step 2b (manual TCC
verification) runs before the first `basecamp@v*` tag is pushed through the new
workflow. The tap repo and `HOMEBREW_TAP_PAT` secret must both exist before the
first real release tag is pushed — otherwise the `tap-pr` job fails.

The fit-guide codegen story resolves automatically: `just codegen` runs before
`bun build --compile`, so generated gRPC clients are bundled into every binary
via bun's import-graph traversal. No special handling needed — the existing
`generated/` symlink in `librpc/src/generated` is followed at build time
(confirmed by basecamp's `build-scheduler` recipe in
`products/basecamp/justfile:35`).

**Naming convention (deliberate design divergence).** The design specifies
output path `dist/binaries/<cli>-<os>-<arch>` for Mach-Os and `dist/apps/` for
`.app` bundles. This plan uses `dist/binaries/fit-<cli>-bun-darwin-arm64` as the
local Mach-O output — the `bun-` prefix is bun's target triple convention and is
required by the `--target` flag. Bundle assembly then reads from
`dist/binaries/` and writes `dist/apps/<Bundle>.app`. The `release-assets` job
zips each `.app` and uploads as `<Bundle>.app-<version>-darwin-arm64.zip`.

## Step 1a — Extract `libraries/libmacos`

Create the shared macOS library every bundle-assembly step depends on, and
migrate basecamp to consume it. This step blocks Step 1b onward.

### Actions

- Create `libraries/libmacos/` with `package.json`, `src/`, `templates/`,
  `scripts/`. Declare `"os": ["darwin"]` so Linux CI skips it cleanly.
- Move `products/basecamp/src/posix-spawn.js` →
  `libraries/libmacos/src/posix-spawn.js`. Rewrite basecamp's imports
  (`products/basecamp/src/agent-runner.js` and any other caller). Add
  `libraries/libmacos/src/tcc-responsibility.js` — a thin wrapper that spawns a
  child, disclaims TCC responsibility, and returns an exit-code Promise.
- Generalize `products/basecamp/pkg/macos/build-app.sh` into
  `libraries/libmacos/scripts/build-app.sh` accepting: `--bundle-name`,
  `--bundle-id`, `--primary-exec`, `--extra-exec` (repeatable), `--info-plist`,
  `--entitlements`, `--resource` (repeatable), `--version`, `--out-dir`. Output
  path `<out-dir>/<bundle-name>.app`.
- Extract the codesign call into `libraries/libmacos/scripts/sign-app.sh` and
  have `build-app.sh` invoke it as its final stage.
- Commit default templates:
  - `templates/entitlements.plist` — JIT +
    `com.apple.security.cs.disable-library-validation` only.
  - `templates/entitlements-gui.plist` — seeded from basecamp's current
    `Basecamp.entitlements` (Calendar, Contacts, Network).
  - `templates/Info.plist.hbs` — template with `{{bundleId}}`, `{{bundleName}}`,
    `{{executable}}`, `{{version}}`, `{{minOS}}`, `{{lsuiElement}}`
    placeholders.
- Delete `products/basecamp/pkg/macos/build-app.sh`. Update basecamp's justfile
  `build-app` recipe to call `libraries/libmacos/scripts/build-app.sh` with
  basecamp-specific arguments (Swift launcher as `CFBundleExecutable`,
  `fit-basecamp` as a secondary Mach-O, `Basecamp.entitlements` as entitlements
  path, `LSUIElement=true`).
- Preserve basecamp's existing `.pkg` flow: `pkg/macos/build-pkg.sh` currently
  depends on `dist/Basecamp.app` being produced by the now-retired
  `build-app.sh`. The rewired `build-app` recipe must produce a bundle at the
  same path (`dist/Basecamp.app`) so `build-pkg.sh` keeps working unchanged. If
  the shared `libmacos/scripts/build-app.sh` output path differs, add a thin
  basecamp-local recipe that copies / symlinks to the legacy path.

### Files

| File                                                  | Action                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------- |
| `libraries/libmacos/package.json`                     | Created — `"os": ["darwin"]`                                        |
| `libraries/libmacos/src/posix-spawn.js`               | Created — moved from `products/basecamp/src/`                       |
| `libraries/libmacos/src/tcc-responsibility.js`        | Created                                                             |
| `libraries/libmacos/scripts/build-app.sh`             | Created — generalized from basecamp's `build-app.sh`                |
| `libraries/libmacos/scripts/sign-app.sh`              | Created                                                             |
| `libraries/libmacos/templates/entitlements.plist`     | Created                                                             |
| `libraries/libmacos/templates/entitlements-gui.plist` | Created — seeded from `Basecamp.entitlements`                       |
| `libraries/libmacos/templates/Info.plist.hbs`         | Created                                                             |
| `products/basecamp/src/posix-spawn.js`                | Deleted — moved to libmacos                                         |
| `products/basecamp/src/agent-runner.js`               | Modified — import from `libmacos`                                   |
| `products/basecamp/pkg/macos/build-app.sh`            | Deleted — superseded by `libmacos/scripts/build-app.sh`             |
| `products/basecamp/justfile`                          | Modified — `build-app` recipe calls `libmacos/scripts/build-app.sh` |

### Verification

```sh
cd products/basecamp
just build-app
# Expect: dist/Basecamp.app produced with Swift launcher as CFBundleExecutable
#         and fit-basecamp in Contents/MacOS/; codesign -dvvv passes
bun test
# Expect: basecamp's existing test suite passes, including agent-runner paths
#         that exercise posix-spawn via libmacos
```

### Agent & parallelism

**Agent:** staff-engineer. **Parallelism:** First step. Blocks Step 1b, Step 2,
Step 2b.

## Step 1b — Bundle recipes in root justfile

Replaces the original Step 1. Drive every bundle through
`libmacos/scripts/build-app.sh` from root-level justfile recipes.

### Recipe: `build-binary`

`NAME` is the full binary name (e.g. `fit-pathway`, `fit-svcgraph`,
`fit-codegen`). The recipe resolves the entry file by scanning every
`package.json` under `products/`, `services/`, and `libraries/` for a `bin`
field whose key matches `NAME`, and uses the path that field points at as the
bun-compile entry. This replaces heuristic-based path guessing (like
"`libraries/lib<NAME>/bin/fit-<NAME>.js`"), which fails for the many library
CLIs whose library name doesn't match the CLI name (e.g. `fit-trace` lives in
`libeval`, `fit-process-graphs` in `libgraph`, `fit-visualize` in
`libtelemetry`).

```just
# Build a standalone native Mach-O. NAME is a full bin name like fit-codegen.
build-binary NAME TARGET="bun-darwin-arm64":
    #!/usr/bin/env bash
    set -euo pipefail
    ENTRY=""
    for PKG in products/*/package.json services/*/package.json libraries/*/package.json; do
      REL=$(jq -r --arg n "{{NAME}}" '.bin[$n] // empty' "$PKG" 2>/dev/null)
      if [ -n "$REL" ]; then
        ENTRY="$(dirname "$PKG")/$REL"
        break
      fi
    done
    if [ -z "$ENTRY" ] || [ ! -f "$ENTRY" ]; then
      echo "Error: no package.json declares bin[{{NAME}}] with an existing entry" >&2
      exit 1
    fi
    mkdir -p dist/binaries
    bun build --compile \
      --target "{{TARGET}}" \
      --no-compile-autoload-dotenv \
      --no-compile-autoload-bunfig \
      --outfile "dist/binaries/{{NAME}}-{{TARGET}}" \
      "$ENTRY"
```

**Flags explained:**

- `--target` — sets the output platform triple; defaults to `bun-darwin-arm64`.
- `--no-compile-autoload-dotenv` / `--no-compile-autoload-bunfig` — CLIs must
  not read `.env` or `bunfig.toml` from the user's working directory; they have
  their own config mechanisms (`fit-rc`, `config.json`).
- `--outfile dist/binaries/<name>-<target>` — deterministic output path. `dist/`
  is already in `.gitignore`. The bundle-assembly step (`build-app-*` below)
  reads from this path.

**Prerequisite for services.** Today `services/<name>/package.json` has no `bin`
field — each service runs via `bun server.js`. Step 1b adds
`"bin": { "fit-svc<name>": "./server.js" }` to each of the five service packages
so the same `build-binary` recipe drives them uniformly.

**Codegen.** `build-binary` does not depend on `codegen` as an individual recipe
— the `build-binaries` fan-out below depends on `codegen` for local use, and
CI's bootstrap action runs `fit-codegen --all` before the bundle job. A
contributor running `just build-binary fit-guide` on a tree without generated
code gets a broken binary; the fan-out is the documented entry point.

### Recipe: `build-binaries`

Each fan-out below uses the real binary names declared in each package.json's
`bin` field — no aliasing or rename machinery. Service binaries get the
`fit-svc` prefix (matching their `@forwardimpact/svc<name>` npm package names)
so they don't collide with any product or library CLI.

```just
# Build all Mach-Os for the default target
build-binaries: codegen build-product-binaries build-service-binaries build-utility-binaries

build-product-binaries:
    just build-binary fit-basecamp
    just build-binary fit-guide
    just build-binary fit-landmark
    just build-binary fit-map
    just build-binary fit-pathway
    just build-binary fit-summit

build-service-binaries:
    just build-binary fit-svcgraph
    just build-binary fit-svcmcp
    just build-binary fit-svcpathway
    just build-binary fit-svctrace
    just build-binary fit-svcvector

build-utility-binaries:
    # Enumerated from `libraries/*/package.json` bin fields at Step 1a time.
    # Every addition or removal here MUST be mirrored in the `binary` stanza
    # list of Casks/fit-utilities.rb (Step 3) — the two lists are the single
    # source of truth for "what ends up on PATH via fit-utilities".
    just build-binary fit-codegen
    just build-binary fit-terrain
    just build-binary fit-eval
    just build-binary fit-doc
    just build-binary fit-rc
    just build-binary fit-xmr
    just build-binary fit-storage
    just build-binary fit-logger
    just build-binary fit-svscan
    just build-binary fit-trace
    just build-binary fit-visualize
    just build-binary fit-query
    just build-binary fit-subjects
    just build-binary fit-process-graphs
    just build-binary fit-process-resources
    just build-binary fit-process-vectors
    just build-binary fit-search
    just build-binary fit-unary
    just build-binary fit-tiktoken
    just build-binary fit-download-bundle
```

Sequential execution is intentional — parallel `bun build --compile` can exhaust
memory on CI runners (each embeds the ~60 MB bun runtime). `codegen` runs first
so generated gRPC code is current. The canonical utility list above must be
verified against `libraries/*/package.json` during Step 1a implementation and
updated if any library's `bin` set has changed since this plan was written.

### Recipes: `build-app-*`

After Mach-Os are built, bundle them via `libmacos/scripts/build-app.sh`:

```just
# Assemble a per-product .app bundle
build-app-product NAME:
    bash libraries/libmacos/scripts/build-app.sh \
      --bundle-name "fit-{{NAME}}" \
      --bundle-id "team.forwardimpact.{{NAME}}" \
      --primary-exec "dist/binaries/fit-{{NAME}}-bun-darwin-arm64" \
      --info-plist "products/{{NAME}}/macos/Info.plist" \
      --entitlements "products/{{NAME}}/macos/entitlements.plist" \
      --version "$(jq -r .version products/{{NAME}}/package.json)" \
      --out-dir dist/apps

# Assemble FIT Services.app
build-app-services:
    bash libraries/libmacos/scripts/build-app.sh \
      --bundle-name "FIT Services" \
      --bundle-id "team.forwardimpact.services" \
      --primary-exec "dist/binaries/fit-svcgraph-bun-darwin-arm64" \
      --extra-exec "dist/binaries/fit-svcmcp-bun-darwin-arm64" \
      --extra-exec "dist/binaries/fit-svcpathway-bun-darwin-arm64" \
      --extra-exec "dist/binaries/fit-svctrace-bun-darwin-arm64" \
      --extra-exec "dist/binaries/fit-svcvector-bun-darwin-arm64" \
      --info-plist "macos/services/Info.plist" \
      --entitlements "macos/services/entitlements.plist" \
      --version "$(jq -r .version package.json)" \
      --out-dir dist/apps

# Assemble FIT Utilities.app
build-app-utilities:
    bash libraries/libmacos/scripts/build-app.sh \
      --bundle-name "FIT Utilities" \
      --bundle-id "team.forwardimpact.utilities" \
      --primary-exec "dist/binaries/fit-codegen-bun-darwin-arm64" \
      --extra-exec "dist/binaries/fit-terrain-bun-darwin-arm64" \
      # … remaining library-CLI Mach-Os as --extra-exec
      --info-plist "macos/libraries/Info.plist" \
      --entitlements "macos/libraries/entitlements.plist" \
      --version "$(jq -r .version package.json)" \
      --out-dir dist/apps

# Fan-out: build every Mach-O, then every bundle
build-apps: build-binaries
    just build-app-product basecamp
    just build-app-product guide
    just build-app-product landmark
    just build-app-product map
    just build-app-product pathway
    just build-app-product summit
    just build-app-services
    just build-app-utilities
```

### Per-bundle metadata files

Create `Info.plist` and `entitlements.plist` alongside each bundle's source
tree:

- `products/<name>/macos/Info.plist` for the five non-basecamp products — render
  `libmacos/templates/Info.plist.hbs` with `bundleId=team.forwardimpact.<name>`,
  `executable=fit-<name>`, `minOS=13.0`, no `NS*UsageDescription` entries.
  Basecamp already has `products/basecamp/macos/Info.plist` — leave it alone.
- `products/<name>/macos/entitlements.plist` for the five non-basecamp products
  — copy `libmacos/templates/entitlements.plist` (JIT +
  disable-library-validation). Basecamp continues to reference
  `products/basecamp/macos/Basecamp.entitlements`.
- `macos/services/Info.plist` and `macos/services/entitlements.plist` — metadata
  for `FIT Services.app`. Identifier `team.forwardimpact.services`,
  `CFBundleExecutable=fit-svcgraph`.
- `macos/libraries/Info.plist` and `macos/libraries/entitlements.plist` —
  metadata for `FIT Utilities.app`. Identifier `team.forwardimpact.utilities`,
  `CFBundleExecutable=fit-codegen`.

The shared bundles live under a top-level `macos/` directory rather than beside
their constituent services or libraries: their contents aggregate across many
services / libraries and are macOS-specific packaging metadata, not a service or
library in their own right.

### Service compile targets

Each `services/<name>/package.json` needs a `bin` entry or the equivalent so
`build-binary <name>` finds an entry point that compiles to `fit-svc<name>`. Add
per-service `bin` fields during Step 1b implementation.

### Recipe placement

Add the binary and bundle recipes under a new `# ── Bundles` section after the
existing `# ── CLI` section of the root justfile.

### Files

| File                                         | Action                                         |
| -------------------------------------------- | ---------------------------------------------- |
| `justfile`                                   | Modified — add binary and bundle recipes       |
| `products/guide/macos/Info.plist`            | Created                                        |
| `products/guide/macos/entitlements.plist`    | Created                                        |
| `products/landmark/macos/Info.plist`         | Created                                        |
| `products/landmark/macos/entitlements.plist` | Created                                        |
| `products/map/macos/Info.plist`              | Created                                        |
| `products/map/macos/entitlements.plist`      | Created                                        |
| `products/pathway/macos/Info.plist`          | Created                                        |
| `products/pathway/macos/entitlements.plist`  | Created                                        |
| `products/summit/macos/Info.plist`           | Created                                        |
| `products/summit/macos/entitlements.plist`   | Created                                        |
| `macos/services/Info.plist`                  | Created                                        |
| `macos/services/entitlements.plist`          | Created                                        |
| `macos/libraries/Info.plist`                 | Created                                        |
| `macos/libraries/entitlements.plist`         | Created                                        |
| `services/*/package.json`                    | Modified — add `bin` fields for compile target |

### Verification

```sh
just codegen
just build-app-product pathway
# Expect: dist/apps/fit-pathway.app exists
codesign -dvvv dist/apps/fit-pathway.app
# Expect: Identifier=team.forwardimpact.pathway, Signature=adhoc, non-empty cdhash
plutil -p dist/apps/fit-pathway.app/Contents/Info.plist
# Expect: CFBundleIdentifier=team.forwardimpact.pathway, CFBundleShortVersionString=<version>
codesign -d --entitlements - dist/apps/fit-pathway.app
# Expect: entitlements plist with com.apple.security.cs.allow-jit
codesign --verify --deep --strict dist/apps/fit-pathway.app
# Expect: exit 0
./dist/apps/fit-pathway.app/Contents/MacOS/fit-pathway --help
# Expect: pathway help output, exit 0

# Build every bundle
just build-apps
ls dist/apps/
# Expect: fit-basecamp.app, fit-guide.app, fit-landmark.app, fit-map.app,
#         fit-pathway.app, fit-summit.app, FIT Services.app, FIT Utilities.app

# cdhash stability check (CI gate): rebuild from the same tree twice and
# compare the signed cdhash. No stash — the tree is unchanged between
# invocations; the build must be deterministic on its own.
BASELINE=$(codesign -dvvv dist/apps/fit-pathway.app 2>&1 | grep CDHash)
rm -rf dist/apps/fit-pathway.app dist/binaries/fit-pathway-bun-darwin-arm64
just build-app-product pathway
AFTER=$(codesign -dvvv dist/apps/fit-pathway.app 2>&1 | grep CDHash)
[ "$BASELINE" = "$AFTER" ] || { echo "cdhash drift"; exit 1; }
```

## Step 2 — Release workflow

Create `.github/workflows/publish-brew.yml` triggered by release tags.

### Key design decisions

**Single-bundle build per tag.** The workflow extracts the bundle name from the
tag and builds only that bundle. Tag shapes:

- `<product>@v*` (e.g. `pathway@v0.25.32`) — builds `fit-<product>.app` via
  `just build-app-product <product>`.
- `services@v*` — builds `FIT Services.app` via `just build-app-services`.
- `utilities@v*` — builds `FIT Utilities.app` via `just build-app-utilities`.

This matches `publish-npm.yml`'s per-package tag semantics — a tag releases one
artifact, not the full set. Building everything per tag would pollute each
release with unrelated assets and waste expensive macOS runner minutes.

**Codegen chain.** The bootstrap action runs `./scripts/bootstrap.sh` which
calls `just install` → `install-bun` → `fit-codegen --all`. This ensures
generated code exists before the build. An explicit `just codegen` step is added
after bootstrap as a defensive measure against bootstrap refactors.

**Release creation.** `publish-npm.yml` does not create GitHub Releases;
`publish-macos.yml` creates one only for `basecamp@v*`. This workflow must
create the release if it does not exist, then upload the zipped bundle.

### Workflow structure

```yaml
name: Publish Brew

on:
  push:
    tags: ["*@v*"]

jobs:
  build:
    runs-on: macos-14
    permissions:
      contents: write

    steps:
      - uses: actions/checkout@<pinned-sha>  # v6

      - name: Extract bundle and version from tag
        id: meta
        run: |
          NAME="${GITHUB_REF_NAME%%@v*}"
          VERSION="${GITHUB_REF_NAME#*@v}"
          case "$NAME" in
            services)   KIND=services;   BUNDLE="FIT Services.app";         CASK=fit-services   ;;
            utilities)  KIND=utilities;  BUNDLE="FIT Utilities.app";        CASK=fit-utilities  ;;
            *)          KIND=product;    BUNDLE="fit-${NAME}.app";          CASK=fit-${NAME}    ;;
          esac
          echo "name=${NAME}"       >> $GITHUB_OUTPUT
          echo "version=${VERSION}" >> $GITHUB_OUTPUT
          echo "kind=${KIND}"       >> $GITHUB_OUTPUT
          echo "bundle=${BUNDLE}"   >> $GITHUB_OUTPUT
          echo "cask=${CASK}"       >> $GITHUB_OUTPUT

      - uses: ./.github/actions/bootstrap

      - name: Ensure codegen is current
        run: just codegen

      - name: Build bundle
        run: |
          case "${{ steps.meta.outputs.kind }}" in
            services)   just build-app-services   ;;
            utilities)  just build-app-utilities  ;;
            product)    just build-app-product ${{ steps.meta.outputs.name }} ;;
          esac

      - name: Smoke test
        run: |
          BUNDLE="dist/apps/${{ steps.meta.outputs.bundle }}"
          codesign --verify --deep --strict "$BUNDLE"
          # For product bundles, run the matching CLI's --help.
          # Shared bundles expose multiple CLIs; exercise the primary exec only.
          case "${{ steps.meta.outputs.kind }}" in
            product)    "$BUNDLE/Contents/MacOS/fit-${{ steps.meta.outputs.name }}" --help ;;
            services)   "$BUNDLE/Contents/MacOS/fit-svcgraph" --help                       ;;
            utilities)  "$BUNDLE/Contents/MacOS/fit-codegen" --help                        ;;
          esac

      - name: Zip bundle and hash
        id: hash
        run: |
          VERSION="${{ steps.meta.outputs.version }}"
          CASK="${{ steps.meta.outputs.cask }}"
          BUNDLE="dist/apps/${{ steps.meta.outputs.bundle }}"
          ASSET="${CASK}-${VERSION}-darwin-arm64.zip"
          # Use `ditto` to preserve codesign metadata through zip.
          ditto -c -k --sequesterRsrc --keepParent "$BUNDLE" "dist/apps/${ASSET}"
          shasum -a 256 "dist/apps/${ASSET}" | awk '{print $1}' > "dist/apps/${ASSET}.sha256"
          echo "asset=${ASSET}" >> $GITHUB_OUTPUT
          echo "sha256=$(cat "dist/apps/${ASSET}.sha256")" >> $GITHUB_OUTPUT

      - name: Create or reuse GitHub Release
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          TAG="${GITHUB_REF_NAME}"
          gh release create "$TAG" --title "$TAG" --generate-notes 2>/dev/null \
            || echo "Release $TAG already exists"

      - name: Upload release assets
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          TAG="${GITHUB_REF_NAME}"
          ASSET="${{ steps.hash.outputs.asset }}"
          gh release upload "$TAG" \
            "dist/apps/${ASSET}" \
            "dist/apps/${ASSET}.sha256" \
            --clobber

  tap-pr:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Extract bundle and version from tag
        id: meta
        run: |
          NAME="${GITHUB_REF_NAME%%@v*}"
          VERSION="${GITHUB_REF_NAME#*@v}"
          case "$NAME" in
            services)   KIND=services;   CASK=fit-services   ;;
            utilities)  KIND=utilities;  CASK=fit-utilities  ;;
            *)          KIND=product;    CASK=fit-${NAME}    ;;
          esac
          echo "name=${NAME}"       >> $GITHUB_OUTPUT
          echo "version=${VERSION}" >> $GITHUB_OUTPUT
          echo "kind=${KIND}"       >> $GITHUB_OUTPUT
          echo "cask=${CASK}"       >> $GITHUB_OUTPUT

      - name: Download sha256 from release
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          TAG="${GITHUB_REF_NAME}"
          CASK="${{ steps.meta.outputs.cask }}"
          VERSION="${{ steps.meta.outputs.version }}"
          ASSET="${CASK}-${VERSION}-darwin-arm64.zip"
          gh release download "$TAG" --pattern "${ASSET}.sha256" --dir .
          echo "sha256=$(cat "${ASSET}.sha256")" >> $GITHUB_OUTPUT
        id: hash

      - name: Checkout tap repo
        uses: actions/checkout@<pinned-sha>  # v6
        with:
          repository: forwardimpact/homebrew-tap
          token: ${{ secrets.HOMEBREW_TAP_PAT }}
          path: tap

      - name: Configure git identity
        working-directory: tap
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

      - name: Update cask
        env:
          CASK:    ${{ steps.meta.outputs.cask }}
          NAME:    ${{ steps.meta.outputs.name }}
          VERSION: ${{ steps.meta.outputs.version }}
          SHA256:  ${{ steps.hash.outputs.sha256 }}
        run: |
          # Only the version and sha256 are updated per release; the rest of
          # the cask body lives in the tap repo (see Step 3) and is not
          # regenerated from this workflow. This avoids clobbering per-cask
          # differences (e.g. the shared fit-services / fit-utilities casks'
          # multi-binary stanza lists, and product casks' depends_on graph).
          CASK_FILE="tap/Casks/${CASK}.rb"
          sed -i \
            -e "s|^  version \".*\"|  version \"${VERSION}\"|" \
            -e "s|^  sha256 \".*\"|  sha256 \"${SHA256}\"|" \
            "$CASK_FILE"

      - name: Open PR
        working-directory: tap
        env:
          GH_TOKEN: ${{ secrets.HOMEBREW_TAP_PAT }}
        run: |
          CASK="${{ steps.meta.outputs.cask }}"
          VERSION="${{ steps.meta.outputs.version }}"
          BRANCH="update/${CASK}-${VERSION}"
          git checkout -b "$BRANCH"
          git add "Casks/${CASK}.rb"
          git commit -m "Update ${CASK} to ${VERSION}"
          git push origin "$BRANCH"
          gh pr create \
            --title "Update ${CASK} to ${VERSION}" \
            --body "Automated cask update from monorepo release ${GITHUB_REF_NAME}." \
            --base main
```

### Workflow changes from design

The design's table shows a 3-job structure with a 7-CLI matrix `build` job, a
separate `release-assets` job, and a `tap-pr` job. This plan simplifies to 2
jobs:

- **`build`** (macos-14) — builds the single tagged CLI, runs `--help` smoke
  test, creates the release, and uploads the asset. Collapsing build + release
  into one job avoids artifact transfer and a second macOS runner.
- **`tap-pr`** (ubuntu-latest) — downloads the sha256 sidecar from the release
  and opens a cask-update PR. Runs on cheap Linux since it only does git + gh
  operations.

### Cask update approach

The workflow updates only `version` and `sha256` lines in place via `sed -i`. It
does **not** regenerate the full cask body. Rationale: the eight casks (six
product + `fit-services` + `fit-utilities`) differ from each other in ways the
release workflow shouldn't re-derive every tag — product casks declare a
`depends_on cask:` list pointing at the shared-bundle casks, and the two shared
casks enumerate many `binary` stanza lines (one per Mach-O they expose). Those
structural pieces live in the tap repo (seeded by Step 3) and are edited there
by humans when the bundle contents change. The release workflow's responsibility
is narrow: bump the version string and hash when a new `.app.zip` ships.

### Livecheck strategy

Casks use `strategy :github_releases` (not `:github_latest`). The
`:github_latest` strategy checks only the single "latest" release, which may
belong to a different CLI. `:github_releases` scans all releases and applies the
per-CLI regex.

### Interaction with existing workflows

- `publish-npm.yml` fires on the same `*@v*` tag pattern. Both workflows run in
  parallel — no coordination needed.
- `publish-macos.yml` fires only on `basecamp@v*` and also calls
  `gh release create`. For `basecamp@v*` tags, both workflows may race to create
  the release. Both use `--clobber` / `2>/dev/null || ...` to handle the race
  idempotently — whichever creates first wins, the other uploads to it.

### Action SHA pins

Resolve at implementation time from versions already in use:

| Action             | Current pin source                  |
| ------------------ | ----------------------------------- |
| `actions/checkout` | `publish-npm.yml`: `de0fac2e…` (v6) |

No `upload-artifact`/`download-artifact` needed — the simplified 2-job workflow
uses `gh release download` instead of artifact transfer.

### Secret: `HOMEBREW_TAP_PAT`

A GitHub Personal Access Token (classic) scoped to `repo` on
`forwardimpact/homebrew-tap`. Must be added to the monorepo's repository secrets
before the first release tag. Add a comment in the workflow documenting the
scope and rotation cadence.

### Files

| File                                 | Action  |
| ------------------------------------ | ------- |
| `.github/workflows/publish-brew.yml` | Created |

### Verification

- Push a test tag (e.g. `pathway@v0.0.0-test.1`) and verify:
  1. Single bundle (`fit-pathway.app`) built, no other bundles touched.
  2. Release created with asset name
     `fit-pathway-0.0.0-test.1-darwin-arm64.zip`.
  3. `codesign --verify --deep --strict` passes in CI log.
  4. `--help` smoke test exits 0.
  5. Tap PR opens and updates only `version` and `sha256` lines in
     `Casks/fit-pathway.rb`; `depends_on cask:`, `binary`, and `livecheck`
     stanzas are preserved unchanged.
- Repeat with `services@v0.0.0-test.1` and `utilities@v0.0.0-test.1` to cover
  the shared-bundle paths.
- Delete test tags and releases after verification.

## Step 2b — Verify basecamp's TCC responsibility chain

Before shipping any real `basecamp@v*` tag through the new workflow, confirm the
shared `libmacos/scripts/build-app.sh` produces a `fit-basecamp.app` bundle that
still inherits Calendar and Contacts grants from macOS TCC.

### Actions

- Build `fit-basecamp.app` via `just build-app-product basecamp`.
- On a macOS 14+ machine that has already granted Basecamp Calendar and Contacts
  access via a previous `.pkg` install: fully uninstall the `.pkg`-installed
  Basecamp, install the newly-built `.app` via the local Homebrew cask from a
  clone of the tap (`brew install --cask ./Casks/fit-basecamp.rb`). Launch the
  app, trigger a calendar sync via the scheduler, verify no TCC prompt appears
  and the sync succeeds.
- Repeat after bumping basecamp's patch version in `package.json` and
  rebuilding + reinstalling: no re-prompt is expected because the bundle
  identifier is stable.

### Verification

```sh
# While the sync is running, tail the TCC log to confirm the responsible
# process resolves to the bundle, not to Terminal or the PATH symlink:
log stream --predicate 'subsystem == "com.apple.tcc"'
# Expect to see responsible-process lookups resolve to
# team.forwardimpact.basecamp
```

Record the test outcome in the implementation PR's description.

### Agent & parallelism

**Agent:** staff-engineer + human tester. **Parallelism:** Runs before the first
`basecamp@v*` tag is pushed through the new workflow. Blocks that tag; does not
block Step 3 or Step 4.

## Step 3 — Bootstrap Homebrew tap repository

Create the external repository `forwardimpact/homebrew-tap` with initial
structure. This step can run in parallel with steps 1–2.

### Repository structure

```
forwardimpact/homebrew-tap/
├── README.md
├── Casks/
│   ├── fit-basecamp.rb      # product casks — each depends_on the two shared casks
│   ├── fit-guide.rb
│   ├── fit-landmark.rb
│   ├── fit-map.rb
│   ├── fit-pathway.rb
│   ├── fit-summit.rb
│   ├── fit-services.rb      # shared bundle — FIT Services.app
│   └── fit-utilities.rb     # shared bundle — FIT Utilities.app
└── .github/
    └── dependabot.yml
```

### Initial cask content — product cask template

Each product cask installs a `.app` bundle, symlinks its CLI onto PATH, and
declares `depends_on cask:` on the two shared-bundle casks:

```ruby
cask "fit-pathway" do
  version "0.0.0"
  sha256 "0000000000000000000000000000000000000000000000000000000000000000"

  url "https://github.com/forwardimpact/monorepo/releases/download/pathway@v#{version}/fit-pathway-#{version}-darwin-arm64.zip"
  name "Forward Impact Pathway"
  desc "Forward Impact Pathway CLI — navigate engineering skills and careers"
  homepage "https://www.forwardimpact.team/pathway/"

  depends_on arch: :arm64
  depends_on cask: [
    "forwardimpact/tap/fit-services",
    "forwardimpact/tap/fit-utilities",
  ]

  app "fit-pathway.app", target: "Forward Impact/fit-pathway.app"
  binary "#{appdir}/Forward Impact/fit-pathway.app/Contents/MacOS/fit-pathway"

  livecheck do
    url "https://github.com/forwardimpact/monorepo/releases?q=pathway@v"
    strategy :github_releases
    regex(/^pathway@v(\d+(?:\.\d+)+)$/i)
  end

  zap trash: "~/Library/Preferences/team.forwardimpact.pathway.plist"
end
```

### Initial cask content — shared bundle cask template

`fit-services.rb` and `fit-utilities.rb` install their respective shared bundles
and enumerate every Mach-O inside `Contents/MacOS/` as a separate `binary`
stanza so all exposed CLIs land on PATH:

```ruby
cask "fit-utilities" do
  version "0.0.0"
  sha256 "0000000000000000000000000000000000000000000000000000000000000000"

  url "https://github.com/forwardimpact/monorepo/releases/download/utilities@v#{version}/fit-utilities-#{version}-darwin-arm64.zip"
  name "Forward Impact Utilities"
  desc "Forward Impact library CLIs — fit-codegen, fit-terrain, fit-eval, and more"
  homepage "https://www.forwardimpact.team/"

  depends_on arch: :arm64

  app "FIT Utilities.app", target: "Forward Impact/FIT Utilities.app"

  # One binary stanza per Mach-O the bundle exposes. Keeping this list
  # explicit (rather than globbing in the cask) makes the PATH surface
  # reviewable in code review when the utility set changes.
  binary "#{appdir}/Forward Impact/FIT Utilities.app/Contents/MacOS/fit-codegen"
  binary "#{appdir}/Forward Impact/FIT Utilities.app/Contents/MacOS/fit-terrain"
  binary "#{appdir}/Forward Impact/FIT Utilities.app/Contents/MacOS/fit-eval"
  binary "#{appdir}/Forward Impact/FIT Utilities.app/Contents/MacOS/fit-doc"
  binary "#{appdir}/Forward Impact/FIT Utilities.app/Contents/MacOS/fit-rc"
  binary "#{appdir}/Forward Impact/FIT Utilities.app/Contents/MacOS/fit-xmr"
  binary "#{appdir}/Forward Impact/FIT Utilities.app/Contents/MacOS/fit-storage"
  binary "#{appdir}/Forward Impact/FIT Utilities.app/Contents/MacOS/fit-logger"
  binary "#{appdir}/Forward Impact/FIT Utilities.app/Contents/MacOS/fit-svscan"
  binary "#{appdir}/Forward Impact/FIT Utilities.app/Contents/MacOS/fit-trace"
  binary "#{appdir}/Forward Impact/FIT Utilities.app/Contents/MacOS/fit-visualize"
  binary "#{appdir}/Forward Impact/FIT Utilities.app/Contents/MacOS/fit-query"
  binary "#{appdir}/Forward Impact/FIT Utilities.app/Contents/MacOS/fit-subjects"
  binary "#{appdir}/Forward Impact/FIT Utilities.app/Contents/MacOS/fit-process-graphs"
  binary "#{appdir}/Forward Impact/FIT Utilities.app/Contents/MacOS/fit-process-resources"
  binary "#{appdir}/Forward Impact/FIT Utilities.app/Contents/MacOS/fit-process-vectors"
  binary "#{appdir}/Forward Impact/FIT Utilities.app/Contents/MacOS/fit-search"
  binary "#{appdir}/Forward Impact/FIT Utilities.app/Contents/MacOS/fit-unary"
  binary "#{appdir}/Forward Impact/FIT Utilities.app/Contents/MacOS/fit-tiktoken"
  binary "#{appdir}/Forward Impact/FIT Utilities.app/Contents/MacOS/fit-download-bundle"

  livecheck do
    url "https://github.com/forwardimpact/monorepo/releases?q=utilities@v"
    strategy :github_releases
    regex(/^utilities@v(\d+(?:\.\d+)+)$/i)
  end

  zap trash: "~/Library/Preferences/team.forwardimpact.utilities.plist"
end
```

`fit-services.rb` follows the same shape with five `binary` stanzas for the gRPC
servers (`fit-svc{graph,mcp,pathway,trace,vector}`).

Each product cask gets a tailored `desc` matching the product tagline from its
Overview page. The all-zero `sha256` placeholder is safe — no release asset
exists at `v0.0.0`, so `brew install` would fail with a download error, not an
integrity bypass. The placeholder's quoted-string form matches the shape Step
2's `sed -i` cask-update edits on first release, so the initial `version` /
`sha256` bump is mechanical.

### README.md content

Brief: what the tap is, how to use it, Gatekeeper caveat, link to npm as
alternative.

### This step is manual

The tap repository is external — it cannot be created by a monorepo PR. The
implementer creates it via `gh repo create forwardimpact/homebrew-tap --public`,
pushes the initial structure, and adds the `HOMEBREW_TAP_PAT` secret to the
monorepo. Both the tap repo and the secret must exist before the first release
tag is pushed.

### Verification

```sh
brew tap forwardimpact/tap
brew info forwardimpact/tap/fit-pathway
# Expect: cask metadata displayed, version 0.0.0
```

## Step 4 — Product overview documentation

Add a brew install section to each of the six product Overview pages and to the
codegen internals page. Each page gets a "Getting Started" section update
showing both npm and brew paths.

### Pattern

For each product overview page, add a brew install block immediately after the
existing npm install block in the "Getting Started" section:

**Before** (example from `website/pathway/index.md`):

````md
## Getting Started

```sh
npm install @forwardimpact/pathway
npx fit-pathway dev
````

````

**After:**

```md
## Getting Started

### Install via npm

```sh
npm install @forwardimpact/pathway
npx fit-pathway dev
````

### Install via Homebrew (macOS arm64)

```sh
brew tap forwardimpact/tap
brew install --cask forwardimpact/tap/fit-pathway
fit-pathway dev
```

Installing any product cask automatically pulls in the shared `fit-services` and
`fit-utilities` casks via `depends_on`. The `fit-pathway.app` bundle lands in
`/Applications/Forward Impact/` and the `fit-pathway` CLI is symlinked onto
`PATH`.

> **Unsigned bundle.** This bundle is ad-hoc signed but not yet Developer ID
> signed or notarized. macOS will show a Gatekeeper warning on first launch for
> each newly-installed bundle (the product bundle plus the two shared bundles).
> To allow them: open **System Settings → Privacy & Security → Open Anyway**.
> Once approved, TCC permission grants and Gatekeeper approvals persist across
> `brew upgrade` — you won't be re-prompted. A follow-up release will add
> Developer ID signing to skip the Gatekeeper step entirely.

````

### fit-guide special case

The Guide overview page currently shows a three-step npm install (install →
codegen → init). The brew section omits the codegen step:

```md
### Install via Homebrew (macOS arm64)

```sh
brew tap forwardimpact/tap
brew install --cask forwardimpact/tap/fit-guide
fit-guide init
````

Generated gRPC clients are bundled into the brew binary — no `fit-codegen` step
needed. The gRPC service bundles (graph, mcp, pathway, trace, vector) install
via the `fit-services` shared cask pulled in by `depends_on`.

````

### fit-codegen and other library CLIs

`fit-codegen` is a library, not a product — it has no Overview page under
`website/`. It is installed alongside every other library CLI by the
`fit-utilities` shared cask. Its brew availability is documented in the
[Codegen Internals](../../website/docs/internals/codegen/index.md) page:

```md
### Install via Homebrew (macOS arm64)

External users on macOS can install fit-codegen standalone via the
shared Utilities bundle:

```sh
brew tap forwardimpact/tap
brew install --cask forwardimpact/tap/fit-utilities
fit-codegen --all
````

Installing any product cask (e.g. `fit-guide`) also installs `fit-utilities`
automatically via `depends_on`.

```

### Files

| File | Action |
| ---- | ------ |
| `website/map/index.md` | Modified — add brew install section |
| `website/pathway/index.md` | Modified — add brew install section |
| `website/basecamp/index.md` | Modified — add brew install section |
| `website/guide/index.md` | Modified — add brew install section (no codegen) |
| `website/landmark/index.md` | Modified — add brew install section |
| `website/summit/index.md` | Modified — add brew install section |
| `website/docs/internals/codegen/index.md` | Modified — add brew install section |

### Verification

- `just docs-build` completes without errors.
- Manual review: each page shows both install paths, Gatekeeper caveat present,
  Guide page omits codegen step.
- SC7 (npm unchanged): no files in `products/*/bin/` or `products/*/package.json`
  are modified by this plan. Existing `publish-npm.yml` and CI quality checks
  exercise the npm path — no new verification needed.

### Agent & parallelism

**Agent:** technical-writer.
**Parallelism:** Can start once the tap path (`forwardimpact/tap`) and
cask names (e.g. `fit-pathway`, `fit-utilities`) are fixed by Step 3.
Runs in parallel with Steps 1b–2; does not block any tag push.

## Risks

1. **Binary size.** Each binary embeds the bun runtime (~60 MB) plus bundled
   dependencies. Neither spec nor design pins an acceptance ceiling; size is
   treated as observable, not gated. If a bundle grows enough to affect
   Homebrew download times or cask-upgrade reliability, revisit in a
   follow-up and propose a ceiling there.
2. **Symlink resolution.** The `generated/` symlink in `librpc/src/generated` →
   `<repo>/generated/` must be resolved by bun's bundler at compile time.
   Confirmed working by basecamp's `build-scheduler` recipe
   (`products/basecamp/justfile:35`). Detectable in Step 1b verification if
   it ever regresses.
3. **Tag collision.** `publish-brew.yml` and `publish-npm.yml` both fire on
   `*@v*`. They're independent, but if `publish-brew.yml` fails, the npm release
   ships without a brew release. Mitigation: the tap PR is the human gate — a
   failed workflow is visible and retriggerable.
4. **Release creation race.** For `basecamp@v*` tags, `publish-macos.yml` also
   creates a release. Both workflows handle the race idempotently (create-or-
   reuse pattern). For all other CLIs, `publish-brew.yml` is the sole release
   creator.
5. **`HOMEBREW_TAP_PAT` rotation.** The PAT is a long-lived credential scoped
   to `forwardimpact/homebrew-tap` only. A comment in the workflow documents the
   scope. Classic PATs expire after at most 1 year — add a rotation reminder.
6. **Gatekeeper friction.** Unsigned binaries require manual approval on first
   run. Mitigation: every Overview page carries the caveat with step-by-step
   instructions. Signing is explicitly deferred per spec.
7. **Cold-start performance.** Neither spec nor design pins a `--help`
   startup budget. CI smoke-tests `--help` for correctness; any regression
   large enough to affect interactive feel is expected to surface in
   manual acceptance testing on dedicated hardware before release.
8. **SC5 acceptance.** The CI smoke test runs `--help` only. Full SC5 coverage
   (every user-visible Guide command works without codegen) requires manual
   acceptance testing on a clean macOS machine with no Node/Bun on PATH. The
   implementer should document the acceptance test results.
9. **Bundle cdhash stability depends on deterministic builds.** Bun's
   `--compile` is not guaranteed deterministic across bun versions (embedded
   runtime may shift), and `codesign --deep` signs in directory-order. A
   rotating cdhash wipes TCC grants on `brew upgrade`. Mitigated by pinning
   the bun version in CI and adding a check that rebuilds twice and diffs the
   bundle cdhash; a mismatch fails the release.
10. **Moving `posix-spawn.js` and `build-app.sh` could break basecamp.**
    Both files currently live in `products/basecamp/` and Step 1a relocates
    them to `libraries/libmacos/`. Mitigated by Step 1a running basecamp's
    full test suite plus Step 2b's manual TCC verification on hardware
    before any `basecamp@v*` tag is pushed through the new workflow.
11. **Symlink-from-Terminal TCC responsibility.** PATH symlinks into
    `.app` bundles make Terminal the TCC-responsible process when a CLI
    is invoked interactively. No current non-basecamp CLI requests TCC
    resources, so this is latent; if a future product needs TCC from a
    Terminal invocation it must ship its own self-disclaim logic using
    `libraries/libmacos/src/posix-spawn.js`.

## Libraries used

**New library introduced by this plan:**

- `@forwardimpact/libmacos` — owns `posix-spawn.js`, `tcc-responsibility.js`,
  `build-app.sh`, `sign-app.sh`, and the Info.plist / entitlements templates.
  Darwin-only (`"os": ["darwin"]`). Created in Step 1a; consumed by every
  bundle-assembly recipe.

Existing libraries consumed transitively (via the CLIs being compiled):

- `@forwardimpact/librpc` — gRPC clients (guide, services/*)
- `@forwardimpact/libcodegen` — code generation (fit-codegen itself)
- All other `@forwardimpact/lib*` packages in each CLI's dependency tree are
  bundled by `bun build --compile` — no new dependencies introduced.

Build toolchain: `bun >= 1.3.11` (pinned in `.github/actions/bootstrap`),
`just` (installed by `scripts/bootstrap.sh`), `gh`, `ditto` (macOS native),
`codesign` (Xcode command-line tools).

## Execution

**Agent:** `staff-engineer` for Steps 1a, 1b, 2, 3 (libmacos, justfile,
workflow, tap bootstrap); `staff-engineer + human tester` for Step 2b
(hardware TCC verification); `technical-writer` for Step 4 (documentation).

**Parallelism:**

- Step 1a is first and blocks everything bundle-related.
- Step 1b → Step 2 are strictly sequential after Step 1a (the workflow
  invokes the recipes).
- Step 3 (tap bootstrap) can run in parallel with Steps 1a–2 since it
  creates an external repo with placeholder casks.
- Step 4 (docs) can start once the tap path (`forwardimpact/tap`) is
  known (it is — from the design).
- Step 2b runs on hardware before the first `basecamp@v*` tag is pushed
  through the new workflow. Blocks that tag only.

**PR boundaries:**

- Step 1a (libmacos extraction + basecamp migration) in its own monorepo
  PR — this is a refactor that should land and bake before the bundle
  pipeline lights up on top of it.
- Steps 1b–2 in a second monorepo PR (justfile recipes + workflow).
- Step 3 is a manual external repo creation.
- Step 4 in a third monorepo PR (docs only).

**Ordering constraint:** The tap repo (Step 3) and `HOMEBREW_TAP_PAT`
secret must both exist before the first release tag triggers the
workflow. Step 2b must pass before the first `basecamp@v*` tag.
Coordinate with the release engineer.

**Recommended:** Staff engineer implements Step 1a and opens the first
PR, then Steps 1b–2 in the second PR, then creates the tap repo (Step
3) manually. Technical writer starts Step 4 once the tap path is
confirmed. Step 2b runs on hardware immediately before the first
basecamp release.
```
