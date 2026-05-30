# Plan 1370 — Part 03: Bin-Shipping Libraries

Migrates the 15 libraries that ship a `bin/` entry. Each section below
is **one PR / one sub-row**. Sections execute independently in parallel
once plan-a-01 (foundations) has merged. Every PR follows the [recipe](plan-a.md#migration-recipe)
in plan-a.md; this file calls out the unit-specific files, seams, and
deviations.

Blocking dependency: plan-a-01 (foundations) merged. Sections within
this part have no inter-section dependencies.

Sub-rows: one per section below.

## libconfig

Sub-row: `1370/libconfig\tplan\timplemented`.

(No bin — libconfig is library-only. Part 03 collects it here because design § Decision 8 sequences libconfig immediately after libwiki and ahead of bin-shipping libraries; the recipe steps that don't apply — golden capture / replay — are skipped per the [plan-a.md migration recipe](plan-a.md#migration-recipe).)

Files (src): `libraries/libconfig/src/config.js`, `libraries/libconfig/src/bootstrap.js`, `libraries/libconfig/src/index.js` (factories).

- Replace the optional `process` constructor arg on `Config` / every `createXxxConfig` factory with a `runtimeOrProcess` parameter resolved to a runtime bag (`{ proc, fs, clock, subprocess }`). Every `process.env.X` read becomes `runtime.proc.env.X`; every `process.cwd()` becomes `runtime.proc.cwd()`; `.env` reads route through `runtime.fs`; `Date.now()` routes through `runtime.clock`.
- The factories' public API accepts `{ runtime }` as the construction parameter; existing callers that passed a bare `process` get a one-cycle deprecation alias (`resolveRuntime` maps a bare process-like object onto `{ proc }` over a default runtime).
- **`Config.ghToken()`'s `gh auth token` fallback uses `runtime.subprocess.runSync("gh", ["auth", "token"])`.** `ghToken()` is a synchronous accessor read across the monorepo, so it cannot await `subprocess.run`; the synchronous `runSync` seam (added to the foundation — see [plan-a.md § Async-only subprocess propagation](plan-a.md#async-only-subprocess-propagation)) lets `config.js` drop its `node:child_process` import entirely and **fully exit the deny-list** (no grandfathered smell remains). The legacy `execSyncFn` constructor parameter is removed; tests that exercised the fallback inject `createTestRuntime({ subprocess: createMockSubprocess({ responses: { gh: { stdout: "<token>" } } }) })`.
- Test files using `process.env` mutation migrate to `createTestRuntime({ proc: createMockProcess({ env: { …, FORWARDIMPACT_X: "value" } }) })`.
- No bin; libconfig itself has no `bin/` entry — golden capture N/A.

Verification: `bun run invariants` exits 0 with **all** libconfig entries removed from the deny-list; `bun test libraries/libconfig/test/` passes.

## libstorage

Sub-row: `1370/libstorage\tplan\timplemented`.

Files (src): every `libraries/libstorage/src/*.js` that imports `node:fs`. Bin: `libraries/libstorage/bin/fit-storage.js`.

- Constructor migration: `MockStorage` already shipped from libmock; production `Storage` (and any Bun-flavored variant) accepts `{ runtime }` and destructures `{ fs }` (async) or `{ fsSync }` (sync) — never both. Pick one per module per [design § Decision 7](design-a.md#key-decisions); if a module currently mixes, the migration splits the sync/async surfaces into two files.
- `fit-storage` bin: convert to `cli.dispatch(parsed, { deps: { runtime } })` if it has multiple subcommands; otherwise thread `runtime` as an explicit parameter from `main()`.
- Golden capture: cases.json covers each subcommand or main flow.

Verification: `bun test libraries/libstorage/test/`; `--verify` golden replay; deny-list shrink.

## libcoaligned

Sub-row: `1370/libcoaligned\tplan\timplemented`.

Files (src): `libraries/libcoaligned/src/*.js`, `libraries/libcoaligned/bin/coaligned.js`.

- The bin already uses `cli.dispatch(parsed, { data })` ([design § CLI Inventory](design-a.md#cli-inventory)). One-line change: `cli.dispatch(parsed, { data, deps: { runtime } })`. Handlers add `ctx.deps.runtime` reads.
- Any libcoaligned src module reading `process.cwd()` / `node:fs` directly switches to `runtime`.

Verification: `bun test libraries/libcoaligned/test/`; existing `data` slot consumers untouched.

## libeval

Sub-row: `1370/libeval\tplan\timplemented`.

Files (src): `libraries/libeval/src/benchmark/runner.js`, `libraries/libeval/src/benchmark/workdir.js`, `libraries/libeval/src/benchmark/task-family.js`, `libraries/libeval/src/benchmark/judge.js`, `libraries/libeval/src/benchmark/scorer.js`, `libraries/libeval/src/benchmark/report.js`, `libraries/libeval/src/benchmark/result.js`, `libraries/libeval/src/benchmark/apm-installer.js`, `libraries/libeval/src/benchmark/npm-installer.js`, `libraries/libeval/src/benchmark/env-loader.js`, `libraries/libeval/src/commands/*.js`, `libraries/libeval/src/judge.js`, `libraries/libeval/src/discusser.js`, `libraries/libeval/src/discuss-tools.js`, `libraries/libeval/src/facilitator.js`, `libraries/libeval/src/orchestration-loop.js`, `libraries/libeval/src/supervisor.js`, `libraries/libeval/src/tee-writer.js`, `libraries/libeval/src/trace-collector.js`, `libraries/libeval/src/trace-github.js`, `libraries/libeval/src/trace-query.js`, `libraries/libeval/src/agent-runner.js`, plus any other src file lighting an ambient-dep smell in the foundations PR's deny-list. Bins: `libraries/libeval/bin/fit-eval.js`, `libraries/libeval/bin/fit-benchmark.js`, `libraries/libeval/bin/fit-trace.js`, `libraries/libeval/bin/fit-selfedit.js`.

- `BenchmarkRunner` (and the benchmark/ subdir's other classes) constructor: `({ runtime })` — destructures `{ fs, proc, subprocess, clock }`. Every `mkdtemp` / `cp` / `mkdir` routes through `runtime.fs`; every `spawn` / `execFileSync` routes through `runtime.subprocess`; every `Date.now()` / `setTimeout` routes through `runtime.clock`; every `process.env.ANTHROPIC_API_KEY` (or similar) routes through `runtime.proc.env`. `task-family.js` and `commands/supervise.js` currently import `node:os` (`os.tmpdir()`); `tmpdir` joins `runtime.proc.env.TMPDIR ?? "/tmp"` (per POSIX convention; node's `os.tmpdir()` is itself an env-respecting wrapper). The runtime bag does not add an `os` slot — `tmpdir` is derivable from `env`.
- `runner` returns `{ records, errors }` payload wrapped as `{ ok: true, value: { records, errors } }` envelope per [design § Decision 4](design-a.md#key-decisions). The bin shim renders the envelope and translates to exit code.
- The benchmark-e2e test (`libraries/libeval/test/benchmark-workdir.test.js`'s listener-cleanup test) is **legitimate integration** and renames to `*.integration.test.js`. All other tests in `test/` migrate to in-process invocation against `createTestRuntime` + `createMockSubprocess`.
- Each bin: convert hand-rolled `COMMANDS` to `cli.dispatch`; capture goldens per bin in `test/golden/<bin>/`.

Verification: `bun test libraries/libeval/test/`; four `--verify` golden replays (one per bin); benchmark-e2e integration test passes.

## librpc

Sub-row: `1370/librpc\tplan\timplemented`.

Files (src): every `libraries/librpc/src/*.js` with `Date.now()` / `setTimeout` / `process.env` / `node:fs` / `node:child_process`. Bin: `libraries/librpc/bin/fit-unary.js`.

- `HmacAuth` already accepts `{ now }` — migrate to `runtime.clock.now` ([design § Decision 10](design-a.md#key-decisions)).
- Audit remaining classes (`Retry` already done; token issuance, deadline, rate limit) and apply the same pattern.
- `fit-unary` bin: convert to `cli.dispatch` if multi-subcommand; otherwise `runtime` parameter.

Verification: librpc tests pass; deny-list shrink.

## libdoc, libcodegen, libterrain, libxmr, librc

Sub-rows: `1370/libdoc`, `1370/libcodegen`, `1370/libterrain`, `1370/libxmr`, `1370/librc` (separate sub-rows; separate PRs).

Per library: identify every src module reading ambient deps; migrate constructors to `{ runtime }` destructuring; convert the bin's dispatch per [design § Decision 13](design-a.md#key-decisions) (most are single-flow — thread `runtime` from `main()`); capture goldens per bin; shrink deny-list.

Specific deviations:

- **libdoc** (`fit-doc`): the doc site builder reads `node:fs` heavily and may have a pre-build hook that shells out. The hook is a subprocess collaborator surface — migrate to `runtime.subprocess`.
- **libcodegen** (`fit-codegen`): generates files into `generated/` — migration must not change generated-content paths or generated-content byte-content. Golden capture covers the generated output.
- **libterrain** (`fit-terrain`): the DSL renderer's `fs` access is heavy. Async migration may be unavoidable if subprocess child invocations exist.
- **libxmr** (`fit-xmr`): time-series CSV reader — `new Date()` for the chart timestamp routes through `runtime.clock`.
- **librc** (`fit-rc`): config-cascade file reader — `process.env.HOME` and `process.env.XDG_CONFIG_HOME` route through `runtime.proc.env`.

Verification per library: tests pass; `--verify` golden replay; deny-list shrink.

## libgraph, libvector

Sub-rows: `1370/libgraph`, `1370/libvector`.

Files: `libraries/libgraph/src/*.js` + `libraries/libgraph/bin/fit-query.js` + `libraries/libgraph/bin/fit-subjects.js` + `libraries/libgraph/bin/fit-process-graphs.js`; `libraries/libvector/src/*.js` + `libraries/libvector/bin/fit-search.js` + `libraries/libvector/bin/fit-process-vectors.js`.

- Both libraries read `node:fs` for the graph/vector store and may invoke `node:child_process` for ingest scripts. Migration is standard `{ runtime }` constructor injection.
- libgraph ships three bins; libvector ships two. Each bin captures its own golden under `test/golden/<bin>/`. If two bins share a single underlying ingest pipeline, the goldens may share a test file but must capture per-bin output independently.

Verification: tests pass; five `--verify` golden replays across both libraries (one per bin); deny-list shrink.

## libresource, libsupervise, libtelemetry

Sub-rows: `1370/libresource`, `1370/libsupervise`, `1370/libtelemetry`.

- **libresource** (`fit-process-resources`): file-walker over resource manifests — `fs` collaborator; bin is single-flow.
- **libsupervise** (`fit-logger`, `fit-svscan`): process supervisor — heavy `node:child_process` and `setTimeout` (watchdog timer); `subprocess.spawn` (streaming) is the primary surface. Both bins are single-flow.
- **libtelemetry** (`fit-visualize`): telemetry renderer — `fs` reads; `new Date()` for chart axes; bin is single-flow.

Verification per library: tests pass; per-bin golden replay; deny-list shrink. libsupervise specifically must test that the streaming `subprocess.spawn` surface (AsyncIterable stdout/stderr) is exercised in unit tests against `createMockSubprocess`.

## Per-section CI gate (shared)

After every section's PR merges, plan-a master row blocked by:

- `1370/foundations` at `plan implemented` (plan-a-01) — prerequisite.
- This section's sub-row at `plan implemented`.

The master `1370\tplan\timplemented` advance waits for every part-03 sub-row, every part-02/04/05/06 sub-row.

## Libraries used

Libraries used: libutil (Runtime, GitClient when needed), libmock
(createTestRuntime + fakes per surface), libcli (cli.dispatch with deps),
the migration target library itself.

## Risks

- **`fit-codegen` golden capture covers generated files, not just bin stdout.** If the cases.json schema only captures stdout/stderr/exitCode, generated-content drift slips through. Mitigation: libcodegen's cases.json declares a `--check-files` option per case that captures the post-run state of `generated/`.
- **libsupervise's `subprocess.spawn` AsyncIterable contract is novel.** No existing libmock fake exercises async iteration. Mitigation: `createMockSubprocess` factory in plan-a-01 ships AsyncIterable-backed stdout/stderr; libsupervise's tests are the first downstream consumer and validate the fake's contract by their own pass/fail.
- **libterrain async cascade.** If terrain DSL rendering currently runs synchronously and the migration introduces an `await runtime.subprocess.run`, every libterrain caller (`benchmarks/*` test fixtures, downstream eval tasks) needs async. Mitigation: scope libterrain's bin migration tightly — the subprocess call may stay in a single ingest path, not the read-path.
- **Inter-section deny-list race.** Two sections shipping in parallel both remove deny-list entries; the second-merging PR sees the first's removals but the JSON merge is mechanical. Mitigation: deny-list edits are scoped per-library (each section removes its own library's globs only), so merge conflicts are minimal; release-merge resolves textually.

— Staff Engineer 🛠️
