# Design 1420-a — Single-Source Native Binary Builds

Spec [1420](spec.md) requires native binaries to be produced in exactly one
place, gated by a per-binary smoke test, published as a raw release channel,
and consumed by both macOS publish workflows; plus compile-readiness fixes for
`fit-codegen` and `fit-outpost`. This design names the components and the seam
each consumer attaches to.

## Components

| Component | Role | Interface |
|---|---|---|
| `just build-binary NAME TARGET` (existing, now the **only** build recipe) | The sole compile primitive and sole binary-build entry point. Unchanged contract: resolve `NAME` to a package `bin` entry, `bun build --compile` it, inject the version via `--define 'process.env.LIBCLI_VERSION'` (the one literal libcli reads to resolve every CLI's version). The 0600 enumeration recipes (`build-binaries`, `build-product-binaries`, `build-gear-binaries`) are deleted. | in: bin name + Bun target → out: `dist/binaries/NAME` |
| CLI-set manifest (new, single source of truth) | A checked-in JSON file (e.g. `build/cli-manifest.json`): the distributable **build set** — each CLI's name, the targets it builds for, and a bundle tag (which product cask, or `gear`) used only to derive `.app` membership. The one place the build set is enumerated. Per-cask packaging config (bundle layout, plists, entitlements, resources, primary/extra-exec roles, Outpost's Swift launcher) stays in the `.app` recipes — it is irreducible packaging, not build enumeration. | read by the matrix (names + targets), the local build loop (`jq`), and the `.app` recipes (bundle membership only) |
| `build-binaries.yml` (new, `workflow_call`) | Single source of build *logic*. Matrix over (CLI × target); each cell calls `just build-binary`, runs the binary's trivial invocation as a gate, then uploads the binary + checksum via `actions/upload-artifact`. | in: caller selects targets → out: run artifacts `{cli}-{target}` + `.sha256` |
| `publish-native.yml` (new) | Public raw-binary channel. Calls `build-binaries.yml` for all targets; a downstream job `download-artifact`s and attaches every binary + checksum to a GitHub release. | trigger: native release tag |
| `publish-brew.yml` (changed) | Calls `build-binaries.yml` for `bun-darwin-arm64`; a downstream job `download-artifact`s and does only `.app` wrap + codesign + cdhash check + cask PR. No compile of its own. | trigger: `gear@v*` + 6 product tags (7 total) |
| `publish-macos.yml` (changed) | Calls `build-binaries.yml` for `bun-darwin-arm64`, consumes the single `fit-outpost` artifact, then builds the Swift `Outpost` launcher and assembles the `.pkg`/`.app`. Retires the `just pkg` path's own `fit-outpost` compile. | trigger: `outpost@v*` |
| libcodegen `Long`-init (new module) | Binds protobufjs's `util.Long` for `fit-codegen`'s **own** runtime proto loading. Distinct from `libcodegen/src/types.js`, which binds `Long` in *generated downstream* code, not in the `fit-codegen` binary itself. | imported ahead of the proto-loading code path |

## Data flow

```mermaid
flowchart TD
  T1[native release tag] --> PN[publish-native.yml]
  T2[gear@v* / product@v*] --> PB[publish-brew.yml]
  T3[outpost@v*] --> PM[publish-macos.yml]
  PN -->|workflow_call: all targets| BB[build-binaries.yml]
  PB -->|workflow_call: darwin-arm64| BB
  PM -->|workflow_call: darwin-arm64| BB
  subgraph BB [build-binaries.yml matrix: CLI × target]
    C[just build-binary] --> G{smoke: run binary<br/>non-empty + exit 0?}
    G -->|fail| X[fail build]
    G -->|pass| A[upload-artifact: binary + sha256]
  end
  A --> PN2[download-artifact → attach to release]
  A --> PB2[download-artifact → .app + codesign + cdhash + cask PR]
  A --> PM2[download-artifact → Swift launcher + .pkg/.app]
```

## Key Decisions

| Decision | Choice | Rejected alternative |
|---|---|---|
| How the three workflows share one build | `build-binaries.yml` as a `workflow_call` reusable job each invokes; the compile is deterministic (already required by specs 0600/1170 for cdhash stability), so identical logic yields identical bytes without cross-workflow coupling. | **publish-native builds once and brew/macos download its release assets.** Reintroduces the documented three-workflow race on `gh release create` and cross-tag asset-availability ordering; rejected because determinism already guarantees byte-equality. |
| Artifact transport across the `workflow_call` seam | `actions/upload-artifact` inside `build-binaries.yml`; consuming jobs in the same run `download-artifact` by the `{cli}-{target}` key. Reusable-workflow job `outputs` cannot carry files, so artifacts are the transport. | **Return binaries via workflow `outputs`.** Outputs are strings only; cannot carry the compiled binary. |
| Where the smoke gate runs | Inside `build-binaries.yml`, *executing* each compiled binary. This forces each target to build on a runner of its own OS/arch (ubuntu for linux-x64, `macos-14` for darwin-arm64) — a foreign-OS binary cannot be run. | **Cross-compile every target on ubuntu and skip execution.** Cheaper, but an un-executed binary is exactly the `fit-codegen`/`fit-outpost` failure mode shipping today; a gate that never runs the binary cannot catch it. |
| Smoke gate location: workflow vs `just build-binary` | Workflow matrix step, leaving `just build-binary` a pure compile primitive. | **Fold the smoke test into `just build-binary`.** Couples local-dev compile to running the artifact (cross-target builds become unrunnable locally) and muddies the one-responsibility primitive. |
| `fit-codegen` `Long` fix | A libcodegen module binds `util.Long` to the `long` implementation. protobufjs populates `util.Long` via a dynamic `inquire("long")` the bundler cannot resolve, leaving it undefined when a 64-bit field default is computed; binding it explicitly fixes it. The binding must run before protobufjs resolves any type, so it lives in a module the proto-loading code imports — **not** the entry shim. | **Wire it in the `bin/fit-codegen.js` entry shim.** ES `import`s are hoisted above entry-body statements, so a shim runs too late to bind `util.Long` before the imported proto-loading code uses it. |
| `fit-outpost` entry | Shared build compiles the package's existing `bin` entry (the real entry that constructs the runtime and invokes it) instead of `src/outpost.js`, whose no-op compile is retired. | **Add a self-exec entry to `src/outpost.js`.** Duplicates the runtime construction site the codebase centralizes in the bin wrapper, leaving two entries to keep in sync. |
| Platform matrix | `bun-linux-x64` (ubuntu-latest) + `bun-darwin-arm64` (`macos-14`) — the two targets with a consumer today (CI bootstrap; Homebrew/installer). `linux-arm64` and `darwin-x64` deliberately deferred. | **Full cross-product of all Bun targets.** ~97 MB × CLI-count × target-count of assets for targets no one consumes yet; deferred until a consumer exists. |
| CLI set | The already-distributed union: the 6 product CLIs + the 25-CLI gear set (the membership `build-gear-binaries` enumerated, which includes `fit-codegen`), now functional, with `fit-outpost` built from its bin entry. `fit-wiki` is **added** to the build set (it is in neither build recipe today) and attaches to the native channel for the bootstrap consumer. Internal-only bins excluded. | **All 43 `bin` entries.** Includes internal-only CLIs (`fit-selfedit`, `coaligned`, several `fit-svc*`) the spec excludes and npm already covers. |
| Where the CLI set lives | A checked-in data file (JSON), because its two readers cross a boundary a recipe cannot: the GitHub Actions matrix is YAML and cannot read a justfile variable, while the local "build all" loop is a recipe. A file both parse (`fromJSON` in the matrix, `jq` in the loop) is the only shared form. The 0600 per-category recipes are deleted, not called from CI. | **A justfile variable.** The YAML matrix cannot read it, forcing a second copy in the workflow — reintroducing the two-lists drift that let a broken `fit-codegen` sit in the gear list. |
| `.app` assembly after cleanup | `build-app-product`/`build-app-gear` survive and keep their per-cask packaging config, but stop driving compilation: they read already-built binaries. `build-app-gear`'s inline 25-CLI list is replaced by the gear subset of the manifest. `build-app-product` no longer compiles `fit-outpost` (consumes the shared binary) but still builds and bundles Outpost's Swift launcher as the bundle's primary exec — so Outpost's `.app` stays structurally distinct; only the *compile* special-case goes, not the launcher. `build-apps` (depended on the deleted `build-binaries`) is removed; the matrix is the fan-out. | **Make the manifest carry every bundle's plist/entitlement/exec layout too.** Over-models a flat build list into packaging config the recipes already express per cask; the manifest owns only the build set, packaging stays in the recipes. |

## What stays put (scope boundaries)

- **Outpost's Swift launcher and `.pkg`/`.app` assembly + signing** remain in
  the two macOS workflows. The shared build produces only the Bun `fit-outpost`
  binary; the launcher is a separate native artifact, not a duplicate CLI, and
  cannot be matrix-compiled.
- **The `.app` codesign / cdhash-determinism contract** (specs 0600, 1170) is
  preserved unchanged; the cask body (binary stanzas, livecheck) stays
  human-edited as today.
- **`fit-bootstrap` consuming the Linux binary** is out of scope — this design
  publishes the binary; adopting it in the bootstrap action is separate.

## Interfaces between phases

- `build-binaries.yml` takes target selection as a `workflow_call` input and
  emits `actions/upload-artifact` entries keyed `{cli}-{target}` with a sibling
  `.sha256`. Callers declare `needs:` on the reusable job and
  `download-artifact` by that key in a downstream job.
- The smoke gate's contract is "binary exits 0 and writes non-empty output on
  its trivial invocation" — satisfiable by every CLI's existing `--help`.
- The libcodegen `Long`-init module exposes no API; its only contract is
  import-order precedence over `fit-codegen`'s proto-loading code path.
- The build set must be codegen-current before compiling (the prerequisite the
  deleted `build-binaries` carried via `codegen`): the matrix runs codegen
  ahead of the per-CLI compile, and the local build-all loop does the same.
