# Spec 1370 — Ambient Dependencies to Injected Collaborators

## Problem

The monorepo treats `node:fs`, `node:child_process`, `Date.now()`,
`setTimeout`, and the `process` global as ambient dependencies imported at
the top of every module that needs them. As a result, the test suite has
no seam to substitute fakes at — so test files reach for the real
filesystem, spawn real subprocesses, sleep real wall-clock time, and
mutate the global `process.env`. Each test pays the cost of a tiny
integration test even when it only exercises pure logic, and the seams
that do exist (Finder's `process` parameter, libconfig's optional
`process` arg, WikiRepo's `resolveToken` callback) are inconsistent
shapes that each caller has to reinvent.

The full-suite wall time was 60 s before recent test-side patches; the
slowest individual tests were `setTimeout`-based waits inside `Retry`
backoff and `HmacAuth` token expiry that could not be skipped because
the production code had no clock seam. The four libwiki CLI test files
(`cli-claim`, `cli-log`, `cli-refresh`, `cli-init`) each spawned `node
bin/fit-wiki.js` once per case because the command handlers called
`process.exit`, `process.stdout.write`, and `process.cwd()` directly —
in-process invocation would have terminated the test runner. Across the
monorepo, the ambient-dependency footprint is large enough that the
problem is structural, not incidental:

| Smell | Files affected (src) |
|---|---|
| Direct `node:fs` import (sync or `fs/promises`) | 91 |
| Direct `node:child_process` import | 24 |
| `Date.now()` or `new Date()` call in module body | 60 |
| `process.exit()` as control flow | 34 |
| `process.cwd()` read at call site | 18 |
| `process.env.X` read inside functions | 45 |
| `setTimeout(...)` used as a wait primitive | 21 |

Test-side consequences:

| Test smell | Test files affected |
|---|---|
| `mkdtempSync` + real `writeFileSync`/`mkdirSync` per case | 58 |
| Spawned subprocess (`execFileSync`/`spawnSync`/`spawn`) | 19 |
| Mutate `process.env.*` globally with manual restore | 23 |
| Real `setTimeout`-based sleep to advance state | 4 |

Three concrete failure modes follow from this shape:

- **Tests can't fake what production hardcodes.** `Retry`'s exponential
  backoff and `HmacAuth`'s expiry were untestable in microseconds until
  a `sleep`/`now` collaborator was added; the same untestable shape
  recurs in any future class that does backoff, retry, expiry, or rate
  limiting unless the pattern is established and enforced.
- **CLI handlers cannot be unit tested in process.** Free functions
  like `runClaimCommand(values, args, cli)` reach into `process.exit`,
  `process.stdout.write`, and `process.cwd()` mid-body. The only way to
  exercise them is to spawn `node bin/fit-wiki.js`, which adds
  60–100 ms of fork + module-load to every test case and forces real
  filesystem setup in a tmpdir.
- **`Finder` already accepts DI but every caller wires it by hand, and
  the injected `fs` parameter is dead code.** 23 separate
  `new Finder(...)` call sites exist across `libraries/`, `products/`,
  and `services/`. Some pass `process`, some pass `{ cwd: io.cwd }`,
  some pass `console` as the logger, some pass a custom no-op logger.
  Each module rebuilds the same boilerplate, and the inconsistency
  hides bugs: Finder declares an `fs` constructor parameter but never
  references it anywhere in the class — `findUpward` and `findData`
  call `fs.existsSync(...)` against the top-level
  `import fs from "fs"`. Every consumer that passes a `node:fs/promises`
  module thinks it's injecting fs; in reality, only `process.cwd()`
  flows through, and only because `findProjectRoot` happens to read it.

The pattern is reachable from any module under `libraries/`,
`products/`, and `services/`. Recent fixes on the
`claude/test-suite-performance-uRYQj` branch added clock injection to
`Retry` and `HmacAuth`, I/O injection to four libwiki commands, and
extended `createMockTracer` so bridge tests could stop reinventing it.
Those landings prove the seam works and trimmed ~11 s off wall time,
but they touched the four hottest test files only. The 87 other src
files that import `node:fs` directly and the 30 other src files that
call `Date.now()` carry the same shape and will surface the same test
smells the moment their tests become hot.

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
|---|---|---|
| Teams Using Agents | Run a continuously improving agent team ([JTBD.md](../../JTBD.md)) | Agents iterate against the test suite. A 60 s suite where most tests are integration-shaped against real fs/process/clock means every Plan-Do-Study-Act cycle waits on tests that test the wrong thing, and feedback that should arrive in milliseconds arrives in seconds. |
| Empowered Engineers | Trust agent output ([JTBD.md](../../JTBD.md)) | A reviewer assessing agent-authored code reads the module's signatures to learn what it touches. Today the signatures lie — a class declares no fs parameter yet imports `node:fs` directly inside its body. Explicit collaborator parameters make the dependency surface a property of the signature, so a reviewer can assess scope from the function header. (This benefit is qualitative; the spec does not commit to a measurable reviewer-confidence target.) |

## Scope

This spec is a **whole-monorepo charter** that establishes a single
DI contract every src module follows. It supersedes the inconsistent
seams that already exist (Finder's `process` arg, libconfig's `process`
arg, WikiRepo's `resolveToken`, libwiki's `io`) by converging them on
one shape and applies that shape across `libraries/`, `products/`, and
`services/`.

### In scope

| Component class | What changes |
|---|---|
| **Clock collaborator** | Every class doing time-based work — backoff, expiry, cooldown, rate limit, debounce, schedule, `Date.now()` ID generation — accepts a `clock` collaborator with `now()` and `sleep(ms)` methods. `Date.now()`, `new Date()`, and `setTimeout(...)` in module bodies of `libraries/*/src`, `products/*/src`, and `services/*/src` are eliminated. The single legitimate exception is the default-clock factory itself. libmock's `createMockClock` is the canonical fake. |
| **Filesystem collaborator** | Every src module that touches files accepts an `fs` collaborator with the methods it actually uses; the module does not also import `node:fs` directly. The async/sync split is consolidated to one fs surface per module (sync-only or async-only), not mixed. libmock's `createMockFs` is the canonical fake; production wires `node:fs`. |
| **Process collaborator** | Every src module that reads `process.cwd()`, `process.env`, `process.argv`, writes to `process.stdout`/`process.stderr`, or calls `process.exit` accepts a `proc` collaborator with the methods it actually uses. Termination is not control flow: handlers return a typed result (`{ ok: true, ... }` / `{ ok: false, code, error }`) and the bin shim translates results to exit codes. `process.exit` survives only in `bin/*.js` entry points and at top-level CLI dispatch in libcli. |
| **Subprocess collaborator** | Every src module that shells out to `git`, `gh`, `node`, or any other tool accepts a `subprocess` collaborator (or a domain-specific abstraction over it, such as `GitClient`). `spawnSync`/`execFileSync`/`spawn` calls survive only inside dedicated subprocess-collaborator implementations. |
| **libwiki: command handlers receive collaborators explicitly** | The twelve `runXxxCommand` free functions (`runBootCommand`, `runLogCommand`, `runAuditCommand`, `runInitCommand`, `runPushCommand`, `runPullCommand`, `runRefreshCommand`, `runMemoCommand`, `runInboxCommand`, `runClaimCommand`, `runReleaseCommand`, `runRotateCommand`) consume `runtime` and any libwiki-internal collaborators (the git repo, the wiki config) through `ctx.deps`, identical in shape to every other multi-subcommand CLI in the monorepo. The four handlers already migrated to the `io` pattern on `claude/test-suite-performance-uRYQj` set the precedent; the remaining eight follow the same contract. Handlers stay per-command files (no `LibwikiCommands` class wrapper) — the construction site for libwiki's domain collaborators (e.g. `WikiSync`) is `bin/fit-wiki.js`, the same layer that constructs `runtime`. What matters is that no command handler reaches into `process.exit`, `process.cwd`, `process.stdout/stderr`, `process.env`, `Date.now`, or imports `node:fs`/`node:child_process` directly. `bin/fit-wiki.js` remains the only place that constructs production collaborators. |
| **libwiki: git access is mediated by an injected collaborator** | The git operations in `wiki-repo.js` (5 `spawnSync("git", ...)` call sites, currently consolidated behind two private helpers) and the git operations in the `commands/init.js` `deriveWikiUrl` flow stop spawning git directly. They consume a git-access collaborator provided at construction time. The shape of that collaborator (raw subprocess fan-out vs. a typed `GitClient` API), and where it lives (libutil, a new libgit, or inline in libwiki), is a **design decision**. The existing integration tests for `WikiRepo` (rebase conflicts, `-X ours` recovery) keep real git through the production collaborator; logic-only tests use a fake. |
| **libwiki: wiki sync flow consolidates** | The git pull/push/conflict resolution logic currently spread across `wiki-repo.js`, `commands/sync.js`, and the wiki-related code paths inside the bridges, collapses into one cohesive surface that command handlers call instead of orchestrating git themselves. The exact API shape (method names, parameter style, error type) is a **design decision**. |
| **libutil: `Finder` collaborator pass-through and call-site collapse** | The `fs` constructor parameter on `Finder` actually flows through to `findUpward` and `findData` instead of being ignored as it is today. The 23 hand-rolled `new Finder(fsAsync, logger, process)` call sites across the monorepo collapse to consumers receiving a Finder collaborator constructed by a single canonical site. Whether that canonical site is a factory function, a static method on Finder, a libutil-managed singleton, or something else is a **design decision**. |
| **libutil: `Retry`, downloader, finder, etc. accept the clock collaborator** | Already done for `Retry`. Apply the same to any other util class with time-dependent behavior surfaced by the audit; `Date.now()` and `setTimeout` survive only inside default-clock factories. |
| **librpc: `HmacAuth` clock injection** | Already done. Audit the rest of librpc for the same shape (token issuance, retry, deadline) and apply the contract uniformly. |
| **libeval: `BenchmarkRunner` accepts `fs`, `proc`, `subprocess`, `clock`** | `runner.js`, `workdir.js`, `task-family.js`, `judge.js`, and the `commands/*.js` family stop importing `node:fs`, `node:os`, and `node:child_process` directly. Workdir creation (`mkdtemp`, `cp`, `mkdir`) and process orchestration (`spawn`) route through injected collaborators. The benchmark-e2e tests stop paying the cost of real tmpdir setup for assertions that only inspect record shape. |
| **libeval: typed-result control flow** | The `runner` and `commands/*` modules return `{ records, errors }` instead of writing to `process.stdout` and exiting; the bin shim renders them. |
| **products and services** | landmark/dispatcher, map/activity, outpost/scheduler, summit, pathway, guide, and every service under `services/*/src` that currently calls `process.exit`, `process.cwd()`, or reads `process.env.X` mid-function moves to the same constructor-injected `proc`/`fs`/`clock` contract. The CLI entry points stay where they are. |
| **libcli contract** | libcli stops reading the global `process` when it dispatches a handler, and provides handlers a path to receive the same collaborators the rest of the monorepo uses. Whether the existing `InvocationContext` extends with a `collaborators` slot, a sibling `runtime` context is added, or libcli takes a different shape is a **design decision** — what matters is that no handler dispatched through libcli has to reach into globals to find fs, clock, or process. |
| **libmock additions** | libmock grows a canonical fake for every collaborator surface this spec introduces — at minimum: clock (already shipped), fs (already shipped), process/proc, subprocess, and the git-access collaborator from the libwiki row. Every test that needs a fake imports it from libmock. The exact factory names, parameter shapes, and capture semantics (record calls vs. configurable responses vs. both) are a **design decision**. |
| **Lint-level enforcement** | A new invariant under `scripts/check-ambient-deps.mjs` (wired into `bun run invariants`) flags any new src file that imports `node:fs`, `node:child_process`, calls `Date.now()` / `new Date()` / `setTimeout` / `process.*` outside the allow-list (default-collaborator factories, bin shims, libcli internals). Existing violations are catalogued in a deny-list file; the deny-list shrinks as modules migrate. |

### Out of scope

- **The CLI binary contract for external users.** `npx fit-wiki claim --target …` and every other published CLI continues to accept the same argv, write the same stdout/stderr, and return the same exit codes. Changes are internal to how handlers are wired.
- **Replacing tests that legitimately exercise real integration.** `libwiki/wiki-repo.test.js` legitimately tests real git behavior (rebase conflicts, `-X ours` recovery), `landmark/dispatcher.test.js` tests the bin's exit-code contract end-to-end, `libeval/benchmark-workdir.test.js`'s listener-cleanup test legitimately spawns a node subprocess. These keep real collaborators. The design phase establishes a naming convention or marker that the lint check (Success Criterion 5) can use to distinguish integration tests from unit tests on the deny-list — the convention itself is a design decision, but the spec requires that one exists so the lint check is mechanically verifiable.
- **Performance work unrelated to the DI pattern.** Algorithmic speedups, parallelization, dependency upgrades, build-system changes.
- **A new test runner or assertion library.** node:test and bun:test both continue to work; the contract here is about source structure, not test mechanics.
- **The migration to TypeScript.** Constructor signatures and collaborator shapes are documented in JSDoc; a future migration can read those without re-deriving them.
- **External SDK abstractions.** `@grpc/grpc-js`, `@anthropic-ai/claude-agent-sdk`, `botbuilder`, `@octokit/*` and similar third-party SDKs are not wrapped in this spec. The DI contract is for node-runtime primitives and project-internal subprocess targets.

## Success Criteria

| # | Criterion | How to verify |
|---|---|---|
| 1 | No src module under `libraries/*/src`, `products/*/src`, or `services/*/src` imports `node:fs`, `node:fs/promises`, or `node:child_process` directly outside the allow-listed default-collaborator factories. | `bun run invariants` exits non-zero if a non-allow-listed src file imports those modules. |
| 2 | No src module calls `Date.now()`, `new Date()`, or `setTimeout(...)` outside the allow-listed default-clock factory and the bin shims. | Same invariant check, same exit semantics. |
| 3 | No src module calls `process.exit(...)`, `process.cwd()`, `process.stdout.write`, `process.stderr.write`, or reads `process.env.X` outside the allow-listed bin shims, default-collaborator factories, and libcli internals. | Same invariant check. |
| 4 | Every libwiki command handler is dispatched through `cli.dispatch(parsed, { deps: { runtime, wikiSync } })` and reads its collaborators from `ctx.deps` — no command handler imports `node:fs`/`node:child_process` or reads `process.*` directly. The same DI contract applies uniformly to every multi-subcommand CLI in the monorepo; libwiki does not introduce a per-CLI facade class. The CLI surface (`fit-wiki claim`, `fit-wiki log`, ...) produces byte-identical output to the current implementation for the existing test corpus. | `bun test libraries/libwiki/test/` passes; a golden-output test asserts the CLI's stdout/stderr/exitCode for a representative set of invocations matches the pre-refactor baseline. |
| 5 | Every command-handler test in libwiki, libeval, products/landmark, products/map, products/outpost, products/summit, products/pathway, and products/guide that previously spawned a subprocess via `execFileSync`/`spawnSync` now runs in-process against injected fakes, with one explicit smoke test per binary that spawns the bin to verify the wiring. | A new `scripts/check-subprocess-in-tests.mjs` invariant enumerates `execFileSync`/`spawnSync` call sites in `test/` and flags any that match `node`/the project's own bins, with an allow-list of one entry per binary for the smoke test. |
| 6 | The full test suite (`bun run test`) hits a sequence of milestones rather than a single target, so progress is visible and a missed milestone surfaces problems early. **M1**: under 45 s after libwiki migration completes. **M2**: under 35 s after libeval and librpc migration completes. **M3**: under 25 s after products and services migration completes. Every milestone reports zero failures and zero environmental-flake errors. | At each milestone, `time bun run test` reports `real` under the target on the same hardware class three consecutive runs apart (warmup excluded); `bun run test 2>&1` reports `0 fail` and `0 errors`. The 49 s state already on `claude/test-suite-performance-uRYQj` is the pre-M1 baseline. |
| 7 | libmock exports canonical fakes for **every** collaborator surface the spec introduces (clock, fs, proc/process, subprocess, git-client, and any other surface introduced during design). Each fake is documented in `libraries/libmock/README.md` under a single "Collaborators" section that names the surface, the production shape it fakes, and an example. The exact factory names and parameter shapes are settled in the design phase. | `libraries/libmock/src/index.js` re-exports a factory for every collaborator surface declared in the design doc; the README's Collaborators section lists every export with a one-line example; a test in libmock asserts that every declared collaborator surface has a corresponding export. |
| 8 | `scripts/check-libmock.mjs` (the existing inline-mock guard) catches the common-shape reimplementations of every collaborator fake libmock introduces — at minimum, the exact patterns the panel review flagged plus any patterns the design phase enumerates. The guard is not expected to catch every conceivable inline duplicate (a fully obfuscated reimplementation will slip through), but it must catch the same kinds of shapes the existing guard catches for tracer/logger/storage today, applied to the new collaborator surfaces. | A regression test in `scripts/` exercises the guard against a corpus of representative inline shapes (one positive case per collaborator surface) and verifies each is flagged. |
| 9 | The `Finder` class accepts the same `{ fs, proc, logger }` shape as every other collaborator-aware util; the 17 hand-rolled `new Finder(...)` call sites collapse to consumers receiving a `finder` collaborator. The `fs` parameter actually flows through to internal calls instead of `findUpward` using the top-level import. | `rg "new Finder\(" libraries/ products/ services/` returns zero matches outside `libutil` itself; a unit test injects a `createMockFs` and verifies `findUpward` uses it. |
| 10 | A contributor doc at `MONOREPO.md` (or a new sibling) names the four collaborator surfaces, the canonical libmock fakes, and the invariants that enforce them, so a future contributor lands on the pattern from any starting point. | The doc exists, links to libmock's collaborator README section, and is referenced from `CONTRIBUTING.md` § READ-DO. |

## Risks and Mitigations

- **Refactor blast radius and half-migrated chaos.** This touches more
  than 150 src files across three top-level directories. A pure
  deny-list lets the invariants pass but doesn't tell a contributor
  whether a module's direct fs import is "temporarily allowed" or
  "forgotten". Mitigation: the design phase produces an explicit
  library-by-library migration order (libutil → libmock → libwiki →
  libeval → librpc/services → products), and `wiki/STATUS.md` carries
  one design+plan row per library so progress is visible and parallel
  sessions don't collide. The deny-list shrinks in lockstep with each
  library's migration PR — a library does not exit migration with any
  of its files still on the deny-list.
- **External CLI contract drift.** Mitigation: a golden-output test per
  CLI binary, captured **before any refactor PR opens**, asserts
  byte-identical stdout/stderr/exit for the existing test corpus.
  Golden capture is a prerequisite of the first migration PR, not a
  test added during it. The release-merge gate refuses to merge any
  refactor PR that changes a golden output without an explicit
  approval signal.
- **OO-vs-DI conflation.** The user's request named "OO+DI" but the
  problem this spec solves is dependency injection, not class-vs-function
  representation. The libwiki `io` pattern already on
  `claude/test-suite-performance-uRYQj` shows DI via function
  parameters works fine. Mitigation: the spec deliberately does not
  require classes — every "command handlers receive collaborators
  explicitly" row leaves the function-vs-class choice to design. The
  test for whether this spec succeeds is "can the test inject fakes
  without spawning subprocesses or touching the real fs/clock", not
  "is everything a class".
- **Constructor-shape fragmentation.** If different libraries choose
  different parameter styles (single `runtime` bag in one library,
  four separate args in another), the pattern fractures immediately.
  Mitigation: the design phase **must** lock in one collaborator-passing
  style before any library's plan is approved. The design-approval row
  in STATUS records which style was chosen; subsequent library plans
  reference it.
- **Slow migration overshadows the speed win.** Mitigation: Success
  Criterion 6's staged milestones (M1/M2/M3) gate the spec — if M1
  passes but M2 misses, we re-investigate before pushing further. The
  49 s state already achieved on `claude/test-suite-performance-uRYQj`
  is the pre-M1 baseline, not the proof point for the final target.
- **Migration cost itself is unbudgeted.** Capturing golden outputs,
  writing fakes, threading collaborators through call sites, and
  updating tests is non-trivial work across 150+ files. Mitigation: the
  design phase produces an effort estimate per library; the plan phase
  decides which libraries are in the first wave and which can wait
  until the pattern is proven. The spec is approved as a charter; not
  every library must migrate in the same quarter.

## Open Questions for Design

- Should the four collaborators be passed as a single `runtime` parameter
  (`{ fs, proc, clock, subprocess }`) or as four separate constructor
  arguments? Trade-off: cohesion vs. constructor noise.
- Should libcli own the collaborator-construction step, or should each
  bin shim construct collaborators inline? Trade-off: shared idiom vs.
  CLI variations (e.g., a CLI that needs a custom logger).
- Where do `GitClient`, `GhClient`, and other domain-specific
  subprocess abstractions live? Candidates: a new `libgit`/`libgh`, or
  inside `libutil`, or inline in each consumer. Trade-off: surface area
  vs. discoverability.
- Should `Result` types be introduced as a shared type from libtype, or
  remain inline plain objects? Trade-off: ceremony vs. consistency.

These questions are for the design phase. They are listed here so the
design author has a starting agenda, not so this spec answers them.
