# Spec 1290 — Unified Outpost.app bundle across brew and .pkg lanes

## Problem

The Outpost release pipeline produces two distinct `.app` bundles from the same
source tree, and ships them through two distribution channels that install
them under different paths and different on-disk names. A user who installs via
`brew install fit-outpost` gets a different bundle than a user who downloads
the `.pkg` from the GitHub release page, even though the upstream code,
Info.plist, entitlements, and Swift launcher are identical.

The divergence is in the bundle assembly step that both lanes share — they
invoke `libraries/libmacos/scripts/build-app.sh`, but with different flags:

| Lane | Builder | `--bundle-name` | Output | Install path |
|---|---|---|---|---|
| Brew | root `justfile` recipe `build-app-product outpost` | `fit-outpost` | `dist/apps/fit-outpost.app` | `/Applications/fit-outpost.app` |
| `.pkg` | `products/outpost/pkg/build.js --app` | `Outpost` | `products/outpost/dist/Outpost.app` | `/Applications/Outpost.app` |

Two builds run on every Outpost release (one in `publish-brew.yml`, one in
`publish-macos.yml`), each carrying its own signing pass, its own cdhash, and
its own copy of the determinism work spec 1170 invested in the brew lane. The
`.pkg` payload in `products/outpost/pkg/macos/build-pkg.sh` copies
`Outpost.app` to `/Applications/Outpost.app`; the brew cask in
`forwardimpact/homebrew-tap` installs `fit-outpost.app` to
`/Applications/fit-outpost.app`. The Info.plist that both bundles embed
declares `CFBundleName = Outpost` and `CFBundleDisplayName = Outpost`, so the
menubar item is named "Outpost" in both — but the icon a user double-clicks in
`/Applications/` is named differently.

[PR #1153](https://github.com/forwardimpact/monorepo/pull/1153) (open as of
this spec) proposes consolidating the brew and `.pkg` workflows by folding
the `.pkg` build into `publish-brew.yml`, without unifying the bundles
themselves — it defers "which name does the user see?" to a separate spec.
The PR-thread review
([#issuecomment-4525623218](https://github.com/forwardimpact/monorepo/pull/1153#issuecomment-4525623218),
2026-05-23) rejects that deferral with the directional statement: "We need a
single Outpost.app build. Brew and .pkg are just packaging concerns. They
should distribute exactly the same app build." This spec captures that
directional decision.

## Why

Two bundles built from one source is duplicated work that a single build
removes. The concrete costs visible today:

- **Determinism work doubles per channel.** Spec 1170 SC1–SC2 restored cdhash
  stability for `dist/apps/fit-outpost.app` (brew lane); the same flags
  (`SWIFT_DETERMINISTIC_HASHING`, `-file-prefix-map`, `-Xlinker -no_uuid`)
  apply to `products/outpost/dist/Outpost.app` (`.pkg` lane), but the second
  bundle's determinism is currently unverified — no equivalent of
  `publish-brew.yml`'s "Verify cdhash stability" step exists in
  `publish-macos.yml`. With one bundle, one gate covers both channels.
- **User-facing identity is split.** A `brew upgrade` migrating a user from
  `fit-outpost.app` to `Outpost.app` (or vice versa) crosses a code-signature
  identity boundary — TCC grants attach to the bundle's cdhash *and* its
  identifier+path. Today's mismatch means even with deterministic builds, the
  two channels cannot interoperate: a user cannot install via brew and later
  switch to `.pkg` (or vice versa) without re-granting Calendar / Contacts /
  Apple Events authorizations. With one bundle, the channels are
  interchangeable.
- **Release surface area doubles.** Every Outpost release builds the app
  twice — once in `publish-brew.yml` for the brew zip and once in
  `publish-macos.yml` for the `.pkg` — with two build scripts, two signing
  passes, and two `.app` paths in dist/. Collapsing the bundles themselves
  removes the underlying reason for two builds, independent of any
  workflow-level consolidation.
- **The brew lane has never published.** Spec 1170 § Why documents that the
  cask remains at the seed placeholder; no real release has ever installed
  `fit-outpost.app` on a user's machine. The migration window is therefore
  empty — the unification can pick the right name once without a deprecation
  story for existing brew users.

The work serves **Empowered Engineers → Be Prepared and Productive**
([JTBD.md](../../JTBD.md)): the user who hires Outpost to walk into every
meeting already oriented should not encounter two differently-named copies of
the same product depending on which install command they happened to type.

## Scope

### In scope

- A single canonical bundle directory name and a single canonical install
  path under `/Applications/`, used by both the brew cask
  (`forwardimpact/homebrew-tap/Casks/fit-outpost.rb`) and the `.pkg` payload
  (`products/outpost/pkg/macos/build-pkg.sh`).
- A single canonical build entry point that emits the unified bundle. The
  brew lane (`publish-brew.yml`) and the `.pkg` lane (`publish-macos.yml`
  today, or whatever workflow assembles the `.pkg` after this spec lands)
  both reach the bundle through that one entry point. Selecting which of
  today's callers (`just build-app-product outpost` or `products/outpost/pkg/build.js --app`)
  becomes canonical is a design decision.
- The bundle's `CFBundleName`, `CFBundleDisplayName`, `CFBundleExecutable`,
  and `CFBundleIdentifier` in `products/outpost/macos/Info.plist` — these
  determine the menubar identity and TCC bucket and must align with the
  chosen install path.
- Extending the existing "Verify cdhash stability" step in `publish-brew.yml`
  to cover the unified bundle on every Outpost release. After this spec
  lands, exactly one bundle per release goes through that gate, and both
  downstream packagers (brew zip + cask, `.pkg` installer) start from the
  gate-verified artifact.
- The brew cask's `app` stanza and any `binary` / `pkgutil` directives, and
  the `.pkg` installer's `BundleIsRelocatable` / install-location settings,
  insofar as they reference the bundle name or install path.

### Out of scope

- The cdhash-determinism work itself for the unified bundle. The flags from
  spec 1170 design Decision 4 (Swift determinism env var, file-prefix-map,
  `-no_uuid`, `-gnone`) are settled; this spec inherits them. If unification
  exposes a new non-determinism source not covered by spec 1170, that is a
  spec-1170 follow-up, not this spec.
- The six other product/gear bundles (`fit-guide`, `fit-landmark`, `fit-map`,
  `fit-pathway`, `fit-summit`, `fit-gear`). None of them ship a `.pkg` today;
  none of them have a two-bundle divergence. Their `fit-*` naming convention
  is unaffected.
- The npm distribution channel (`npx fit-outpost`). It ships JavaScript, not
  a `.app` bundle, and is unaffected by the unification.
- Notarization, Developer ID signing, or any move away from ad-hoc codesign.
  The current ad-hoc signature is what both bundles use today and what TCC
  grants attach to; changing it is its own product decision.
- Migration of existing brew users from `fit-outpost.app` to the unified
  name. Per Spec 1170 § Why, the brew cask remains at the seed placeholder
  and no real release has ever installed via brew, so no live install base
  needs migrating. The spec records this as the migration story (an empty
  set), not as a deliverable.
- Migration of existing `.pkg` users when the unified name matches today's
  `.pkg` bundle name (`Outpost.app`). No migration is required in that
  case. If the unification chooses a different name, the spec inherits
  SC5's identity-equality constraint and the design picks the means of
  honoring it; the means is out of scope here.
- Any reorganisation of the publish-brew vs publish-macos workflow split
  beyond what unification requires. PR #1153's consolidation is independent
  of this spec.

## Success criteria

Each criterion is verifiable from the state of `main` and a real
`outpost@v*` tag push.

### SC1 — One bundle directory name across both lanes

For Outpost, exactly one `.app` directory name is declared in the build
sources, and both the brew lane and the `.pkg` lane assemble a bundle with
that name. Verifiable on `main`:

```sh
# Every `--bundle-name` value emitted along the outpost build chain.
# After unification, the unique set of values for the outpost path is size 1.
{
  awk '/build-app-product outpost/,/^$/' justfile
  awk '/outpost/' products/outpost/pkg/build.js products/outpost/justfile
} | grep -- '--bundle-name' | sed -E 's/.*--bundle-name[ "]+([^" ]+).*/\1/' | sort -u
```

The output has exactly one line (today it has two: `fit-outpost` and
`Outpost`). The other six bundles' `--bundle-name` values are unaffected.

### SC2 — One install path across both lanes

A `brew install fit-outpost` and an Outpost `.pkg` installer both land the
bundle at the same path under `/Applications/`. Verifiable by reading:

- `forwardimpact/homebrew-tap/Casks/fit-outpost.rb` — the cask's `app`
  stanza names the same bundle directory the `.pkg` installs.
- `products/outpost/pkg/macos/build-pkg.sh` — the payload copies the bundle
  to the same `/Applications/` path the cask declares.

The two install paths are byte-identical strings.

### SC3 — One bundle build owns the determinism gate

On every `outpost@v*` tag push after this spec lands, the CI workflow chain
contains exactly one "Verify cdhash stability" step, and the artifact that
step verifies is the same artifact both downstream packagers consume — the
brew zip is the gate-verified bundle zipped with `ditto`, and the `.pkg`
payload is the gate-verified bundle copied into `/Applications/`. Verifiable
by inspecting `.github/workflows/` on `main` after merge: a workflow-wide
search for `cdhash` returns exactly one occurrence of the verification step
on the outpost release path.

### SC4 — Both release assets carry the same bundle identity

On the first `outpost@v*` tag pushed after the unification lands, both
release assets (the brew `.zip` and the `.pkg`) on the GitHub release page
yield a bundle whose:

- `CFBundleIdentifier` is `team.forwardimpact.outpost`,
- `CFBundleName` value matches in both extractions, and
- `codesign -dvvv` `CandidateCDHash` matches in both extractions.

Verifiable on a `macos-14` arm64 host by downloading both assets, extracting
each (`ditto -x -k …` for the zip; `pkgutil --expand-full …` for the `.pkg`,
which unpacks the embedded `Payload` to the `.app`), locating the `.app`
inside each extraction, and running `codesign -dvvv` plus `plutil -p
Contents/Info.plist` on each. The two `CandidateCDHash` and `CFBundleName`
lines are byte-identical. The asset filenames and the canonical bundle
directory name are design outputs; the SC tests for identity equality, not
for specific filenames.

### SC5 — TCC-keyed identity is equal across channels

TCC (Transparency, Consent, and Control) attaches grants to the tuple
`(CFBundleIdentifier, cdhash, install path)`. After this spec lands, that
tuple is byte-identical for the bundle a user installs via brew and the
bundle the same user would install via `.pkg`. Verifiable by combining SC2
(equal install paths) with SC4 (equal `CFBundleIdentifier` and equal
`CandidateCDHash`): all three components of the TCC-keying tuple are equal
across channels. This SC is the user-facing consequence the spec exists to
deliver; it is satisfied transitively by SC2+SC4 and does not require a
separate verification beyond confirming the conjunction holds for the same
release.

## References

- [PR #1153](https://github.com/forwardimpact/monorepo/pull/1153) —
  open follow-up proposing to consolidate `publish-macos` into
  `publish-brew` while deferring the bundle unification. The directional
  review comment
  ([#issuecomment-4525623218](https://github.com/forwardimpact/monorepo/pull/1153#issuecomment-4525623218))
  is the trigger for this spec.
- [Spec 1170](../1170-outpost-cdhash-determinism/spec.md) — brew-lane
  cdhash determinism. SC1–SC2 are the determinism inputs this spec
  inherits. SC4 (no regression for other six bundles) remains the contract
  for non-outpost bundles after unification.
- [Spec 600](../600-native-binary-distribution/spec.md) — native binary
  distribution. SC8 ("Stable bundle identity") is the contract TCC grants
  attach to; this spec re-establishes it across two channels rather than
  one.
- [`libraries/libmacos/scripts/build-app.sh`](../../libraries/libmacos/scripts/build-app.sh)
  — the shared assembly script both lanes already invoke. Its
  `--bundle-name` flag is the divergence point.
- [`products/outpost/pkg/build.js`](../../products/outpost/pkg/build.js)
  and [`products/outpost/pkg/macos/build-pkg.sh`](../../products/outpost/pkg/macos/build-pkg.sh)
  — the `.pkg` lane builder and its payload step.
- [`justfile`](../../justfile) — root recipe `build-app-product outpost`,
  the brew lane builder.
- [`products/outpost/macos/Info.plist`](../../products/outpost/macos/Info.plist)
  — `CFBundleName = Outpost` already, so the menubar name is unaffected by
  the unification.
- [`.github/workflows/publish-brew.yml`](../../.github/workflows/publish-brew.yml)
  — the workflow whose "Verify cdhash stability" step becomes the single
  gate after unification.

— Product Manager 🌱
