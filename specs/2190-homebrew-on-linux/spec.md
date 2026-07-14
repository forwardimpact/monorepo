# Spec 2190: Homebrew on Linux

**Classification:** Internal — the change lands on the release pipeline
(`.github/`), the build matrix, the packaging tooling under `build/`, and the
Homebrew tap. The install-documentation update is the one product-aligned slice
and carries the `product` label on the commit that lands it. Primary job
unblocked: **Platform Builders → Build Agent-Capable Systems** (Gear); the CLI
products also become installable on Linux for the engineers who run them.

## Problem

macOS users install every shipped bundle through Homebrew: the release pipeline
assembles the bundle's CLIs into one `fit-<bundle>.app`, signs and notarizes it,
zips it, and updates a cask. Linux users have no equivalent. The release already
compiles a native `bun-linux-x64` binary for every CLI — the `curl | bash`
bootstrap installer consumes those raw binaries on x64 Linux — but nothing turns
a bundle into an installable, upgradable Homebrew package. A Linux engineer who
hires Gear (Platform Builders) or a headless CLI product (Empowered Engineers)
has no `brew install`, no `brew upgrade`, and no install-time checksum
verification.

Homebrew runs natively on Linux — the officially supported successor to
Linuxbrew — and resolves formulae there. The existing tap can serve Linux
formulae beside its casks. The clean way to do this is to mirror the model macOS
already uses:
**one container per bundle, its contents defined by the manifest.** On macOS
that container is the signed `.app`; on Linux it is a tarball. One packaging
idea, two platform-native forms.

## Goal

Linux users on x64 and arm64 install and upgrade every tagged bundle through
Homebrew, with install-time checksum verification, from a per-bundle container
packed the same way macOS packs its `.app`.

## Scope

Covers every bundle the release tag matrix builds: the CLI products (`map`,
`pathway`, `summit`, `guide`, `landmark`, `outpost`) and the `gear` toolbox.
The rules below are stated per bundle so a future bundle folds in by adding its
tag and manifest entry, with no pipeline change.

In scope:

| Area | Change |
| --- | --- |
| Build matrix | Produce a native Linux **arm64** binary for every CLI, alongside the existing Linux x64 and macOS arm64 outputs. This needs arm64 Linux CI capacity and a runner-selection change, not only a new target entry. |
| Bundle packaging | Pack each bundle's CLIs into one per-architecture Linux tarball, its contents defined by the bundle manifest — the Linux analog of the macOS `.app` assembly. |
| Packaging symmetry | Drive every bundle's `.app` assembly and every cask's `binary` block from `build/cli-manifest.json`, gear and products alike, so the gear-vs-product `KIND` branch disappears from the pipeline. The manifest gains a `bundles` map (per-bundle plist, entitlements, version source, and any launcher or resources); one `build-app.sh <bundle>` replaces the separate gear and product assemblers; the cask binary-block render runs for every bundle. The `.app` bytes stay byte-identical, so signing and notarization are unaffected; the product **casks** gain the generated binary block. Outpost's native launcher and `.pkg`, and the gear bootstrap installer, stay bundle-specific by domain necessity. |
| Release assets | Publish the per-bundle Linux tarballs (x64 and arm64), each with a checksum. The existing x64 raw per-CLI binaries stay published unchanged for the bootstrap installer. |
| Tap | The existing tap gains one formula per bundle beside the casks. Each formula selects its bundle's tarball by host architecture and verifies the published checksum at install. |
| Release pipeline | On each tag, update every affected cask (as today) and formula (version and per-architecture checksums) so the tap tracks the release. |
| Documentation | Document the Linux install path (add the tap, then `brew install`) beside the existing macOS `brew install --cask` instructions. |

Out of scope:

- **The macOS `.app` bytes are unchanged.** The signed, notarized `.app` and
  its signing and notarization are byte-for-byte what users install today — the
  unified `build-app.sh` reproduces each bundle's `.app` exactly, verified by
  the cdhash-stability gate. The **cask** files do change: the binary block is
  now generated for every bundle (product casks gain the rendered block), which
  keeps the linked binaries from drifting. The documented `--cask` install
  command and what it installs are unchanged.
- **The bootstrap installer stays x64-only.** `fit-install.sh` keeps consuming
  the x64 raw per-CLI release binaries; it does not gain an arm64 Linux channel
  here. This is not a regression — the installer never supported arm64 Linux —
  and arm64 users install via Homebrew. Extending the installer to arm64 is
  future work.
- **No signing or notarization on Linux.** Integrity rests on the published
  checksum, as the raw binaries are already verified in the pipeline.
- **No macOS-native runtime is ported.** `outpost` links its CLI on Linux, but
  its macOS-only runtime features (menu-bar presence, TCC-gated system access)
  do not function there; the Linux formula ships the CLI surface only.
- **No architectures beyond x64 and arm64.**

## Success Criteria

1. On Linux x64, after adding the tap, `brew install <tap>/<bundle>` installs
   the bundle and every CLI the manifest assigns to that bundle runs `--help`
   with a zero exit. Verify: tap, install, `--help` each manifest CLI on an x64
   host.
2. On Linux arm64, the same tap-install-and-`--help` check passes. Verify: run
   on an arm64 Linux host or runner.
3. Each in-scope bundle has a formula in the tap, and `brew audit` passes for
   it. Verify: the file exists and the audit reports no errors.
4. Each formula declares, per architecture, the checksum of the exact tarball
   published on the release. Verify: the formula's `sha256` values equal the
   published tarballs' checksums.
5. Every release tag produces, for the tagged bundle,
   `fit-<bundle>-linux-x64.tar.gz` and `fit-<bundle>-linux-arm64.tar.gz`, each
   with a `.sha256`. Verify: the named assets are present on the release.
6. Each bundle's tarball contains exactly the CLIs the manifest assigns to that
   bundle. Verify: list the tarball contents against the manifest.
7. After a release, each affected formula's version equals the tag. Verify: read
   the formula version.
8. The macOS install path is unaffected — the documented `brew install --cask`
   command still installs the cask. Verify: the macOS cask still installs and
   passes its existing checks.
9. The x64 raw per-CLI binaries remain published and the bootstrap installer
   resolves them. Verify: `fit-install.sh` installs a named CLI on x64 Linux
   unchanged.
10. The documented Linux instructions install a working bundle. Verify:
    following the documented tap-and-install commands on Linux yields a runnable
    CLI.
11. The pipeline has no gear-vs-product conditional: `meta`, the macOS packaging
    job, and the tap job derive every bundle's `.app` contents and cask binary
    block from `build/cli-manifest.json`. Verify: no `KIND`/`kind` branch
    selects gear vs product; one `build-app.sh <bundle>` serves both; the cask
    render runs unconditionally. Only outpost's launcher/`.pkg` and the gear
    bootstrap installer remain bundle-specific.
12. The unified `.app` assembly is byte-identical to the prior per-kind scripts.
    Verify: for gear and a product, the assembled bundle (tree, `Info.plist`,
    executables) matches what `build-app-gear.sh`/`build-app-product.sh`
    produced, so the cdhash-stability gate holds.
