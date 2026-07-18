# Spec 2220: Consolidate the RAG and codegen CLIs

**Classification:** Product-aligned — beyond shared libraries (`libraries/`),
agent skills (`.claude/skills/`), and library docs, the change updates the
**Gear** product landing page (`websites/fit/gear/`) and Gear's product scope,
which documents a product surface a persona hires.

**Persona / job:** Platform Builders, across two jobs. The RAG consolidation
serves *Ground Agents in Context*
([libraries/README.md](../../libraries/README.md)), whose Trigger is knowledge
"scattered across files no one maintains" — the fragmented CLI surface. The
codegen consolidation serves *Build Agent-Capable Systems* (Gear,
[JTBD.md](../../JTBD.md)) on its typed-contracts thread.

## Problem

A Platform Builder who installs the knowledge stack meets six separately-named
CLIs across three libraries, and a codegen library that forces a heavyweight
build toolchain into every runtime image.

**The RAG surface is fragmented.** One coherent Retrieval-Augmented-Generation
domain is split across six binaries in three libraries, each a thin (~50–80
line) wrapper over its library API:

| CLI | Library | Role | Reads/Writes |
| --- | --- | --- | --- |
| `fit-process-resources` | libresource | write | HTML → `resources` index |
| `fit-process-graphs` | libgraph | write | `resources` → `graphs` index |
| `fit-process-vectors` | libvector | write | `resources` → `vectors` index |
| `fit-search` | libvector | read | queries `vectors` index |
| `fit-query` | libgraph | read | queries `graphs` index |
| `fit-subjects` | libgraph | read | enumerates `graphs` subjects |

The three write CLIs form one strict pipeline keyed on a shared `resources`
intermediate (`libgraph` and `libvector` both depend on `libresource`). The
three read CLIs are pure lookups over the two indexes the write side produces;
`fit-query` and `fit-subjects` already share one graph handle and carry the same
paired documentation links. The published Ground-Agents guide walks a user
through six distinct `npx fit-*` invocations to complete one build-then-query
workflow — a user must learn six binary names to run what is two operations.

**The codegen library over-installs in production.** `fit-codegen` (libcodegen)
generates code from proto contracts and depends on a proto-compiler toolchain
(`@grpc/proto-loader`, `mustache`, `protobufjs-cli`). Its produced artifact —
`generated/bundle.tar.gz` — is fetched at container startup by a *separate*
binary, `fit-download-bundle` (libutil). Producing and consuming one artifact
live in two libraries, and any runtime image that only needs to fetch the bundle
must still carry `fit-codegen`'s build toolchain if the two are ever merged
naively. Today the split avoids that cost but scatters one artifact's lifecycle
across two homes.

## Proposal

Consolidate along domain boundaries, one `<subcommand>` surface per operation.

**1. New `librag` library, two CLIs.** Introduce a `librag` library that
provides the consolidated RAG CLI surface. Existing processing and index
behavior is unchanged; where that logic lives is a design concern.

| New CLI | Subcommands | Replaces |
| --- | --- | --- |
| `fit-process` | `resources`, `graphs`, `vectors` | the three write CLIs |
| `fit-rag` | `search`, `query`, `subjects` | the three read CLIs |

The two operations — build the knowledge, then query it — stay two binaries, not
one: they have different runtime prerequisites (only `vectors`/`search` need the
embedding service) and different audiences (pipeline operator vs querying
agent). Each subcommand preserves its predecessor's positional arguments, exact
stdout, and exit behavior so downstream parsers are unaffected.

**2. `fit-codegen` gains explicit `generate` and `download` subcommands.**
`fit-codegen` moves from bare flags to a `generate` subcommand (its existing
flags) plus a new `download` subcommand that folds in `fit-download-bundle`'s
bundle-fetch, co-locating produce and consume of one artifact under one binary.
A production install that only runs `download` must not pull the proto-compiler
toolchain (`@grpc/proto-loader`, `mustache`, `protobufjs-cli`); those become
opt-in and are present only when generation is wanted. This is a **partial**
footprint win: `protobufjs` remains unavoidable because the telemetry chain
`download` needs (`libtelemetry` → `libindex` → `libtype`) pulls it regardless;
removing it is out of scope.

**3. Clean break, no shims.** The six old RAG bins and `fit-download-bundle` are
removed, not aliased ([CONTRIBUTING.md § Clean breaks](../../CONTRIBUTING.md));
the six RAG launcher packages are replaced by `fit-process` and `fit-rag`
launchers. All internal call sites — `justfile`, CI workflows, the container
`Dockerfile` entrypoint, and `CLAUDE.md` — move to the new commands in the same
change.

**4. Skills and docs follow.** Skills and library documentation are updated so a
fresh installation learns only the consolidated surface.

| Surface | Change |
| --- | --- |
| `.claude/skills/fit-search`, `fit-query`, `fit-subjects` | Deleted; replaced by new `fit-rag` skill |
| new `.claude/skills/fit-rag`, `.claude/skills/fit-process` | Added |
| `.claude/skills/fit-codegen` | Updated for `generate`/`download` subcommands |
| `websites/fit/docs/libraries/ground-agents/**` | Command invocations updated to `fit-process`/`fit-rag`; page slugs unchanged (published URLs) |
| `websites/fit/docs/libraries/typed-contracts/**`, `internals/release`, `internals/vectors`, `getting-started/engineers/guide` | `fit-codegen`/RAG command invocations updated |
| `libraries/README.md` catalog, `websites/fit/docs` library index | New `librag`; `fit-download-bundle` entry removed |
| `websites/fit/gear/index.md` (Gear product page) + Gear product scope | Reflect `librag` in the catalog and regenerated library count; keep the "Ground Agents in Context" retrieval capability copy accurate for the unified `fit-rag` surface |

Doc page slugs are published URLs, kept in place (retitled at most, never
moved). Two slugs are referenced by CLI `documentation` arrays today —
`search-semantically` (`fit-search`) and `query-graph` (`fit-query`,
`fit-subjects`); those references move to the `fit-rag` skill and CLI. The
`fit-process` write CLIs carry no `documentation` array today; adding one is
optional. Skill `## Documentation` lists stay in parity with their CLI's
`documentation` array.

## Scope

**In scope:** creating `librag` with `fit-process` and `fit-rag` and their
launcher packages; removing the six RAG bins and their launchers; adding
`fit-codegen download` and removing `fit-download-bundle`; making the
proto-compiler toolchain opt-in for `libcodegen`; updating all internal call
sites (including the container `Dockerfile` entrypoint), affected `fit-*`
skills, library docs, and the **Gear** product landing page and product scope.

**Excluded:** decoupling `protobufjs` from `libtype`/`libtelemetry` (a
foundational re-architecture); consolidating any hard-excluded CLIs
(`fit-harness`+`fit-trace`; `fit-rc`+`fit-svscan`+`fit-logger`); merging the
write and read surfaces into a single binary; changing index formats, storage
backends, or the embedding service contract; any `products/` or `services/`
behavior.

## Success Criteria

| # | Criterion | Verification |
| --- | --- | --- |
| 1 | `fit-process <resources\|graphs\|vectors>` runs each write stage | `npx fit-process resources --base=… && npx fit-process graphs && npx fit-process vectors` produces `data/resources`, `data/graphs`, `data/vectors` |
| 2 | `fit-rag <search\|query\|subjects>` reproduces each predecessor's exact stdout | `fit-rag query` prints bare identifiers, `fit-rag search` prints `id<TAB>score`, `fit-rag subjects` prints `subject<TAB>type` — byte-identical to the old CLIs for the same input |
| 3 | The six old RAG bins are gone and the two new launchers exist | No `bin`/launcher named `fit-process-{resources,graphs,vectors}`, `fit-search`, `fit-query`, or `fit-subjects`; `launchers/fit-process` and `launchers/fit-rag` present |
| 4 | `fit-codegen generate` and `fit-codegen download` both work | `npx fit-codegen generate --all` regenerates code; `npx fit-codegen download` fetches and unpacks a bundle |
| 5 | `fit-download-bundle` no longer exists | No `fit-download-bundle` bin in any `package.json` (it never shipped a launcher) |
| 6 | A production install of `libcodegen` omits the proto-compiler toolchain | Installing `libcodegen` with optional dependencies omitted yields a `node_modules` without `@grpc/proto-loader`, `mustache`, or `protobufjs-cli`, and `fit-codegen download` still runs |
| 7 | No live call site references a removed CLI | `rg` for the removed bin names finds no hits in shipped source, CI, the `Dockerfile`, docs, or `CLAUDE.md` (excluding `specs/`, test fixtures, and generated/lock files) |
| 8 | Affected skills exist and are in CLI parity | `.claude/skills/fit-rag`, `fit-process`, `fit-codegen` present; `fit-search`/`fit-query`/`fit-subjects` skills absent; each skill's `## Documentation` matches its CLI's `documentation` array |
| 9 | The Gear product page reflects the consolidation | `websites/fit/gear/index.md` shows the regenerated library count including `librag`, its "Ground Agents in Context" copy stays accurate, and no removed-CLI names appear |
| 10 | Repository checks pass | `bun run check` and `bunx coaligned` are green |
