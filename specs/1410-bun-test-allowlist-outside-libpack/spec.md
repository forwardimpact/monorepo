# Spec 1410 — Allowlist `bun:test` Universal-Subset Imports Outside `libpack`

## Problem

Spec 0650 switched the runner to `bun test` and added a runner-independent
`spy()` in `libmock` so call-inspection sites stayed identical across runners.
Its **Non-goals** section carries this bullet: _"Adding `bun:test`-specific
features (snapshot testing, etc.) — out of scope; this spec is purely about
the runner switch."_ Issue #1328 labels this "Decision 2/7" — that label is
the issue author's enumeration of the architectural choices embedded in
0650; it maps to the Non-goals bullet quoted above. Read globally, that
bullet has been interpreted as foreclosing any `bun:test` import outside
`libraries/libpack/`.

Current `main` contradicts that reading. Verification command (run from
repo root):

```sh
grep -rlE "from ['\"]bun:test['\"]" libraries/ services/ products/ tests/ websites/
```

| Surface                                | Files with `from "bun:test"` |
| -------------------------------------- | ---------------------------: |
| `libraries/libbridge/test/`            |                           17 |
| `libraries/libhttp/test/`              |                            1 |
| `libraries/libeval/test/`              |                            2 |
| `services/ghbridge/test/`              |                            6 |
| `services/msbridge/test/`              |                            4 |
| `products/pathway/test/`               |                            1 |
| **Outside-`libpack` total**            |                       **31** |
| `libraries/libpack/test/`              |                            6 |
| `tests/`, `websites/`                  |                            0 |
| **Repo total**                         |                       **37** |

Issue #1328 framed the disposition as binary: enforce (Option A — guard rule
+ migrate 31 files) or relax (Option B — allowlist + amend record). Both
options align with the **Platform Builders / Gear** persona job to maintain
a shared, agent-capable test surface ([JTBD.md § Gear](../../JTBD.md)); the
choice turns on the symbol-usage evidence.

Per-symbol file counts among the 31 outside-`libpack` files (same
verification grep, narrowed by symbol):

| Symbol        | Files using it | Notes                                                  |
| ------------- | -------------: | ------------------------------------------------------ |
| `describe`    |             31 | Every file.                                            |
| `test`        |             31 | Every file.                                            |
| `expect`      |             31 | Every file. **No `node:test` equivalent.**             |
| `beforeEach`  |             16 | About half of files.                                   |
| `afterEach`   |             16 | About half of files (same set as `beforeEach`).        |
| `afterAll`    |              1 | `products/pathway/test/serve.integration.test.js`.     |
| `beforeAll`   |              0 | No current usage; relevant only to allowlist forward-compat. |
| `it`          |              0 | No current usage; relevant only to allowlist forward-compat. |
| `mock`, `spyOn`, `setSystemTime`, `useFakeTimers`, snapshot serializers, `vi.*` aliases | 0 | None imported anywhere outside `libpack`. |

Across the 37 imports inside and outside `libpack`, files converged on a
6-symbol observed subset (`describe`, `test`, `expect`, `beforeEach`,
`afterEach`, `afterAll`). The 91% of test files that import from `node:test`
do not contradict this — those files made an earlier choice and 0650 left
them alone; the convergence point is "of files that adopted `bun:test`, all
use the universal subset." No file outside `libpack` reaches for a
`bun:test`-specific power feature.

## Decision

**Option B — accept the convergent convention; allowlist the universal subset
plus two forward-compat aliases in test files; preserve `libmock`/`libpack`
source decoupling via a guard rule.**

### Rationale

| Signal                        | Weight                                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Symbol convergence is exact   | The 6-symbol observed subset is shared across `libpack`-inside and -outside files. Zero divergent-feature usage. The drift is not toward bun-specific power; it is toward `expect()` ergonomics. |
| Cost asymmetry favours B      | Option A migrates ~31 files (rewriting `expect(x).toEqual(y)` → `assert.deepStrictEqual(x, y)`, plus several `expect(spy).toHaveBeenCalledWith(...)` shapes), turning CI red until clean. Option B is a guard script + supersession note. |
| 0650's core decoupling holds  | The "Why a custom `spy`" rationale in 0650 protected `libmock`/`libpack` **source** from runtime mock APIs. Source files still do not import `bun:test` (verified). Only test files do. The relaxation is at the test-consumer edge; the structural decoupling is unchanged. |
| Foreclosure was inferred, not stated | 0650 records the foreclosure as a non-goal bullet under "snapshot testing, etc." — never enumerated the prohibited symbols, never wired a guard. 31 files of organic adoption is evidence the inferred scope was over-broad. |

### Supersession note on spec 0650 (sealed at `plan implemented`)

This spec amends one bullet of `specs/0650-bun-test-runner/spec.md` — the
**Non-goals** bullet quoted above:

> Adding `bun:test`-specific features (snapshot testing, etc.) — out of
> scope; this spec is purely about the runner switch.

The seal is being broken because the foreclosure was inferred from a single
non-goal bullet interpreted globally rather than written as a stated
constraint with a guard. 31 files of organic adoption across 5 surfaces
over months, all converging on the universal subset, are evidence the
inferred scope was over-broad. Narrowing the foreclosure preserves 0650's
structural intent (keep `libmock`/`libpack` source decoupled from
`bun:test`) while matching the convention the team actually uses. The
convention is observed across 31 files in 6 surfaces (`libbridge`,
`libhttp`, `libeval`, `ghbridge`, `msbridge`, `pathway`). No other 0650
decision is amended — runner choice, custom `spy()`, `node:test`
lifecycle compatibility, and risk register all stand.

The amendment to 0650 takes one specific form: the Non-goals bullet
quoted above is **replaced in place** with the text below, plus a
footnote of the form `*[amended by spec 1410, YYYY-MM-DD]*` that links to
this spec for audit (the original bullet text is preserved in this spec's
quotation above, which is reachable from the footnote). The amendment is
done by the implementation of this spec (CONTRIBUTING.md is the single
source of truth for the policy itself — see success criterion 7 — and
0650's bullet defers there).

Replacement bullet text:

> Adding `bun:test`-specific features to `libmock`/`libpack` **source**
> (snapshot testing, fake timers, etc.) — out of scope. The universal
> test-surface subset (per spec 1410 allowlist) is permitted in
> `*.test.js` files anywhere. Non-test source files anywhere in the repo
> must not import from `bun:test` — see spec 1410 § Scope.

## Scope

### Allowlist (permitted as `from "bun:test"` named imports in `*.test.js`)

The allowlist contains every observed-subset symbol plus two forward-compat
aliases. **Admission rule:** an observed-subset symbol stays in by usage
evidence; a forward-compat alias stays in only when omitting it would
create an arbitrary break under stylistic drift (`it` is the standard alias
for `test`; `beforeAll` is the standard peer of `afterAll`) and its
semantics match the observed subset. Nothing in the Out column qualifies
under this rule — those symbols introduce divergent semantics, not stylistic
variation.

| Symbol         | Status        | Why in                                                                                                                                              |
| -------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `describe`     | Observed (31) | Block constructor; identical contract across `node:test`, `bun:test`, Vitest.                                                                       |
| `test`         | Observed (31) | Case constructor; identical contract.                                                                                                               |
| `it`           | Alias         | Standard alias for `test`; admitting it avoids a spurious break the first time someone writes `it(...)`; semantics identical to `test`.            |
| `expect`       | Observed (31) | Assertion API. **No `node:test` equivalent.** The primary ergonomic gain across the 31 files; the reason the convention exists.                    |
| `beforeAll`    | Alias         | Standard peer of `afterAll` (which is observed); admitting both keeps lifecycle-hook coverage symmetric without rewriting tests that pair them.    |
| `beforeEach`   | Observed (16) | Lifecycle hook; identical contract.                                                                                                                |
| `afterEach`    | Observed (16) | Lifecycle hook; identical contract.                                                                                                                |
| `afterAll`    | Observed (1)  | Lifecycle hook; used by the pathway integration test.                                                                                              |

### Out (banned by guard rule)

| Symbol or surface                                  | Why out                                                                                                                                                                                                                                  |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mock`, `spyOn`                                    | Use `libmock`'s runtime-independent `spy()`. Preserves 0650's core decoupling: call-inspection sites stay identical across runners.                                                                                                      |
| Bun-specific timer manipulation (`setSystemTime` and any future `bun:test` timer surface) | Diverges from `node:test`'s timer semantics. 0650 names the symmetric risk for `node:test`'s `mock.timers`; banning the bun-side equivalent keeps the surface narrow in both directions.                |
| Default or namespace imports from `bun:test`       | Allowlist scope is **named imports only**; `import test from "bun:test"` or `import * as bunTest from "bun:test"` would bypass the symbol check, so the guard rejects them in test files just as it rejects them in source files.        |
| `vi.*` aliases (Vitest compatibility shims)        | Out of scope for this spec; if Vitest compatibility becomes a need, that is its own decision.                                                                                                                                            |

Snapshot serializers (`toMatchSnapshot`, `toMatchInlineSnapshot`, custom
serializers) are explicitly **out of scope** for this spec rather than
guarded. They are `expect()` methods rather than `bun:test` imports, so
the import-allowlist guard cannot catch them; if snapshot usage appears,
it should land via its own spec. The CONTRIBUTING.md paragraph (success
criterion 7) mentions this for awareness.

### Scope clause

- The allowlist applies to files matching `**/*.test.js` under
  `libraries/`, `services/`, `products/`, `tests/`, and `websites/`.
  Today `tests/` and `websites/` have zero `bun:test` imports; inclusion
  is preemptive so the policy is uniform across every directory the
  monorepo's test runner could be pointed at.
- Files matching `**/*.spec.js` (the Playwright end-to-end tests in
  `tests/`) and any other extension (`*.test.ts`, `*.test.mjs`, …) are
  **not** in test-file scope. They count as non-test source for the
  purposes of this spec — i.e., they are bound by the source-file ban
  below. `bun:test` is intended for the `bun test` runner, which only
  picks up `.test.js`.
- **Non-test source files** (anything not matching `**/*.test.js`) must
  not import from `bun:test` under any condition. This preserves the
  source/runtime decoupling that motivated 0650's custom `spy()`.
- `libraries/libpack/` and `libraries/libmock/` source code is bound by
  the same source-file ban; their test files are allowlisted on the same
  terms as every other surface. There is no `libpack`-special carve-out
  today and none is being introduced.

### Out of scope

- Migrating any current file. The 37 existing `bun:test` imports already
  use only allowlisted symbols and pass the guard on day one (success
  criterion 4).
- Migrating away from `node:test`'s `describe`/`test`/`beforeEach`/etc.
  in files that still use them — both runners support the universal
  subset under either import path.
- Switching the runner away from `bun test` — 0650's runner decision
  stands.
- Adding snapshot testing or fake timers — listed in Out above; either
  would need its own spec.
- Adding `expect` to `node:assert` or replacing `expect` with a
  cross-runtime polyfill — relaxation is the point.

## Success criteria

| # | Claim                                                                                                                  | Verified by                                                                                       |
| - | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1 | A guard script enforces the named-import allowlist on every `*.test.js` import from `bun:test`, **and** rejects default and namespace imports from `bun:test` in `*.test.js` files (parallel to criterion 2). The guard's error message names the offending symbol or import shape and, for banned symbols, the recommended replacement (e.g. `libmock`'s `spy()` for `spyOn`). | A fixture `*.test.js` importing only allowlisted named symbols exits zero; fixtures importing a banned symbol, a default import, or a namespace import each exit non-zero with a message matching the requirement above. |
| 2 | The guard script forbids `bun:test` imports (named, default, or namespace) in any non-test source file. | Running the guard against a fixture source file (non-`*.test.js`) that imports anything from `bun:test` exits non-zero. |
| 3 | The guard runs in CI as part of the existing `invariants` aggregator (which is invoked by `bun run check` and by the `Quality` workflow). The new entry is named `invariants:check-bun-test-imports`. | `package.json` lists `invariants:check-bun-test-imports` in the `invariants` aggregator alongside the existing `invariants:check-*` entries. |
| 4 | The guard, run on `main` at the time this spec lands, exits 0: all 37 current `bun:test` imports in test files pass the named-import allowlist, and zero non-test source files import from `bun:test`. | The verification grep in § Problem reproduces 37 / 31 / 6 / 0 counts; a second grep `grep -rlE "from ['\"]bun:test['\"]" --include='*' --exclude='*.test.js' libraries/ services/ products/ tests/ websites/` returns no matches. |
| 5 | A regression test exercises allowed named-import shapes, disallowed named-import shapes (each banned symbol), and disallowed import shapes (default, namespace) against the rules module, following the established `tests/check-*-rules.test.js` convention. | A file under `tests/` matching the `check-*-rules.test.js` shape is present, green under `bun test`, and parameterised over the in/out symbol partition declared in this spec plus the default/namespace shapes. |
| 6 | `specs/0650-bun-test-runner/spec.md` has its Non-goals bullet quoted in § Supersession replaced in place with the Replacement bullet text shown there, followed by a footnote of the form `*[amended by spec 1410, YYYY-MM-DD]*` that links to this spec. | The 0650 spec file shows the replacement bullet on the same line position the original occupied; the footnote link resolves to this spec; the original bullet text appears in this spec's § Supersession quotation block (so the seal-break audit trail is complete). |
| 7 | `CONTRIBUTING.md` is the single source of truth for the policy: one paragraph names the allowlist, the source/test split, the snapshot out-of-scope note, and points readers to this spec. No other doc states a contradictory policy. | A diff against the current `CONTRIBUTING.md` shows the added paragraph; a repo-wide search finds no contradicting policy text.                          |

## Risks

- **Future contributor reaches for a banned symbol** (e.g. `spyOn` in a
  bridge test). The guard catches this in CI. Success criterion 1
  requires the error message to name the recommended replacement so the
  contributor does not need to read this spec to recover.
- **Future bun release breaks a universal-subset symbol, or `bun:test`'s
  surface shifts.** Lower probability — the subset is the cross-runtime
  stable surface — but two costs land if it happens: the guard triplet
  (`check-*.mjs` + rules module + regression test) needs updating, and a
  runner-version pin may be needed. The regression test in (5) is the
  single place that pin would land.
- **Cross-runtime migration** (e.g. to Vitest) is constrained by the
  allowlist surface, not by the size of the test corpus. Vitest's
  `describe`/`test`/`it`/`expect`/`beforeAll`/`beforeEach`/`afterEach`/
  `afterAll` contracts match name-for-name; a future migration would be
  an import-path rewrite, not an API rewrite.

## References

- Spec 0650 — Switch Test Runner from `node:test` to `bun test` (frozen at
  `plan implemented`; this spec amends one Non-goals bullet only)
- Issue #1328 — spec: enforce or relax spec 0650 Decision 2/7 (`bun:test`
  outside libpack); "Decision 2/7" maps to 0650's Non-goals bullet (see
  § Supersession)
- Spec 1370 / PR #1285 — ambient-dependency foundations; touched
  `libmock` but did not change 0650's runner decision or the `spy()`
  contract. Listed because a planner reading this spec may see `libmock`
  edits in adjacent commits.
- `scripts/check-libmock.mjs` and `scripts/check-libmock-rules.mjs` plus
  `tests/check-libmock-rules.test.js` — the guard/rules/regression-test
  triplet pattern this spec adopts

— Product Manager 🌱
