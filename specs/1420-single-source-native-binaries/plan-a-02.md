# Plan 1420-a-02 — CLI manifest + justfile + docs

Part 2 of [plan 1420-a](plan-a.md). Introduces the single-source-of-truth build
set and collapses the bespoke 0600 enumeration recipes onto it. Branch off
`origin/main`; depends on [Part 01](plan-a-01.md) for the shared
`fit-outpost` binary's version.

Libraries used: libmacos (`scripts/build-app.sh`, consumed unchanged).

## Step 1 — Create the CLI-set manifest

Add the one authoritative list of the distributable build set: 6 product CLIs +
25 gear CLIs + `fit-wiki`, each with its targets and a bundle tag (`.app`
membership; `null` = native channel only).

- Created: `build/cli-manifest.json`

```json
{
  "clis": [
    { "name": "fit-map",                "targets": ["bun-linux-x64", "bun-darwin-arm64"], "bundle": "map" },
    { "name": "fit-pathway",            "targets": ["bun-linux-x64", "bun-darwin-arm64"], "bundle": "pathway" },
    { "name": "fit-guide",              "targets": ["bun-linux-x64", "bun-darwin-arm64"], "bundle": "guide" },
    { "name": "fit-landmark",           "targets": ["bun-linux-x64", "bun-darwin-arm64"], "bundle": "landmark" },
    { "name": "fit-summit",             "targets": ["bun-linux-x64", "bun-darwin-arm64"], "bundle": "summit" },
    { "name": "fit-outpost",            "targets": ["bun-linux-x64", "bun-darwin-arm64"], "bundle": "outpost" },
    { "name": "fit-svcgraph",           "targets": ["bun-linux-x64", "bun-darwin-arm64"], "bundle": "gear" },
    { "name": "fit-svcmcp",             "targets": ["bun-linux-x64", "bun-darwin-arm64"], "bundle": "gear" },
    { "name": "fit-svcpathway",         "targets": ["bun-linux-x64", "bun-darwin-arm64"], "bundle": "gear" },
    { "name": "fit-svctrace",           "targets": ["bun-linux-x64", "bun-darwin-arm64"], "bundle": "gear" },
    { "name": "fit-svcvector",          "targets": ["bun-linux-x64", "bun-darwin-arm64"], "bundle": "gear" },
    { "name": "fit-codegen",            "targets": ["bun-linux-x64", "bun-darwin-arm64"], "bundle": "gear" },
    { "name": "fit-terrain",            "targets": ["bun-linux-x64", "bun-darwin-arm64"], "bundle": "gear" },
    { "name": "fit-eval",               "targets": ["bun-linux-x64", "bun-darwin-arm64"], "bundle": "gear" },
    { "name": "fit-doc",                "targets": ["bun-linux-x64", "bun-darwin-arm64"], "bundle": "gear" },
    { "name": "fit-rc",                 "targets": ["bun-linux-x64", "bun-darwin-arm64"], "bundle": "gear" },
    { "name": "fit-xmr",                "targets": ["bun-linux-x64", "bun-darwin-arm64"], "bundle": "gear" },
    { "name": "fit-storage",            "targets": ["bun-linux-x64", "bun-darwin-arm64"], "bundle": "gear" },
    { "name": "fit-logger",             "targets": ["bun-linux-x64", "bun-darwin-arm64"], "bundle": "gear" },
    { "name": "fit-svscan",             "targets": ["bun-linux-x64", "bun-darwin-arm64"], "bundle": "gear" },
    { "name": "fit-trace",              "targets": ["bun-linux-x64", "bun-darwin-arm64"], "bundle": "gear" },
    { "name": "fit-visualize",          "targets": ["bun-linux-x64", "bun-darwin-arm64"], "bundle": "gear" },
    { "name": "fit-query",              "targets": ["bun-linux-x64", "bun-darwin-arm64"], "bundle": "gear" },
    { "name": "fit-subjects",           "targets": ["bun-linux-x64", "bun-darwin-arm64"], "bundle": "gear" },
    { "name": "fit-process-graphs",     "targets": ["bun-linux-x64", "bun-darwin-arm64"], "bundle": "gear" },
    { "name": "fit-process-resources",  "targets": ["bun-linux-x64", "bun-darwin-arm64"], "bundle": "gear" },
    { "name": "fit-process-vectors",    "targets": ["bun-linux-x64", "bun-darwin-arm64"], "bundle": "gear" },
    { "name": "fit-search",             "targets": ["bun-linux-x64", "bun-darwin-arm64"], "bundle": "gear" },
    { "name": "fit-unary",              "targets": ["bun-linux-x64", "bun-darwin-arm64"], "bundle": "gear" },
    { "name": "fit-tiktoken",           "targets": ["bun-linux-x64", "bun-darwin-arm64"], "bundle": "gear" },
    { "name": "fit-download-bundle",    "targets": ["bun-linux-x64", "bun-darwin-arm64"], "bundle": "gear" },
    { "name": "fit-wiki",               "targets": ["bun-linux-x64", "bun-darwin-arm64"], "bundle": null }
  ]
}
```

`fit-svcgraph` is first among `gear` entries so it remains the gear bundle's
`--primary-exec` (the CLI `publish-brew.yml`'s gear smoke test invokes).

Verify: `jq -e '.clis | length == 32' build/cli-manifest.json` exits 0, and
every `.name` resolves:
`jq -r '.clis[].name' build/cli-manifest.json | while read c; do just build-binary "$c" bun-linux-x64 >/dev/null; done`
exits 0.

## Step 2 — Replace the enumeration recipes with a manifest-driven `build-all`

Delete `build-binaries`, `build-product-binaries`, `build-gear-binaries`, and
`build-apps`; add a single `build-all` recipe that derives its CLI set from the
manifest. No surviving recipe references a removed one or carries a build
enumeration.

- Modified: `justfile`

Remove justfile lines 225–264 (`build-binaries` + `build-product-binaries` +
`build-gear-binaries`) and 327–335 (`build-apps`). Add:

```makefile
# Build every distributable binary for TARGET, driven by build/cli-manifest.json
build-all TARGET="bun-darwin-arm64": codegen
    #!/usr/bin/env bash
    set -euo pipefail
    jq -r --arg t "{{TARGET}}" \
      '.clis[] | select(.targets | index($t)) | .name' build/cli-manifest.json \
      | while read -r CLI; do just build-binary "$CLI" "{{TARGET}}"; done
```

`build-binary` (lines 192–223) is unchanged — it stays the sole compile
primitive and sole binary-build entry point.

Verify:
`rg -n 'build-binaries|build-product-binaries|build-gear-binaries|build-apps' justfile`
returns nothing; `just build-all bun-linux-x64` compiles all 32 binaries into
`dist/binaries/`.

## Step 3 — Drive `build-app-gear` from the manifest

Replace `build-app-gear`'s inline 25-CLI `--extra-exec` list with the gear
subset of the manifest, keeping its irreducible packaging config (plist,
entitlements, version, out-dir).

- Modified: `justfile`

Replace `build-app-gear` including its preceding comment (lines 293–325) with:

```makefile
# Assemble dist/apps/fit-gear.app — bundles the manifest's gear CLI subset
build-app-gear:
    #!/usr/bin/env bash
    set -euo pipefail
    mapfile -t GEAR < <(jq -r '.clis[] | select(.bundle == "gear") | .name' build/cli-manifest.json)
    ARGS=(--bundle-name "fit-gear" --primary-exec "dist/binaries/${GEAR[0]}")
    for CLI in "${GEAR[@]:1}"; do ARGS+=(--extra-exec "dist/binaries/$CLI"); done
    ARGS+=(
      --info-plist "macos/gear/Info.plist"
      --entitlements "macos/gear/entitlements.plist"
      --version "$(jq -r .version package.json)"
      --out-dir dist/apps
    )
    bash libraries/libmacos/scripts/build-app.sh "${ARGS[@]}"
```

Verify (macOS):
`jq '[.clis[]|select(.bundle=="gear")]|length' build/cli-manifest.json` is
exactly 25; `just build-all bun-darwin-arm64 && just build-app-gear` produces
`dist/apps/fit-gear.app` whose `Contents/MacOS/` holds those 25 gear binaries
with `fit-svcgraph` as the primary exec.

## Step 4 — Make `build-app-product` outpost consume the shared binary

Stop `build-app-product`'s outpost path from compiling the scheduler; build only
the Swift launcher and bundle the shared `dist/binaries/fit-outpost` as the
extra exec. The non-outpost branch is unchanged.

- Modified: `justfile`

Replace the outpost branch of `build-app-product` (lines 270–282) so it reads:

```makefile
    if [ "{{NAME}}" = "outpost" ]; then
      (cd products/outpost && bun pkg/build.js --launcher)
      bash libraries/libmacos/scripts/build-app.sh \
        --bundle-name "fit-outpost" \
        --primary-exec "products/outpost/dist/Outpost" \
        --extra-exec "dist/binaries/fit-outpost" \
        --info-plist "products/outpost/macos/Info.plist" \
        --entitlements "products/outpost/macos/Outpost.entitlements" \
        --resource "products/outpost/config" \
        --resource "products/outpost/templates" \
        --resource "design/fit/assets/icon-outpost.svg" \
        --version "$(jq -r .version products/outpost/package.json)" \
        --out-dir dist/apps
    else
```

Only the launcher invocation (`bun pkg/build.js --launcher` instead of
`just build`) and the `--extra-exec` source (`dist/binaries/fit-outpost`
instead of `products/outpost/dist/fit-outpost`) change; the launcher remains the
bundle's primary exec.

This recipe is `outpost-determinism-probe.yml`'s build path, but that probe's
`paths:` filter (lines 6–9) only watches `products/outpost/**`,
`libraries/libmacos/**`, and the probe file — **not** `justfile` — so it would
not auto-run on this justfile-only change. Add `justfile` to that filter in the
same step so the cdhash gate fires on PRs that touch the outpost-app recipe:

```yaml
    paths:
      - "products/outpost/**"
      - "libraries/libmacos/**"
      - "justfile"
      - ".github/workflows/outpost-determinism-probe.yml"
```

- Also modified: `.github/workflows/outpost-determinism-probe.yml`

Verify (macOS):
`just build-binary fit-outpost bun-darwin-arm64 && just build-app-product outpost`
produces `dist/apps/fit-outpost.app`; the probe now triggers on this PR and its
two-build cdhash comparison passes.

## Step 5 — Update the release-internals doc

Point the gear-CLI maintenance note at the manifest, since both
`build-gear-binaries` and `build-app-gear`'s inline list no longer enumerate the
set.

- Modified: `websites/fit/docs/internals/release/index.md`

Replace lines 68–70:

```md
When a library or service CLI is added or removed, update `build/cli-manifest.json`
(the single source of truth for the build set, from which `build-app-gear` now
derives the gear bundle's membership) and the `binary` stanzas in
`Casks/fit-gear.rb` in the tap repo.
```

The cask→PATH mapping table (lines 58–66) stays as-is: it is human-facing
documentation mirroring the tap repo's human-edited cask `binary` stanzas, not a
build input, so it is not a second build-set enumeration in the spec's sense.

Verify:
`rg -n 'build-gear-binaries|build-product-binaries|build-binaries\b' websites/fit/docs/internals/release/index.md`
returns nothing, and the surviving `build-app-gear` mention reads as
manifest-derived (no inline CLI list beside it).

## Risks

- `build-app-gear`'s primary exec is positional (`GEAR[0]`); if the manifest's
  gear order is edited so `fit-svcgraph` is no longer first,
  `publish-brew.yml`'s gear smoke test (`fit-svcgraph --help`) and the cask's
  primary binary diverge. Keep `fit-svcgraph` first.
