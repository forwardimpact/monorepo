# Spec 1170 — Deterministic Outpost.app bundle for brew lane

## Problem

`.github/workflows/publish-brew.yml` lines 78–104 fail at the **Verify cdhash
stability (plan §1b CI gate)** step on every `outpost@v*` tag push. The gate
rebuilds `dist/apps/fit-outpost.app` from the same source tree and compares
`codesign -dvvv` CandidateCDHash before and after. Two consecutive builds at
the same workspace path on the same `macos-14` runner produce different
cdhashes. The most recent failure is on `outpost@v3.0.5`
([run 26099668719](https://github.com/forwardimpact/monorepo/actions/runs/26099668719)):

```
##[error]cdhash drift detected — bundle is not deterministic
baseline: CandidateCDHash sha256=c54dbc278fe57e065dedf570d58af97611cbf9be
after:    CandidateCDHash sha256=d5d6608449a2c9aef17168a2897434ec4b1d0b43
```

The bundle is non-deterministic: signed inputs to the cdhash (Mach-O text/data,
embedded resources, Info.plist, embedded entitlements) differ between two
builds of the same tree. The build chain is `just build-app-product outpost`
in the root justfile, which delegates via `(cd products/outpost && just build)`
to `products/outpost/pkg/build.js` (compiling both the Swift launcher under
`products/outpost/macos/Outpost/` and the scheduler binary), and then to
`libraries/libmacos/scripts/build-app.sh` for bundle assembly (which in turn
shells out to `libraries/libmacos/scripts/sign-app.sh:24` for the codesign
that produces the CandidateCDHash).

## Why

The brew install path is one of three documented distribution channels for
every product (CLAUDE.md § Distribution Model; spec 0600 SC8 "Stable bundle
identity"). The other two — `npx fit-outpost` from npm and the `.pkg` from
the GitHub release page — publish successfully today;
`fit-outpost-3.0.5.pkg` is attached to the v3.0.5 release. The brew lane
has never published Outpost to a user:

- Every `outpost@v*` publish-brew run has failed: v3.0.0 (2026-05-12), v3.0.1
  / v3.0.2 / v3.0.3 (all 2026-05-13), v3.0.4 (2026-05-18), v3.0.5 (2026-05-19).
- The `forwardimpact/homebrew-tap` cask remains at the seed placeholder
  (`version "0.0.0"`, `sha256 "000…"`) — no real release has ever advanced it.
- Earlier failures were attributed to the bunfs `__dirname` / ENOENT issue
  resolved over the past two weeks. With those fixed, the cdhash gate fires
  in their place; it is now the singular known blocker for the brew lane.

The CI gate that catches cdhash drift exists because a drifting cdhash wipes
TCC (Transparency, Consent, and Control) grants on `brew upgrade`: a Calendar
/ Contacts / Apple Events authorization granted against one cdhash does not
carry forward when the next release ships a different one. Today there is
no brew install base to harm — but the first successful publish-brew run
establishes the cdhash identity that every subsequent `brew upgrade` must
preserve. Letting a non-deterministic build through now would mean every
brew user re-grants TCC permissions on every release, eroding trust in the
channel from its first use. The gate correctly blocks; the spec is to
restore determinism so the gate's verdict inverts to pass.

The work serves Empowered Engineers → Be Prepared and Productive
([JTBD.md:85](../../JTBD.md)). The TCC walkthrough fix in
[`a356381b`](https://github.com/forwardimpact/monorepo/commit/a356381b)
shipped on `outpost@v3.0.5` is the immediate value brew-channel users
cannot reach. More structurally: until this spec lands, the documented
`brew install fit-outpost` path returns a placeholder cask — the install
surface for the status-menu macOS app whose value depends on continuous
running is the channel that has never worked.

## Scope

### In scope

- The `dist/apps/fit-outpost.app` bundle assembled by
  `just build-app-product outpost`, including:
  - Swift launcher build under `products/outpost/macos/Outpost/` (sources,
    `Package.swift`, and any compiler invocation flags or environment in
    `products/outpost/pkg/build.js`).
  - The scheduler binary compiled by the same `products/outpost/pkg/build.js`
    default-mode invocation (the `fit-outpost` CLI surfaced as the bundle's
    `--extra-exec` per root justfile:275).
  - Bundle assembly by `libraries/libmacos/scripts/build-app.sh` against
    `products/outpost/macos/Info.plist`,
    `products/outpost/macos/Outpost.entitlements`, and the declared resources
    — including the codesign invocation that
    `libraries/libmacos/scripts/sign-app.sh:24` performs on its behalf.
- The `Verify cdhash stability` step of `.github/workflows/publish-brew.yml`
  (lines 78–104) as the standing CI gate. The step itself is correct and stays
  in place; its inputs change.

### Out of scope

- The six other product/gear bundles (`fit-guide`, `fit-landmark`, `fit-map`,
  `fit-pathway`, `fit-summit`, `fit-gear`). Those use the `else` branch of
  `build-app-product NAME` (root justfile:283–291) — no Swift launcher, no
  `products/outpost/pkg/build.js`. They currently publish to brew without
  cdhash drift. Re-establishing determinism for them is a separate effort if
  and when it becomes load-bearing.
- The `publish-npm.yml` and `publish-macos.yml` lanes. Both publish
  `outpost@v3.0.5` successfully today and do not gate on cdhash stability —
  npm ships JS, `publish-macos` ships a notarized `.pkg`. Any signing or
  notarization rework on those lanes is outside this spec.
- Rewriting the brew cdhash gate to be tolerant of drift. The gate exists to
  protect TCC grants on `brew upgrade` (workflow comment at lines 79–82);
  relaxing it would silently break that contract before the first user even
  installs. The spec accepts the gate's verdict as load-bearing and restores
  determinism to its inputs.
- Backfilling the brew lane with intermediate versions. Whether the cask
  jumps directly from `0.0.0` to the first post-fix release, or whether
  prior outpost tags are republished against the tap, is outside this spec.
- Diagnosis between candidate non-determinism sources catalogued in
  [issue #1036](https://github.com/forwardimpact/monorepo/issues/1036)
  ("Likely sources of non-determinism" §). The four hypotheses (embedded
  timestamps, Swift symbol ordering, debug-info paths, captured runtime
  metadata) and four suggested investigations (diffoscope,
  `SWIFT_DETERMINISTIC_HASHING`, Info.plist inspection, fix-and-republish)
  are design-phase inputs. The spec does not commit to which holds.

## Success criteria

Each criterion is verifiable from the state of `main` and a real
`outpost@v*` tag push to the existing `publish-brew.yml` workflow.

### SC1 — Local determinism

Run on a `macos-14` arm64 host with the Bun version declared by
`.github/actions/bootstrap/action.yml` (`bun-version: "1.3.11"` as of this
spec) and Xcode command-line tools available (the runner image ships them
pre-installed):

```sh
git checkout main
bun install
just build-binary "fit-outpost"
just build-app-product outpost
codesign -dvvv "dist/apps/fit-outpost.app" 2>&1 | grep -i CDHash > /tmp/cdhash.before
rm -rf dist/apps dist/binaries products/outpost/dist
just build-binary "fit-outpost"
just build-app-product outpost
codesign -dvvv "dist/apps/fit-outpost.app" 2>&1 | grep -i CDHash > /tmp/cdhash.after
diff /tmp/cdhash.before /tmp/cdhash.after
```

The final `diff` exits 0 (whereas it exits non-zero today). The recipe
mirrors the CI gate's build sequence (`publish-brew.yml:61–62`) so a green
SC1 implies a green CI gate. Verifiable on any `macos-14` arm64 host; the
criterion is not coupled to any release tag landing.

### SC2 — CI gate passes on next outpost release

The `Verify cdhash stability` step in `.github/workflows/publish-brew.yml`
passes on the next `outpost@v*` tag push to land after the fix merges, with
no `--rerun` and no manual signing intervention. The step's stdout shows a
`cdhash stable:` line rather than `cdhash drift detected`.

### SC3 — Brew cask advances past the seed placeholder

Following the green publish-brew run from SC2, the
`forwardimpact/homebrew-tap` cask `fit-outpost.rb` carries the tag's version
in its `version` field and the corresponding release zip's `sha256`, and no
longer reads `version "0.0.0"` / `sha256 "000…"`. Verifiable by:

```sh
gh api repos/forwardimpact/homebrew-tap/contents/Casks/fit-outpost.rb \
  -H "Accept: application/vnd.github.raw" | head -5
```

### SC4 — No cdhash regression for the other six bundles

For each non-`outpost` tag prefix (`guide@v*`, `landmark@v*`, `map@v*`,
`pathway@v*`, `summit@v*`, `gear@v*`), define the baseline as the most
recent `publish-brew.yml` run for that prefix that passed `Verify cdhash
stability` prior to this spec merging. After the fix lands, the next
`publish-brew.yml` run for that prefix must also pass that step.
Verification window: 60 days from the fix landing. Tag prefixes whose
baseline does not exist (no prior green run) are unverified-but-not-failed;
tag prefixes with a green baseline and no subsequent run within the window
are unverified-but-not-failed.

## References

- [Issue #1036](https://github.com/forwardimpact/monorepo/issues/1036) — bug
  report with reproduction recipe, four hypothesis sources, and four suggested
  investigations. Authored by release engineer, triaged product-aligned.
- [Spec 0740](../740-seed-homebrew-tap/spec.md) — parent of the brew lane.
  Seeds the seven casks the publish-brew workflow updates.
- [Spec 0600](../600-native-binary-distribution/spec.md) — native binary
  distribution. SC8 ("Stable bundle identity") is the determinism contract
  this spec re-establishes for Outpost; the publish-brew workflow comment
  at `.github/workflows/publish-brew.yml:79–82` cites it as the rationale
  for the gate. SC11 covers the Homebrew CLI-on-PATH install surface, which
  is unrelated to this spec.
- [`.github/workflows/publish-brew.yml`](../../.github/workflows/publish-brew.yml)
  — workflow whose `Verify cdhash stability` step is the standing gate.
  Comment at lines 79–82 names the TCC-grants rationale.
- [`products/outpost/pkg/build.js`](../../products/outpost/pkg/build.js),
  [`libraries/libmacos/scripts/build-app.sh`](../../libraries/libmacos/scripts/build-app.sh),
  and [`libraries/libmacos/scripts/sign-app.sh`](../../libraries/libmacos/scripts/sign-app.sh)
  — the three scripts whose combined output is the cdhash-drifting bundle.

— Product Manager 🌱
