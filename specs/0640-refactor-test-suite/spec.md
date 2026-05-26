# Spec 0640 — Refactor Test Suite for Speed and Maintenance

## Problem

The test suite has grown to 211 files / 45,456 lines / 3,089 test cases, and it
is slow to run and time-consuming to maintain. `libraries/libharness/` was
created to hold shared fixtures and mocks, but adoption has stalled: coding
agents consistently pick the local optimum and reinvent helpers inline rather
than extend the shared library.

### Evidence

Measured on branch `claude/refactor-test-suite-Fx4EQ` at 2026-04-23:

| Metric                                                                | Value                                   |
| --------------------------------------------------------------------- | --------------------------------------- |
| Test files                                                            | 211                                     |
| Total LOC in test files                                               | 45,456                                  |
| Test cases                                                            | 3,089                                   |
| Test files importing `@forwardimpact/libharness`                      | **37 (17.5%)**                          |
| Test files with local `createMock*` / `mockStorage` / `createFake*`   | 67                                      |
| Files using raw `assert.throws` / `assert.rejects`                    | 82                                      |
| Files using libharness `assertThrowsMessage` / `assertRejectsMessage` | **0**                                   |
| Tests that call `createDataLoader().loadAllData()` (real YAML I/O)    | 27                                      |
| Tests using `mkdtempSync` / real tmp dirs                             | 12                                      |
| Tests doing real `fs.readFile` / `readFileSync`                       | 20                                      |
| Tests spawning child processes / real servers                         | 6                                       |
| Test files > 300 LOC                                                  | 52                                      |
| Test files > 200 LOC                                                  | 107                                     |
| Full `bun run test` wall-clock                                        | 16.3 s (serial, `--test-concurrency=0`) |

### Structural issues found

1. **Serial execution is hard-coded.** `package.json` runs
   `node --test --test-concurrency=0`, which forces one test file at a time.
2. **Products almost never use libharness.** 0 of 19 `products/map` tests, 0 of
   17 `products/landmark` tests, and 0 of 12 root `tests/model-*.test.js` files
   import it. They redefine framework fixtures (disciplines, levels, tracks,
   skills, behaviours) 10+ times.
3. **Existing libharness helpers are reimplemented.** `MockMetadata` is
   redefined four times in `libraries/libtelemetry/test/*` even though
   `libharness` already exports it. `createMockStorage`, `createMockLogger`, and
   `createMockFs` are duplicated across at least seven subsystems.
4. **Ad-hoc `make*` vs `createTest*` naming.** `libraries/libskill/test/`
   invented a parallel fixture layer (`makeDiscipline`, `makeLevel`,
   `makeSeniorLevel`, `makeSkills`, `makeBehaviours`, `makeCapabilities`,
   `makeDrivers`) that duplicates the pathway fixtures already in libharness.
5. **Coverage loops.** The 12 root `tests/model-*.test.js` files, the 16
   `libraries/libskill/test/*` files, and
   `services/pathway/test/integration.test.js` overlap on libskill
   matching/derivation behaviour.

## Goal

Halve both maintenance surface (duplicate fixture/mock definitions) and
wall-clock test time. Coverage reduction is allowed where redundant, but it must
not be the only fix — the primary levers are consolidation into libharness and
removing real I/O from unit tests.

## Scope

### A. Move into libharness

Concrete helpers to add, with call sites that will collapse once they exist.

#### A.1 Framework-data fixtures

Framework data (capabilities / skills / disciplines / tracks / drivers /
behaviours / levels) is inlined or re-defined in at least 20 places.

| Helper                                                                                                                   | Consumers (examples)                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createTestFramework(overrides?)` → returns `{ capabilities, skills, disciplines, tracks, drivers, behaviours, levels }` | `products/map/test/exporter.test.js:21-87`, `products/map/test/levels.test.js:71-104`, `products/map/test/view-builders/{skill,capability,others}.test.js`, `products/landmark/test/{readiness,health,marker,snapshot}.test.js`, `tests/model-fixtures.js` (shared across all 12 root tests), `services/pathway/test/service.test.js:31-120` |
| `createTestPerson(overrides?)`                                                                                           | `products/map/test/activity/validate-people.test.js:16-43` and surrounding validation tests                                                                                                                                                                                                                                                  |
| `createTestRoster(overrides?)` + `createTestTeamSnapshot(roster, data, teamId)`                                          | `products/summit/test/{coverage,evidence,risks,what-if,trajectory,growth}.test.js` — the `FIXTURE_ROSTER` + `snapshot()` pattern is replicated 7×.                                                                                                                                                                                           |
| `createTestEvidenceRow(overrides?)`                                                                                      | `products/map/test/activity/transform-evidence.test.js:74-100`, `products/landmark/test/{evidence,evidence-helpers,health,timeline}.test.js` (5 sites, identical shape)                                                                                                                                                                      |
| `createTestSkillWithMarkers()`                                                                                           | `products/landmark/test/{marker,readiness,evidence-helpers}.test.js`                                                                                                                                                                                                                                                                         |

libharness already exports `createTestLevel[s]`, `createTestDiscipline`,
`createTestSkill[s]`, `createTestTrack`, `createTestCapability`,
`createTestBehaviour[s]` in `src/fixture/pathway.js`. Extend (don't replace)
those with a single top-level `createTestFramework()` and migrate
`libraries/libskill/test/derivation-fixtures.js` to call it, then retire
`makeDiscipline`, `makeLevel`, `makeSeniorLevel`, `makeJuniorLevel`,
`makeSkills`, `makeBehaviours`, `makeCapabilities`, `makeDrivers` from libskill
and `products/landmark/test/**/stubQueries` from landmark.

#### A.2 libeval supervisor / trace helpers

The `libraries/libeval/test/` directory (23 files) contains 10 helpers
duplicated 2–6 times each. Add to libharness as an opt-in `eval` namespace:

| Helper                                                                                         | Call sites                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createToolUseMsg(name, input)` (replaces `concludeMsg`, `redirectMsg`, `tellMsg`, `shareMsg`) | `supervisor-run.test.js:13-27`, `supervisor-output.test.js:18-48`, `supervisor-batching.test.js:18-48`, `supervisor-intervention.test.js:13-43`, `facilitator.test.js:13-43`, `facilitator-messaging.test.js:14-60` |
| `createTextBlockMsg(text)`                                                                     | `agent-runner-batching.test.js:20-23`, `supervisor-batching.test.js:13-16`                                                                                                                                          |
| `createTestTrace(overrides?)` (replaces 155-line inline `buildTrace`)                          | `trace-query.test.js:11-165`, `trace-query-v1.1.test.js:12-36`                                                                                                                                                      |
| `createStreamCollector()` → `{ collect, collectLines }`                                        | `tee-writer{,-schema}.test.js`, `fixture-equivalence.test.js` (5 sites)                                                                                                                                             |
| `stripAnsi(s)`                                                                                 | same 3 files                                                                                                                                                                                                        |
| `writeLines(writer, lines)`                                                                    | `tee-writer{,-schema}.test.js`                                                                                                                                                                                      |
| `createMockAgentQuery(messages, onParams?)` async-generator                                    | `agent-runner.test.js:13-20`, `agent-runner-batching.test.js:12-18`                                                                                                                                                 |

#### A.3 Graph / RPC / telemetry infra

| Helper                                                                                               | Call sites                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createGraphIndexFixture({ storageOverrides?, indexKey? })` → `{ n3Store, graphIndex, mockStorage }` | `libgraph/test/index-items.test.js:19`, `libgraph-query.test.js:54`, `prefixes.test.js:50`, `index-loading.test.js:18`, `libgraph-filters.test.js:55` |
| **Use existing** `MockMetadata` (already exported)                                                   | replace 4 redefinitions in `libtelemetry/test/{tracer,error}.test.js`                                                                                 |
| `createMockS3Client({ sendFn?, overrides? })`                                                        | `libstorage/test/libstorage-s3-ops.test.js:12-48`                                                                                                     |
| `createMockSupabaseClient({ from?, insert?, delete?, storage? })`                                    | `products/map/test/activity/transform-{evidence,getdx,people,github}.test.js` (4 files with near-identical `createFakeClient`)                        |
| `createTurtleTestHelpers()` → `{ parseQuads, findOne, findAll }`                                     | `services/pathway/test/{service,integration,serialize}.test.js` (~100 LOC across 3 files)                                                             |
| `createMockGrpcHealthDefinition()`                                                                   | `libraries/librpc/test/health.test.js` and `products/guide/test/status.test.js`                                                                       |
| `createReplEnvironment()` bundling readline / process / os / formatter / storage                     | `libraries/librepl/test/librepl.test.js:11-58`                                                                                                        |

#### A.4 CLI / console

| Helper                                                      | Call sites                                                                                                                                |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `withSilentConsole(fn)`                                     | `products/pathway/test/{agent-builder-install,build-packs}.test.js:31-50` (defined twice), useful in CLI tests across libcli and basecamp |
| `createMockProcess()` → `{ env, stdout, stderr, exitCode }` | `libraries/libcli/test/cli.test.js:7-25`, `libutil/test/finder.test.js:14-24`                                                             |

#### A.5 Promote existing helpers (no new API needed)

These exist in libharness already but the 67 inline reimplementations prove the
helpers aren't discoverable. Blocking fix: add `CONTRIBUTING.md` section
pointing to the libharness README with an example and add to the `CHECKLISTS.md`
DO-CONFIRM gate "checked libharness before writing a mock."

- `createMockStorage` — reimplemented in
  `libraries/libutil/test/downloader.test.js:9-44`,
  `libraries/libstorage/test/libstorage-local.test.js:9-46`, and inline in at
  least 5 other files.
- `createMockLogger` / `createSilentLogger` —
  `libraries/libsupervise/test/tree.test.js:8`,
  `libraries/libutil/test/finder.test.js:14`,
  `libraries/libutil/test/libutil.test.js:8`.
- `createMockFs` — `products/basecamp/test/kb-manager.test.js:9-80`
  (sophisticated, could feed back into libharness),
  `products/basecamp/test/agent-runner.test.js:13-14` uses real tmpdir instead.
- `assertThrowsMessage` / `assertRejectsMessage` — exist, zero adopters.
- `MockMetadata` — exported, redefined 4×.

### B. Speed improvements that aren't libharness moves

#### B.1 Turn on concurrency

`package.json:28` hard-codes `--test-concurrency=0`. Node test runner defaults
to parallel file execution. Flipping to the default (or an explicit number)
should drop wall-clock on 2+ cores materially; the blocker to investigate is
whether some tests share global state (`process.env`, file locks, ports). Likely
culprits to fix first:

- `libraries/libutil/test/logger.test.js` mutates `process.env.DEBUG` and
  `console.error` globally — wrap in a per-file `beforeEach/afterEach`.
- `libraries/librc/test/manager-{start,stop}.test.js` spawns processes.
- `libraries/libconfig/test/libconfig-credentials.test.js` binds a real port
  (only test doing so in libraries).

Expected impact: ~3–5× faster on CI runners with multiple cores.

#### B.2 Eliminate real filesystem I/O in unit tests

The 20 files doing `fs.readFile` / `readFileSync` and the 12 using `mkdtemp` are
mostly unit tests that could use the existing `createMockFs`. The slowest
offenders:

| File                                                                                      | Issue                                                                                                                                                  |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `libraries/libsyntheticprose/test/prose-engine.test.js`                                   | 6 tests each `mkdtempSync` + `writeFileSync` + `readFileSync` for cache persistence (~150 LOC). Replace with `createMockFs`.                           |
| `libraries/libprompt/test/loader.test.js` and `libraries/libtemplate/test/loader.test.js` | Mirror image — both do per-test `mkdtempSync` + `writeFileSync` for 10+ tests.                                                                         |
| `libraries/libcodegen/test/metadata.test.js:16-42`                                        | Scans `node_modules/@forwardimpact/*/proto` at load time.                                                                                              |
| `products/pathway/test/build-packs.test.js`                                               | Real tar extraction via `execFileSync("tar", …)` in 3 tests. Keep _one_ integration test; convert the others to assert against the pre-packed archive. |

#### B.3 Cache fixture data across tests that need real framework data

27 tests call `createDataLoader().loadAllData()` which reads the 11 YAML files
in `products/map/starter/`. Even at 57 KB it adds up × 27 × (parse + derive).
Options:

- Add a libharness `loadStarterFrameworkCached()` that memoizes the load across
  a process, keyed by `starterDir`. Safe because fixtures are read-only.
- Replace per-test `loadData()` calls in `products/summit/test/*` with a single
  shared `before()` that loads once per file.

Expected impact: ~30–40% reduction in summit + services/pathway integration test
time.

#### B.4 Split giant test files

52 files are over 300 LOC. The biggest maintenance burden comes from the few at
400+:

| File                                                        | LOC | Split suggestion                |
| ----------------------------------------------------------- | --- | ------------------------------- |
| `libraries/libeval/test/tee-writer.test.js`                 | 474 | split schema vs behaviour       |
| `libraries/libeval/test/trace-query.test.js`                | 460 | introspection vs query vs stats |
| `libraries/libeval/test/supervisor-output.test.js`          | 453 | event envelope vs orchestration |
| `libraries/libindex/test/base-filters.test.js`              | 450 | by filter family                |
| `libraries/libtelemetry/test/visualizer-edge-cases.test.js` | 411 | by edge-case family             |

#### B.5 Reduce excessive parametrization

- `libraries/libskill/test/modifiers.test.js` (44 cases) and
  `policies-predicates.test.js` (46 cases) appear to cross-multiply every
  proficiency × modifier combination. Audit whether the matrix tests distinct
  code paths or repeats one implementation detail; keep representative cases per
  branch.
- `tests/model-types.test.js` (448 LOC) exhaustively iterates proficiency ×
  maturity indices. Replace with a small set of boundary cases plus one
  property-based check.

### C. Coverage reductions (secondary, after B)

Only take these after the libharness moves so the remaining tests are also
cleaner to maintain. Each removal below was called out by independent sub-agents
as redundant with upstream coverage.

| Candidate                                                                                                | Rationale                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Merge `libraries/libeval/test/trace-query.test.js` and `trace-query-v1.1.test.js`                        | Both probe the same `TraceQuery` surface; v1.1 mostly adds schema-specific assertions that can be version-gated subtests in one file.                                                                                                                                        |
| Consolidate 4 `libraries/libeval/test/supervisor-*.test.js` files into 2                                 | `supervisor-run` + `supervisor-output` + `supervisor-batching` + `supervisor-intervention` share identical mock scaffolding; split by _behaviour_ (run/output vs mid-turn control) instead of by _detail_.                                                                   |
| Remove overlap between `tests/model-matching-*.test.js` and `libraries/libskill/test/matching-*.test.js` | Root matching tests re-exercise `findNextStepJob` / `classifyMatch` / `calculateGapScore` already covered in libskill's own tests. Keep root tests for genuine cross-module integration (`profile-base`, `interview`); delete assertions that duplicate libskill unit tests. |
| Drop `libraries/libsyntheticrender/test/enricher.test.js` IRI-format checks                              | Covered by `validate.test.js` + `industry-data.test.js` in the same library.                                                                                                                                                                                                 |
| Merge `libraries/libsyntheticgen/test/parser.test.js` + `parser-dataset.test.js` overlap                 | Both parse org/team/department shapes; keep one.                                                                                                                                                                                                                             |
| Remove regex-based source-file assertions in `products/guide/test/cli.test.js`                           | Fragile and duplicates what libcli already unit-tests.                                                                                                                                                                                                                       |
| `libraries/libutil/test/libutil.test.js` (3 tests)                                                       | Subsumed by `logger.test.js` (18 tests).                                                                                                                                                                                                                                     |

### D. Docs / process (prevents regression)

1. Add a short "Don't inline a mock" section to `CONTRIBUTING.md`, listing the
   libharness API and saying: if you need a helper that isn't there, add it to
   libharness in the same PR.
2. Add a `<read_do_checklist>` entry in the project-wide test checklist (per
   `CHECKLISTS.md`): _"Checked `libraries/libharness/src/index.js` for an
   existing mock / fixture before writing a new one."_
3. Add a simple eslint rule or `scripts/check-instructions.mjs` lint that warns
   when a test file defines `createMock*` locally and does not import from
   `@forwardimpact/libharness`.

## Non-goals

- No changes to what products do or how they are wired. Only test code.
- No new test framework. Keep `node:test`.
- No rewrite of libharness internals; only additive extensions.

## Open questions

1. What's the right ceiling for coverage reduction? Step C removes maybe 8–12
   test files; are any of those load-bearing for a spec owner?
2. Should the `eval` namespace helpers live in libharness or in a sibling
   `libeval/test-helpers.js` exported for downstream libraries that consume
   libeval? Precedent in `libdoc/test-harness.js`.
3. Is there appetite for property-based testing (fast-check or similar) to
   replace the combinatorial matrices in libskill and root `tests/`?

## Expected outcome

- Local `bun run test` wall-clock: 16 s → ~5 s (parallel + cached framework
  data + fewer tmpdirs).
- Duplicate mock/fixture definitions: ~120 → ~15.
- libharness adoption: 17% → ~80% of test files.
- Test LOC: 45,456 → ~33,000 (≈ 25% reduction) without losing a real code path
  from coverage.

## Outcome so far

First execution pass on branch `claude/refactor-test-suite-Fx4EQ`:

- **libharness extended** — `src/fixture/eval.js`, `src/fixture/cache.js`, and
  `src/mock/infra.js` added. New exports: `createToolUseMsg`,
  `createTextBlockMsg`, `createTestTrace`, `collectStream`, `collectLines`,
  `stripAnsi`, `writeLines`, `createMockAgentQuery`, `createTestFramework`,
  `createTestPerson`, `createTestRoster`, `createTestEvidenceRow`,
  `createTestSkillWithMarkers`,
  `createTestCapabilities/Tracks/Disciplines/Drivers`,
  `createMockSupabaseClient`, `createTurtleHelpers`, `createMockProcess`,
  `withSilentConsole`, `createMockQueries`, `createMockS3Client`,
  `memoizeAsync`, `memoizeOnSubject`.
- **Consumers migrated**: libeval (11 files, -232 LOC of
  `concludeMsg/redirectMsg/tellMsg/shareMsg/textBlock/mockQuery/collect/stripAnsi/writeLines`);
  services/pathway (3 files, Turtle helpers); products/map (2 transform tests,
  Supabase fake clients); libsupervise + libutil (inline `mockLogger`);
  products/landmark (10 `stubQueries` factories).
- **Process**: `CONTRIBUTING.md` READ-DO and DO-CONFIRM entries added;
  `scripts/check-libharness.mjs` wired into `bun run check` to flag new inline
  `concludeMsg`/`stripAnsi`/`mockLogger`/`MockStorage` patterns.

Measured deltas:

| Metric                                             | Before     | After                         |
| -------------------------------------------------- | ---------- | ----------------------------- |
| Test files importing `@forwardimpact/libharness`   | 37 (17.5%) | **85 (40.9%)**                |
| Files using `assertThrowsMessage`/`RejectsMessage` | 0          | **40**                        |
| Total LOC in test files                            | 45,456     | 44,312 (−1,144)               |
| Test file count                                    | 211        | 208 (3 schema-sibling merges) |
| Full `bun run test` wall-clock (serial)            | 16.3 s     | ~18 s (noise-bound)           |
| Test count                                         | 2,405      | 2,405 (1 skipped both sides)  |

**Second pass (parallel sub-agent sweep)**

After the first pass I spawned six focused sub-agents in parallel, each
constrained to a non-overlapping scope, and they delivered the bulk of the
remaining migrations:

- `products/landmark/test/fixtures.js` created; 11 test files refactored to
  import `PEOPLE`/`TEAM`/`SNAPSHOTS`/`SCORES`/`EVIDENCE_ROWS`/`COMMENTS`/
  `PATTERNS`/`MAP_DATA` from the shared module.
- `products/summit/test/fixtures.js` created with `loadStarterData()` using
  `memoizeAsync` to cache the starter YAML load across the 9 summit test files
  plus shared `FIXTURE_ROSTER` and `snapshot(roster, data, teamId)` helpers.
  Per-test framework re-parse dropped from ~20–27 ms to ~1–3 ms.
- `products/map/test/fixtures.js` created with shared `DATA`, `PIPELINE_DATA`,
  `PEOPLE_VALID`, `PEOPLE_UNKNOWN_LEVEL`, `makeEvidenceRow`, `makeArtifact`.
  Activity tests migrated to `createMockSupabaseClient`; `exporter`, `pipeline`,
  `validate-people`, `transform-github` migrated.
- `libraries/libskill/test/derivation-fixtures.js` rewritten as thin wrappers
  around libharness pathway atoms (315 → 266 LOC); `job.test.js` inline fixtures
  deleted (161 → 49 LOC).
- `tests/model-fixtures.js` rewritten to compose from libharness atoms (176 →
  114 LOC).
- Mechanical `assertThrowsMessage`/`assertRejectsMessage` sweep across libcli,
  libconfig, libdoc, libgraph, libindex, libmcp, librc, librepl, librpc,
  libsyntheticgen, libsyntheticrender, libtelemetry, libvector, and
  `services/pathway` (~77 call sites converted, devDeps added to 14 packages).

### Wall-clock is dominated by Node per-file fork overhead

On this 16-core machine, 211 test files × ~90 ms of Node boot per file = ~19 s
of pure startup, which matches the observed wall-clock. Measured:

- `--test-concurrency=0` (serial fork-per-file): 16–18 s
- default parallel: 18–19 s
- `--experimental-test-isolation=none` (everything in one process): 27 s
  single-threaded — module caching helps but async serialization hurts more
- `bun test`: 12 s — but `node:test`'s `mock.fn` throws `NotImplementedError`
  under bun ([bun#5090](https://github.com/oven-sh/bun/issues/5090)), and
  libharness relies heavily on `mock.fn`

So wall-clock speedups only come from reducing file count. This pass merged
three schema/messaging sibling pairs in libeval (saving ~280 ms) — a small
sample to validate that approach; a larger consolidation of the 23 libeval test
files and the 8 libtelemetry visualizer tests into 5–10 combined files would
reasonably save ~3 s. That's deferred pending a judgement call on whether
collapsed files hurt discoverability.

### Still open

- libprompt / libtemplate / libsyntheticprose tmpdir → `createMockFs` — blocked
  by source refactor: `PromptLoader`, `TemplateLoader`, and `ProseEngine`
  hardcode `readFileSync` from `node:fs` rather than accepting a fs dep.
- Remaining file consolidation (libeval supervisor-_, libtelemetry visualizer-_)
  — would move wall-clock, deferred on aesthetic grounds.
- `bun test` migration — blocked on a `mock.fn` shim in libharness that bridges
  to `bun:test`'s `mock`. Plausible but invasive.
- Coverage cuts remain unlikely to pay off: the original audit's candidates
  (`libutil.test.js`, `guide/test/cli.test.js`, `trace-query.test.js` +
  `trace-query-v1.1.test.js`) all turned out to cover distinct surfaces on
  closer inspection.
