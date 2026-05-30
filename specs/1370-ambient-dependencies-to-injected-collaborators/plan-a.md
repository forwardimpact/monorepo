# Plan 1370 — Ambient Dependencies to Injected Collaborators

## Approach

The design ratifies a single `runtime` bag (`{ fs, fsSync?, proc, clock,
subprocess, finder }`) flowing from each entry point through `ctx.deps`
into every constructor and factory. Every multi-subcommand CLI — libwiki
included — keeps its per-command-file layout; libwiki adds a `WikiSync`
collaborator constructed inside `bin/fit-wiki.js` and threaded via
`cli.dispatch(parsed, { deps: { runtime, wikiSync } })` (Success
Criterion 4, reframed after PR #1280 review). The plan executes that
direction as a foundation PR followed by per-library / per-product /
per-service migration PRs.
STATUS carries one sub-row per migration unit
([`{spec}/{unit}`](../../wiki/STATUS.md)) so claims are visible and
parallel sessions don't collide ([design § Decision 8](design-a.md#key-decisions)).
The master row at `1370` advances to `plan implemented` only when every
sub-row is implemented.

## Migration Recipe

Every per-library / per-product / per-service PR follows the same recipe
so the plan parts can stay short. Variations are called out per section.

### Steps

1. **Open the STATUS sub-row.** Add `1370/{unit}\tplan\tapproved` to
   `wiki/STATUS.md` as the first commit of the migration PR (the
   implementing agent writes this row when it opens the PR; no
   `kata-dispatch` automation is required). The master
   `1370\tplan\tapproved` row is already on `main` from the plan PR
   merge.
2. **Capture golden output** (CLI units only). Run
   `bun run scripts/capture-cli-golden.mjs <bin>` against the pre-refactor
   binary; commit `test/golden/<bin>/*.txt` as the first commit of the PR.
   No refactor commit may precede the golden snapshot.
3. **Constructor migration.** For every class/factory in `src/` that
   touches `node:fs`, `node:child_process`, `Date.now()`, `new Date()`,
   `setTimeout(...)`, or `process.*`:
   - Replace the ambient access with a destructured field on a `runtime`
     parameter (or on a domain bag that itself was constructed from
     `runtime`).
   - Destructure `fs` **xor** `fsSync` — never both
     ([design § Decision 7](design-a.md#key-decisions)).
   - Delete the top-of-file `import fs from "fs"` / `import { spawnSync }
     from "node:child_process"` / etc. once every internal call site
     routes through the destructured field.
4. **Handler signature migration.** For every CLI handler the unit owns:
   - If the bin uses `cli.dispatch(parsed, { … })`: extend the dispatch
     call to `cli.dispatch(parsed, { data, deps: { runtime } })`. The
     handler signature changes to `(ctx) => …` and reads
     `ctx.deps.runtime`.
   - If the bin uses hand-rolled `COMMANDS[command]` /
     `switch (command)`: convert to `cli.dispatch` if the unit is in the
     Decision-13 "subcommand surface" set (15 of 30 bins). Otherwise
     thread `runtime` as an explicit parameter to `main()`'s callees.
   - Handlers return the envelope `{ ok: true, value? } | { ok: false,
     code, error }`. The bin shim translates the envelope to
     `runtime.proc.exit(code)`. No handler calls `process.exit` itself.
5. **Test migration.** For every `*.test.js` in `test/` that previously
   spawned the unit's bin or wrote to a real tmpdir:
   - Import the constructor and call it with `createTestRuntime({
     overrides })` from libmock.
   - Replace `execFileSync`/`spawnSync(node, [binPath, …])` with
     direct method invocation against the in-process constructor.
   - The one explicit smoke test per binary stays — its filename gets
     the `.integration.test.js` suffix and is exempted by
     `scripts/check-subprocess-in-tests.mjs`.
   - Tests legitimately exercising real git/fs/subprocess
     (e.g. WikiSync rebase recovery, libeval workdir listener cleanup)
     rename to `*.integration.test.js`.
6. **Deny-list shrink.** Remove every entry for the unit from
   `scripts/check-ambient-deps.deny.json` and
   `scripts/check-subprocess-in-tests.deny.json`. The PR may not exit
   migration with any entry for the unit remaining
   ([spec § Risks](spec.md#risks-and-mitigations)).
7. **Golden replay.** Re-run `bun run scripts/capture-cli-golden.mjs
   <bin>` (CLI units only). The diff against the committed snapshot must
   be empty. Release-merge rejects a non-empty diff without an explicit
   approval signal.
8. **Sub-row advance.** Update the sub-row to `1370/{unit}\tplan\timplemented`
   in the same PR; the master `1370` row updates only when every sub-row
   is implemented.

### Per-unit verification

| Check | Command | Pass condition |
|---|---|---|
| Invariant | `bun run invariants` | exit 0; no new `check-ambient-deps.mjs` violations for unit's glob |
| Unit tests | `bun test {unit-path}/test/` | `0 fail`, `0 errors` |
| Integration tests | `bun test {unit-path}/test/*.integration.test.js` | `0 fail`, `0 errors` |
| Golden replay | `bun run scripts/capture-cli-golden.mjs --verify <bin>` | exit 0 (bytes match) |
| Full suite | `time bun run test` | `real` time tracked against milestone M1/M2/M3 ([spec § SC6](spec.md#success-criteria)) |

## Cross-Cutting Concerns

### STATUS sub-row schema

The plan extends the `id` field in `wiki/STATUS.md` to permit a
`/<unit>` suffix ([design § Decision 8](design-a.md#key-decisions)).
The first commit of the foundations PR documents the suffix in
`wiki/STATUS.md`'s header comment and extends `libwiki/constants.js`'s
status-row validator to allow `^\d{4}(\/[a-z0-9-]+)?$`. `kata-dispatch`,
`fit-wiki claim`, and `kata-release-merge` parse the suffix as a sub-row
of the master `NNNN` spec id; behavior unchanged for non-suffixed rows.

### Async-only subprocess propagation

`runtime.subprocess.run` returns a Promise ([design § Collaborator
Surfaces](design-a.md#collaborator-surfaces)). Every call chain from a
`spawnSync` / `execFileSync` site to its caller(s) converts to async on
migration. libwiki's `commands/sync.js` and `commands/init.js` propagate
this conversion to every libwiki caller chain (the bridges, the
`WikiSync` consumers, the four already-`io`-migrated commands). Other
libraries follow the same propagation — a unit may not exit migration
with a remaining sync subprocess call against its own surface.

**Synchronous exception (`runSync`).** A small number of call sites are
synchronous accessors whose caller chains cannot be made async without an
unbounded cascade — the canonical case is `libconfig`'s `Config.ghToken()`,
a sync getter that shells to `gh auth token` and is read synchronously
across the monorepo. For these, the subprocess surface provides
`runtime.subprocess.runSync(cmd, args, opts) → { stdout, stderr, exitCode }`
(over `spawnSync`), added to both `createDefaultSubprocess` and
`createMockSubprocess` as part of the foundation. `runSync` is the
escape hatch, not the default: reach for it only when async propagation is
genuinely infeasible, and document the reason at the call site.

### Golden capture timing

`scripts/capture-cli-golden.mjs` ships in plan-a-01-foundations. Every
CLI unit's first commit captures the golden snapshot against the
pre-refactor bin. Release-merge rejects refactor PRs whose first commit
isn't a golden capture, and rejects refactor commits that alter a
committed snapshot without an explicit approval signal
([spec § Risks](spec.md#risks-and-mitigations) — External CLI
contract drift).

### Deny-list seeding

Foundations PR seeds `scripts/check-ambient-deps.deny.json` with every
existing src violation across the monorepo, grouped by library/product/
service. Each migration PR removes its unit's entries (Step 6). The
deny-list is monotone — entries are removed only, never added — and CI
fails any new src violation not covered by the allow-list.

### libmock drift detection

`libraries/libmock/test/runtime-completeness.test.js` imports the
`Runtime` typedef via JSDoc `@typedef` and asserts every typedef field
has a corresponding `createMock*` factory export
([design § libmock README and Drift Detection](design-a.md#libmock-readme-and-drift-detection)).
Adding a field to `Runtime` without adding a fake fails CI. This
catches the "spec extension drifts ahead of fakes" failure mode.

### Performance milestone tracking

[Spec § SC6](spec.md#success-criteria) gates the spec on M1/M2/M3 wall
times. The plan tracks them as part of release-merge's per-wave
acceptance:

| Milestone | Trigger | Target |
|---|---|---|
| Pre-M1 baseline | foundations PR merges | record current `time bun run test` in plan-a-01 final note |
| M1 | every library in plan-a-02/03/04 sub-row at `plan implemented` | `real` under 45 s, three consecutive runs |
| M2 | every libeval + librpc sub-row at `plan implemented` | `real` under 35 s |
| M3 | every products + services sub-row at `plan implemented` | `real` under 25 s |

A missed milestone halts further wave PRs until reinvestigated
([spec § Risks](spec.md#risks-and-mitigations) — Slow migration).

## Migration Order and Part Index

The order mirrors [design § Decision 8](design-a.md#key-decisions),
with libraries not enumerated there folded into plan-a-04 (non-bin
libraries) so every src module gets covered.

| # | Part | Units | Blocks on |
|---|---|---|---|
| 01 | [plan-a-01-foundations.md](plan-a-01-foundations.md) | libmock, libcli, libutil, scripts, MONOREPO.md, STATUS schema, golden capture | — |
| 02 | [plan-a-02-libwiki.md](plan-a-02-libwiki.md) | libwiki (per-command handler signature migration + WikiSync + bin rewrite to `cli.dispatch`) | 01 |
| 03 | [plan-a-03-bin-libraries.md](plan-a-03-bin-libraries.md) | libconfig (no bin), libstorage, libcoaligned, libeval, librpc, libdoc, libcodegen, libterrain, libxmr, librc, libgraph, libvector, libresource, libsupervise, libtelemetry | 01 |
| 04 | [plan-a-04-non-bin-libraries.md](plan-a-04-non-bin-libraries.md) | libbridge, libformat, libindex, libmacos, libmcp, libpack, libpolicy, libpreflight, libprompt, libproto, librepl, libsecret, libskill, libsyntheticgen, libsyntheticprose, libsyntheticrender, libtemplate, libtype, libui | 01 |
| 05 | [plan-a-05-products.md](plan-a-05-products.md) | products/{map, pathway, summit, landmark, guide, outpost} | 01, 03 (libeval), 02 (libwiki) |
| 06 | [plan-a-06-services.md](plan-a-06-services.md) | services/{bridge, embedding, ghauth, ghbridge, graph, map, mcp, msbridge, oauth, pathway, trace, vector} | 01, 03 |
| teardown | [teardown.md](teardown.md) | remove the one-cycle BC bridges foundations shipped (`Finder` legacy positional constructor + `node:fs` deny-list entry; `createCli` zero-arg fallback) | 02, 03, 04, 05, 06 |

The `teardown` unit is the **last** to land: it deletes the backward-compat
bridges part 01 introduced so consumers could migrate incrementally. The master
`1370` row reaches `plan implemented` only once `1370/teardown` does (the
`kata-release-merge` sub-row gate enforces it). See
[teardown.md](teardown.md) for the bridges, their forcing functions, and the
removal checklist — `finder.js`'s `check-ambient-deps.deny.json` entry
mechanically blocks the Finder bridge from being forgotten; the `createCli`
fallback is tracked by teardown.md plus a runnable zero-count check.

Inter-part dependencies are inclusion-only — once a part's predecessor
has merged its foundations row, every unit inside the part can ship in
parallel. The dependency from products on libeval/libwiki reflects
products' actual consumers (landmark/dispatcher uses libwiki;
map/activity uses libeval): a product PR opening before its consumer
library migrates is acceptable only if the product's PR includes the
transitive collaborator-wiring updates.

## Libraries used

Libraries used: libmock (createMock* fakes for runtime fields), libcli
(InvocationContext.deps), libutil (Runtime + GitClient + GhClient +
Finder), libwiki (WikiSync + bin rewrite to cli.dispatch — plan-a-02),
libeval (runner + workdir + benchmark — plan-a-03), librpc (HmacAuth
audit — plan-a-03), libconfig (process arg → runtime.proc — plan-a-03).

## Risks

- **STATUS sub-row tooling not extended.** `kata-dispatch`,
  `kata-release-merge`, and `fit-wiki claim` currently treat the spec
  id as `^\d{4}$`; `wiki/STATUS.md` is excluded from
  `audit/scopes.js`'s `EXCLUDED_BASES` ([scopes.js:14](../../libraries/libwiki/src/audit/scopes.js))
  so the row shape is unchecked today. Plan-a-01 Step 1
  authors `STATUS_ID_REGEX` in `libraries/libwiki/src/status.js`
  (new file), removes `STATUS.md` from `EXCLUDED_BASES`, registers an
  `audit/status-row.js` rule, and updates the
  `kata-release-merge` / `kata-dispatch` skill markdown grep patterns.
  Mitigation: these are listed as Step 1's required file changes and
  the substep order is documented so the implementer cannot ship
  half-wired.
- **libwiki consolidation drift from the four `io`-migrated commands.**
  Those commands ship today; plan-a-02 must preserve their behavior
  byte-for-byte while collapsing `io` → `ctx.deps.runtime`. Mitigation:
  plan-a-02 Step 1 captures goldens against today's `fit-wiki claim/log/
  refresh/init` before any rewrite.
- **Async propagation cascade across libwiki callers.** The bridges
  (msbridge, ghbridge) thread `WikiRepo` through; converting subprocess
  to async forces every caller path async. Mitigation: plan-a-02 carries
  the bridge call-site updates inside the libwiki PR (the bridges
  themselves remain on their existing bin contracts).
- **M2/M3 milestone slippage stalls the program.** A missed milestone
  halts further wave PRs ([§ Performance milestone tracking](#performance-milestone-tracking)).
  Mitigation: plan-a-03 and plan-a-04 are ordered so the smallest
  libraries migrate first, building per-unit time savings into M1
  before the larger libraries land.
- **products PR opens before its library consumer migrates.** If a
  product is migrated while still constructing collaborators against a
  pre-1370 library shape, the product carries an in-flight compatibility
  shim. Mitigation: plan-a-05's per-product entries declare blocking
  units explicitly; release-merge rejects a product PR whose blocking
  units aren't at `plan implemented`.

## Execution

Foundation parts (plan-a-01, plan-a-02) sequence strictly: 02 cannot
open until 01 merges. After 01 merges, plan-a-03 and plan-a-04 may run
in parallel — each library inside ships as its own PR / sub-row with
no inter-library dependencies. Plan-a-05 starts when 01 plus
plan-a-02 (for landmark) and the libeval row from plan-a-03 (for map)
have merged. Plan-a-06 starts when 01 and the librpc/libgraph/libvector
rows from plan-a-03 have merged.

Route every wave to engineering agents (`staff-engineer` for the
foundation and libwiki parts; `staff-engineer` or peer engineering
agents for plan-a-03..06 parts; each unit's PR is a self-contained
engineering task). `technical-writer` owns the MONOREPO.md and
`CONTRIBUTING.md § READ-DO` edits inside plan-a-01 as a co-author hand-off.

— Staff Engineer 🛠️
