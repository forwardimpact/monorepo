# Plan 0640-a — Test-Side Hygiene

Implements [spec.md](spec.md) per [design-a.md](design-a.md). Read both before
executing; this plan does not restate them.

## Approach

Decomposed into four independently-executable parts that touch disjoint file
sets: Part 01 adds the three libmock fixtures with their inline-shape lint rules
and README lines, then collapses the eight named inline consumers onto them;
Part 02 migrates the residual real-I/O **unit** tests onto the existing
`runtime` seam (`createTestRuntime` + `createMockFs`) and renames genuine
integration tests to `*.integration.test.js`; Part 03 splits the 30 over-400-LOC
test files by behaviour family and records the shape policy plus its allow-list;
Part 04 collapses the combinatorial matrices to boundary + property cases after
auditing each for single-path. The three design Open Questions resolve to their
stated defaults: graph fixtures take `GraphIndex`/`Store` by direct injection
(Q3), property checks are hand-rolled loops (Q2), and the § B sweep migrates
only assertions over pure logic — everything else is renamed (Q1).

## Part Index

| Part | Scope (spec §) | Primary paths | Depends on |
| --- | --- | --- | --- |
| [01](plan-a-01.md) | § A — three libmock fixtures + lint rules + consumer collapse | `libraries/libmock/`, `libraries/libgraph/test/`, `libraries/librpc/test/`, `products/guide/test/`, `libraries/librepl/test/`, `scripts/check-libmock-rules.mjs`, `tests/check-libmock-rules.test.js` | none |
| [02](plan-a-02.md) | § B — migrate real-I/O unit tests onto the seam | `libraries/libprompt/test/`, `libraries/libtemplate/test/`, swept unit tests under `libraries/`, `products/`, `services/`, `tests/` | none |
| [03](plan-a-03.md) | § C.1 — split files > 400 LOC + shape policy | the 29 over-ceiling files (model-types excluded — Part 04), `CONTRIBUTING.md` | none |
| [04](plan-a-04.md) | § C.2 — collapse combinatorial matrices | `libraries/libskill/test/modifiers.test.js`, `policies-predicates.test.js`, `tests/model-types.test.js` | none |

## Cross-cutting

- **Runner.** All test files run under `bun test` (0650). `node:test`-style
  imports remain bun-compatible; do not rewrite import style as part of this
  work.
- **Seam re-use.** Parts 02 consumes the injected `runtime` parameter 1370
  shipped; no `src/` file changes in any part except where a fixture's injected
  constructor is read from an existing export.
- **model-types overlap.** `tests/model-types.test.js` (448 LOC) appears on both
  the > 400 list and the matrix list. **Part 04 owns it** (audit then collapse);
  Part 03's split set excludes it. If Part 04's audit finds it is broad
  per-helper coverage rather than a single-path cross-multiply, Part 04 splits
  it by behaviour family under the Part 03 ceiling instead of collapsing.
- **Part 02 ∩ Part 03 overlap.** `libraries/libterrain/test/pipeline.test.js`
  (411 LOC, `mkdtemp`) and `libraries/libwiki/test/audit-engine.test.js` (421
  LOC, `mkdtemp`) appear on both Part 02's sweep list and Part 03's split list.
  **Part 02 owns both end-to-end**: migrate/rename the I/O first, then bring the
  result under the 400-LOC ceiling (split by family, or allow-list per Part 03's
  rule if cohesive). Part 03's split set excludes both. This keeps the two parts
  file-disjoint and parallel-safe.
- **map pipeline GraphIndex.** `products/map/test/pipeline.test.js` builds a
  *real* `GraphIndex` over `LocalStorage` (an integration construction, not the
  `createMockStorage` unit triple) and also uses `mkdtemp`. **Part 02 owns it**
  as a rename to `*.integration.test.js`; Part 01's GraphIndex rule is scoped to
  the `createMockStorage` triple so it does not trip on this file (or on the
  rename).
- **Three-artifact rule.** Every new shared fixture lands with its export, its
  `check-libmock-rules.mjs` shape rule, and its README line in the same commit
  (Decision 2). Part 01 is the only part that adds fixtures.
- **Workspace-import declarations.** `scripts/check-workspace-imports.mjs` fails
  any `@forwardimpact/*` import not declared in the importing package's
  `package.json`. Any file that **newly** imports `@forwardimpact/libmock` (or
  any other workspace package) requires that package added to the importing
  package's `devDependencies` in the same commit. Part 01's consumers
  (libgraph, guide, map, librepl, librpc) already declare libmock; the new
  importers are in Part 02 (libprompt, libtemplate, and any lib the sweep
  newly migrates) — see Part 02.

## STATUS sub-rows

Each part is tracked as a `wiki/STATUS.md` sub-row under the master `0640` row,
mirroring the 1370/1270 precedent (`1370/teardown`, `1270/protos-and-tenancy`):

| Sub-row | Part |
| --- | --- |
| `0640/libmock-fixtures` | 01 |
| `0640/io-migration` | 02 |
| `0640/file-splits` | 03 |
| `0640/matrix-collapse` | 04 |

All four sub-rows enter at `plan approved` alongside the master row. Each
advances to `plan implemented` when its part merges. The master `0640` row
advances to `plan implemented` only when **every** sub-row is implemented.

## Execution

Route all four parts to an engineering agent. Parts 01, 02, 03, and 04 are
mutually independent (disjoint file sets after the model-types assignment above)
and may run in parallel. Each part ends green on `bun run check` and
`bun test` for the directories it touched; the final integrating run verifies
the full suite and the spec's six success criteria.

## Risks

- **`createMockFs` sync surface coverage (Part 02).** The loaders read
  `runtime.fsSync` (`existsSync`/`readFileSync`); `createMockFs` provides those,
  but a swept file may call a sync method the fake lacks. Verify each migrated
  file's exact `fsSync` calls resolve against `createMockFs` before assuming the
  swap is mechanical; extend the fake (Part 01-style, with rule + README) only
  if a genuine gap appears.
- **Matrix single-path assumption (Part 04).** Collapsing a matrix that actually
  exercises distinct branches would drop coverage. Each matrix is audited for
  single-path **before** collapse (Decision 6); if an axis is a real branch,
  keep it as discrete cases rather than folding it into the property check.
- **Behaviour-family split coupling (Part 03).** Splitting a file with shared
  top-level setup can duplicate fixtures across the new files; lift shared setup
  into a sibling helper or the relevant libmock fixture rather than
  copy-pasting.
