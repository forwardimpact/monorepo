# Plan 2190-a: Homebrew on Linux

Executes [design 2190-a](design-a.md) for [spec 2190](spec.md).

## Approach

Add `bun-linux-arm64` to the build matrix behind a target→runner map, extract
the inline macOS `package` job into a reusable `package-macos.yml`
byte-for-byte, and add a parallel `package-linux.yml`. Two new `build/` scripts
hold the logic the workflows only orchestrate: `build-tarball.sh` packs a
bundle's manifest CLIs as the `binaries` job built and checksummed them (no
re-verification), and `update-formula.sh` rewrites a formula's version and
per-arch checksums. The `release` and `tap` jobs gain a `linux-packages`
artifact beside the unchanged `package-assets`. Steps 1–8 and 10 land in the
monorepo; step 9 seeds the external tap by hand and must precede the first
post-change release tag.

Libraries used: none.

## Step 1: Add the arm64 Linux build target

Compile every CLI for arm64 Linux and route that cell to an arm64 runner.

- Modified: `build/cli-manifest.json`, `.github/workflows/build-binaries.yml`

Add `"bun-linux-arm64"` to every CLI's `targets` array in the manifest. In
`build-binaries.yml`, replace the two-branch `os` ternary in the `matrix` job's
`jq` expression with a three-way map:

```jq
os: (if . == "bun-linux-x64" then "ubuntu-latest"
     elif . == "bun-linux-arm64" then "ubuntu-24.04-arm"
     else "macos-14" end)
```

Verify: run the `matrix` job's exact `jq` cell expression
(`build-binaries.yml` lines 46–53) with `TARGETS='["bun-linux-arm64"]'` and
empty `BUNDLE`; every emitted cell has `"os":"ubuntu-24.04-arm"`.

## Step 2: Add arm64 to the release build set

Make the release pipeline build the arm64 target it now knows how to route.

- Modified: `.github/workflows/publish-binaries.yml` (`binaries` job)

Change the `binaries` job's `with.targets` to
`'["bun-linux-x64", "bun-linux-arm64", "bun-darwin-arm64"]'`.

Verify: `actionlint .github/workflows/publish-binaries.yml` passes.

## Step 3: Extract macOS packaging into a reusable workflow

Lift the inline `package` job into a reusable workflow with an `arch` matrix,
preserving the signing-secret scoping, so the pipeline is symmetric.

- Created: `.github/workflows/package-macos.yml`
- Modified: `.github/workflows/publish-binaries.yml` (`package` job)

Move the current `package` job body verbatim into `package-macos.yml` under
`on: workflow_call` with inputs `bundle`, `version`, `kind`, `name`,
`bundle_name`, `cask`. Declare `environment: macos-signing` and
`strategy.matrix.arch: [arm64]` on its build job; keep every step (download,
checksum verify, sign, assemble, smoke, cdhash-stability, notarize, staple, zip,
`.pkg`, upload `package-assets`) unchanged. Replace the inline job in
`publish-binaries.yml` with:

```yaml
  package:
    needs: [meta, binaries]
    uses: ./.github/workflows/package-macos.yml
    with:
      bundle: ${{ needs.meta.outputs.bundle }}
      version: ${{ needs.meta.outputs.version }}
      kind: ${{ needs.meta.outputs.kind }}
      name: ${{ needs.meta.outputs.name }}
      bundle_name: ${{ needs.meta.outputs.bundle_name }}
      cask: ${{ needs.meta.outputs.cask }}
    secrets: inherit
```

Verify: `actionlint` on both files passes; the emitted artifact name is still
`package-assets` and the cdhash-stability step is present.

## Step 4: Add the tarball packing script

Pack a bundle's manifest CLIs into one per-arch tarball, the Linux analog of the
`.app` assembly.

- Created: `build/build-tarball.sh`

Read `bundle` and `arch` args, select `.clis[] | select(.bundle == $b) | .name`
from `build/cli-manifest.json`, and `tar -czf` those executables from
`dist/binaries/` into `dist/release/fit-<bundle>-linux-<arch>.tar.gz`, then
write `<tarball>.sha256` (`shasum -a 256 | awk '{print $1}'`). Include only the
named executables — no directory prefix, no sidecar files — so
`bin.install Dir["*"]` lands exactly the CLIs.

Verify: after any `just build-binary` populates `dist/binaries/`, run the script
for a bundle and confirm `tar -tzf` lists exactly that bundle's manifest CLIs
and no `.sha256` siblings. This local check covers CLI selection and tar
plumbing; arch-correct Linux content is proven by the CI build cells.

## Step 5: Add the Linux packaging workflow

Produce both architecture tarballs from the already-built binaries.

- Created: `.github/workflows/package-linux.yml`
- Modified: `.github/workflows/publish-binaries.yml` (new `package-linux` job)

`on: workflow_call` with inputs `bundle`, `version`; `strategy.matrix.arch:
[x64, arm64]`. Steps: checkout; `download-artifact` with
`pattern: "*-bun-linux-${{ matrix.arch }}"`, `path: dist/binaries`,
`merge-multiple: true`; then
`bash build/build-tarball.sh "${{ inputs.bundle }}" "${{ matrix.arch }}"`;
`upload-artifact` name `linux-packages`, path `dist/release/`,
`if-no-files-found: error`. Wire the caller job:

```yaml
  package-linux:
    needs: [meta, binaries]
    uses: ./.github/workflows/package-linux.yml
    with:
      bundle: ${{ needs.meta.outputs.bundle }}
      version: ${{ needs.meta.outputs.version }}
```

Verify: `actionlint` passes; a dispatch run yields a `linux-packages` artifact
holding `fit-<bundle>-linux-x64.tar.gz`, `-arm64.tar.gz`, and both `.sha256`.

## Step 6: Stage the Linux tarballs on the release

Publish the per-arch tarballs while keeping x64 raw binaries and dropping arm64
raw assets (no consumer).

- Modified: `.github/workflows/publish-binaries.yml` (`release` job)

Add `package-linux` to `needs`. In the raw-staging loop, `continue` on keys
equal to `linux-packages` (as it already does for `package-assets`) **and** on
keys ending in `-bun-linux-arm64`, so arm64 ships only inside the tarball. After
the loop, add `cp -R dist/artifacts/linux-packages/. dist/release/` beside the
existing `package-assets` copy.

Verify: a dispatch release lists `fit-<bundle>-linux-{x64,arm64}.tar.gz` +
`.sha256` and the `{cli}-bun-linux-x64` raw assets, and no
`*-bun-linux-arm64` raw asset.

## Step 7: Add the formula update script

Rewrite a formula's version and both per-architecture checksums, keyed by the
arch token in each `url`, distinct from the cask's single flat `sed`.

- Created: `build/update-formula.sh`

Args: `<formula-file> <version> <x64-sha> <arm64-sha>`. Substitute the top-level
`version "..."`. For each `sha256`, target the one on the line following the
`url` whose value contains `linux-x64` / `linux-arm64` respectively (awk that
tracks the last-seen `url` arch token), so the two `on_intel`/`on_arm` stanzas
never cross-assign. End with `ruby -c` on the file.

Verify: run against a fixture formula with distinct placeholder shas and confirm
each stanza's `sha256` matches its arch and `ruby -c` passes.

## Step 8: Update cask and formula in the tap job

Track the release in the tap by updating both packages in one commit.

- Modified: `.github/workflows/publish-binaries.yml` (`tap` job)

Add `package-linux` to `needs`. Add a second `download-artifact` step
(`name: linux-packages`, `path: dist/release`) beside the existing
`package-assets` download. In the `hash` step, set `X64_SHA`/`ARM64_SHA` from
`shasum -a 256 dist/release/fit-<bundle>-linux-{x64,arm64}.tar.gz | awk '{print $1}'`.
The monorepo checkout at `path: main` is already unconditional, so after the
existing cask `sed`/render, run
`bash ../main/build/update-formula.sh "Formula/${CASK}.rb" "$VERSION" "$X64_SHA" "$ARM64_SHA"`.
`git add` both `Casks/${CASK}.rb` and `Formula/${CASK}.rb`; keep the single
commit and push.

Verify: `actionlint` passes; a dispatch run against a scratch tap produces one
commit touching both files.

## Step 9: Seed one formula per bundle in the tap

Create the formula files the `tap` job updates; without them the first
post-change release fails at the `update-formula.sh` step.

- Created (external `forwardimpact/homebrew-tap`): `Formula/fit-map.rb`,
  `fit-pathway.rb`, `fit-guide.rb`, `fit-landmark.rb`, `fit-summit.rb`,
  `fit-outpost.rb`, `fit-gear.rb`

Author each from the [design's formula shape](design-a.md): `on_linux` wrapping
`on_intel`/`on_arm`, each with its arch tarball `url` and `sha256`, and
`def install; bin.install Dir["*"]; end`. Use the release download URL shape the
cask already uses. Placeholder `version`/`sha256` values are fine — the first
release rewrites them. This is a one-time seed of the external
`forwardimpact/homebrew-tap` repo (as spec 0740 seeded the casks), delivered as
a PR on that repo — not on this branch, and not routable to an in-repo agent.
The `tap` job (step 8) commits `Formula/<token>.rb` and fails if the file is
absent, so this PR must merge to the tap before any `<bundle>@v*` tag lands.

Verify: `brew audit Formula/<token>.rb` reports no errors for each file.

## Step 10: Document the Linux install path

Document the formula path beside the cask conventions.

- Modified: `websites/fit/docs/internals/release/index.md`

Add a Linux section after the existing cask conventions: the tap gains
`Formula/` beside `Casks/`; one formula per bundle; the
`brew install <tap>/<bundle>` install path (vs macOS
`brew install --cask <tap>/<bundle>`); and the per-arch checksum contract
(`update-formula.sh` keys each `sha256` to its `url` arch token, unlike the
cask's flat two-line `sed`). Note the macOS `--cask` path is unchanged and the
formula is `on_linux`-only. While here, correct this page's stale anchors: it
names a `publish-brew.yml` workflow and a PR-based cask update that no longer
exist — the live pipeline is `publish-binaries.yml`'s `tap` job with a direct
`sed`+push.

Verify: `bunx fit-doc build --src=websites/fit` succeeds and the section
renders.

## Risks

- **Formula seeding must precede the first release tag.** The `tap` job commits
  cask and formula together; a missing `Formula/<token>.rb` fails the release
  mid-pipeline. Land step 9 before any post-change `<bundle>@v*` tag.
- **`ubuntu-24.04-arm` availability depends on plan tier.** If the label is
  unavailable the arm64 build cell fails the release; fallback is a self-hosted
  arm64 runner (design § Risks).
- **macOS extraction touches working notarization.** The retained
  cdhash-stability re-verification is the guard that the reusable workflow
  signs the same bytes deterministically; a drift fails the release rather than
  shipping a TCC-wiping bundle.

## Execution

Order within the monorepo: `1 → 2`, then `4 → 5` and `7 → 8`. Step 1 must
precede step 5 (the arm64 cell must build before `package-linux` downloads it),
and step 5 must precede steps 6 and 8 (both add `package-linux` to a job's
`needs`). Step 3 is independent. Route the monorepo code steps (1–8) to
`staff-engineer` and step 10 (docs) to `technical-writer`. Step 9 is a
hand-authored PR on the external `forwardimpact/homebrew-tap` repo — not
routable to an in-repo agent on this branch — and must merge to the tap before
the first post-change release tag.
