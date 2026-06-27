# Plan 1420-a — Single-Source Native Binary Builds

Implements [design 1420-a](design-a.md) for [spec 1420](spec.md).

## Approach

Land the `fit-codegen` compile-readiness fix first so the shared
`just build-binary` emits a working `fit-codegen` binary; then introduce the
single-source-of-truth CLI manifest and collapse the bespoke `just` recipes onto
it; then add the `build-binaries.yml` reusable workflow plus
`publish-native.yml` and rewire `publish-brew.yml`/`publish-macos.yml` to
consume its artifacts and retire the duplicate `fit-outpost` compile. Each part
is its own branch off `origin/main` and verifiable on its own.

## Parts

| Part | Title | Scope | Depends on |
|---|---|---|---|
| [01](plan-a-01.md) | Compile-readiness fix | `fit-codegen` `util.Long` binding | — |
| [02](plan-a-02.md) | CLI manifest + justfile + docs | `build/cli-manifest.json`; delete the 0600 enumeration recipes; manifest-driven `build-all`, `build-app-gear`, `build-app-product` outpost path; release-doc update | 01 |
| [03](plan-a-03.md) | Native channel + workflow rewire | `build-binaries.yml` reusable matrix, `publish-native.yml`, `publish-brew.yml`/`publish-macos.yml` rewire, `pkg/build.js` scheduler retirement | 01, 02 |

## Execution

Sequential: **01 → 02 → 03**. Part 03's smoke gate only passes once 01's
`fit-codegen` fix is on `main` and its matrix reads the manifest 02 creates.
Route all three to an engineering agent — there is no docs-only part (the
release-doc edit in 02 is one table footnote adjacent to the recipe change).
`outpost-determinism-probe.yml` is the local guard that 02's outpost-app rewrite
preserves the spec-1170 cdhash contract; no part edits it.

## Risks

- **cdhash determinism (spec 1170).** Part 02 changes how `fit-outpost.app` is
  assembled (Swift launcher built standalone via `pkg/build.js --launcher`,
  scheduler sourced from the shared `dist/binaries/fit-outpost`). The launcher's
  determinism profile is untouched and the bun compile is already deterministic,
  but the `outpost-determinism-probe.yml` PR check is the gate that proves it —
  treat a probe failure as a blocker, not flake.
- **Smoke gate forces same-OS runners.** Each `bun-darwin-arm64` matrix cell
  must run on `macos-14` and each `bun-linux-x64` cell on `ubuntu-latest`; a
  cell scheduled on the wrong OS cannot execute its binary and will fail
  confusingly. The matrix-generation job must attach the runner label per
  target.
- **`fit-codegen` startup crash reproduces only when bundled.** The `Long` bug
  is invisible under `bun run`/`bunx` (source execution resolves `long`); it
  appears only in the `--compile` artifact. Verify every 01 fix against the
  *compiled* binary, never the source CLI.
