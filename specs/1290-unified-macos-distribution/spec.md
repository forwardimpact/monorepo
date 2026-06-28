# Spec 1290 — Unified macOS distribution for Gear bundles

## Problem

The monorepo publishes seven macOS `.app` bundles to brew today —
`fit-outpost`, `fit-guide`, `fit-landmark`, `fit-map`, `fit-pathway`,
`fit-summit`, and `fit-gear` (shared bundle for the gear CLI suite). All
seven are tagged on `*@v*` push and built by `publish-brew.yml`, all seven
go through the same "Verify cdhash stability" gate spec 1170 introduced,
and all seven assemble through the same shared assembly script
`libraries/libmacos/scripts/build-app.sh` (invoked by the `justfile`
recipes `build-app-product NAME` for single-product bundles and
`build-app-gear` for the shared gear bundle). The two `justfile` recipes
already differ in shape — `build-app-gear` enumerates 25 `--extra-exec`
binaries; `build-app-product` carries an `if [ "{{NAME}}" = "outpost" ]`
branch that adds an `--extra-exec` and resources the other five products
do not need — so "single approach" here means the shared assembly script
plus one cdhash determinism gate, not a uniform recipe shape. Six of
seven brew lanes reach the gate end-to-end. One product breaks the
approach on a second channel.

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
  (2026-05-23): "We need to rethink this completely. We need a single
  Outpost.app build. Brew and .pkg are just packaging concerns. They
  should distribute exactly the same app build."
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

## Status after spec 1420 (#1345) — reduced scope

Spec 1420 (single-source native binary builds) merged after this draft was
written and already delivers part of this unification, so the remaining scope
is **narrower** than the Problem and Why sections below describe. Those
sections predate 1420 and overstate the divergence — read them with this
correction.

**Already delivered by 1420 — no longer in scope here:**

- **Shared scheduler binary.** Both Outpost lanes now consume the same
  `dist/binaries/fit-outpost` produced by the single `just build-binary`
  primitive. `products/outpost/pkg/build.js` no longer compiles the scheduler
  (`compileScheduler` is removed); it builds only the Swift launcher and
  assembles from the shared binary, which `publish-macos.yml` obtains from the
  shared `build-binaries.yml` workflow rather than compiling its own. The
  "same upstream code built twice" cost is eliminated for the binary.
- **Runner parity.** `publish-macos.yml` now runs on `macos-14`, matching
  `publish-brew.yml` and `outpost-determinism-probe.yml`, closing the former
  `macos-latest` / `macos-14` split so the cdhash toolchain image is identical
  across lanes.

**Still in scope — the remaining unification this spec owns:**

- **One bundle directory name + install path (SC1, SC2, SC4, SC5).** The brew
  lane still assembles `fit-outpost.app` (`build-app-product outpost` →
  `--bundle-name fit-outpost`) while the `.pkg` lane still assembles
  `Outpost.app` (`pkg/build.js buildApp()` → `--bundle-name "Outpost"`). The
  name / install-path / TCC-identity divergence is unchanged by 1420.
- **One cdhash determinism gate on the `.pkg` lane (SC3).** `publish-macos.yml`
  still has no cdhash-determinism step; only `publish-brew.yml` does. 1420
  aligned the runner and the binary source but did not bring the `.pkg`
  `.app` assembly under the gate.
- **One canonical build entry point.** The `.pkg` lane still assembles its
  bundle via `pkg/build.js buildApp()` rather than consuming the canonical
  `build-app-product outpost` output.

SC1–SC5 remain valid as written, except that their shared-binary and
runner-parity inputs are now satisfied by 1420 rather than by this spec. The
Lane/Builder table above is also updated by this note: the `.pkg` lane's
builder no longer compiles the scheduler and runs on `macos-14`.

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
  versa) must re-grant the Apple Events authorization Outpost requests
  in `products/outpost/macos/Info.plist` (the only TCC-gated entitlement
  the bundle declares today). Re-granting interrupts the user's
  meeting-prep flow — the very job Outpost is hired for. The other six
  products do not have this failure mode because they have only one
  channel; bringing Outpost into the unified approach eliminates the
  failure mode there too, and inherits the contract for any future
  Gear-bundle channel that declares TCC entitlements.
- **Release surface area doubles for Outpost.** Every Outpost release
  still assembles the `.app` twice — once in `publish-brew.yml` for the
  brew zip (`build-app-product outpost`) and once in `publish-macos.yml`
  for the `.pkg` (`pkg/build.js buildApp()`) — with two signing passes
  and two `.app` paths in `dist/`. (Post-1420 the *scheduler binary* is
  built once and shared across both lanes, so the duplication is now the
  `.app` assembly and signing, not the binary compile.) The other six
  products assemble once per release; collapsing Outpost's bundle to one
  brings it in line with the cost profile every other product already has.
- **The contract is currently undocumented.** The six conforming lanes
  satisfy the approach because every `build-app-product NAME` invocation
  passes the same fixed `--bundle-name "fit-{{NAME}}"` to the shared
  assembly script, not because any spec requires it. A future per-product
  `.pkg` channel (or any other new macOS distribution channel) would
  have no documented contract to satisfy and could re-introduce
  divergence the way Outpost's `.pkg` did. Naming the contract here lets
  future work — including Outpost's `.pkg` consolidation — apply it
  explicitly.
- **The migration window is empty for the one product that needs
  migration.** Spec 1170 § Why documents that the cask remains at the
  seed placeholder; no real brew release has ever installed
  `fit-outpost.app` on a user's machine. So bringing Outpost's `.pkg`
  bundle in line with its brew bundle (or vice versa) can pick the right
  name once without a deprecation story for either channel.

The work serves **Platform Builders → Build Agent-Capable Systems**
([JTBD.md:228](../../JTBD.md)) — the job Gear is hired for, where the
Big Hire is *"help me give humans and agents shared capabilities through
the same interface, with tooling to prove changes improved outcomes"*. A
shared `.app` distribution contract is part of that interface; without
it, each new Gear macOS channel renegotiates install conventions
ad-hoc. The Outpost-specific TCC-grant failure mode above also surfaces
in **Empowered Engineers → Be Prepared and Productive**
([JTBD.md:85](../../JTBD.md)) — the job Outpost is hired for — because
re-granting Apple Events authorization interrupts the briefing flow the
job exists to protect.

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
  any other macOS channel that ships the bundle reach the bundle
  through the same root-`justfile` recipe (`build-app-product NAME` for
  product bundles, `build-app-gear` for gear). For Outpost this means
  the `.pkg` lane stops calling `products/outpost/pkg/build.js --app`
  for the bundle-assembly step and instead consumes the bundle produced
  by `build-app-product outpost`. The workflow change that wires
  `publish-macos.yml` to the canonical builder (or that retires
  `publish-macos.yml` in favor of an extended `publish-brew.yml`) is
  in scope as the means of satisfying this property; the specific
  workflow layout is a design output. For the other six products the
  property is preserved (their release paths already reach
  `build-app-product`).
- **One cdhash determinism gate covering every release path on every
  Gear macOS bundle.** Today `publish-brew.yml`'s "Verify cdhash
  stability" step gates all seven brew bundles. After this spec lands,
  every macOS release path for every Gear bundle runs the same
  baseline / rebuild / compare check against the same canonical bundle
  (SC3) before its release-asset upload, including the path that
  produces Outpost's `.pkg` payload.
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
  The workflow change that wires the canonical builder into the `.pkg`
  release path (including PR #1153-style consolidation of
  `publish-macos.yml` into `publish-brew.yml`, if that is what design
  picks) is in scope above. Beyond that — restructuring the brew
  lane's matrix shape, splitting `publish-brew.yml` per product,
  introducing a separate release-on-tag workflow per bundle, or any
  other reorganisation not required by SC1–SC4 — is out of scope.

## Success criteria

Each criterion is verifiable from the state of `main` and real
`*@v*` tag pushes across the seven product / gear bundles.

### SC1 — Outpost reduces to one bundle directory name across channels; no other product introduces a second

Today, for each of the seven product / gear bundles, the set of
`--bundle-name` values referenced from any `build-app-*` invocation
reachable from that product's release path has size 1 for six
products and size 2 for Outpost (`fit-outpost` from
`build-app-product outpost` and `Outpost` from
`products/outpost/pkg/build.js --app`). The criterion has two parts:

1. **Reduction (Outpost only):** after this spec lands, Outpost's set
   has size 1.
2. **Non-regression (all seven):** no product introduces a new
   `--bundle-name` value as a side effect of this spec; the size-1
   property the other six already satisfy by construction is
   preserved.

Verifiable on `main` post-merge by extracting, for each of the seven
products, the union of `--bundle-name` arguments reachable from that
product's release path (root `justfile` recipes for the brew lane;
`products/outpost/pkg/build.js` for Outpost's `.pkg` lane while it
still exists). Each union is a singleton.

### SC2 — One install path per product across every channel (post-release verifier for Outpost)

For each product that ships through more than one channel, every
channel's install path for that product is a byte-identical
`/Applications/...` string. Today Outpost is the only product with
more than one channel.

**Pre-merge property:** the monorepo emits a single canonical bundle
directory name for each product (SC1), so any install path of the form
`/Applications/<bundle>.app` derived from it is the same string for
every channel that consumes that bundle.

**Post-release verifier (Outpost only):** on the first `outpost@v*`
tag pushed after the unification lands, the `app` stanza in
`forwardimpact/homebrew-tap`'s `Casks/fit-outpost.rb` at the
release-time commit, and the install location encoded in
`products/outpost/pkg/macos/build-pkg.sh` on the merge commit, both
name the same `/Applications/<bundle>.app` path. The cask is in a
sibling repo this monorepo does not version-lock, so SC2's
external-repo half is an explicit post-release verifier, not a
pre-merge CI gate.

For the other six products the criterion holds trivially (single
channel → single install path). The criterion is stated per-product so
future channels for those products inherit the same constraint.

### SC3 — Every Gear macOS release path runs the same cdhash determinism check against the same canonical artifact

After this spec lands, on every `*@v*` tag push for each of the seven
product / gear bundles, every macOS release path for that tag includes
a step satisfying all three mechanical predicates:

1. **Same check.** The step records a baseline cdhash with
   `codesign -dvvv "$BUNDLE" 2>&1 | grep -i CDHash`, rebuilds the
   bundle from the same source tree by invoking
   `build-app-product <NAME>` (or `build-app-gear` for the gear
   bundle), records the post-rebuild cdhash with the same `codesign
   -dvvv | grep CDHash` invocation, and fails the release if the two
   strings differ. This is the same predicate
   `publish-brew.yml`'s "Verify cdhash stability" step encodes today
   (`.github/workflows/publish-brew.yml:78–104`).
2. **Same artifact.** Both the baseline and the after-rebuild cdhash
   measurements target the canonical bundle produced by
   `build-app-product` / `build-app-gear` — the same bundle the
   release asset for every channel is derived from. The Outpost
   `.pkg` lane must not measure cdhash against a separately-assembled
   `products/outpost/dist/Outpost.app`.
3. **Coverage.** Every CI job that produces a release asset for the
   tagged product reaches the step before its release-asset upload.

Verifiable on `main` post-merge by inspecting
`.github/workflows/publish-brew.yml` and `.github/workflows/publish-macos.yml`
(or whichever workflow replaces them per the design decision under
*One canonical build entry point*): every release-asset-producing job
contains the predicate above. Today six of seven brew lanes satisfy
this via `publish-brew.yml`'s gate; the Outpost `.pkg` lane in
`publish-macos.yml` does not.

### SC4 — Both Outpost release assets carry the same bundle identity (post-release verifier)

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

SC4 is a **post-release verifier** — the two release assets only exist
after the next `outpost@v*` tag publishes. SC3's pre-merge mechanical
predicate (same check against the same canonical artifact) is the
pre-merge gate that ensures SC4 will hold on that first release; SC4
confirms the property held end-to-end once the assets exist. For the
other six products SC4 holds trivially (single asset → identity
matches itself).

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
- [Spec 0600](../0600-native-binary-distribution/spec.md) — native binary
  distribution. SC8 ("Stable bundle identity") is the contract TCC
  grants attach to; this spec re-establishes it across every Gear
  macOS bundle and every channel that ships them.
- [`libraries/libmacos/scripts/build-app.sh`](../../libraries/libmacos/scripts/build-app.sh)
  — the shared assembly script every brew lane already invokes. Its
  `--bundle-name` flag is the divergence point Outpost's `.pkg` lane
  exploits and that this spec closes.
- [`products/outpost/pkg/build.js`](../../products/outpost/pkg/build.js)
  and
  [`products/outpost/pkg/macos/build-pkg.sh`](../../products/outpost/pkg/macos/build-pkg.sh)
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
