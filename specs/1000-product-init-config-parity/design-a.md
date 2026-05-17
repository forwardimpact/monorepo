# Design 1000-a — Shared init writer

Spec [1000-product-init-config-parity](spec.md) requires one callable interface
that every product's `init` verb hands its starter material to, with
namespace-scoped ownership semantics for `config/config.json` and `.env`.

## Components

| Component | Home | Role |
|---|---|---|
| `bootstrapProject` | new library `@forwardimpact/libinit` | Single entry point. Accepts target dir, config fragment, env entries, overwrite-intent set; emits the merged on-disk state or refuses. |
| `mergeConfigFragment` | `libinit/src/config.js` | Pure function: takes existing `config.json` object, starter fragment, overwrite set; returns merged object or throws a `ConflictError` listing key paths. |
| `mergeEnvEntries` | `libinit/src/env.js` | Pure function: same shape over `.env` key/value pairs against existing file contents (lines preserved). |
| `ConflictError` | `libinit/src/errors.js` | Carries `{ kind: "config" \| "env", paths: string[], overwriteSurface: string }`. Products convert to non-zero exit + stderr diagnostic. |
| `fit-guide init` adapter | `products/guide/src/commands/init.js` | Calls `bootstrapProject` with `{ init, product.guide, service.mcp }` namespaces + service-URL/secret env entries. Keeps `.claude/skills/` and `package.json` writes — those are not config/env. |
| `fit-map init` adapter | `products/map/src/commands/init.js` | Calls `bootstrapProject` with no config fragment (or a `product.map` namespace if the design picks one). Keeps the `data/pathway/` copy. |
| User guide | `websites/fit/docs/libraries/project-bootstrap/index.md` | New-product onboarding contract — one home, per [libraries/CLAUDE.md § CLIs and progressive documentation](../../libraries/CLAUDE.md). |

## Interface

```js
import { bootstrapProject } from "@forwardimpact/libinit";

await bootstrapProject({
  target,              // absolute path; defaults to process.cwd()
  config: {            // top-level keys are product-owned namespaces; may be {} or omitted
    "product.guide": { systemPrompt: "…" },
    "service.mcp":   { systemPrompt: "…", tools: { … } },
  },
  env: {               // .env entries; may be {} or omitted
    SERVICE_SECRET: "…",
    MCP_TOKEN:      "…",
  },
  overwrites: {        // explicit overwrite intent, partitioned per file
    config: ["product.guide.systemPrompt"],  // dotted leaf paths
    env:    ["MCP_TOKEN"],                   // bare keys
  },
});
```

Return is `void` on success, throws `ConflictError` on refused write. The
interface accepts a fragment per call — products call it once. Multiple products
call it independently against the same target; the on-disk state converges by
the same merge rules each call applies.

`bootstrapProject` always ensures `config/config.json` exists at the target,
even when `config` is `{}` or omitted — the file is written as `{}` if no
prior file exists. This is the surface that makes `fit-map init` satisfy the
spec's anchoring requirement (spec.md § Success Criteria row "subsequent
fit-map invocations anchor at the init target") without requiring fit-map to
ship a starter fragment. `.env` is written only when at least one entry is
supplied or pre-existed.

## Data flow

```mermaid
sequenceDiagram
  participant CLI as Product CLI (init verb)
  participant Lib as libinit.bootstrapProject
  participant FS as Target dir
  CLI->>Lib: { target, config, env, overwrites }
  Lib->>FS: read config/config.json (or {} if absent)
  Lib->>FS: read .env (or "" if absent)
  Lib->>Lib: mergeConfigFragment(existing, fragment, overwrites)
  Lib->>Lib: mergeEnvEntries(existing, entries, overwrites)
  alt conflict
    Lib-->>CLI: throw ConflictError(paths, surface)
    CLI-->>CLI: stderr diagnostic + non-zero exit
  else clean
    Lib->>FS: ensure config/ dir
    Lib->>FS: write config/config.json (pretty JSON; "{}" when fragment empty)
    Lib->>FS: write .env via libsecret.updateEnvFile (per-key)
  end
```

## Namespace ownership semantics

The spec frames product ownership at **top-level keys in `config.json`** —
a product declares the namespaces it owns and the writer must never let one
product's call mutate another product's namespace. The writer enforces this
by carrying the same refuse-by-default rule **all the way to the leaf key
path**: cross-namespace writes never collide by construction (the leaf-path
walk visits disjoint subtrees), and within a single product's own namespace
the same-key-different-value rule prevents accidental self-overwrite across
two passes of the same product's `init`. Top-level-namespace ownership is the
spec's correctness floor; leaf-path enforcement is the strictly stronger
contract this design picks. The writer walks the fragment depth-first; each
leaf path is one of:

| Pre-state | Fragment value | Result |
|---|---|---|
| absent | any | write |
| present, deep-equal (JSON canonical) | same | no-op |
| present, different | different | refuse, unless path ∈ `overwrites.config` |

"Deep-equal (JSON canonical)" is defined as: serialize both subtrees with
sorted object keys and compare the resulting strings. This is the normalization
rule that lets the writer treat re-invocation with the same starter as a
no-op even when the runtime order of object keys differs from the on-disk
order.

For `.env`, the same three rows apply at the **bare-key** granularity, against
`overwrites.env`. The value comparison is byte-for-byte over the string after
`KEY=`. The writer's permission and line-rewrite behaviour is whatever the
existing `libsecret.updateEnvFile` provides today (see decision #7); this
design does not assert new permission guarantees.

## Key decisions

| # | Decision | Rejected alternative | Reason |
|---|---|---|---|
| 1 | New library `@forwardimpact/libinit`. | Extend `libconfig` with a writer surface. | libconfig is read-side and depends on libstorage; a writer that *owns* namespaces is a distinct concern. A new library carries its own JTBD entry (Platform Builders: project bootstrap) without bloating libconfig's API. |
| 2 | Single `bootstrapProject` entry point per call. | Per-file writers (`writeConfig`, `writeEnv`). | The ownership contract spans both files together — same-key conflicts on `.env` should refuse before `config.json` is written. One call keeps the refuse-before-mutate guarantee structural rather than caller-discipline. |
| 3 | Per-call `overwrites` array of fully-qualified paths. | Boolean `force: true` on the whole call. | Boolean flips the spec's default-refuse to default-overwrite for every key the call carries; a per-path set keeps overwrite intent surgical and self-documenting in diagnostics. |
| 4 | `ConflictError` carries `overwriteSurface: string` naming the caller's flag. | Library prints the diagnostic itself. | Each product's CLI owns its flag surface (`fit-guide init --force <key>` vs `fit-map init --force <key>`). The library names the path; the CLI names the flag. |
| 5 | Config merge is leaf-path deep merge, not top-level-only. | Top-level-only merge (Map's `product.map.*` is one atomic unit). | A future product adding `product.guide.feature.x` shouldn't be forced to re-ship the whole `product.guide` block. Leaf-path merge composes; top-level-only collapses ownership granularity. |
| 6 | Library never records first-writer identity. | Per-namespace owner marker in a `.libinit-meta` file. | The spec defers first-writer identity to design; adding a marker creates a fourth file in the contract for a diagnostic that only fires on the unhappy path. The conflicting key path is sufficient remediation context. |
| 7 | `.env` writer reuses `libsecret.updateEnvFile` semantics. | New flat-file writer in libinit. | `updateEnvFile` already preserves 0o600, comment-rewrite, and trailing-newline behaviour the spec requires preserving. libinit calls it per key after the merge passes. |
| 8 | New-product onboarding contract documented at the libinit user-guide URL (`websites/fit/docs/libraries/project-bootstrap/index.md`). libinit is a library API, not a CLI — the CLI/skill linking rule in [libraries/CLAUDE.md](../../libraries/CLAUDE.md) does not apply, but the guide-home convention does. | Replicate guidance into each product's README. | One home for the contract; products link to it from their own docs. |
| 9 | `fit-map init` ships no starter `config.json` fragment in this slice. | Synthesise a `product.map` block from existing data. | The spec requires only that `fit-map init` produces a `config/` so subsequent CLI invocations anchor locally. A starter fragment is additive and can land in a follow-up spec without breaking the ownership contract. |
| 10 | Empty-string `.env` values are written verbatim. | Skip empty values. | Spec 990 makes empty-string-on-shell-env equivalent to absent on the read path; the writer's job is the bytes, not the read semantics. Coherence with 990 holds without writer-side filtering. |

## Coherence with spec 990

Spec 990 ships the `mkdir -p config/` workaround in `kata-interview.yml` and
sets credential-override read semantics where shell env > `.env` > defaults.
This design does not touch either:

- The workaround line stays under spec 990 ownership until a follow-up spec
  removes it (deferred in spec 1000 scope).
- Read resolution is libconfig's responsibility; libinit only writes bytes.
  An empty-string write to `.env` produces `KEY=` on disk; libconfig already
  treats that as present-with-empty-string, and the credential-override loop
  in spec 990 treats shell-empty-string as absent independently. The writer
  semantics and reader semantics compose cleanly.

## Verification surfaces

Each Success Criteria row in [spec.md](spec.md) maps to one of:

| Surface | Where the test lives |
|---|---|
| Two-namespace merge, idempotent re-invoke, A→B→A→B convergence | libinit unit tests |
| Same-key-different-value refuse + diagnostic | libinit unit tests |
| `.env` ownership + permission preservation | libinit unit tests |
| `fit-map init` anchors locally after init | fit-map product test |
| `fit-guide init` observable contract preserved | existing fit-guide init test stays green |
| Onboarding contract discoverability via `--help` | per-product help-text test |

## Out of scope (deferred to plan or follow-ups)

- File-level changes inside `products/guide/src/commands/init.js` and
  `products/map/src/commands/init.js` — [plan-a.md](plan-a.md) names them.
- Removing the kata-interview `mkdir -p config/` workaround — follow-up spec.
- Cross-file atomicity between `config.json` and `.env` — deferred per spec.
- Schema validation of the merged `config.json` — deferred per spec.

— Staff Engineer 🛠️
