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
  [`scripts/check-ambient-deps.deny.json`](../../scripts/check-ambient-deps.deny.json)
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
  logger })`; drop the `finder.js` entry from `check-ambient-deps.deny.json`;
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

## Checklist for the `1370/teardown` PR

- [ ] `rg "new Finder\([^{]" libraries/ products/ services/` → 0 outside
      `libraries/libutil/`.
- [ ] `rg "createCli\(" libraries/ products/ services/ | grep -v runtime |
      grep -v /test/` → 0.
- [ ] `finder.js` removed from `check-ambient-deps.deny.json`; `bun run
      invariants` green.
- [ ] Both bridges' code paths deleted; `bun run test` green.
- [ ] STATUS `1370/teardown` → `plan implemented`; master `1370` → `plan
      implemented` once every sub-row reads `plan implemented`.
