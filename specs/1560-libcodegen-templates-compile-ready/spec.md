# Spec 1560 — Compiled `fit-codegen` Runs Codegen to Completion

## Problem

[Spec 1420](../1420-single-source-native-binaries/spec.md) made the compiled
`fit-codegen` binary launch cleanly (success criterion #3: `fit-codegen
--version` exits 0). The binary now starts, resolves protos, and answers
`--help`. It still cannot do the one thing it exists to do — generate code.

Running the compiled binary against the repo's protos fails:

```
Missing service.js.mustache template
```

`libcodegen` looks up its mustache templates at render time by resolving a
path relative to its own source location. When the library runs from source
(`bunx fit-codegen` or `just codegen`), the templates sit next to the source
and the lookup succeeds. When the library is bundled into a single-file
compiled binary, the templates are not part of the binary's runtime surface
— the lookup throws once codegen reaches the first render call.

Spec 1420's per-binary build gate verifies that each compiled CLI starts and
produces output (success criterion #2). `fit-codegen --version` satisfies
that gate today, so the build gate is green, while `fit-codegen --all` —
the binary's actual job — is unusable. Both `kata-review` panels on spec
1420 flagged this and recommended tracking it as a separate spec rather
than dismissing it silently.

`libcodegen` is consumed today only from source (`bunx`/`just codegen`), so
no user hits this failure. But the gear Homebrew cask ships a `fit-codegen`
whose `--version` exits 0 and `--all` cannot complete — a binary that passes
the build gate while remaining unfit for its purpose.

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
|---|---|---|
| Platform Builders | [Build Agent-Capable Systems](../../JTBD.md#platform-builders-build-agent-capable-systems) — Gear distribution | Gear ships a compiled `fit-codegen` that passes the per-binary gate but cannot complete its actual user-facing task; the channel cannot be trusted as the distribution form for codegen while real operation depends on running from source. |
| Engineering Leaders | The zero-Node Homebrew evaluation path spec 0600 set out to deliver | A cask whose bundled CLI exits cleanly on `--help` but cannot produce its output undermines the friction-free first look 0600 promised. |
| Teams Using Agents | [Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team) | Cask binaries that answer `--help`/`--version` but not their work command undermine the contract that "what is on `PATH` works" — the contract a team implicitly relies on when an agent shells out to a CLI. |

## Scope

### In scope

| Component | What changes |
|---|---|
| `libcodegen` template resolution | The library's render paths obtain their templates by a mechanism that works identically from source-of-truth Node/Bun execution and from a single-file compiled binary. The library owns the mechanism; consumers reach a render path without supplying or locating templates themselves. The mechanism is chosen by `design-a.md`; the spec binds only the property. |
| Compiled-binary verification for `fit-codegen` | Spec 1420's per-binary verification (whether extended in place or replaced) gates `fit-codegen` on a generation invocation against the same proto set `bunx fit-codegen --all` resolves on `main`, exercising at least one render path per template kind (`service`, `client`, `definition`, `services-exports`, `definitions-exports`); the gate fails on any template-resolution or render-time error. |
| Source-execution parity | `bunx fit-codegen` and `just codegen` continue to work and produce the same output they produce today; the change is observable only as "compiled `fit-codegen` now also works" — never as "source `fit-codegen` regressed". |

### Invariants preserved (not changes)

These properties are unchanged by this spec; they appear here so the design phase preserves them rather than treating them as implicitly out of scope.

- **Template set.** The five template files (`service`, `client`, `definition`, `services-exports`, `definitions-exports`) are neither added, removed, nor renamed.
- **Rendered output.** What `fit-codegen --all` produces is unchanged file-for-file from a source re-run on the same proto inputs; codegen output today is deterministic byte-for-byte given a fixed input set (no timestamps, no `Date.now()`, no map-iteration leak), so equivalence is checked without a reproducibility hedge.
- **Public render-path API surface.** `libcodegen`'s public exports — `CodegenBase`, `CodegenTypes`, `CodegenServices`, `CodegenDefinitions`, `CodegenMetadata` (from `libraries/libcodegen/src/index.js`) — continue to expose render paths that callers reach without supplying a template path, a template loader, or a template body. The change moves where templates come from, not how callers ask for renders.
- **npm distribution.** The published `@forwardimpact/libcodegen` package continues to carry the template files in the published tarball under `templates/`. Changes here are limited to how `libcodegen` resolves templates at runtime; the on-disk shape of the npm artifact is preserved.

### Out of scope

- Adding a Windows compiled binary or any platform not already in spec 1420's matrix.
- The `loadTemplate("exports")` jsdoc kind in `libraries/libcodegen/src/base.js`, for which no template file exists today — tracked separately as Issue [#1450](https://github.com/forwardimpact/monorepo/issues/1450).
- A second compiled consumer of `libcodegen` (none exists today; `fit-codegen` is the only `bin` reaching a render path). Forward-compatibility for hypothetical future consumers is a natural consequence of putting the resolution mechanism inside the library, not a separate verification gate.

## Success Criteria

| Claim | Verification |
|---|---|
| The compiled `fit-codegen` binary completes codegen against the repo's protos. | Build `fit-codegen` through the shared mechanism from spec 1420; run it on a checkout whose `generated/` directory has been removed; observe it exits 0 (today it exits non-zero with the template-missing error quoted in § Problem). |
| The compiled binary's output matches the source path's output byte-for-byte. | Run `bunx fit-codegen --all` from source against a clean checkout at the change's base commit and snapshot `generated/`; remove `generated/` and run the compiled binary with the change applied the same way; observe the resulting tree is file-for-file identical to the snapshot. The "Rendered output" invariant pins this expectation to byte-equivalence without exemption. |
| The per-binary build gate from spec 1420 fails when the compiled `fit-codegen` cannot complete codegen. | Inspect the gate's configuration; observe the `fit-codegen` invocation exercises a generation path against the same proto set `bunx fit-codegen --all` resolves on `main`, and any template-resolution or render-time error fails the build. A negative-path demonstration (the design's pick: introduce a template-missing condition and observe build failure) is recorded in `design-a.md`. |
| Source-execution behaviour is unchanged. | Run `bunx fit-codegen --all` and `just codegen` against a clean checkout at the change's base commit; record the resulting `generated/` tree as the baseline; with the change applied, run the same commands and observe a file-for-file match against the baseline. |
| The npm-distributed package continues to ship template files. | Run `npm pack --dry-run` (or equivalent) on `libraries/libcodegen`; observe `templates/*.mustache` are present in the file listing and the set matches today's. |

## References

- [Spec 1420](../1420-single-source-native-binaries/spec.md) — Single-source
  native binary builds, success criterion #3 (`fit-codegen --version` exits 0)
  and success criterion #2 (per-binary build gate). This spec sits downstream
  of both.
- [Spec 0600](../0600-native-binary-distribution/spec.md) — Native binary
  distribution; sets up the gear Homebrew cask whose "friction-free first look"
  the Engineering Leaders persona row references.
- Issue [#1346](https://github.com/forwardimpact/monorepo/issues/1346) — the
  surfaced gap and the panel-deferral history from spec 1420 review.
- Issue [#1450](https://github.com/forwardimpact/monorepo/issues/1450) —
  the deferred `loadTemplate("exports")` orphan jsdoc kind.
- [JTBD.md](../../JTBD.md) — Platform Builders, Engineering Leaders, and
  Teams Using Agents personas.

— Product Manager 🌱
