# Spec 1290 — Unified macOS distribution for Gear bundles

## Problem

The monorepo publishes seven macOS `.app` bundles to brew today —
`fit-outpost`, `fit-guide`, `fit-landmark`, `fit-map`, `fit-pathway`,
`fit-summit`, and `fit-gear` (shared bundle for the gear CLI suite). All
seven are tagged on `*@v*` push and built by `publish-brew.yml`, all seven
go through the same "Verify cdhash stability" gate spec 1170 introduced,
and all seven assemble under the same `dist/apps/fit-{name}.app` directory
via `libraries/libmacos/scripts/build-app.sh`. Six of the seven follow
this single approach end-to-end. One does not.

**Outpost is the special case.** In addition to the brew lane, Outpost
ships a `.pkg` installer through `publish-macos.yml` that assembles a
*second* bundle — `products/outpost/dist/Outpost.app` — via
`products/outpost/pkg/build.js`. Same upstream code, same Info.plist,
same Swift launcher, but with `--bundle-name Outpost` instead of
`--bundle-name fit-outpost`. The two bundles install under different
paths (`/Applications/fit-outpost.app` vs `/Applications/Outpost.app`)
and carry independent code signatures with independent cdhashes. The
`.pkg` channel does not pass through the cdhash determinism gate — it has
no equivalent step in `publish-macos.yml`. The result is that the single
approach the other six bundles satisfy is violated for Outpost on every
release.

The divergence is in the bundle assembly step both Outpost lanes share —
they both invoke `libraries/libmacos/scripts/build-app.sh`, but with
different flags:

| Lane | Builder | `--bundle-name` | Output | Install path |
|---|---|---|---|---|
| Brew (all 7) | root `justfile` recipes `build-app-product NAME` / `build-app-gear` | `fit-{name}` (or `fit-gear`) | `dist/apps/fit-{name}.app` | `/Applications/fit-{name}.app` |
| `.pkg` (Outpost only) | `products/outpost/pkg/build.js --app` | `Outpost` | `products/outpost/dist/Outpost.app` | `/Applications/Outpost.app` |

[PR #1153](https://github.com/forwardimpact/monorepo/pull/1153) (closed)
proposed consolidating the brew and `.pkg` workflows by folding the `.pkg`
build into `publish-brew.yml`, but deferred unifying the bundles
themselves. Two directional reviews on the originating thread rejected
that framing:

- [#issuecomment-4525623218](https://github.com/forwardimpact/monorepo/pull/1153#issuecomment-4525623218)
  (2026-05-23): "We need a single Outpost.app build. Brew and .pkg are
  just packaging concerns. They should distribute exactly the same app
  build."
- [#issuecomment-4525839764](https://github.com/forwardimpact/monorepo/pull/1154#issuecomment-4525839764)
  (2026-05-23): "I want to expand this spec to holistically cover all
  macOS + brew workflows. Outpost is one special case. But the intention
  here is to build and publish all Gear CLI tools on macOS and publish
  them as built binaries to brew. We need a single approach to this.
  Deterministic builds and a single path to brew."

This spec captures the holistic frame: a single approach for building and
publishing every Gear macOS bundle to brew. The approach already exists
in the six conforming brew lanes; the spec promotes it from accidental
convention to documented contract, and brings the one violation —
Outpost's `.pkg` lane — into line.

## Why

The single approach is **one canonical bundle directory name per
product, one canonical install path per product, one canonical build
entry point per product, and one cdhash determinism gate covering every
bundle on every release.** Today the approach is satisfied for six of
seven brew lanes by convention, and violated for the seventh's `.pkg`
channel by construction. Lifting it from convention to contract — and
fixing the one violation — addresses concrete costs:

- **Determinism guarantees do not extend across channels.** Spec 1170's
  cdhash gate runs once per brew tag and covers all seven brew bundles
  uniformly. The Outpost `.pkg` lane builds an independent bundle without
  passing through that gate — its cdhash stability is unverified and
  could regress silently. A user installing Outpost via `.pkg` today has
  no guarantee equivalent to what brew users receive. With one canonical
  build per product, one gate covers every release path.
- **TCC grants do not survive cross-channel switching for Outpost.** TCC
  (Transparency, Consent, and Control) keys grants on the tuple
  `(CFBundleIdentifier, cdhash, install path)`. The two Outpost bundles
  share `CFBundleIdentifier` but diverge on cdhash and install path, so
  a user who installs via brew and later installs via `.pkg` (or vice
  versa) must re-grant Calendar / Contacts / Apple Events authorizations.
  The other six products do not have this failure mode because they have
  only one channel; bringing Outpost into the unified approach
  eliminates the failure mode there too.
- **Release surface area doubles for Outpost.** Every Outpost release
  builds the app twice — once in `publish-brew.yml` for the brew zip and
  once in `publish-macos.yml` for the `.pkg` — with two build scripts,
  two signing passes, and two `.app` paths in `dist/`. The other six
  products build once per release. Collapsing Outpost's bundle to one
  brings it in line with the cost profile every other product already
  has.
- **The contract is currently undocumented.** The six conforming lanes
  satisfy the approach because they were all generated from the same
  `build-app-product` recipe template, not because any spec requires it.
  A future per-product `.pkg` channel (or any other new macOS
  distribution channel) would have no documented contract to satisfy and
  could re-introduce divergence the way Outpost's `.pkg` did. Naming the
  contract here lets future work — including Outpost's `.pkg`
  consolidation — apply it explicitly.
- **The migration window is empty for the one product that needs
  migration.** Spec 1170 § Why documents that the cask remains at the
  seed placeholder; no real brew release has ever installed
  `fit-outpost.app` on a user's machine. So bringing Outpost's `.pkg`
  bundle in line with its brew bundle (or vice versa) can pick the right
  name once without a deprecation story for either channel.

The work serves **Empowered Engineers → Be Prepared and Productive** and
the **Platform Builders → use shared libraries and services** jobs
([JTBD.md](../../JTBD.md)): users who hire any Gear CLI or Outpost
should encounter the same install conventions, the same on-disk
identity, and the same determinism guarantees regardless of which
channel they used.

## Scope

### In scope

- **One bundle directory name per product across every channel.** For
  each of the seven product / gear bundles, the bundle directory name
  (the `.app` directory under `/Applications/`) is identical across
  every release channel that ships it. For Outpost specifically that
  means the brew zip and the `.pkg` payload land at the same `.app`
  name; for the other six it remains the case (they have only brew
  today, but a future `.pkg` would be bound by the same rule).
- **One install path per product across every channel.** The cask's
  `app` stanza and any future `.pkg` payload's install location for the
  same product name a byte-identical `/Applications/...` path. For
  Outpost this resolves the current
  `/Applications/fit-outpost.app` vs `/Applications/Outpost.app` split.
- **One canonical build entry point per product.** The brew lane and
  any other macOS channel that ships the bundle reach it through the
  same `justfile` recipe (or equivalent). For Outpost this means
  `products/outpost/pkg/build.js --app` and the brew lane's bundle
  step converge on one canonical builder; today only the brew lane
  recipe is reachable from the other six products' release paths and
  that property is preserved.
- **One cdhash determinism gate covering every release path on every
  Gear macOS bundle.** Today `publish-brew.yml`'s "Verify cdhash
  stability" step gates all seven brew bundles. After this spec lands,
  every macOS release path for every Gear bundle passes through that
  step (or an equivalent step that emits the same guarantee),
  including the path that produces Outpost's `.pkg` payload.
- **The contract is documented in spec form** so future channels (a
  per-product `.pkg`, a notarized signed channel, etc.) inherit the
  approach rather than re-discovering it. The contract is the four
  properties above (one name, one path, one entry point, one
  determinism gate), stated as success criteria below.
- **Info.plist alignment for the unified Outpost bundle.** The
  `CFBundleName`, `CFBundleDisplayName`, `CFBundleExecutable`, and
  `CFBundleIdentifier` in `products/outpost/macos/Info.plist` — the
  keys that determine the menubar identity, the TCC bucket, and the
  signing identity — must align with the chosen bundle directory name.
- **The brew cask's `app` stanza and any `binary` / `pkgutil`
  directives, and the Outpost `.pkg` installer's
  `BundleIsRelocatable` / install-location settings**, insofar as they
  reference the bundle name or install path.

### Out of scope

- **Adding new macOS distribution channels for the other six bundles.**
  No `.pkg` channel for guide / landmark / map / pathway / summit /
  gear is in scope. Their conformance to the single approach today
  (brew-only) is preserved; opening additional channels for them is
  separate product work that would inherit this spec's contract.
- **The cdhash-determinism work itself.** Spec 1170's flags
  (`SWIFT_DETERMINISTIC_HASHING`, `-file-prefix-map`, `-Xlinker
  -no_uuid`, `-gnone`) are settled; this spec inherits them. If
  unification exposes a new non-determinism source not covered by spec
  1170, that is a spec-1170 follow-up, not this spec.
- **The npm distribution channel (`npx fit-*`).** It ships JavaScript,
  not a `.app` bundle, and is unaffected by the unification. The
  approach defined here is macOS-bundle-scoped.
- **Notarization, Developer ID signing, or any move away from ad-hoc
  codesign.** The current ad-hoc signature is what every bundle uses
  today and what TCC grants attach to; changing it is its own product
  decision.
- **Migration of existing brew users.** Per spec 1170 § Why, no cask
  has ever published a real release, so the brew install base is
  empty for every product. The spec records this as the migration
  story (an empty set), not as a deliverable.
- **Migration of existing Outpost `.pkg` users when the unified name
  matches today's `.pkg` bundle name.** No migration required in that
  case. If the unification chooses a different name, SC4's identity
  equality and SC2's install-path equality constrain the design; the
  means of honoring them is out of scope here.
- **Workflow-split reorganisation beyond what unification requires.**
  PR #1153's `publish-macos`-into-`publish-brew` consolidation falls
  out naturally once Outpost has one canonical build to publish, but
  the spec does not prescribe a specific workflow layout — only that
  every release path for every Gear bundle passes through one
  determinism gate (SC3).

## Success criteria

Each criterion is verifiable from the state of `main` and real
`*@v*` tag pushes across the seven product / gear bundles.

### SC1 — One bundle directory name per product across every channel

For each of the seven product / gear bundles, every `--bundle-name`
value emitted along that product's macOS build chain resolves to a
single canonical name. Verifiable on `main` by extracting, for each
product, the set of `--bundle-name` values referenced from any
`build-app-*` invocation reachable from that product's release path
(the root `justfile` recipes for the brew lane, and
`products/outpost/pkg/build.js` for Outpost's `.pkg` lane). The set
size is 1 for every product. Today Outpost is the only product whose
set is size 2 (`fit-outpost` from the brew lane and `Outpost` from
`products/outpost/pkg/build.js`); after this spec lands every product
satisfies the size-1 criterion.

### SC2 — One install path per product across every channel

For each product that ships through more than one channel, every
channel's install path for that product is a byte-identical
`/Applications/...` string. Today Outpost is the only product with
more than one channel; the criterion is verified by reading:

- `forwardimpact/homebrew-tap/Casks/fit-outpost.rb` — the cask's
  `app` stanza names the same bundle directory the `.pkg` installs.
- `products/outpost/pkg/macos/build-pkg.sh` — the payload copies the
  bundle to the same `/Applications/` path the cask declares.

For the other six products the criterion holds trivially (single
channel → single install path). The criterion is stated per-product so
future channels for those products inherit the same constraint.

### SC3 — Every Gear macOS release path passes through one cdhash determinism gate

After this spec lands, on every `*@v*` tag push for each of the seven
product / gear bundles, every macOS release path for that tag executes
exactly one "Verify cdhash stability" step (or an equivalent step
emitting the same `baseline != after → fail` guarantee), and that step
covers the artifact every downstream packager consumes. Verifiable by
inspecting `.github/workflows/` on `main` after merge: for each of the
seven tag patterns, every CI job that produces a release asset passes
through one cdhash gate. Today six of seven brew lanes satisfy this via
`publish-brew.yml`'s gate; the Outpost `.pkg` lane in
`publish-macos.yml` does not. After this spec lands, the Outpost `.pkg`
lane passes through the gate (either by sharing the brew lane's gate
via consolidation, or by running an equivalent gate against the same
canonical build artifact).

### SC4 — Both Outpost release assets carry the same bundle identity

On the first `outpost@v*` tag pushed after the unification lands, both
release assets (the brew `.zip` and the `.pkg`) on the GitHub release
page yield a bundle whose:

- `CFBundleIdentifier` is `team.forwardimpact.outpost`,
- `CFBundleName` value matches in both extractions, and
- `codesign -dvvv` `CandidateCDHash` matches in both extractions.

Verifiable on a `macos-14` arm64 host by downloading both assets,
extracting each (`ditto -x -k …` for the zip; `pkgutil --expand-full …`
for the `.pkg`, which unpacks the embedded `Payload` to the `.app`),
locating the `.app` inside each extraction, and running `codesign
-dvvv` plus `plutil -p Contents/Info.plist` on each. The two
`CandidateCDHash` and `CFBundleName` lines are byte-identical. Asset
filenames and the canonical bundle directory name are design outputs;
the SC tests for identity equality, not for specific filenames.

For the other six products SC4 holds trivially (single asset → identity
matches itself); the criterion is named explicitly for Outpost because
Outpost is where identity equality across channels is the headline
deliverable.

### SC5 — TCC-keyed identity is equal across channels (Outpost)

TCC attaches grants to the tuple `(CFBundleIdentifier, cdhash, install
path)`. After this spec lands, that tuple is byte-identical for the
Outpost bundle a user installs via brew and the Outpost bundle the same
user would install via `.pkg`. Verifiable by combining SC2 (equal
install paths) with SC4 (equal `CFBundleIdentifier` and equal
`CandidateCDHash`): all three components of the TCC-keying tuple are
equal across channels. This SC is the user-facing consequence the spec
exists to deliver; it is satisfied transitively by SC2+SC4 and does
not require a separate verification beyond confirming the conjunction
holds for the same release. For the other six products the criterion
holds trivially.

## References

- [PR #1153](https://github.com/forwardimpact/monorepo/pull/1153) —
  closed follow-up that proposed consolidating `publish-macos` into
  `publish-brew` while deferring bundle unification. The directional
  review comment
  ([#issuecomment-4525623218](https://github.com/forwardimpact/monorepo/pull/1153#issuecomment-4525623218))
  triggered this spec.
- [PR #1154 directional comment](https://github.com/forwardimpact/monorepo/pull/1154#issuecomment-4525839764)
  — broadens this spec from Outpost-specific to a holistic single
  approach for all Gear macOS bundles.
- [Spec 1170](../1170-outpost-cdhash-determinism/spec.md) — brew-lane
  cdhash determinism. SC1–SC2 are the determinism inputs this spec
  inherits. SC4 (no regression for other six bundles) remains the
  contract for non-outpost bundles after unification.
- [Spec 600](../600-native-binary-distribution/spec.md) — native binary
  distribution. SC8 ("Stable bundle identity") is the contract TCC
  grants attach to; this spec re-establishes it across every Gear
  macOS bundle and every channel that ships them.
- [`libraries/libmacos/scripts/build-app.sh`](../../libraries/libmacos/scripts/build-app.sh)
  — the shared assembly script every brew lane already invokes. Its
  `--bundle-name` flag is the divergence point Outpost's `.pkg` lane
  exploits and that this spec closes.
- [`products/outpost/pkg/build.js`](../../products/outpost/pkg/build.js)
  and [`products/outpost/pkg/macos/build-pkg.sh`](../../products/outpost/pkg/macos/build-pkg.sh)
  — the Outpost `.pkg` lane builder and its payload step.
- [`justfile`](../../justfile) — recipes `build-app-product NAME` and
  `build-app-gear`, the canonical brew-lane builders that all seven
  products go through today.
- [`products/outpost/macos/Info.plist`](../../products/outpost/macos/Info.plist)
  — `CFBundleName = Outpost` already, so the menubar name is
  unaffected by the unification.
- [`.github/workflows/publish-brew.yml`](../../.github/workflows/publish-brew.yml)
  — the workflow whose "Verify cdhash stability" step gates all seven
  brew bundles today and gates the canonical Outpost build after
  unification.
- [`.github/workflows/publish-macos.yml`](../../.github/workflows/publish-macos.yml)
  — Outpost's `.pkg` lane, the one Gear macOS release path that does
  not pass through the determinism gate today.

— Product Manager 🌱
