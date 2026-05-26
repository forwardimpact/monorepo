# Design 1000-a — Shared init writer for `config/` + `.env` parity

Spec [1000-product-init-config-parity](spec.md) requires one callable
interface that every product's `init` verb hands its starter material to,
with namespace-scoped ownership semantics for `config/config.json` and
`.env`. The spec also pulls in the spec 0990 `mkdir -p config/` workaround
cleanup and commits `fit-map init` ↔ `fit-map substrate stage` to a
shared bootstrap shape.

## Components

| Component | Home | Role |
|---|---|---|
| `bootstrapProject` | new library `@forwardimpact/libinit` | Single entry point. Accepts target dir, config fragment, env entries, overwrite-intent set; converges on-disk state or throws. |
| `mergeConfigFragment` | `libinit/src/config.js` | Pure function over `{ existing, fragment, overwrites }`; returns merged object or throws `ConflictError`. |
| `mergeEnvEntries` | `libinit/src/env.js` | Pure function over `{ existing, entries, overwrites }`; returns per-key write plan or throws `ConflictError`. |
| `ConflictError` | `libinit/src/errors.js` | `{ kind: "config" \| "env", paths: string[], overwriteSurface: string }`. Products convert to non-zero exit + stderr diagnostic. |
| `README.md` | `libraries/libinit/README.md` | Onboarding contract: entry point, namespace-declaration step, overwrite-intent parameter. Spec § *New-product onboarding* names this as the firm home. |
| `fit-guide init` adapter | `products/guide/src/commands/init.js` | Calls `bootstrapProject` once with the starter config + `.env` entries. Existing `package.json` / `.claude/skills/` writes stay local — those are not config or env. |
| `fit-map init` adapter | `products/map/src/commands/init.js` | Calls `bootstrapProject` with no config fragment (empty); existing `data/pathway/` copy stays local. The `bootstrapProject`-emitted `config/config.json` is what unblocks anchoring. |
| `fit-map substrate stage` adapter | `products/map/src/commands/substrate-stage.js` | New first phase: invokes `runInit` (the function `products/map/src/commands/init.js` already exports — currently consumed by the `fit-map init` CLI dispatch) before `stack`/`url-discovery`/etc. Idempotent — re-stages a workspace produced by `fit-map init` as a no-op. |
| Workflow cleanup | `.github/workflows/kata-interview.yml` | Spec 0990 `mkdir -p "$AGENT_CWD/config"` line removed from the Substrate stage step. |

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

Returns `void` on success; throws `ConflictError` on refused write. Each
product calls it once per init. Multiple products call independently
against the same target; convergence is guaranteed by the merge rules
each call applies.

`bootstrapProject` **always ensures `config/config.json` exists** at the
target — when `config` is `{}` or omitted, the file is written as `{}` if
absent (no-op if already `{}` on disk). This is the surface that makes
`fit-map init` satisfy the spec's anchoring success criterion without
shipping a `product.map` starter fragment. `.env` is written only when at
least one entry is supplied or the file already exists.

## Data flow

```mermaid
sequenceDiagram
  participant CLI as Product CLI (init verb)
  participant Lib as libinit.bootstrapProject
  participant FS as Target dir
  CLI->>Lib: { target, config, env, overwrites }
  Lib->>FS: read config/config.json (or {} if absent)
  Lib->>FS: read .env (or "" if absent)
  Lib->>Lib: mergeConfigFragment(existing, fragment, overwrites.config)
  Lib->>Lib: mergeEnvEntries(existing, entries, overwrites.env)
  alt conflict
    Lib-->>CLI: throw ConflictError(paths, surface)
    CLI-->>CLI: stderr diagnostic + non-zero exit
  else clean
    Lib->>FS: mkdir -p config/
    Lib->>FS: write config/config.json (canonical JSON; "{}" when fragment empty)
    Lib->>FS: write .env entries via libsecret.updateEnvFile (per-key, 0o600)
  end
```

Merges complete and validate before any FS mutation — a `.env` conflict
never leaves a half-written `config.json` on disk.

## Namespace ownership semantics

The writer walks the fragment depth-first to leaf paths and classifies
each against the existing on-disk subtree. Cross-namespace writes never
collide by construction (disjoint subtrees); within a single product's
namespace, the same-key-different-value rule catches accidental
self-overwrite across two passes of the same product's `init`. See
Decision #5 for why leaf-path granularity over the spec's top-level
framing.

Each leaf path classifies as:

| Pre-state | Fragment value | Result |
|---|---|---|
| absent | any | write |
| present, deep-equal (canonical JSON) | same | no-op |
| present, different | different | refuse, unless path ∈ `overwrites.config` |

"Deep-equal canonical JSON" = serialize both subtrees with sorted object
keys + no whitespace; compare strings. This is the normalization rule
that makes A→B→A→B converge to the same bytes regardless of input key
order or whitespace.

For `.env`, the same three rows apply at the **bare-key** granularity
against `overwrites.env`. Value comparison is byte-for-byte over the
string after `KEY=`.

## fit-map init ↔ fit-map substrate stage

The spec leaves the *which-invokes-which* arrangement as a design choice.
This design picks **substrate stage delegates to init**: a new first
phase inside `runStageCommand` calls `runInit` (the exported function
in `products/map/src/commands/init.js`) before `stack`/`url-discovery`/
etc. The kata-interview workflow keeps `bunx fit-map substrate stage` as
its only substrate entry point; the `mkdir -p` line goes away.
Bootstrap-shape parity is structural — both entry points run the same
`runInit` body, so the "two fresh tmpdirs" success criterion holds by
construction. Decision #8 carries the rejected alternative.

## Re-run semantics

**fit-guide init**: Spec requires re-runs to be same-key-same-value
no-ops — including generated `SERVICE_SECRET` / `MCP_TOKEN`. The adapter
uses `libsecret.getOrGenerateSecret(key, gen)` (reads `.env` first) to
materialize values *before* the `bootstrapProject` call. The fragment
therefore carries whatever value is already in `.env`; the merge
classifies it as same-key-same-value and writes nothing. The pre-spec
`"config/ already exists, skipping starter copy"` line is dropped.

**fit-map init**: Pre-spec exits non-zero with `./data/pathway/ already
exists`. The adapter changes the existence check to a no-op; re-running
becomes byte-stable, matching the shared-interface contract and making
substrate stage idempotent against an already-bootstrapped workspace.

## Key decisions

| # | Decision | Rejected alternative | Reason |
|---|---|---|---|
| 1 | New library `@forwardimpact/libinit`. | Extend `libconfig` with a writer. | libconfig is read-side and depends on libstorage; a writer that *owns* namespaces is a distinct concern. Libsecret hosts the env-line primitive but not config-merging — naming-incoherent home. |
| 2 | Single `bootstrapProject` entry point per call. | Per-file writers (`writeConfig`, `writeEnv`). | The ownership contract spans both files together — `.env` conflicts must refuse before `config.json` mutates. One call keeps refuse-before-mutate structural rather than caller-discipline. |
| 3 | Per-call `overwrites` partitioned as `{ config, env }`. | Flat `overwrites: string[]` mixing both surfaces. | A bare key name and a dotted config path can collide (`MCP_TOKEN` vs `MCP_TOKEN` as a top-level config key). Partitioning disambiguates without naming conventions. |
| 4 | `ConflictError` carries `overwriteSurface` naming the caller's flag. | Library prints the diagnostic itself. | Each product owns its flag surface (`--force <key>`); the library names the conflicting path; the CLI names the flag. Keeps the spec's "reference to the overwrite-intent parameter" greppable in stderr without coupling libinit to per-product CLI text. |
| 5 | Config merge enforces ownership at the **leaf path**, strictly stronger than the spec's top-level-namespace floor. | Top-level-only merge (whole `product.map.*` is one atomic unit). | The spec's correctness floor (top-level ownership) admits two implementations: top-level-only and leaf-path. Top-level-only forces a future product adding `product.guide.feature.x` to re-ship the whole `product.guide` block. Leaf-path composes; top-level-only collapses ownership granularity. The spec's own success-criteria tests assert leaf-path-shaped conflicts (e.g. `product.x.foo`), so the stronger contract is the testable one. |
| 6 | Library never records first-writer identity. | `.libinit-meta` file per-namespace owner. | Spec defers first-writer identity to follow-up; the conflicting path + overwrite surface are sufficient remediation context. A fourth tracked file would fire only on the unhappy path. |
| 7 | `.env` writer reuses `libsecret.updateEnvFile`. | New env writer in libinit. | `updateEnvFile` already preserves `0o600`, comment-rewrite, and trailing-newline. libinit calls it per key after the merge passes. The spec's explicit `0o600` requirement is satisfied transitively. |
| 8 | `substrate stage` delegates to `runInit`. | Workflow invokes init + substrate in sequence. | Two subprocesses, two error surfaces, two ways for CI to silently drift out of parity with developer-local `bunx fit-map init`. Delegation makes bootstrap-shape parity structural (one code path) rather than asserted (one CI test). |
| 9 | `runInit` becomes idempotent on `data/pathway/`. | Keep the non-zero exit. | Spec § *Re-invoking* idempotency requires it; substrate stage re-running against a bootstrapped workspace requires it. |
| 10 | Empty-string `.env` values written verbatim. | Skip empty values. | Spec 0990 makes empty-string-on-shell-env equivalent to absent on the read path; the writer's job is bytes, not read semantics. Coherence with 0990 holds without writer-side filtering. |
| 11 | Onboarding docs in `libraries/libinit/README.md`. | User guide at `websites/fit/docs/libraries/<slug>/index.md`. | Spec § *New-product onboarding* fixes the README as the home. A user guide may follow later under libraries/CLAUDE.md § CLIs and progressive documentation — but libinit ships no CLI (library-only), so the README is sufficient under that policy and the spec's success criterion. |

## Coherence with spec 0990

- **`mkdir -p` workaround** — removed by this design (spec 0990 cleanup
  row). The substrate stage step in `kata-interview.yml` keeps the
  `if: inputs.product == 'landmark'` gate; only the `mkdir` line goes.
- **Credential-override read order** — unchanged. libinit only writes
  bytes; libconfig still resolves shell env > `.env` > defaults. An
  empty-string write to `.env` produces `KEY=` on disk; libconfig
  treats that as present-with-empty-string; the credential-override
  loop independently treats shell-empty-string as absent.

## Verification surfaces

| Success criterion | Surface |
|---|---|
| Two-namespace merge, idempotent re-invoke, A→B→A→B convergence | libinit unit tests |
| Same-key-different-value refuse + diagnostic | libinit unit tests |
| `.env` ownership + `0o600` mode | libinit unit tests (mode assertion via `fs.stat`) |
| `fit-map init` anchors locally after init | fit-map product test |
| Workflow runs end-to-end without in-workflow `mkdir` | kata-interview CI on the implementation branch + workflow source grep |
| Bootstrap-shape parity (`fit-map init` vs substrate stage) | fit-map product test (structural — both call `runInit`) |
| End-to-end Landmark interview prep preserved after workaround removal (substrate roster non-empty, substrate issue writes `.env` + `.substrate.json`, `resolveIdentity()` succeeds, Landmark self-smoke green) | same kata-interview CI run as above — asserts the four post-stage steps |
| `fit-guide init` first-run + re-run preservation | fit-guide product test + existing suite |
| README documents onboarding contract | libinit README test (grep for entry point + namespace step + overwrite-intent param) |
| Existing in-tree tests for libconfig, libsecret, affected CLIs stay green | `bun run test` on the implementation branch |

## Out of scope (deferred to plan or follow-ups)

- File-level changes inside the three adapters — [plan-a.md](plan-a.md)
  names them and sequences the cutover.
- Cross-file atomicity between `config.json` and `.env` — deferred per
  spec; refuse-before-mutate is the floor.
- Schema validation of the merged `config.json` — deferred per spec.
- Secret rotation as a separate verb — deferred per spec.

— Staff Engineer 🛠️
