# Spec 1560 — Compiled `fit-codegen` Runs Codegen to Completion

## Problem

[Spec 1420](../1420-single-source-native-binaries/spec.md) made the compiled
`fit-codegen` binary launch cleanly (success criterion #3: `fit-codegen
--version` exits 0). The binary now starts, resolves protos, and answers
`--help`. It still cannot do the one thing it exists to do — generate code.

Running the compiled binary against the repo's protos fails:

```text
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
| Engineering Leaders | Spec 0600's zero-Node Homebrew evaluation path (this row's stake is upstream of [Spec 0600](../0600-native-binary-distribution/spec.md), not a JTBD job in [JTBD.md](../../JTBD.md)) | A cask whose bundled CLI exits cleanly on `--help` but cannot produce its output undermines the friction-free first look 0600 promised. |
| Teams Using Agents | [Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team) | Cask binaries that answer `--help`/`--version` but not their work command undermine the contract that "what is on `PATH` works" — the contract a team implicitly relies on when an agent shells out to a CLI. |

## Scope

### In scope

| Component | What changes |
|---|---|
| `libcodegen` template resolution | The library's render paths obtain their templates by a mechanism that works identically from source-of-truth Node/Bun execution and from a single-file compiled binary. Consumers reach a render path without supplying or locating templates themselves. The mechanism is chosen by `design-a.md`; the spec binds only the property and does not pre-narrow against either a library-internal mechanism or a consumer-side resolution. |
| Compiled-binary verification for `fit-codegen` | Spec 1420's per-binary verification (whether extended in place or replaced) gates `fit-codegen` on a generation invocation against the same proto set `bunx fit-codegen --all` resolves on `main`, exercising at least one render path per template kind — exactly the five rendered today: `service`, `client`, `definition`, `services-exports`, `definitions-exports`; the gate fails on any template-resolution or render-time error. |
| Source-execution parity | `bunx fit-codegen` and `just codegen` continue to work and produce the same output they produce today; the change is observable only as "compiled `fit-codegen` now also works" — never as "source `fit-codegen` regressed". |
| Rendered-output determinism repair | `CodegenDefinitions.runExports` (`libraries/libcodegen/src/definitions.js:62`) and `CodegenServices.runExports` (`libraries/libcodegen/src/services.js:55`) iterate `fs.readdirSync(...)` without sorting; `collectProtoFiles` at `libraries/libcodegen/src/base.js:127` already sorts, these two `runExports` paths do not, and POSIX does not guarantee `readdirSync` ordering. A one-line sort added in both paths makes the "Rendered output" invariant factually true and gives SC #2's byte-equivalence a stable basis across filesystems. |

### Invariants preserved (not changes)

These properties are unchanged by this spec; they appear here so the design
phase preserves them rather than treating them as implicitly out of scope.

- **Template set.** The kind set is exactly the five rendered today (`service`,
  `client`, `definition`, `services-exports`, `definitions-exports`); none are
  added, removed, or renamed.
- **Rendered output.** What `fit-codegen --all` produces is unchanged
  file-for-file from a source re-run on the same proto inputs. Codegen output is
  deterministic byte-for-byte given a fixed input set (no timestamps, no
  `Date.now()`) once the unsorted `readdirSync` iterations in `runExports`
  (`libraries/libcodegen/src/definitions.js:62`,
  `libraries/libcodegen/src/services.js:55`) are sorted — a one-line repair
  carried in this change's scope (see § Scope row "Rendered-output determinism
  repair"). With that repair in place, equivalence is checked without a
  reproducibility hedge.
- **Public render-path API surface.** `libcodegen`'s public exports —
  `CodegenBase`, `CodegenTypes`, `CodegenServices`, `CodegenDefinitions`,
  `CodegenMetadata` (from `libraries/libcodegen/src/index.js`) — continue to
  expose render paths that callers reach without supplying a template path, a
  template loader, or a template body. The change moves where templates come
  from, not how callers ask for renders.
- **npm distribution.** `@forwardimpact/libcodegen` consumers continue to reach
  render paths without supplying or locating templates themselves. The
  user-observable property is preserved; the mechanism (on-disk templates under
  `templates/` vs. inlined string literals in the published `dist/`, or anything
  else) is `design-a.md`'s call.

### Out of scope

- Adding a Windows compiled binary or any platform not already in spec 1420's
  matrix.
- The `loadTemplate("exports")` jsdoc kind in
  `libraries/libcodegen/src/base.js`, for which no template file exists today —
  tracked separately as Issue
  [#1450](https://github.com/forwardimpact/monorepo/issues/1450).
- A second compiled consumer of `libcodegen` (none exists today; `fit-codegen`
  is the only `bin` reaching a render path). Forward-compatibility for
  hypothetical future consumers is a natural consequence of putting the
  resolution mechanism inside the library, not a separate verification gate.

## Success Criteria

| Claim | Verification |
|---|---|
| The compiled `fit-codegen` binary completes codegen against the repo's protos. | Build `fit-codegen` through the shared mechanism from spec 1420; run it on a checkout whose `generated/` directory has been removed; observe it exits 0 (today it exits non-zero with the template-missing error quoted in § Problem). |
| The compiled binary's output matches the source path's output byte-for-byte. | At the change-applied commit, run `bunx fit-codegen --all` from source against a clean checkout and snapshot `generated/`; remove `generated/`, build the compiled `fit-codegen` binary from the same commit, run it the same way, and observe the resulting tree is file-for-file identical to the snapshot. The "Rendered output" invariant pins this expectation to byte-equivalence without exemption (the determinism repair is in this change's scope, so source and binary outputs are both stable). |
| The per-binary build gate from spec 1420 fails when the compiled `fit-codegen` cannot complete codegen. | Inspect the gate's configuration; observe the `fit-codegen` invocation exercises a generation path against the same proto set `bunx fit-codegen --all` resolves on `main`, exercising at least one render path per template kind — exactly the five rendered today (`service`, `client`, `definition`, `services-exports`, `definitions-exports`); any template-resolution or render-time error fails the build. A negative-path demonstration of the gate firing is recorded in `design-a.md`. |
| Source-execution behaviour is unchanged. | Run `bunx fit-codegen --all` and `just codegen` against a clean checkout at the change's base commit; record the resulting `generated/` tree as the baseline; with the change applied, run the same commands and observe a file-for-file match against the baseline. |
| `@forwardimpact/libcodegen` consumers continue to reach render paths without supplying or locating templates. | Install `@forwardimpact/libcodegen` from `npm pack`-ed tarball into a fresh consumer project; import a public render path (e.g. `CodegenServices.runExports`) and invoke it without passing a template path, template loader, or template body; observe it produces rendered output. The mechanism (on-disk `templates/` vs. inlined `dist/`) is `design-a.md`'s call; the verifier checks only that the consumer-visible property holds. |

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
