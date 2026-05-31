# Plan 1370 — Part 05-b: Remaining Products (follow-up)

> **Status:** follow-up to [plan-a-05-products.md](plan-a-05-products.md).
> Inherits the approved [plan-a.md](plan-a.md) Migration Recipe, the
> [design-a.md](design-a.md) collaborator contract, and every key decision
> already ratified. **No new architecture** — this doc only records what is
> done, what remains, the blocking order, and the lessons from the first
> products wave so a fresh session resumes without re-deriving them.

## Why this doc exists

Part 05 (products) decomposes into **one PR / one sub-row per product**
(six products). The first wave shipped the three **unblocked** products in
PR #1308 (squash commit `54a4c023` on `main`):

| Product | Sub-row | State |
|---|---|---|
| guide | `1370/products-guide` | ✅ `plan implemented` |
| summit | `1370/products-summit` | ✅ `plan implemented` |
| pathway | `1370/products-pathway` | ✅ `plan implemented` |

The remaining three products — **landmark, map, outpost** — were **blocked**
at the time of the first wave because their consumer libraries had not yet
migrated. They are fully specified in
[plan-a-05-products.md](plan-a-05-products.md); this doc carries them forward
plus the prerequisite libraries that unblock them.

## Background — the contract (for a cold reader)

Spec 1370 replaces ambient node-runtime dependencies (`node:fs`,
`node:child_process`, `Date.now()`/`new Date()`/`setTimeout`, `process.*`)
with a single injected `runtime` bag threaded from each binary's entry point:

```
runtime = { fs, fsSync, proc, clock, subprocess, finder }
```

- Production wires it from `createDefaultRuntime()`
  ([libraries/libutil/src/runtime.js](../../libraries/libutil/src/runtime.js));
  tests wire `createTestRuntime({ overrides })` plus `createMockFs` /
  `createMockClock` / `createMockProcess` / `createMockSubprocess` from
  **libmock**.
- `runtime.fs` is async (`readFile`, `writeFile`, `readdir`, `stat`, `mkdir`,
  `rm`, `access`, `copyFile`, `cp`, `mkdtemp`, …); `runtime.fsSync` is sync
  (`existsSync`, `readFileSync`, …). **One fs surface per module — never both.**
- `runtime.proc`: `cwd()`, `env`, `argv`, `stdout.write`, `stderr.write`,
  `exit(code)`, `exitCode`.
- `runtime.clock`: `now()`, `sleep(ms)`, `setTimeout`, `clearTimeout`.
- `runtime.subprocess`: `run(cmd,args,opts) → Promise<{stdout,stderr,exitCode}>`
  (**resolves, never rejects**; `exitCode` 127 on spawn failure), `runSync`,
  and `spawn(...)` (AsyncIterable streams + `kill(signal)` for long-running
  children).
- `runtime.finder`: a pre-built `Finder` (`findData`, `findUpward`,
  `findProjectRoot`).

The enforcement gate is `scripts/check-ambient-deps.mjs` (wired into
`bun run invariants`), reading a monotone deny-list
(`check-ambient-deps.deny.yml`, shrinks as units migrate) and an allow-list
(`check-ambient-deps.allow.yml`, exempt-forever entries). A sibling check,
`scripts/check-subprocess-in-tests.mjs`, flags `node`/own-bin spawns in
non-`*.integration.test.js` test files.

**Reference implementations:** read the three shipped products before
starting — `products/guide`, `products/summit`, `products/pathway` — and the
already-migrated dispatched CLI `libraries/libxmr` (handlers as
`(ctx) => …` reading `ctx.deps.runtime`).

## Blocking prerequisites (part-03, must land first)

These are **part-03** units ([plan-a-03-bin-libraries.md](plan-a-03-bin-libraries.md)),
not part-05 — but landmark/map/outpost cannot pass `kata-release-merge`'s
per-section blocking gate until they merge. They block only on foundations
(✅ on `main`), so they are ready to implement now.

| Library | Deny entries remaining | Unblocks |
|---|---|---|
| **libeval** | 17 | landmark, map |
| **libsupervise** | 5 | outpost |

libeval carries the `fit-eval` + `fit-benchmark` + `fit-trace` + `fit-selfedit`
bins; its `runner`/`workdir`/`task-family`/`judge`/`commands/*` route fs/os/
subprocess through the runtime and return `{ ok, value: { records, errors } }`
envelopes. libsupervise carries `fit-logger` + `fit-svscan` and is what the
outpost scheduler's streaming `runtime.subprocess.spawn` contract validates.

> Do these as their own PRs/sub-rows (`1370/libeval`, `1370/libsupervise`)
> first, or coordinate so the product PR carries the transitive wiring per
> [plan-a-05-products.md § Risks](plan-a-05-products.md). The clean path is
> libraries-first.

## The three remaining products

Each section below is **one PR / one sub-row**, executed per the shared
[Migration Recipe](plan-a.md#migration-recipe). File lists are the current
`check-ambient-deps.deny.yml` entries (the migration target — empty the
product's entries before the sub-row reaches `plan implemented`).

### landmark (`fit-landmark`) — `1370/products-landmark`

**Blocking:** 01 ✓ · 02 libwiki ✓ · **03 libeval ✗**.

Src (7 deny files): `commands/login.js`, `commands/logout.js`,
`commands/sources.js`, `lib/cli.js`, `lib/credentials.js`,
`lib/evidence-helpers.js`, `lib/identity.js` — plus `bin/fit-landmark.js`,
`src/formatters/*`, `src/lib/commands-manifest.js`, `src/index.js` as the
plan-a-05 section enumerates.

Notes: `fit-landmark` is multi-subcommand. Per design Decision 13 you may
either convert to `cli.dispatch(parsed, { deps: { runtime } })` **or** thread
`runtime` as an explicit handler param (the route guide/summit/pathway took —
lower golden risk). landmark consumes libwiki (✓) and may consume libeval
traces (the libeval blocker). Capture goldens.

### map (`fit-map`, `dispatch-substrate`) — `1370/products-map`

**Blocking:** 01 ✓ · **03 libeval ✗**.

Src (27 deny files): the whole `src/activity/` extract/transform/validate tree,
`commands/*` (activity, getdx, people*, substrate-*, init, auth-issue,
validate-shacl), `loader.js`, `exporter.js`, `index-generator.js`,
`schema-validation.js`, and `lib/*` (copy-activity, data-dir, persona-enricher,
pick-memory, supabase-cli) — plus the two bins `bin/fit-map.js` and
`bin/dispatch-substrate.js`.

Notes: **largest unit.** `fit-map` is dispatched; `dispatch-substrate` is
single-flow. The `activity/` tree's `spawnSync`/`execFileSync` ingest moves to
`runtime.subprocess`. Two bins → two goldens. `supabase-cli.js` shells out (the
`gh auth token`-style sync-accessor escape hatch `runtime.subprocess.runSync`
may apply). Watch the async-propagation cascade where `run` replaces sync spawns.

### outpost (`fit-outpost`) — `1370/products-outpost`

**Blocking:** 01 ✓ · **03 libsupervise ✗**.

Src (6 deny files): `scheduler.js`, `agent-runner.js`, `kb-manager.js`,
`socket-server.js`, `state-manager.js`, `outpost.js` — plus
`bin/fit-outpost.js`. Per the CLI inventory the dispatch table lives in
`src/outpost.js`, so both `bin/fit-outpost.js` **and** `src/outpost.js` migrate.

Notes: the scheduler's long-running bash watcher consumes
`runtime.subprocess.spawn` (the streaming AsyncIterable contract) — **preserve
cancellation**: `spawn(...).kill(signal)` must propagate to the child. Add an
integration test asserting kill propagation against a sleep-bound child
(`*.integration.test.js`). This is the unit that exercises the same surface
libsupervise validates.

## Lessons from the first wave (apply these — they were panel findings)

The PR #1308 5-reviewer `kata-review` panel surfaced consensus findings; bake
them in from the start to avoid a second round:

1. **No default-collaborator factory inside `src`.** Do not write
   `clock = deps.clock || createDefaultClock()` (or similar) in a `src`
   module — the bin is the **sole** construction site (design Decision 4).
   Make the collaborator a required injected arg; pass it from the bin.
2. **One fs surface per module.** Don't mix `runtime.fs.*` (async) and
   `runtime.fsSync.*` (sync) in the same module. Convert sync accessors to
   async (`await runtime.fs.readFile`, `await fs.access(...).then(…).catch(…)`
   for an existence check) unless the caller chain genuinely cannot go async.
3. **`runtime.subprocess.run` resolves, never rejects.** Drive fallbacks off
   `result.exitCode !== 0`, not `try/catch` (a `catch` around `run` is dead
   code — e.g. an `open`/`xdg-open` browser fallback).
4. **Tests: fakes or the `.integration` marker.** Pure-logic/output-capture
   tests inject `createTestRuntime` + a mock `proc` (assert on
   `runtime.proc.stdout.chunks`) — never patch global `process.stdout`. Tests
   that legitimately use real fs/subprocess get renamed `*.integration.test.js`.
   Add **one per-bin smoke `*.integration.test.js`** that spawns the bin
   (`--version`) — spec SC5.
5. **Goldens before/with the refactor.** Capture deterministic, network-free,
   data-free cases (`--help`, `--version` with `FIT_<NAME>_VERSION` env,
   no-args, unknown-command) via `scripts/capture-cli-golden.mjs`; leave the
   CLI `definition` object untouched so `--help` stays byte-identical; verify
   with `--verify`.
6. **Deterministic `new Date(<arg>)` parses** (parsing a fixed timestamp, not
   reading the clock) prefer `Date.parse(iso)` (returns ms, not flagged); if a
   `Date` object is unavoidable, allow-list that one file with an inline reason
   (precedent: `products/summit/src/git/history.js`). Browser/DOM UI modules
   (timers, element-id `Date.now()`) are allow-listed like libui — but a
   server-side scheduler's timer is **not** a UI false positive; inject
   `runtime.clock`.
7. **Declare new workspace deps.** If a test newly imports `@forwardimpact/libmock`
   (or any workspace pkg), add it to the product's `package.json`
   `devDependencies` or `check-workspace-imports` fails.

## Per-unit verification (every product PR)

```
node scripts/check-ambient-deps.mjs            # exit 0; no product src smells
node scripts/check-subprocess-in-tests.mjs     # exit 0
bun test products/<name>/test/                 # 0 fail, 0 errors
node scripts/capture-cli-golden.mjs --bin fit-<name> --exec products/<name>/bin/fit-<name>.js \
  --golden-dir products/<name>/test/golden/fit-<name> --verify   # exit 0
bun run invariants                             # all green
```

`bun run check` additionally runs a `wiki` audit that is currently red on a
**pre-existing** `wiki/staff-engineer.md` word-budget overage (unrelated to
1370). It is orthogonal to this work; do not treat it as a part-05-b blocker.

## Execution order & completion gate

```
libeval, libsupervise (part-03)        ← ready now (block only on foundations)
        │
        ├─ landmark, map  (need libeval)
        └─ outpost        (needs libsupervise)
services/* (part-06)                   ← ready now (librpc/libgraph/libvector done)
        │
teardown (plan-a teardown.md)          ← LAST: removes the one-cycle BC bridges
        │                                 (Finder legacy positional ctor +
        │                                 createCli zero-arg fallback)
master row 1370 → plan implemented     ← only when EVERY sub-row is implemented
```

`kata-release-merge`'s sub-row gate holds `teardown` until all other sub-rows
are `plan implemented`, and holds the master `1370` row until `teardown` is.

## Pointers

- Spec: [spec.md](spec.md) · Design: [design-a.md](design-a.md) · Recipe &
  part index: [plan-a.md](plan-a.md) · Products detail:
  [plan-a-05-products.md](plan-a-05-products.md) · Teardown:
  [teardown.md](teardown.md)
- Contract: `libraries/libutil/src/runtime.js`,
  `libraries/libmock/src/runtime.js` + `src/mock/*`
- Gates: `scripts/check-ambient-deps.mjs` (+ `.allow.yml` / `.deny.yml`),
  `scripts/check-subprocess-in-tests.mjs`, `scripts/capture-cli-golden.mjs`
- Shipped reference PR: #1308 (`54a4c023`) — diff of
  `products/{guide,summit,pathway}`

— Recorded after the first products wave (PR #1308) for a clean-session resume.
