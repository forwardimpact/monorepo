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
    `mintSupabaseServiceRoleKey`, plus the internal `mintSupabaseRoleKey`
    helper the latter two delegate to; the pure-crypto helpers `generateJWT`
    / `generateHash` / `generateSecret` take no `runtime`),
    `libsyntheticgen/src/engine/{activity,activity-initiatives}.js`,
    `libsyntheticprose/src/engine/{generator,cache,pathway}.js`,
    `libsyntheticrender/src/render/{dataset-renderers,markdown,link-assigner}.js`.
  - part 04, coalesce form (`runtime ?? createDefaultRuntime()`):
    `libpack/src/{builder,stager,disc-emitter,git-emitter,tar-emitter}.js`.
- **Clock-only fallback** — `?? createDefaultClock()` **or** a `clock =
  createDefaultClock()` default parameter —
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
  singleton, and update the few non-injecting tests to pass `createTestRuntime()`.

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

These are **not** BC bridges and teardown does **not** remove them — they exist
because the ratified `runtime` surface does not (yet) express the capability.
Closing them needs a **foundation follow-up** that extends the runtime contract
(a separate spec/design amendment), not the `1370/teardown` unit. They are
listed here so "no fallbacks left after teardown" has an explicit, honest
exception set:

- **`librc/src/manager.js` `logs()` — streaming read piped to a `Writable`
  stdout.** `logs()` does `pipeline(fs.createReadStream(logPath), this.#stdout)`.
  Two surface gaps keep it grandfathered together (they are co-required — fixing
  one without the other does not migrate `logs()`):
  - `fs.createReadStream` is not on the `fsSync`/`fs` surface, so `librc` keeps
    its legacy `deps.fs` for the read stream.
  - `runtime.proc.stdout` is a `{ write }` shim, not a pipeline-grade
    `Writable`, so `librc` keeps `deps.stdout ?? process.stdout` for the sink.

  **Resolved this wave:** `runtime.proc` now exposes `kill(pid, signal)`
  (negative pid = group), so `librc`'s liveness probe and env reads route
  through `runtime.proc` and the `deps.process` fallback was deleted. Only the
  `logs()` streaming pair above remains.
- **`libsupervise` detached, process-group spawning** (`spawn(...,
  { detached: true })` + `process.kill(-pid, ...)`) and **log stdin piping** —
  `runtime.subprocess` exposes no detached option, no child **pid** (needed for
  `proc.kill(-pid, ...)` group-kill), and no writable child stdin. This is why
  libsupervise was deferred this wave. (`proc.kill` now exists, but the spawn
  surface must also return the pid and accept `detached` before the group-kill
  can route through it.)
- **`libeval` streaming-fs / `node:net` / fd-passing files**
  (`benchmark/{runner,workdir,task-family,scorer,judge,report,*-installer}.js`,
  `commands/{tee,run,supervise,discuss,facilitate}.js`, `trace-github.js`,
  `profile-prompt.js`) — kept grandfathered in `check-ambient-deps.deny.yml`;
  they need `createReadStream`/`createWriteStream`, `node:net`, and fd-3
  passing, none of which the runtime surface covers.
- **Already-closed notes:** `Config.ghToken()` uses
  `runtime.subprocess.runSync`, and `runtime.proc.kill` is now in the contract
  — both were foundation seams added during the wave, so neither appears above.

A future "runtime surface extension" spec should add: a writable
`proc.stdout` stream, streaming `fs.createReadStream`/`createWriteStream`, and
`subprocess.spawn` detached + pid + writable-stdin (which, combined with the
now-shipped `proc.kill`, closes the libsupervise group-kill). When it lands,
the items above migrate and this section shrinks to empty.

## Checklist for the `1370/teardown` PR

- [ ] `rg "new Finder\([^{]" libraries/ products/ services/` → 0 outside
      `libraries/libutil/` (Bridge 1).
- [ ] `rg "createCli\(" libraries/ products/ services/ | grep -v runtime |
      grep -v /test/` → 0 (Bridge 2).
- [ ] `rg "(\?\?|=) *createDefaultRuntime\(\)|(\?\?|=) *createDefaultClock\(\)"
      libraries/ products/ services/ -g '!**/libutil/src/runtime.js'` → every
      hit dead (Bridge 3; the `=` alternative catches the `runtime =
      createDefaultRuntime()` / `clock = createDefaultClock()`
      default-parameter form that parts 03+ use, which the old `??`-only grep
      missed. The excluded `libutil/src/runtime.js` is the factory itself —
      its internal `createDefaultClock()` build step is permanent, not a
      consumer fallback).
- [ ] `rg "\?\? process\b|globalThis\.(process|setTimeout|clearTimeout)|getDefaultRuntime"
      libraries/ products/ services/` → only the foundation-gap residue in
      `librc/manager.js` remains (Bridge 3 + the NOT-BC section).
- [ ] `rg "resolveRuntime|_procFromLegacy" libraries/` → 0; the `Logger`
      positional `proc` parameter removed (Bridge 4).
- [ ] `finder.js` removed from `check-ambient-deps.deny.yml`; `bun run
      invariants` green.
- [ ] All four bridges' code paths deleted; the NOT-BC residue either migrated
      (if the runtime-surface-extension spec has landed) or explicitly retained
      with a tracking reference; `bun run test` green.
- [ ] STATUS `1370/teardown` → `plan implemented`; master `1370` → `plan
      implemented` once every sub-row reads `plan implemented`.
