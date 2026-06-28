# Plan 1370 — Deferred Teardown

Part 01 (foundations) shipped two **one-cycle backward-compatibility bridges**
so the ~53 existing call sites stay green while consumers migrate per-unit
(parts 02–06). This file is the durable record of that debt and the mechanical
forcing functions that keep its cleanup from being missed — read it before
closing the master `1370` row.

The cleanup ships as its own migration unit, **`1370/teardown`**, listed in
[plan-a.md § Migration Order](plan-a.md#migration-order-and-part-index). The
master `1370` row advances to `plan implemented` **only when `1370/teardown`
is implemented** (the `kata-release-merge` sub-row gate enforces this — it
counts every `1370/<unit>` row). Teardown is the last unit; it blocks on parts
02–06 because it can only delete a bridge once every consumer has migrated off
it.

## Bridge 1 — `Finder` legacy positional constructor

- **Where:** `libraries/libutil/src/finder.js` — the constructor accepts both
  the canonical `({ fs, fsSync, proc })` config and the legacy
  `(fs, logger, process)` positional form, and keeps `import nodeFsSync from
  "node:fs"` / `import nodeFsPromises from "node:fs/promises"` for the legacy
  path.
- **Forcing function (mechanical):** `finder.js` is grandfathered in
  [`scripts/check-ambient-deps.deny.yml`](../../scripts/check-ambient-deps.deny.yml)
  with `["import:fs"]`. The migration recipe forbids a library exiting
  migration with any file still on the deny-list, so removing finder.js from
  the deny-list — required to close libutil — fails CI until the `node:fs`
  imports (and therefore the legacy path) are gone.
- **Safe to remove when:** `rg "new Finder\([^{]" libraries/ products/
  services/` returns **zero** matches outside `libraries/libutil/test/`
  (every consumer now passes the config object). Spec Success Criterion 9 is
  this exact check.
- **Removal steps:** delete the `isRuntimeConfig` branch's legacy fallback and
  the two `node:fs` imports; collapse the constructor to `({ fs, fsSync, proc,
  logger })`; drop the `finder.js` entry from `check-ambient-deps.deny.yml`;
  update `finder.test.js` to drop the legacy-form cases.

## Bridge 2 — `createCli` zero-arg deprecated alias

- **Where:** `libraries/libcli/src/cli.js` — `createCli(definition, { runtime }
  = {})` falls back to the global `process` when no `runtime` is passed. libcli
  internals are allow-listed by `check-ambient-deps`, so this path has **no**
  CI forcing function of its own — this document is its tracker.
- **Forcing function (manual, runnable):** the `1370/teardown` unit verifies
  `rg "createCli\(" libraries/ products/ services/ | grep -v runtime | grep -v
  /test/` returns **zero** before deleting the fallback. Until then, each
  per-unit migration PR (parts 02–06) converts its own `createCli(def)` call
  sites to `createCli(def, { runtime })` as part of wiring the runtime bag.
- **Safe to remove when:** every dispatched-CLI bin passes `{ runtime }`.
- **Removal steps:** change the signature to require `runtime`
  (`createCli(definition, { runtime })`), delete the `runtime ? … : process`
  ternary, and drop the "deprecated alias" note from the JSDoc.

## Bridge 3 — per-unit runtime default fallbacks (parts 03+)

Each migrated constructor/factory accepts an optional `runtime` (or a single
collaborator) and falls back to a freshly-built default when a caller has not
yet been updated to inject one. These exist **only** for not-yet-migrated
callers; once every caller injects `runtime`, the fallback is dead code.

- **Full-bag fallback** — a `?? createDefaultRuntime()` coalesce **or** a
  `runtime = createDefaultRuntime()` default parameter (both are the same
  bridge; parts 03+ favour the default-parameter form, matching the
  `libstorage` reference idiom):
  - parts 01–03: `librpc/src/server.js` (`Server`),
    `libeval/src/benchmark/workdir.js` (`WorkdirManager.start`),
    `librc/src/index.js` (`waitForSocket`), `libconfig/src/bootstrap.js`
    (`bootstrapProject`), `libcodegen/src/base.js` (`CodegenBase`),
    `libcoaligned/src/{jtbd,instructions}.js`,
    `libterrain/src/{pipeline,sinks}.js`.
  - part 04, default-parameter form (`runtime = createDefaultRuntime()`):
    `libindex/src/buffered.js` (`BufferedIndex`, 4th `{ runtime }` arg),
    `libmacos/src/posix-spawn.js` (`readOutput`, `spawn`, `waitForExit`),
    `libprompt/src/loader.js` (`PromptLoader`), `libtemplate/src/loader.js`
    (`TemplateLoader`), `libsecret/src/index.js` (the env-file + Supabase-JWT
    helpers that read the clock — `readEnvFile`, `getOrGenerateSecret`,
    `updateEnvFile`, `mintSupabaseJwt`, `mintSupabaseAnonKey`,
    `mintSupabaseServiceRoleKey`, plus the internal `mintSupabaseRoleKey` helper
    the latter two delegate to; the pure-crypto helpers `generateJWT` /
    `generateHash` / `generateSecret` take no `runtime`),
    `libsyntheticgen/src/engine/{activity,activity-initiatives}.js`,
    `libsyntheticprose/src/engine/{generator,cache,pathway}.js`,
    `libsyntheticrender/src/render/{dataset-renderers,markdown,link-assigner}.js`.
  - part 04, coalesce form (`runtime ?? createDefaultRuntime()`):
    `libpack/src/{builder,stager,disc-emitter,git-emitter,tar-emitter}.js`.
- **Clock-only fallback** — `?? createDefaultClock()` **or** a
  `clock = createDefaultClock()` default parameter —
  `libtelemetry/src/{span,logger}.js`;
  `libbridge/src/{callback-registry,callback-handler,callback-payload,dispatcher,rate-limit,elapsed-scheduler,inbox-handler,resume-scheduler}.js`
  (libbridge consumes only the clock surface, so it injects `clock` directly
  rather than the full bag — a faithful narrow projection of `runtime.clock`;
  teardown makes `clock` a required parameter and drops the default).
- **`globalThis.*` clock/proc fallbacks** —
  `libeval/src/inbox-poller.js` (`globalThis.setTimeout`/`clearTimeout`),
  `libeval/src/redaction.js` `defaultProc()` (`globalThis.process?.env` /
  `?.stderr`).
- **Bare `?? process` (exit only)** — `libdoc/src/server.js`
  (`#proc = opts?.runtime?.proc ?? process`; SIGINT registration intentionally
  stays on the global `process` and is **not** part of this bridge — signals
  are not a `runtime.proc` surface).
- **Lazy `getDefaultRuntime()` singleton** — `librc/src/manager.js` (memoizes a
  default runtime so importing the module is side-effect-free in tests).
- **Forcing function (manual, runnable):** none of these are caught by
  `check-ambient-deps` (a `createDefaultRuntime()`/`createDefaultClock()` call,
  a bare `process` identifier, and `globalThis.*` are all unflagged), so this
  document is their tracker. The `1370/teardown` unit runs the greps in the
  checklist below and confirms every remaining hit is dead before deleting.
- **Safe to remove when:** every construction site across `libraries/`,
  `products/`, and `services/` injects a `runtime`.
- **Removal steps:** make `runtime` (or the specific collaborator) a required
  parameter on each constructor/factory, delete the `?? createDefault*` /
  `?? globalThis.*` / `?? process` fallback and the `getDefaultRuntime`
  singleton, and update the few non-injecting tests to pass
  `createTestRuntime()`.

## Bridge 4 — legacy call-shape adapters (one-cycle deprecation aliases)

Some factories accept the **pre-1370 argument shape** (a bare `process`-like
object, or a positional `proc`) and adapt it onto a runtime internally, so
callers that passed the old shape keep working for one cycle.

- `libconfig/src/config.js` — `resolveRuntime(runtimeOrProcess)` maps a bare
  `{ env, cwd }` process onto a runtime bag.
- `libstorage/src/index.js` — `_procFromLegacy(proc)` + the `createStorage`
  third-arg branch that detects a legacy `process`-shaped object.
- `libtelemetry/src/logger.js` — `Logger(domain, proc = global.process,
  runtime = null)` keeps the legacy positional `proc` parameter; `createLogger`
  passes `global.process` through it.
- `librc/src/manager.js` — `deps.fs` (legacy) precedence over `runtime.fsSync`.
- **Forcing function (manual, runnable):** tracked by this document plus the
  checklist greps (`resolveRuntime`, `_procFromLegacy`, the `Logger` positional
  `proc`). Each per-unit follow-up converts its callers to the runtime shape.
- **Safe to remove when:** no caller passes the legacy shape (every caller
  passes `{ runtime }` or a constructed runtime).
- **Removal steps:** drop the legacy branch in each adapter, collapse the
  signature to the runtime-only form, and update tests/docs that used the old
  shape (e.g. `libconfig`/`librc` programmatic-usage docs).

## Residual global reads that are NOT backward-compat (foundation surface gaps)

**Corrected 2026-06-01 (post-merge audit + [plan-a-07.md](plan-a-07.md)).**
An earlier revision of this section listed libeval, libsupervise, and a
`librc logs()` pair as grandfathered gaps awaiting "a future runtime
surface-extension spec." That description did **not** match what shipped:
most of the surface those items needed was added, backward-compatibly,
during the migration waves, and the rest is closed by part-07. The honest
current state:

- **Closed during the waves.** `runtime.fs` gained `createReadStream` /
  `createWriteStream`; `runtime.fsSync` is the full `node:fs` module (so it
  too exposes `createReadStream`); `runtime.proc` gained `kill(pid, signal)`
  (negative pid = group), `pid`, `platform`, and `on(event, handler)`;
  `runtime.subprocess.spawn` gained `detached`, `pid`, and writable `stdin`.
  With those, **libeval** migrated fully (no `node:fs` imports;
  `createWriteStream` via `runtime.fs`; **off** the deny-list) and
  **libsupervise** migrated fully (`this.#proc.kill(-pid, …)` group teardown,
  `detached: true` spawns, and `logProcess.stdin` piping all route through
  injected collaborators). Neither is deferred; neither is on the deny-list.
- **To be closed by [plan-a-07.md](plan-a-07.md) (approved, pending
  implementation).** The one genuine remaining surface gap **is**
  `librc/src/manager.js` `logs()`: it pipes a read stream into
  `runtime.proc.stdout`, which is still a `{ write }` shim rather than a
  pipeline-grade `Writable`, so `manager.js` still carries the
  `deps.fs ?? runtime.fsSync` and `deps.stdout ?? process.stdout` fallbacks on
  `main`. Part-07 **will** make `proc.stdout`/`stderr` pipeline-grade
  `Writable`s and migrate `logs()` onto `runtime.fsSync.createReadStream` +
  `runtime.proc.stdout`.
- **Genuinely remaining (DI-clean, not a fallback).** `librc` still injects
  `deps.spawn` / `deps.execSync` (from the bin) to launch the `fit-svscan`
  daemon, because that spawn needs `detached` **plus** fd-redirect-to-logfile
  stdio (`stdio: [..., fd, fd]`), which `runtime.subprocess.spawn` does not
  yet express. This is dependency-injected (the bin supplies it; src reads no
  ambient `process`/`child_process`), so it is **not** a backward-compat
  fallback — it is a deliberate injected seam. Unifying it onto
  `runtime.subprocess` (an fd-redirect `stdio` option) is the only surface
  extension still open; it is small, and no separate spec is required unless a
  second consumer needs the same shape.
- **Already-closed notes:** `Config.ghToken()` uses
  `runtime.subprocess.runSync` — a foundation seam added during the wave.

## Retained composition-root defaults (DX-first decision)

The teardown removes every backward-compat **bridge** and forces consumers to
inject. It deliberately **retains** `createDefaultRuntime()` at a small set of
**composition-root factories** — the DI roots where building the production
runtime is the factory's job, not a fallback a consumer failed to supply.
These are not BC bridges (no legacy call shape, no per-consumer fallback);
they are the single place a root constructs the runtime. Retaining them keeps
the external/idiomatic call sites clean (the alternative threads a runtime
through dozens of `createServiceConfig("x")` / `createStorage("y")` call sites):

- `libstorage/src/index.js` — `createStorage(prefix, type, runtime?)` builds a
  default runtime when `runtime` is absent. The legacy bare-process branch
  (`_procFromLegacy`) **is** removed.
- `libconfig/src/{config.js,index.js}` — `Config` / `createServiceConfig` etc.
  build a default runtime when no `{ runtime }` is passed. The legacy
  bare-process `resolveRuntime` branch **is** removed (and the helper inlined).
- `librpc/src/index.js` — `createTracer(name)` builds the clock for the Tracer
  (and thence every Span).

`librpc/src/server.js` — `Server` was **fully injected** rather than retained:
its trailing positional params (`logger`, `tracer`, `observerFn`, `grpcFn`,
`authFn`, `runtime`) were collapsed into a single options bag
(`new Server(service, config, { logger, tracer, runtime, … })`), making
`runtime` required and dropping the `createDefaultRuntime()` default. Every
service `server.js` and the librpc tests inject a runtime through the bag.

Service `server.js` entry points and library `bin/` entry points are likewise
roots: they call `createDefaultRuntime()` once and thread the bag onward. The
checklist greps below therefore still match these root sites — that is expected
and correct; the spec's "remaining hits are the live root, not a fallback."

## Checklist for the `1370/teardown` PR

- [x] `rg "new Finder\([^{]" libraries/ products/ services/` → 0 outside
      `libraries/libutil/` (Bridge 1). *(One comment reference remains in
      `libwiki/src/util/wiki-dir.js`; no live call.)*
- [x] `rg "createCli\(" libraries/ products/ services/ | grep -v runtime |
      grep -v /test/` → 0 (Bridge 2).
- [x] `rg "(\?\?|=) *createDefaultRuntime\(\)|(\?\?|=) *createDefaultClock\(\)"
      libraries/ products/ services/ -g '!**/libutil/src/runtime.js'` → the
      only remaining hits are the retained composition-root defaults above
      (libstorage `createStorage`, librpc `createTracer`) plus bin/`server.js`
      roots; every per-consumer fallback is removed (Bridge 3).
- [x] `rg "\?\? process\b|globalThis\.(process|setTimeout|clearTimeout)|getDefaultRuntime" libraries/ products/ services/`
      → only the foundation-gap residue `librc/manager.js`
      `deps.stdout ?? process.stdout` remains (NOT-BC) on `main`;
      **scheduled for removal in [plan-a-07.md](plan-a-07.md)** (approved,
      pending) once `runtime.proc.stdout` becomes pipeline-grade.
- [x] `rg "resolveRuntime|_procFromLegacy" libraries/` → 0; the `Logger`
      positional `proc` parameter removed (Bridge 4).
- [x] `finder.js` removed from `check-ambient-deps.deny.yml`; `bun run
      invariants` green.
- [x] All four bridges' code paths deleted; the NOT-BC residue explicitly
      retained with the tracking reference above; `bun run test` green.
- [x] STATUS `1370/teardown` → `plan implemented`. **Note (2026-06-01):** the
      master `1370` row advanced to `plan implemented` after teardown, but a
      post-merge audit reopened it — see [plan-a-07.md](plan-a-07.md). Master
      `1370` re-advances to `plan implemented` only once
      `1370/part-07-reconciliation` is also implemented.
