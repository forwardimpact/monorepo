# Plan 1420-a-03 — Native channel + workflow rewire

Part 3 of [plan 1420-a](plan-a.md). Adds the reusable build workflow and the
public native channel, rewires both macOS publish workflows onto shared
artifacts, and retires Outpost's duplicate scheduler compile. Branch off
`origin/main`; depends on [Part 01](plan-a-01.md) (smoke gate passes) and
[Part 02](plan-a-02.md) (matrix reads the manifest).

Libraries used: none.

Pin every action to a full commit SHA per repo convention. SHAs already in use:
`actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6`,
`actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4`,
`forwardimpact/fit-bootstrap@v1`. The snippets below use the literal token
`PIN_DOWNLOAD_ARTIFACT_V4` everywhere `actions/download-artifact` appears —
**resolve it once** and pin all three occurrences identically before applying.
Get the v4 SHA with:

```sh
gh api repos/actions/download-artifact/git/ref/tags/v4 --jq .object.sha
```

(Dereference to the commit if it returns a tag object.) The YAML will not run
until every `PIN_DOWNLOAD_ARTIFACT_V4` is replaced with that SHA + `# v4`.

## Step 1 — Add `build-binaries.yml` reusable workflow

Single source of build logic: a `workflow_call` matrix over (CLI × requested
target) that compiles, gates by executing the binary, and uploads each binary +
checksum keyed `{cli}-{target}`.

- Created: `.github/workflows/build-binaries.yml`

```yaml
name: "Build: Binaries"

on:
  workflow_call:
    inputs:
      targets:
        description: "JSON array of bun targets to build (subset of the manifest's)."
        type: string
        required: true

permissions:
  contents: read

jobs:
  matrix:
    runs-on: ubuntu-latest
    outputs:
      cells: ${{ steps.gen.outputs.cells }}
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6
      - id: gen
        env:
          TARGETS: ${{ inputs.targets }}
        run: |
          CELLS=$(jq -c --argjson req "$TARGETS" '
            [ .clis[] as $c | $c.targets[]
              | select(. as $t | $req | index($t))
              | { cli: $c.name, target: .,
                  os: (if . == "bun-linux-x64" then "ubuntu-latest" else "macos-14" end) } ]
          ' build/cli-manifest.json)
          # Fail loudly on a bad `targets` input rather than emit an empty
          # matrix that silently skips every build.
          test "$(jq 'length' <<<"$CELLS")" -gt 0 \
            || { echo "::error::no manifest CLI matches targets ${TARGETS}"; exit 1; }
          echo "cells={\"include\":${CELLS}}" >> "$GITHUB_OUTPUT"

  build:
    needs: matrix
    strategy:
      fail-fast: false
      matrix: ${{ fromJSON(needs.matrix.outputs.cells) }}
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6
      - uses: forwardimpact/fit-bootstrap@v1
      - name: Ensure codegen is current
        run: just codegen
      - name: Compile
        run: just build-binary "${{ matrix.cli }}" "${{ matrix.target }}"
      - name: Smoke gate
        run: |
          BIN="dist/binaries/${{ matrix.cli }}"
          # Capture stdout+stderr: a CLI that prints --help to stderr must still
          # count as non-empty output (the gate is "starts and writes output").
          OUT="$("$BIN" --help 2>&1)"
          test -n "$OUT" || { echo "::error::${{ matrix.cli }} produced no output"; exit 1; }
      - name: Checksum
        run: shasum -a 256 "dist/binaries/${{ matrix.cli }}" | awk '{print $1}' > "dist/binaries/${{ matrix.cli }}.sha256"
      - uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4
        with:
          name: "${{ matrix.cli }}-${{ matrix.target }}"
          path: |
            dist/binaries/${{ matrix.cli }}
            dist/binaries/${{ matrix.cli }}.sha256
          if-no-files-found: error
```

The `--help` gate is the universal "starts and produces output" check (spec
criterion #2). It catches the `fit-codegen` and `fit-outpost` failures because
both manifest today as **startup** failures — the binary exits before arg
parsing, so any invocation including `--help` reproduces them. `--help` is a
pure print-and-exit for every CLI in the manifest because all are libcli
`createCli` binaries (libcli short-circuits `--help`/`--version` before any
dispatch or server start, so the five `fit-svc*` CLIs do not bind a port); a
hypothetical hanging `--help` would time the cell out and surface, not mask, the
problem. The deeper `fit-codegen` proto-resolution path is additionally proven
by Part 01's `--all` verify before it ever reaches this gate.

Verify: a PR carrying this file plus a temporary caller (or `publish-native.yml`
from Step 2) runs the matrix; the `fit-codegen` and `fit-outpost` cells pass the
smoke gate (they would fail before Part 01).

## Step 2 — Add `publish-native.yml`

Public raw-binary channel: build all targets through the reusable workflow, then
attach every binary + checksum to the release.

- Created: `.github/workflows/publish-native.yml`

```yaml
name: "Publish: Native"

on:
  push:
    tags: ["native@v*"]

permissions:
  contents: read

jobs:
  binaries:
    permissions:
      contents: read
    uses: ./.github/workflows/build-binaries.yml
    with:
      targets: '["bun-linux-x64", "bun-darwin-arm64"]'

  release:
    needs: binaries
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/download-artifact@PIN_DOWNLOAD_ARTIFACT_V4 # v4
        with:
          path: dist/binaries
          merge-multiple: true
      - name: Create or reuse GitHub Release
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          gh release create "$GITHUB_REF_NAME" --repo "$GITHUB_REPOSITORY" \
            --title "$GITHUB_REF_NAME" --generate-notes 2>/dev/null \
            || echo "Release $GITHUB_REF_NAME already exists"
      - name: Restore executable bit and upload binaries + checksums
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          # actions/upload-artifact does not preserve the POSIX executable bit;
          # restore it so downstream consumers receive runnable binaries (the
          # `.sha256` siblings stay non-executable text).
          find dist/binaries -type f ! -name '*.sha256' -exec chmod +x {} +
          gh release upload "$GITHUB_REF_NAME" --repo "$GITHUB_REPOSITORY" --clobber dist/binaries/*
```

`native@v*` does not collide with `publish-brew.yml`'s tag allowlist (it lists
only `gear@v*` and the six product tags).

Verify: pushing a `native@v*` tag produces a release carrying one binary per
CLI-per-target (32 × 2 = 64) plus a `.sha256` beside each.

## Step 3 — Rewire `publish-brew.yml` onto shared artifacts

Source macOS binaries from `build-binaries.yml` instead of compiling
in-workflow; keep the `.app` wrap, codesign, cdhash-stability check, and cask
PR.

- Modified: `.github/workflows/publish-brew.yml`

Add a leading reusable-workflow job and make `build` consume its artifacts.
Replace **only the compile** in the `build` job — the **Ensure codegen** step
(lines 51–52, now done inside `build-binaries.yml`) and the **Build bundle**
step (lines 54–65) — with an artifact download and an assembly step. The
`./.github/actions/audit` gate (line 49) is **kept**; it is a release gate, not
part of the compile:

```yaml
jobs:
  binaries:
    permissions:
      contents: read
    uses: ./.github/workflows/build-binaries.yml
    with:
      targets: '["bun-darwin-arm64"]'

  build:
    needs: binaries
    runs-on: macos-14
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6
      # ... existing "Extract bundle and version from tag" step (unchanged) ...
      - uses: forwardimpact/fit-bootstrap@v1   # for `just` + the .app recipes
      - uses: ./.github/actions/audit          # kept — release gate, unchanged
      - uses: actions/download-artifact@PIN_DOWNLOAD_ARTIFACT_V4 # v4
        with:
          pattern: "*-bun-darwin-arm64"
          path: dist/binaries
          merge-multiple: true
      - name: Assemble bundle
        run: |
          # upload-artifact drops the executable bit; restore it before wrapping.
          find dist/binaries -type f ! -name '*.sha256' -exec chmod +x {} +
          case "${{ steps.meta.outputs.kind }}" in
            gear)     just build-app-gear ;;
            product)  just build-app-product "${{ steps.meta.outputs.name }}" ;;
          esac
```

The **Build bundle** step's `just build-gear-binaries` / `just build-binary`
calls are gone (binaries arrive as artifacts; `build-app-*` consume
`dist/binaries/*` after Part 02). In **Verify cdhash stability** (lines 78–104),
keep the step but make its rebuild re-assemble the `.app` from the **same**
downloaded binaries rather than recompiling. The rebuild block (lines 86–96)
becomes:

```yaml
          rm -rf dist/apps products/outpost/dist   # keep dist/binaries (artifacts)
          case "${{ steps.meta.outputs.kind }}" in
            gear)     just build-app-gear ;;
            product)  just build-app-product "${{ steps.meta.outputs.name }}" ;;
          esac
```

`dist/binaries` is no longer deleted, so the downloaded binaries survive for the
second assembly; for the outpost product tag, `build-app-product outpost`
re-creates `products/outpost/dist` by re-running `bun pkg/build.js --launcher`
(deterministic per spec 1170) and re-consumes the preserved
`dist/binaries/fit-outpost`. The `BASELINE`/`AFTER` capture and comparison
around this block are unchanged. The **Smoke test**, **Zip bundle and hash**,
release, and **tap-pr** steps are unchanged.

Routing every brew tag through `build-binaries.yml` compiles the **full**
darwin-arm64 set (all 32 CLIs), not just the tag's CLI; the consuming job then
assembles only its own bundle. This is the design's single-build-path
consequence (design § publish-brew / publish-macos both download a subset of the
same matrix) — it is intended, not a defect, but see the Risks note on its
release-coupling cost.

Verify: a `gear@v*` build downloads the 25 gear artifacts, assembles
`fit-gear.app`, passes the codesign + cdhash-stability gate, and opens the cask
PR; a product tag does the same for its single CLI.

## Step 4 — Retire Outpost's scheduler compile in `pkg/build.js`

Remove the scheduler compile so `pkg/build.js` builds only the launcher and
assembles the `.app`/`.pkg` from a pre-supplied `dist/fit-outpost` (the shared
binary), with a guard if it is missing.

- Modified: `products/outpost/pkg/build.js`

Delete `compileScheduler()` (it `bun build --compile`s `src/outpost.js`).
Change the CLI flag logic (lines 167–186) so `scheduler` is gone and
`app`/`pkg` imply only `launcher`, and guard `buildApp()` on the binary's
presence:

```js
const all = args.length === 0;
const want = {
  launcher: all || args.includes("--launcher"),
  app: args.includes("--app") || args.includes("--pkg"),
  pkg: args.includes("--pkg"),
};
if (want.app || want.pkg) want.launcher = true;

console.log(`Outpost Build (v${VERSION})`);
console.log("==========================");
if (want.launcher) compileLauncher();
if (want.app) buildApp();
if (want.pkg) buildPKG();
```

At the top of `buildApp()`, fail fast if the shared binary is absent:

```js
  if (!existsSync(join(DIST_DIR, APP_NAME))) {
    throw new Error(
      `${APP_NAME} binary not found in dist/ — build it with \`just build-binary fit-outpost\` or supply it from the native build before assembling the app.`,
    );
  }
```

The `--scheduler` flag no longer exists; the shared `just build-binary
fit-outpost` is the only `fit-outpost` compile. Update the usage comment block
(lines 5–10) to drop `--scheduler`.

Verify: `bun pkg/build.js --launcher` builds only `dist/Outpost`;
`bun pkg/build.js --app` errors clearly when `dist/fit-outpost` is absent and
succeeds once it is present.

## Step 5 — Rewire `publish-macos.yml` onto the shared `fit-outpost`

Source the single `fit-outpost` binary from `build-binaries.yml`, place it where
`pkg/build.js` expects it, then build the launcher and `.pkg`/`.app`.

- Modified: `.github/workflows/publish-macos.yml`

Add the reusable-workflow job and rewire the build job's compile step:

```yaml
jobs:
  binaries:
    permissions:
      contents: read
    uses: ./.github/workflows/build-binaries.yml
    with:
      targets: '["bun-darwin-arm64"]'

  build:
    needs: binaries
    runs-on: macos-14
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6
      # ... existing "Extract version from tag" step (unchanged) ...
      - uses: forwardimpact/fit-bootstrap@v1
      - uses: ./.github/actions/audit
      - name: Run tests
        run: bun run test
      - uses: actions/download-artifact@PIN_DOWNLOAD_ARTIFACT_V4 # v4
        with:
          name: fit-outpost-bun-darwin-arm64
          path: products/outpost/dist   # workspace-root-relative → products/outpost/dist/fit-outpost
      - name: Build .pkg installer
        working-directory: products/outpost   # cwd here, so `dist/fit-outpost` == products/outpost/dist/fit-outpost
        run: |
          chmod +x dist/fit-outpost   # upload-artifact dropped the +x bit
          bun pkg/build.js --pkg      # launcher + .app + .pkg; consumes dist/fit-outpost, no scheduler compile
      # ... existing "Verify .pkg exists" + release + upload steps (unchanged) ...
```

`runs-on` moves from `macos-latest` to `macos-14` to match the build job's
runner (cdhash-determinism parity with the other workflows). This aligns the
Swift toolchain too: `outpost-determinism-probe.yml` and `publish-brew.yml`
already build on `macos-14`, so the launcher's determinism profile is exercised
there — moving `publish-macos.yml` onto the same image removes the only
`outpost@v*` build still on `macos-latest`. The `just pkg` step is replaced; the
scheduler is no longer compiled here.

Verify: an `outpost@v*` build downloads the `fit-outpost` artifact, builds the
launcher and `.pkg`, and uploads the installer; the `.pkg`'s bundled scheduler
reports its version. After applying all
steps, `rg -n PIN_DOWNLOAD_ARTIFACT_V4 .github/workflows/` returns nothing — no
unresolved pin token remains in any of the three workflows.

## Risks

- **`download-artifact` directory layout.** `merge-multiple: true` flattens all
  artifacts into one directory; without it each artifact lands under its own
  `name/` subdir and `dist/binaries/<cli>` paths break. The native and brew jobs
  rely on the flattened layout; the macOS job downloads a single named artifact
  so needs only `path`.
- **Release coupling: every publish builds the full set.** Each `gear@v*`/
  product/`outpost@v*` tag now compiles all 32 darwin-arm64 binaries through the
  shared matrix and gates each on its smoke test, so an unrelated CLI's
  compile/smoke failure blocks an otherwise-healthy cask release. This is the
  design's single-build-path trade (byte-equality without cross-workflow races);
  narrowing the matrix per tag would be a design change, not a plan tweak — flag
  it if a release is ever blocked by an unrelated CLI.
- **Codegen runs per matrix cell.** Each cell runs `just codegen` before its
  compile (design § Interfaces requires the build set be codegen-current), so a
  64-cell native build runs codegen 64×. Correct but not free; do not "optimize"
  by hoisting codegen out of the matrix, as cross-target cells run on different
  runners that each need their own generated tree.
- **cdhash parity across runners.** `publish-brew.yml` and `publish-macos.yml`
  must build on the same macOS runner image the binaries were compiled on
  (`macos-14`); a runner-image mismatch between the `binaries` job and the
  consuming job can perturb the codesign cdhash. Keep both pinned to `macos-14`.
