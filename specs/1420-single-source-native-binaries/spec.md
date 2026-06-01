# Spec 1420 — Single-Source Native Binary Builds

## Problem

[Spec 0600](../0600-native-binary-distribution/spec.md) added a native-binary
channel so macOS users can run `fit-*` CLIs without Node. That channel works,
but the binaries behind it are built **more than once, more than one way**, and
the build is broken or absent for three of the CLIs. There is no single
artifact a downstream packager can point at.

### Native binaries are produced by divergent, duplicated paths

| Surface | Trigger | How it produces the binary | Output |
|---|---|---|---|
| Homebrew gear + 5 product casks (`publish-brew.yml`) | `gear@v*`, five product tags | `just build-binary` / `just build-gear-binaries` | zipped `.app` per cask |
| Homebrew Outpost cask (`publish-brew.yml`, `outpost@v*`) | `outpost@v*` | special-cased to Outpost's own `just pkg` build, **not** `just build-binary` | zipped `.app` |
| Outpost installer (`publish-macos.yml`) | `outpost@v*` | the same Outpost `just pkg` build again | `.pkg` |
| CI bootstrap (`fit-bootstrap`) | every workflow run | no native binary — invokes CLIs through `bunx` from source | n/a |

Two workflows compile overlapping binaries from the same source on the same
tag with no shared output, Outpost's compile path differs from the shared one,
and nothing produces a Linux binary at all.

### Three CLIs cannot take part in a unified build today

| CLI | Observed failure when compiled standalone | Consequence |
|---|---|---|
| `fit-codegen` | The compiled binary exits at startup, before its first line of work: protobufjs's optional 64-bit-integer support does not survive standalone bundling, so resolving a field default throws. | It is **already enumerated in the gear build set**, so the gear cask ships a CLI that exits on launch. |
| `fit-wiki` | The binary resolves its version by reading its own `package.json` at runtime; that file is absent from the compiled binary's mount, so it exits with `ENOENT`. `fit-codegen` already avoids this by reading a build-time-injected version; `fit-wiki` does not. | Not compile-ready; cannot join the build until version resolution stops touching the filesystem. |
| `fit-outpost` (defect 1) | Outpost's installer compiles a module that only *exports* its entry function and never calls it, so the binary does nothing (`--help` prints nothing, exits 0). The working entry is the package's existing `bin` (a thin wrapper that constructs the runtime and invokes the entry). | The installer's binary is a no-op. |
| `fit-outpost` (defect 2) | That working `bin` entry reads its build-time version as `OUTPOST_VERSION`, but the shared builder injects `FIT_OUTPOST_VERSION` (derived from the bin name); the names do not match. | A shared build of `fit-outpost` would carry no version. |

`fit-wiki init` + `fit-wiki pull` run on **every** bootstrap; `fit-codegen
--all` runs only on a cold cache. So `fit-wiki`'s startup is paid every CI run
while it has no binary, and `fit-codegen`'s binary is unusable on the cold path
that needs it.

### Indicative opportunity (motivation, not an acceptance gate)

Comparing a working compiled binary against source-via-`bunx` (25-run medians,
linux-x64, from the investigation that motivated this spec): `fit-wiki` startup
~343 ms → ~191 ms, and a real `fit-wiki pull` ~697 ms → ~540 ms — a roughly
~150 ms fixed saving per invocation, paid on every one of the team's many daily
CI runs. These figures motivate the Linux channel; none is a success criterion.

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
|---|---|---|
| Platform Builders | "Give humans and agents shared capabilities through the same interface" — Gear distribution ([JTBD.md](../../JTBD.md)) | Gear ships a `fit-codegen` binary that crashes on launch; the channel cannot be trusted while its build is divergent and partly broken. |
| Engineering Leaders | The zero-Node Homebrew evaluation path that spec 0600 set out to deliver | A cask whose bundled CLI exits immediately undermines the friction-free first look 0600 promised. |
| Teams Using Agents | "Run a continuously improving agent team" ([JTBD.md](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team)) | Native binaries are built three ways with no single set to adopt, and no Linux binary exists to make a faster bootstrap even possible. |

## Scope

### In scope

| Component | What changes |
|---|---|
| Shared binary build | One mechanism compiles the distributable `fit-*` CLI set for a defined platform matrix and is the **only** place a native binary is produced. Every consumer sources binaries from it. |
| Per-binary build gate | Each compiled binary is run (a trivial invocation) inside the build; a non-zero exit or empty output fails the build, so the `fit-codegen` and `fit-outpost` failure modes above can never be published. |
| Native release channel (`publish-native.yml`) | Publishes the raw per-platform binaries plus checksums as release assets — a single addressable artifact for the CI bootstrap and any future packager. |
| Homebrew workflow (`publish-brew.yml`) | Sources its macOS binaries from the shared build instead of compiling its own; the `.app` wrap, codesign, cdhash-stability check, and cask-update PR are unchanged. |
| Outpost installer workflow (`publish-macos.yml`) | Sources the single `fit-outpost` binary from the shared build instead of Outpost's own compile; the Swift launcher build and `.pkg`/`.app` assembly and signing are unchanged. |
| `fit-codegen` compile-readiness | The compiled `fit-codegen` binary starts and runs to completion. |
| `fit-wiki` compile-readiness | The compiled `fit-wiki` binary starts and reports its version. |
| `fit-outpost` compile-readiness | `fit-outpost` is built by the shared mechanism from its real entry point and the compiled binary reports its version. |

### Out of scope

- The exact CLI-set membership and platform matrix (which targets, which
  architectures). The bounding set is the CLIs already distributed via npm and
  Homebrew — the six product CLIs and the gear CLIs (which include
  `fit-codegen`) — plus `fit-wiki`, which the bootstrap path needs and which is
  not built today; internal-only CLIs are excluded. Success criteria below are
  evaluated against the design-chosen set and matrix.
- Outpost's Swift launcher (`Outpost`) and the `.app`/`.pkg` assembly and
  signing mechanics — they remain macOS-only and are not compiled by the shared
  mechanism; this spec only changes where the bundled `fit-outpost` binary
  comes from.
- The macOS `.app` signing, notarization, and cdhash-determinism contract
  (specs 0600 and [1170](../1170-outpost-cdhash-determinism/spec.md)) — the
  contract is preserved, not redefined.
- Adopting the Linux binary inside `fit-bootstrap` — publishing the binary is
  in scope; changing the bootstrap action to consume it is a separate change.
- The npm channel — it remains the cross-platform default and is unchanged.
- Windows binaries.

## Success Criteria

| Claim | Verification |
|---|---|
| Native binaries are produced in exactly one place; both macOS publish workflows consume that output rather than compiling their own. | Inspect `publish-brew.yml` and `publish-macos.yml`; observe neither contains a binary-compile step and both obtain binaries from the shared build. |
| Every published binary starts and produces output. | For each CLI in the design-chosen set, on each target in the design-chosen matrix, run the release binary's trivial invocation; observe a zero exit and non-empty output. The same check runs as the build gate and fails the build on violation. |
| `fit-codegen` runs as a compiled binary. | Build `fit-codegen` through the shared mechanism and run `fit-codegen --version`; observe it prints the version and exits 0 (today it throws at startup). |
| `fit-wiki` runs as a compiled binary. | Build `fit-wiki` through the shared mechanism and run `fit-wiki --version`; observe it prints the version and exits 0 (today it exits `ENOENT`). |
| `fit-outpost` is built from its real entry by the shared mechanism and reports its version. | Build `fit-outpost` through the shared mechanism and run `fit-outpost --version` and `fit-outpost --help`; observe the version prints and help lists the commands (today the installer's binary prints nothing). |
| The native release channel publishes per-platform binaries with checksums. | Trigger `publish-native.yml`; observe the release carries one binary per CLI-per-target plus a checksum for each. |
| A Homebrew cask built through the new path is equivalent for the user. | Install such a cask; observe it exposes the same CLI set on `PATH`, each answers `--help` with a zero exit, and the cdhash-stability check still passes. |
