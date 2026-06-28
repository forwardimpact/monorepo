# Plan 1370 — Part 07: Gap Closure and Accounting Reconciliation

Post-implementation remediation unit. Parts 01–06 + teardown shipped the
charter, but a post-merge audit surfaced four open items the master `1370`
row papered over when it advanced to `plan implemented`. This part closes
them and makes the spec's own artifacts match what shipped. It is the new
**last** unit; the master `1370` row re-advances to `plan implemented` only
when `1370/part-07-reconciliation` does (the `kata-release-merge` sub-row
gate counts it like every other `1370/<unit>` row).

The four items, and how this part disposes of each (dispositions chosen by
the spec owner, 2026-06-01):

| Gap | Disposition | Steps |
|---|---|---|
| **SC9 (+ the general DI pattern)** — `new Finder(` exists outside libutil (2 bins, 1 service entry, 1 pre-runtime bin, 2 test helpers) and the teardown checklist quietly narrowed the check to `new Finder\([^{]` to pass; the same anti-pattern (constructing a collaborator instead of receiving it from the `runtime` bag) also appears as `createDefaultProc().env` in `librpc/src/base.js` | Route every production site through the injected runtime (Finder + the librpc proc read), then enforce the **general** rule — no direct construction of a leaf collaborator (`new Finder`, `createDefaultProc/Clock/Subprocess`) outside libutil — with a real invariant | 1, 2 |
| **librc `logs()`** — the sole genuine runtime-surface gap left (`runtime.proc.stdout` is a `{ write }` shim, not a pipeline-grade `Writable`; `manager.js` keeps `deps.stdout ?? process.stdout` + a `deps.fs` override) | Extend `runtime.proc.stdout`/`stderr` to pipeline-grade `Writable`s and migrate `logs()` onto the runtime | 3 |
| **SC6** — the M1/M2/M3 wall-time milestones were never met (`38.5 s` recorded at part-06 in `wiki/staff-engineer-2026-W22.md` vs the `25 s` M3 target; a post-merge audit re-ran the suite at `4144` tests / ~55 s on a 4-core container) yet the master row advanced anyway | Retire the absolute wall-time milestones with a grounded outcome note (retroactive `spec.md` edit, carried in this PR); verify nothing in plan/CI/docs still asserts a 25 s gate | 4 |
| **Accounting** — `teardown.md` describes libeval/libsupervise as deferred/grandfathered when both fully migrated, and names a "future runtime-surface-extension spec" for capabilities that already shipped | Correct the durable ledger and other artifacts (retroactive edits, carried in this PR); reconcile STATUS | 4, 5 |

This part follows the [§ Migration Recipe](plan-a.md#migration-recipe)
except Step 2 (golden capture) — it touches no CLI argv/stdout contract (the
collaborator-construction edits are internal). The `logs()` change is
covered by a new behavioural test, not by the `fit-rc` golden — that golden
captures only `help` and `no-command`, so it never exercises `logs`; the
golden replay in Step 3 only confirms those two cases stay byte-identical.

## Approach

Three small code changes plus a documentation reconciliation. The
collaborator collapse leans on the fact that
`findData`/`findUpward`/`findProjectRoot` never read the logger (only
`createSymlink`/`createPackageSymlinks` do, via `finder.js:163`), so the
sites that only resolve paths lose nothing by switching to bare
`runtime.finder`; the one site that logs (codegen's symlink creation) gets a
`Finder.withLogger(logger)` seam — which also grounds the [design's
per-call-logger claim](design-a.md#components) to a mechanism that actually
exists. The librc change implements the exact `proc.stdout` surface extension
the [teardown ledger](teardown.md) named as required. No
backward-compat shim: every `new Finder(` and the `logs()` `deps.fs` /
`deps.stdout` fallbacks are deleted, not wrapped ([§ Clean
breaks](../../CONTRIBUTING.md#read-do)). librc's `deps.spawn` / `deps.execSync`
are **not** touched — they are a deliberate DI seam for the svscan fd-redirect
spawn (see [teardown.md § Residual](teardown.md), not a `logs()` fallback).

## Steps

### Step 1 — Collapse every direct collaborator construction to the injected runtime

The anti-pattern is broader than Finder: a consumer that invokes any of
libutil's leaf collaborator constructors (`new Finder`, `createDefaultProc`,
`createDefaultClock`, `createDefaultSubprocess`) hand-rolls a collaborator it
should destructure off the `runtime` bag. This step fixes the **production**
instances — the six `new Finder(` sites plus librpc's `createDefaultProc()`
read — and adds the logger seam the one logging Finder site needs.
(`createDefaultRuntime()` is the sanctioned composition-root factory and is
left in place at its 116 root call sites.)

- **Modified:**
  - `libraries/libutil/src/finder.js` — add `withLogger(logger)` returning a
    Finder over the same collaborators with the given logger. Because the
    constructor derives `#existsSync` from `fsSync ?? fs`, the method cannot
    just copy private fields onto a bare object — store the raw `fs`/`fsSync`
    on the instance and rebuild via `new Finder({ fs, fsSync, proc, logger })`
    (identical existence binding, swapped logger).
  - `services/pathway/server.js:30` — delete
    `new Finder({ ...runtime, logger })`; call
    `runtime.finder.findData("data", homedir())` directly (findData does not
    log, so `logger` was dead).
  - `libraries/libstorage/bin/fit-storage.js:108` — delete `new Finder(...)`;
    use `runtime.finder.findUpward(process.cwd(), "data")` (findUpward does
    not log).
  - `libraries/libcodegen/bin/fit-codegen.js:379` — there is a **single**
    `new Finder({ …, logger })` here, constructed in `main()` and threaded
    into `runCodegen` where it serves both `findProjectRoot` (`:385`) and
    `createPackageSymlinks` (`:367`). Because that one instance is the only
    logger consumer in the file, replace it with
    `runtime.finder.withLogger(logger)` (not bare `runtime.finder`, or the
    symlink debug logs go silent).
  - `libraries/libeval/bin/fit-selfedit.js:75` — construct
    `createDefaultRuntime()` at the top of the security pre-check and use
    `runtime.finder.findUpward(dirname(absoluteTarget), ".claude/settings.json", 20)`
    (no ordering constraint forces the lookup before runtime construction).
  - `libraries/libxmr/test/helpers.js:58`,
    `libraries/libwiki/test/helpers.js:52` — replace `new Finder(...)` with a
    finder obtained from a factory: `createDefaultRuntime().finder` when the
    helper needs real-fs traversal of fixtures, else
    `createTestRuntime().finder` from libmock.
  - `libraries/librpc/src/base.js:34-35` — `createAuth(serviceName)` reads
    `createDefaultProc().env.SERVICE_SECRET`, hand-rolling a throwaway `proc`
    (the "no ambient-dep smell" comment notwithstanding — it *is* the DI bypass,
    laundered through the factory). Thread the runtime in:
    `createAuth(serviceName, runtime)` reading
    `runtime.proc.env.SERVICE_SECRET`; update its call site (the `Server`/base
    wiring already carries a `runtime` in its options bag per
    [teardown.md](teardown.md)), and delete the `createDefaultProc` import.
  - `libraries/libwiki/src/util/wiki-dir.js:6` — the comment is accurate
    ("SC9 keeps Finder construction inside libutil") but contains the literal
    token `new Finder(`, which the SC9 verify grep (and a reader) trips over;
    reword it to drop the literal call form so the literal-grep verification
    is unambiguous.
- **Verify:** `rg "new Finder\(" libraries/ products/ services/` returns matches
  only under `libraries/libutil/` (spec Success Criterion 9, literal form);
  `rg "createDefaultProc\(" libraries/ products/ services/ -g '!**/libutil/**'`
  returns matches only in `test/` files; `bun run test` green for
  libcodegen/libstorage/libwiki/libxmr/librpc, products/pathway,
  services/pathway.

### Step 2 — Enforce "no direct collaborator construction" as an invariant

Make the broader DI pattern (not just SC9) mechanically verifiable so it
cannot regress. The check is deliberately **separate** from
`check-ambient-deps.mjs`: that checker scans `src/` only and skips `bin/`,
`test/`, and package-root entry files (they are *allowed* ambient deps),
whereas every collaborator-construction violation lives in exactly those
excluded locations — and the rule is a hard no-grandfathering rule, not the
ambient-deps monotone deny-list model. Reimplementing the small AST walk here
keeps the two checks' opposing scopes and policies cleanly decoupled.

- **Created:**
  - `scripts/check-collaborator-construction.mjs` — its own acorn parse + AST
    walk over `*.js` under `libraries/`, `products/`, `services/`
    (recursively: `src/`, `bin/`, `test/`, and package-root files; skips
    `node_modules`/`dist`/`generated`/`tmp`). Flags the four leaf
    collaborator constructors outside `libraries/libutil/`:
    - `new Finder(...)` (`NewExpression`, callee `Finder`),
    - `createDefaultProc(...)`, `createDefaultClock(...)`,
      `createDefaultSubprocess(...)` (`CallExpression`, callee an `Identifier`
      of that name).

  `createDefaultRuntime(...)` is **not** flagged (sanctioned
  composition-root factory). **Prod-strict / test-lenient policy:** for a
  file under a `test/` directory, only `new Finder(` is flagged (SC9 wants
  Finder gone everywhere); `createDefaultProc/Clock/Subprocess` are permitted
  in tests (a test may wire a real collaborator deliberately). For all other
  files (`src/`, `bin/`, package roots) all four are flagged. No allow-list:
  the tree is clean after Step 1, so any future hit is a real regression.
  - `scripts/check-collaborator-construction.test.mjs` — fixtures: `new Finder(`
    in a non-libutil src path is flagged; the same under `libutil/` is not;
    `createDefaultClock()` in a `*.test.js` path is **not** flagged but in a
    `src` path **is**; `createDefaultRuntime()` is never flagged.
- **Modified:**
  - `package.json` — two edits so the check runs under `bun run invariants`,
    matching the existing pattern: (1) add a sub-script
    `"invariants:check-collaborator-construction": "node scripts/check-collaborator-construction.mjs"`
    (the `.mjs` checks use the `node` runner, like
    `invariants:check-ambient-deps`); (2) append
    `&& bun run invariants:check-collaborator-construction` to the end of the
    `"invariants"` aggregate `&&`-chain. Without edit (2) the check exists but
    never runs in CI.
  - `MONOREPO.md` § Enforcement — describe the check (the pattern: receive
    collaborators from the `runtime` bag, never construct them outside
    libutil) and update the closing sentence "All three run under `bun run
    invariants`" (`MONOREPO.md:231`) to "All four".
- **Verify:** `bun run invariants` exits 0 on the tree; the regression test
  passes; a `new Finder(` or a `createDefaultClock()` added under `src/`
  outside libutil fails CI, while the same `createDefaultClock()` under
  `test/` does not.

### Step 3 — Make `runtime.proc.stdout`/`stderr` pipeline-grade and migrate `librc logs()`

Implement the writable-stdout surface extension the teardown ledger named,
then drop librc's two foundation-gap fallbacks.

- **Modified:**
  - `libraries/libutil/src/runtime.js` — in `createDefaultProc`, replace the
    `{ write }` shims with `Writable`s that forward chunks to
    `source.stdout`/`source.stderr` (a `new Writable({ write(c,e,cb){
    source.stdout.write(c); cb(); } })` wrapper — pipeline-grade as a sink,
    `.write(str)` still works, `.end()` does not close the real stream).
    Update the `proc` typedef: `stdout`/`stderr` are pipeline-grade
    `Writable`s. Import `Writable` from `node:stream` (libutil/src/runtime.js
    is the allow-listed default-collaborator factory).
  - `libraries/libmock/src/mock/infra.js` (createMockProcess — note: it lives
    in `infra.js`, not a `process.js`) — make the `stdout`/`stderr` recorders
    `Writable` subclasses that retain the existing capture accessor (so current
    assertions keep working) and accept piped input.
  - `libraries/libmock/src/mock/fs.js` (createMockFs) — `createReadStream`
    **already exists** (`:274`, returns a `Readable` over stored content) and
    so does `createWriteStream` (`:288`); no addition needed. Confirm the
    existing `createReadStream` yields the configured content for the `logs()`
    test; extend only if a gap surfaces.
  - `libraries/librc/src/manager.js` — delete
    `this.#fs = deps.fs ?? runtime.fsSync` (use
    `runtime.fsSync.createReadStream`, which the sync surface already exposes —
    `runtime.fsSync` is the full `node:fs` module, so the old comment claiming
    it lacks `createReadStream` was always inaccurate); delete
    `this.#stdout = deps.stdout ?? process.stdout` (use `runtime.proc.stdout`);
    drop `fs`/`stdout` from the `Dependencies` typedef and the foundation-gap
    comments at `:62-78`, `:110-112`, `:129-132`. Leave `deps.spawn` /
    `deps.execSync` untouched.
  - `libraries/librc/test/{manager-logs,manager-start,manager-stop}.test.js` —
    all three currently pass an `fs` override through `deps`; once `deps.fs` is
    gone, route their sync-fs through `createTestRuntime({ fsSync })` instead.
    The `logs()` test additionally asserts captured `proc.stdout` from the mock
    `Writable`.
- **Verify:**
  `rg "deps\.fs|deps\.stdout|process\.stdout" libraries/librc/src/manager.js`
  returns zero; `logs()` test runs in-process with no real `process.stdout`;
  `bun run scripts/capture-cli-golden.mjs --verify fit-rc` exits 0;
  `bun run test` green across all `runtime.proc.stdout` consumers (full suite —
  the proc surface is monorepo-wide).

### Step 4 — Land the retroactive artifact corrections and verify no stale references

The artifact edits (SC6 retirement, SC9 reframe, teardown de-staling,
design grounding, plan index) ship in this PR's non-code commits. This step
verifies they are internally consistent and that no machine-checked surface
still asserts a retired gate.

- **Modified (carried in this PR):** `spec.md` (SC6, SC9, Risks, § Outcome),
  `design-a.md` (Finder logger seam; surface-extensions-shipped note; retire the
  `M1/M2/M3` Out-of-Scope line and the per-call-logger Out-of-Scope line),
  `teardown.md` (libeval/libsupervise corrected; residue shrunk to the
  plan-closed `logs()` item; svscan-spawn noted as DI-clean-but-not-unified),
  `plan-a.md` (Migration Order index + master-row re-advance note;
  **retire the § Performance milestone tracking M1/M2/M3 gate**; reconcile the
  `check-ambient-deps.deny.json` → `.deny.yml` filename),
  `plan-a-05-products.md` (the "M3 milestone gates …" line). All SC6-milestone
  language across the spec dir must read as **retired**, not live.
- **Verify:** searching the spec dir, `scripts/`, and `package.json` for a
  live `25 s` / `M3` wall-time gate surfaces only the retired-with-rationale
  prose in `spec.md`/`plan-a.md` (no CI assertion, no skill grep on the
  narrowed `new Finder` form); the teardown checklist greps all return their
  stated counts.

### Step 5 — STATUS reconciliation

Reflect the honest state: the spec has approved-but-unimplemented remediation
work again.

- **Modified:** `wiki/STATUS.md` — add
  `1370/part-07-reconciliation\tplan\tapproved`; set master `1370` back to
  `plan approved` (a sub-row is no longer implemented, so per the file header
  the master cannot read `implemented`). On this part's implementation, both
  rows advance to `plan implemented`.
- **Verify:** `wiki/STATUS.md` parses against `^\d{4}(/[a-z0-9-]+)?$`;
  `1370/teardown` stays `plan implemented`.

## Per-unit verification

| Check | Command | Pass condition |
|---|---|---|
| Finder singleton | `rg "new Finder\(" libraries/ products/ services/` | matches only under `libraries/libutil/` |
| Prod proc construction | `rg "createDefaultProc\(" libraries/ products/ services/ -g '!**/libutil/**'` | matches only in `test/` files |
| Invariants | `bun run invariants` | exit 0; `check-collaborator-construction` green (and fails on a planted `src/` violation) |
| librc residue | `rg "deps\.fs\|deps\.stdout\|process\.stdout" libraries/librc/src/manager.js` | zero matches |
| Golden replay | `bun run scripts/capture-cli-golden.mjs --verify fit-rc` | exit 0 (bytes match) |
| Full suite | `bun run test` | `0 fail`, `0 errors` (proc + collaborator changes are monorepo-wide) |

## Libraries used

Libraries used: libutil (Finder.withLogger, runtime proc Writable), libmock
(createMockProcess Writable, createMockFs createReadStream), librc
(ServiceManager.logs migration), librpc (createAuth runtime injection).

## Risks

- **`runtime.proc.stdout` widening is monorepo-wide.** Every consumer of
  `proc.stdout`/`stderr` now receives a `Writable` instead of a `{ write }`
  object. The change is backward-compatible (a `Writable` has `.write`), but
  a test asserting the exact shape of `proc.stdout`, or code reading
  `.write()`'s boolean return for backpressure, can shift. Mitigation: the
  Step 3 verification runs the full suite, not just librc.
- **Mock capture-accessor drift.** Making `createMockProcess` stdout a
  `Writable` must preserve whatever accessor existing tests read (`.calls`,
  `.written`, etc.). The implementer reads the current mock and keeps the
  accessor name; the runtime-completeness test does not cover capture shape,
  so a silent break would only surface in consumer tests — run them.
- **codegen symlink logger.** Whether `fit-codegen:367`'s finder consumes a
  live logger determines if `withLogger` is needed there or the site collapses
  to bare `runtime.finder`. The implementer confirms by reading the call site
  before choosing; getting it wrong silently drops symlink debug logs (not a
  test failure). Mitigation: grep `createSymlink`/`createPackageSymlinks`
  logger usage before editing.
- **librpc `createAuth` call-site threading.** Adding a `runtime` parameter to
  `createAuth(serviceName)` only works cleanly if every caller already has a
  runtime in scope. The teardown ledger says `Server` was fully injected with
  a runtime options bag, so the expected single caller is covered — but the
  implementer must confirm there is no other `createAuth(` caller (and no
  default-factory invocation) lacking a runtime before changing the signature.
  If one exists, thread the runtime to it rather than re-introducing
  `createDefaultProc()`.

## Execution

Single engineering-agent PR; steps are sequential within it (Step 2 depends
on Step 1; Step 4 verifies Steps 1–3 plus the carried doc edits). The
retroactive `spec.md`/`design-a.md`/`teardown.md`/`plan-a.md` edits are
authored by the planning session and carried into the same PR so the
artifacts and the code land together. No part of this unit runs in parallel
with another — it is the terminal 1370 unit.

— Plan author, spec 1370 part-07
