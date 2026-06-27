# Plan 1290 — Unified macOS distribution for Gear bundles

Executes [design-a](design-a.md). The brew lane (`publish-brew.yml`) already
assembles the canonical `dist/apps/fit-outpost.app` via `build-app-product
outpost` and gates it on cdhash stability. This plan brings the `.pkg` lane
(`publish-macos.yml`) onto that same canonical bundle and gate, and removes the
now-dead second assembler in `pkg/build.js`.

Libraries used: none.

## Steps

### 1. Strip `pkg/build.js` to launcher-only

Remove the second `.app`/`.pkg` assembler so `build-app-product` is the sole
bundle entry point.

Files modified: `products/outpost/pkg/build.js`

- Delete `buildApp()` and `buildPKG()` (the two `function …(){ }` blocks).
- Delete the `--app`/`--pkg` CLI arms: the `want` object keeps only `launcher`;
  remove the `app`/`pkg` keys, the `if (want.app || want.pkg)` line, and the
  `if (want.app) buildApp();` / `if (want.pkg) buildPKG();` calls.
- Remove the now-unused module-level `APP_NAME` constant. Keep all `node:fs`
  imports — `existsSync`/`mkdirSync`/`rmSync`/`readFileSync` stay live in
  `ensureDir()` and `compileLauncher()`; nothing becomes orphaned.
- Remove **every** `--app`/`--pkg` mention from comments, not just the usage
  block: the header usage lines, the "before `--app`/`--pkg`" note, and the
  "`--app`/`--pkg` imply the launcher" CLI comment. After this step no `--app`
  or `--pkg` token remains anywhere in the file.

Verification: `grep -cE -- '--app|--pkg' products/outpost/pkg/build.js` returns
`0` (catches leftover comment references too); `(cd products/outpost && bun
pkg/build.js --launcher)` compiles the launcher to `dist/Outpost` and exits 0.

### 2. Retire the dead package.json scripts

Files modified: `products/outpost/package.json`

- Remove `"build:app": "bun pkg/build.js --app"` and
  `"build:pkg": "bun pkg/build.js --pkg"`.
- Keep `"build": "bun pkg/build.js"`.

Verification: `jq -e '.scripts | has("build:app") or has("build:pkg") | not'
products/outpost/package.json` is `true`; `(cd products/outpost && bun run
build)` still runs.

### 3. Fix the stale hint in `build-pkg.sh`

Files modified: `products/outpost/pkg/macos/build-pkg.sh`

- Replace the `echo "Run 'bun pkg/build.js --app' first."` line (`:24`) with a
  message naming the canonical builder, e.g. `echo "Run 'just build-app-product
  outpost' first."`. No other change — the `<dist_dir> <version>` signature,
  `APP_PATH="$DIST_DIR/fit-outpost.app"` (`:18`), `IDENTIFIER`, and the
  `/Applications/Forward Impact/` payload location stay as-is.

Verification: `grep -c -- '--app' products/outpost/pkg/macos/build-pkg.sh` is 0
and `grep -c 'build-app-product' products/outpost/pkg/macos/build-pkg.sh` is ≥1
(the hint now names the canonical builder).

### 4. Rewire `publish-macos.yml` to the canonical builder + cdhash gate

Point the `.pkg` job at `build-app-product outpost`, add a cdhash determinism
gate whose **predicate matches** `publish-brew.yml`'s, then wrap the canonical
bundle. The brew gate is parameterised on `$KIND`/`$NAME`/`$BUNDLE_NAME` env via
a `case "$KIND"` switch; this lane has only one bundle, so the gate is the same
predicate **specialised to outpost** — not a literal copy of the env-driven
brew body.

Files modified: `.github/workflows/publish-macos.yml`

All edits target the `build` job. Today it has (in order): a download step
(`:45–46`), one combined "Build .pkg installer" step with
`working-directory: products/outpost` doing chmod + `bun pkg/build.js --pkg`
(`:48–52`), a "Verify .pkg exists" step also with
`working-directory: products/outpost` (`:54–66`), and an "Upload release assets"
step that uploads `products/outpost/$PKG_FILE` (`:84–91`). After this step **no
step in the job carries `working-directory: products/outpost`** — every path is
repo-root-relative.

- **Download step (`:45–46`):** change `path:` from `products/outpost/dist` to
  `dist/binaries` so the binary lands at `dist/binaries/fit-outpost` (where
  `build-app-product.sh:25` reads it). Keep the single
  `name: fit-outpost-bun-darwin-arm64` (do not adopt the brew lane's
  `pattern:`/`merge-multiple:`; this lane needs only that binary).
- **Replace the combined "Build .pkg installer" step (`:48–52`)** — including
  dropping its `working-directory: products/outpost` — with these steps, all
  repo-root-relative:
  1. *Restore bit + assemble* — `chmod +x dist/binaries/fit-outpost` (artifact
     upload drops it), then `just build-app-product outpost` (compiles the
     launcher, emits `dist/apps/fit-outpost.app`).
  2. *Verify cdhash stability* — outpost-specialised gate:
     `BUNDLE=dist/apps/fit-outpost.app`; baseline
     `codesign -dvvv "$BUNDLE" 2>&1 | grep -i CDHash`;
     `rm -rf dist/apps products/outpost/dist`; rebuild
     `just build-app-product outpost`; record after; on mismatch echo the brew
     lane's `::error::cdhash drift detected — bundle is not deterministic` and
     `exit 1`. The baseline → rm+rebuild → compare predicate is identical to
     `publish-brew.yml`'s; only the `$BUNDLE`/name constants are inlined (no
     `case "$KIND"`).
  3. *Build the `.pkg`* —
     `bash products/outpost/pkg/macos/build-pkg.sh dist/apps "$VERSION"`, with
     `env: VERSION: ${{ steps.meta.outputs.version }}` on the step (the old step
     read the version from package.json; the direct call needs it in env). The
     `.pkg` lands at `dist/apps/fit-outpost-$VERSION.pkg`.
- **"Verify .pkg exists" step (`:54–66`):** remove its
  `working-directory: products/outpost` and repoint `PKG_FILE` from
  `dist/fit-outpost-${VERSION}.pkg` to `dist/apps/fit-outpost-${VERSION}.pkg`.
  The `pkg_file` it writes to `$GITHUB_OUTPUT` is now repo-root-relative.
- **"Upload release assets" step (`:84–91`):** drop the `products/outpost/`
  prefix — upload `"$PKG_FILE"` (already `dist/apps/...` from the verify step's
  output), not `"products/outpost/$PKG_FILE"`.
- Leave the `binaries` job, runner (`macos-14`), tag trigger, and the idempotent
  `gh release create` step unchanged.

Verification: the repo's workflow lint passes; `grep -c 'working-directory'
.github/workflows/publish-macos.yml` is `0`; the gate runs the same
baseline → `rm` + rebuild-via-`build-app-product` → compare predicate as
`publish-brew.yml` (a byte diff is not expected — confirm the three predicate
parts are present and the `rm`+rebuild sits **between** baseline and after, not
skipped); `grep -n 'CDHash\|build-pkg.sh\|release upload'` shows the gate before
the `.pkg` build before the upload.

## Risks

- **First `.pkg` cdhash run may fail on launcher non-determinism.** The `.pkg`
  lane has never run the gate; if the Swift launcher is not byte-stable across
  rebuilds the gate fails the release. That is correct behavior — escalate as a
  spec-1170 follow-up, do not weaken the gate to make the release pass.
- **`rm -rf dist/apps products/outpost/dist` in the gate also removes the
  downloaded launcher inputs under `products/outpost/dist`.** This matches
  `publish-brew.yml`, which keeps the binary artifacts under `dist/binaries`
  (untouched by the `rm`). The rebuild's `build-app-product outpost` recompiles
  the Swift launcher via `pkg/build.js --launcher` (`build-app-product.sh:21`),
  so the gate's rebuild is what puts the launcher under the cdhash check — the
  reason the gate must call `build-app-product`, not measure a binary-only
  artifact. The launcher is regenerated, not expected to survive the `rm`; the
  gate is self-contained.
- **The `.pkg` and brew jobs both write `dist/apps`.** They are separate CI
  jobs on separate runners (`build` in each workflow), so the shared relative
  path is not a collision — each job has its own checkout. No coordination
  needed; noted so an implementer does not invent a path rename.

## Execution

Single engineering agent, steps in order. Steps 1–3 are independent source
edits; step 4 depends on steps 1 and 3 (it calls the launcher-only `build.js`
and the fixed `build-pkg.sh`). No parallelism benefit at this size. No
documentation changes required — the `.pkg` build is internal CI plumbing, not a
user-facing doc surface.

— Staff Engineer 🛠️
