# Design 2220-a: Consolidate the RAG and codegen CLIs

Spec [2220](spec.md) consolidates six RAG bins into two subcommand CLIs in a new
`librag`, folds `fit-download-bundle` into `fit-codegen download`, and makes the
proto-compiler toolchain opt-in — a clean break with skills and docs following.

## Components

```mermaid
flowchart TB
  subgraph librag[libraries/librag NEW]
    P[bin/fit-process.js<br/>dispatch: resources|graphs|vectors]
    R[bin/fit-rag.js<br/>dispatch: search|query|subjects]
  end
  subgraph existing[unchanged processing + index libs]
    RES[libresource<br/>ResourceProcessor]
    GRA[libgraph<br/>GraphProcessor / GraphIndex]
    VEC[libvector<br/>VectorProcessor / VectorIndex]
  end
  P -->|resources| RES
  P -->|graphs| GRA
  P -->|vectors| VEC
  R -->|search| VEC
  R -->|query,subjects| GRA
  subgraph libcodegen[libraries/libcodegen]
    C[bin/fit-codegen.js<br/>dispatch: generate|download]
    G[src/commands/generate.js<br/>heavy: proto-loader,mustache]
    D[src/commands/download.js<br/>lean: bundle fetch]
    C -->|generate| G
    C -->|download| D
  end
```

`librag` depends on `libresource`, `libgraph`, `libvector` and shared
`libcli`/`libstorage`/`libtelemetry`/`libconfig`; `librpc` is reached only
through `libvector` for the `vectors`/`search` closures, not as a broad shared
dep. It contains **no** processing or query logic — each handler constructs the
same index + processor the old bin did and delegates. Dynamic `import()` defers
*evaluation*, not *installation*: `librag` always installs all three RAG libs,
so the isolation it buys is runtime cost, not install footprint (unlike the
codegen case below). The `download` logic (`createBundleDownloader` +
`execLine`, plus `createScriptConfig` from `libconfig`) moves from `libutil`
into `libcodegen/src/commands/download.js`; `libutil` keeps the reusable
helpers, loses only the bin. Because `download` calls `createScriptConfig`,
`libcodegen` gains `libconfig` as a direct dependency (today it resolves only
transitively).

## Dispatch interface

Each consolidated bin uses libcli's native `commands` array (the established
pattern in `libterrain`), where each command handler does its own
`await import()` of the command module. Top-level `--help`/`--version`/bare
invocation stay handled by `createCli`, unchanged. A handler's heavy `import()`
runs only when its subcommand is dispatched, so a subcommand evaluates only its
own module closure — no sibling's dependencies load.

| Bin | Subcommand | Loads (beyond shared libs) | Args / stdout preserved from |
| --- | --- | --- | --- |
| `fit-process` | `resources` | libresource; `--base` scoped here | `fit-process-resources` |
| `fit-process` | `graphs` | libgraph | `fit-process-graphs` |
| `fit-process` | `vectors` | libvector + embedding client (lazy) | `fit-process-vectors` |
| `fit-rag` | `search` | libvector + embedding client (lazy) | `fit-search` |
| `fit-rag` | `query` | libgraph | `fit-query` |
| `fit-rag` | `subjects` | libgraph | `fit-subjects` |
| `fit-codegen` | `generate` | proto-loader, mustache, protobufjs, long-init | `fit-codegen --*` |
| `fit-codegen` | `download` | libstorage + libconfig bundle fetch, `execLine` | `fit-download-bundle` |

The embedding gRPC client is constructed inside the `vectors`/`search` handlers
only, so offline subcommands (`resources`, `graphs`, `query`, `subjects`,
`download`) never require that service.

## Packaging: the codegen toolchain

`libcodegen` moves `@grpc/proto-loader`, `mustache`, and `protobufjs-cli` from
`dependencies` to `optionalDependencies`. Default installs (npx, workspace) keep
them, so `generate` works for external developers with no extra step. Production
images install with optional deps omitted and get a `download`-only
`libcodegen`. `generate.js` guards its heavy dynamic imports and prints a
reinstall hint if they are absent. `protobufjs` stays a regular dependency — the
telemetry chain `download` needs (`libtelemetry` → `libindex` → `libtype`, which
`libstorage`/`libutil` also reach) pulls it regardless, so it cannot be shed
here.

## Key Decisions

| Decision | Choice | Rejected alternative |
| --- | --- | --- |
| RAG CLI home | New `librag` aggregates the bins, delegates to existing libs | Re-home processors/queries into `librag` — churns three owners, breaks library-mandate; or add subcommands in one existing lib — arbitrary owner, cyclic deps |
| Write vs read | Two bins (`fit-process`, `fit-rag`) | One mega-CLI — staples unlike prerequisites/audiences (embedding service vs offline reads) together |
| One library or two | Single `librag` for both bins | `librag-write` + `librag-read` — doubles packaging for one domain, no consumer benefit |
| Subcommand loading | libcli `commands` array + `await import()` in each handler (the `libterrain` pattern) | Hand-rolled `argv[0]` dispatch — reinvents libcli's help/version/usage handling; static top-level imports — load every dep for every subcommand, defeating the codegen footprint goal |
| Codegen toolchain gate | `optionalDependencies` + omit-in-prod | Optional `peerDependencies` — not auto-installed, breaks `npx fit-codegen generate` for external devs; keeping in `dependencies` — no prod win |
| `fit-codegen` surface | Explicit `generate`/`download` subcommands | Keep bare flags as implicit generate — asymmetric with `download`, and the spec frames both as subcommands |
| Old bins & launchers | Delete six RAG bins + their launchers; add `launchers/fit-process` + `launchers/fit-rag`; delete `fit-download-bundle` bin (it has no launcher) | Deprecated alias shims — the standard forbids compat wrappers absent a spec requirement |
| Doc slugs | Keep all ground-agents slugs; re-point the two in CLI `documentation` arrays (`search-semantically`, `query-graph`) to `fit-rag`; edit invocations only | Rename slugs to match new CLIs — breaks published URLs |

## Skills and docs

| Surface | WHERE | Action |
| --- | --- | --- |
| RAG read skills | `.claude/skills/fit-{search,query,subjects}` | Delete |
| New RAG skills | `.claude/skills/fit-rag`, `.claude/skills/fit-process` | Add; `fit-rag`'s `## Documentation` mirrors its CLI array (`fit-process` has none) |
| Codegen skill | `.claude/skills/fit-codegen` | Add `generate`/`download` usage |
| Ground-agents guides | `websites/fit/docs/libraries/ground-agents/**` | Rewrite `npx fit-*` invocations; slugs unchanged |
| Codegen/vectors/release docs | `typed-contracts`, `internals/{vectors,release}`, `getting-started/engineers/guide` | Update invocations |
| Catalogs | `libraries/README.md`, library docs index | Add `librag`; drop `fit-download-bundle` |

Skill packs are generic: the new skills name CLIs bare (`fit-rag search`), never
`npx`/paths, per `.claude/skills/CLAUDE.md`.

## Migration surface (call sites)

The `justfile` codegen target, `.github/workflows/**`, the container
`Dockerfile` entrypoint (`fit-download-bundle` → `fit-codegen download`), and
`CLAUDE.md`'s `npx fit-codegen --all`/RAG references move to the new commands.
Success criterion 7 (`rg` finds no removed names in live sources) is the
completeness gate.

## Risks

- **Contract drift.** A subcommand that alters positional args or stdout breaks
  downstream parsers — the plan pins per-subcommand snapshot checks against the
  old CLIs (criterion 2).
- **Hidden call site.** A missed invocation ships a broken command — the
  `rg`-clean criterion is the backstop.
- **Version coupling.** `librag` becomes a fan-in release point over three libs;
  a downstream fix must flow through a `librag` release to reach npm consumers.
