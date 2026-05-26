# Plan A — Git-Installable Pack Repos (libpack Extraction)

Spec: [700](spec.md) · Design: [C](design-c.md)

## Approach

Extract pack distribution logic from Pathway into `libraries/libpack` as an
OO+DI library following the monorepo's library pattern (libstorage, libcodegen).
`PackStager` stages directory trees per layout (full, APM, skills), three
`Emitter` implementations (`TarEmitter`, `GitEmitter`, `DiscEmitter`) produce
output artifacts from staged dirs, and `PackBuilder` orchestrates the
per-combination loop. Pathway's `generatePacks` becomes thin glue: load data via
libskill, format via Pathway templates, construct a `PackBuilder` with concrete
emitters, call `build()`, then write `apm.yml` from the returned metadata.
`GitEmitter` creates static bare git repos using system `git` plumbing commands
(`hash-object`, `mktree`, `commit-tree`, `repack`) with pinned
author/date/email environment variables for deterministic output.

## Parts

| Part | File                          | Summary                                                                      | Agent            |
| ---- | ----------------------------- | ---------------------------------------------------------------------------- | ---------------- |
| 1    | [plan-a-01.md](plan-a-01.md) | Create `libraries/libpack` — scaffold, utilities, emitters, stager, builder, unit tests | `staff-engineer` |
| 2    | [plan-a-02.md](plan-a-02.md) | Rewire Pathway — replace internals with libpack, update install UI, update integration tests | `staff-engineer` |

## Cross-Cutting Concerns

- **Determinism.** Every emitter independently guarantees byte-identical output
  for identical input. TarEmitter: epoch timestamps + sorted file list +
  `gzip -n`. GitEmitter: pinned author/committer/date + sorted tree entries +
  `--no-reuse-delta`. DiscEmitter: `stringifySorted` for index.json + sorted
  entries array.
- **I/O injection.** Child-process access in `TarEmitter` and `GitEmitter`
  flows through constructor-injected `exec`. Unit tests inject recording stubs;
  integration tests use real binaries. `PackStager` and `DiscEmitter` use
  standard `fs` and are tested against real temp directories.
- **Clean break.** Pathway's `writePackFiles`, `stageApmBundle`,
  `archiveRawPack`, `archiveApmPack`, `writeSkillsPack`,
  `writeSkillsAggregate`, and all helper functions they depend on are deleted
  when replaced — no shims, no aliases, no re-exports.
- **Spec amendment.** Design-c's Prerequisites section notes the spec's Scope
  section should be amended to include the library extraction. A one-line note
  is added to `spec.md` § Scope in Part 2.

Libraries used: none (Node built-ins only).

## Risks

| Risk                                                     | Mitigation                                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Git version differences produce different packfile bytes | Pin `--no-reuse-delta`, use plumbing commands, epoch-pinned timestamps. Byte-equality CI assertion catches drift |
| `git init --bare` scaffold varies across git versions    | Write `config` and `description` explicitly; strip output to the 8 design-specified files        |
| `apm.yml` URL changes from `.apm.tar.gz` to `.apm.git`  | Behavioral change for existing APM consumers. Tarball still emitted (Spec Req 7); `apm install` gains native git resolution. Consumers using `apm unpack` are unaffected — that command reads the tarball directly, not `apm.yml` |

## Execution

Parts 1 → 2, sequential. Part 2 depends on Part 1 (imports
`@forwardimpact/libpack`). Both route to `staff-engineer`.
