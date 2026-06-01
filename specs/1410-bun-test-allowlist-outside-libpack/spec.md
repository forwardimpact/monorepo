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

Current `main` contradicts that reading. The `bun test` invocation roots
(verified against `package.json` `scripts.test`) are `./tests`,
`./libraries`, `./products`, `./services`, `./.github/workflows/test`, and
`./.claude/skills/kata-interview/test`; the verification grep adds
`./websites/` as preemptive coverage so the inventory cannot miss a file
the runner discovery surface might absorb later. The four spec-critical
counts are produced by four commands sharing one regex; each count names
its source explicitly so the result is single-command reproducible:

```sh
# 37 = repo-wide files importing from "bun:test"
grep -rlE "from ['\"]bun:test['\"]" libraries/ services/ products/ tests/ websites/ .github/ .claude/ | wc -l

# 31 = outside-libpack subset of the 37
grep -rlE "from ['\"]bun:test['\"]" libraries/ services/ products/ tests/ websites/ .github/ .claude/ | grep -v '^libraries/libpack/' | wc -l

# 6 = inside-libpack subset of the 37
grep -rlE "from ['\"]bun:test['\"]" libraries/libpack/ | wc -l

# 0 = files outside the package surfaces (tests/, websites/, .github/, .claude/)
grep -rlE "from ['\"]bun:test['\"]" tests/ websites/ .github/ .claude/ | wc -l
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
| `.github/workflows/test/`, `.claude/skills/kata-interview/test/` | 0 |
| **Repo total**                         |                       **37** |

The two `bun test` discovery roots outside the package surfaces
(`.github/workflows/test/kata-interview-shape.test.js`,
`.claude/skills/kata-interview/test/skill-shape.test.js`) currently import
from `node:test`; neither imports from `bun:test`. They are included in the
verification roots so the inventory matches the runner's discovery surface.

Issue #1328 framed the disposition as binary: enforce (Option A — guard rule
+ migrate 31 files) or relax (Option B — allowlist + amend record). Both
options align with the **Platform Builders** persona job to "Build
Agent-Capable Systems" via the Gear product
([JTBD.md](../../JTBD.md#platform-builders-build-agent-capable-systems));
the choice turns on the symbol-usage evidence.

Per-symbol file counts among the 31 outside-`libpack` files, each with its
own per-symbol verification grep so a reviewer can reproduce a single row
in isolation:

| Symbol           | Files using it | Per-symbol verification grep                                                                                                |
| ---------------- | -------------: | --------------------------------------------------------------------------------------------------------------------------- |
| `describe`       |             31 | `grep -rlE "import .*\\bdescribe\\b.* from ['\"]bun:test['\"]" libraries/ services/ products/ tests/ websites/ .github/ .claude/` |
| `test`           |             31 | `grep -rlE "import .*\\btest\\b.* from ['\"]bun:test['\"]" libraries/ services/ products/ tests/ websites/ .github/ .claude/` |
| `expect`         |             31 | `grep -rlE "import .*\\bexpect\\b.* from ['\"]bun:test['\"]" libraries/ services/ products/ tests/ websites/ .github/ .claude/` |
| `beforeEach`     |             16 | `grep -rlE "import .*\\bbeforeEach\\b.* from ['\"]bun:test['\"]" libraries/ services/ products/ tests/ websites/ .github/ .claude/` |
| `afterEach`      |             16 | `grep -rlE "import .*\\bafterEach\\b.* from ['\"]bun:test['\"]" libraries/ services/ products/ tests/ websites/ .github/ .claude/` |
| `afterAll`       |              1 | `grep -rlE "import .*\\bafterAll\\b.* from ['\"]bun:test['\"]" libraries/ services/ products/ tests/ websites/ .github/ .claude/` |
| `beforeAll`      |              0 | Same shape — no matches; allowlisted as forward-compat alias only.                                                          |
| `it`             |              0 | Same shape — no matches; allowlisted as forward-compat alias only.                                                          |
| `mock`           |              0 | `grep -rlE "import .*\\bmock\\b.* from ['\"]bun:test['\"]" libraries/ services/ products/ tests/ websites/ .github/ .claude/` |
| `spyOn`          |              0 | `grep -rlE "import .*\\bspyOn\\b.* from ['\"]bun:test['\"]" libraries/ services/ products/ tests/ websites/ .github/ .claude/` |
| `setSystemTime`  |              0 | `grep -rlE "import .*\\bsetSystemTime\\b.* from ['\"]bun:test['\"]" libraries/ services/ products/ tests/ websites/ .github/ .claude/` |
| `useFakeTimers`  |              0 | `grep -rlE "import .*\\buseFakeTimers\\b.* from ['\"]bun:test['\"]" libraries/ services/ products/ tests/ websites/ .github/ .claude/` |

`vi.*` (Vitest compatibility globals) and snapshot serializers
(`toMatchSnapshot`, `toMatchInlineSnapshot`, custom serializers) are **not**
rows in this table. They are not imported from `bun:test` — `vi.*` is a
global access pattern and snapshot serializers are `expect()` methods — so
the import-allowlist guard cannot catch them. They are addressed under
§ Out of scope below.

**Convergence claim (precise).** Of the 37 files that import from `bun:test`
across `libpack`-inside and -outside, none import any symbol outside the
six-symbol observed subset (`describe`, `test`, `expect`, `beforeEach`,
`afterEach`, `afterAll`). This is **not** the claim that every adopting
file uses all six symbols — most use a subset, with `describe`/`test`/
`expect` as the common floor and lifecycle hooks added by roughly half.
The claim is the upper bound: no file reaches outside the universal
subset. The 91% of test files that import from `node:test` do not
contradict this — those files made an earlier choice and 0650 left them
alone.

## Decision

**Option B — accept the convergent convention; allowlist the universal subset
plus two forward-compat aliases in test files; preserve `libmock`/`libpack`
source decoupling via a guard rule.**

### Rationale

| Signal                        | Weight                                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Symbol convergence is exact   | No file (inside or outside `libpack`) imports any symbol outside the 6-symbol observed subset (`describe`, `test`, `expect`, `beforeEach`, `afterEach`, `afterAll`). Most files use a smaller floor — `libpack`-inside files use only `describe`/`test`/`expect`; outside-`libpack` files add lifecycle hooks. Zero divergent-feature usage. The drift is not toward bun-specific power; it is toward `expect()` ergonomics. |
| Cost asymmetry favours B      | Option A migrates ~31 files (rewriting `expect(x).toEqual(y)` → `assert.deepStrictEqual(x, y)`, plus several `expect(spy).toHaveBeenCalledWith(...)` shapes), turning CI red until clean. Option B is a guard script + supersession note. |
| 0650's core decoupling holds  | The "Why a custom `spy`" rationale in 0650 protected `libmock`/`libpack` **source** from runtime mock APIs. Source files still do not import `bun:test` (verified). Only test files do. The relaxation is at the test-consumer edge; the structural decoupling is unchanged. |
| Foreclosure was inferred, not stated | 0650 records the foreclosure as a non-goal bullet under "snapshot testing, etc." — never enumerated the prohibited symbols, never wired a guard. 31 files of organic adoption is evidence the inferred scope was over-broad. |

### Supersession note on spec 0650

This spec amends one bullet of `specs/0650-bun-test-runner/spec.md`,
which lives on `main`. (`wiki/STATUS.md` records the 0650 row as
`0650 spec cancelled`, but the spec.md file itself was merged onto
`main` and the runner switch it describes is live — `package.json`
runs `bun test`, `libmock` exports `spy()`, and
`libraries/libpack/test/` contains 6 `bun:test` importers. The
amendment edits the file on `main`; the STATUS string does not change
the audit obligation.) The **Non-goals** bullet quoted above is the
amendment target:

> Adding `bun:test`-specific features (snapshot testing, etc.) — out of
> scope; this spec is purely about the runner switch.

The amendment is justified because the foreclosure was inferred from a
single non-goal bullet interpreted globally rather than written as a
stated constraint with a guard. 31 files of organic adoption across 6
surfaces (`libbridge`, `libhttp`, `libeval`, `ghbridge`, `msbridge`,
`pathway`) over months, all converging on the universal subset, are
evidence the inferred scope was over-broad. Narrowing the foreclosure
preserves 0650's structural intent (keep `libmock`/`libpack` source
decoupled from `bun:test`) while matching the convention the team
actually uses. No other 0650 statement is amended — runner choice,
custom `spy()`, `node:test` lifecycle compatibility, and risk register
all stand.

The amendment takes one specific form: the Non-goals bullet quoted
above is **replaced** by the Replacement bullet text below, plus a
footnote of the form `*[amended by spec 1410](link-to-this-spec)*`.
The footnote carries no date — the audit date is observable from the
git history of `specs/0650-bun-test-runner/spec.md` and from this
spec's PR record; embedding a date in the footnote would require
post-merge editing or out-of-band substitution and adds no audit value
the git history does not already provide. The original bullet text is
preserved in this spec's quotation above, which is reachable from the
footnote, so the seal-break audit trail is complete.

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

| Symbol or shape                                    | Why out                                                                                                                                                                                                                                  |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mock`, `spyOn`                                    | Use `libmock`'s runtime-independent `spy()`. Preserves 0650's core decoupling: call-inspection sites stay identical across runners.                                                                                                      |
| Bun-specific timer manipulation (`setSystemTime`)  | Diverges from `node:test`'s timer semantics. 0650 names the symmetric risk for `node:test`'s `mock.timers`; banning the bun-side equivalent keeps the surface narrow in both directions. Any future `bun:test` timer-manipulation symbol is also banned by allowlist construction (only the 8 symbols on the allowlist are admitted; anything not on the list — present or future — is rejected). |
| Default or namespace imports from `bun:test`       | Allowlist scope is **named imports only**; `import test from "bun:test"` or `import * as bunTest from "bun:test"` would bypass the per-symbol check. The guard rejects them in test files just as the source-file ban rejects them everywhere else. |
| Side-effect imports (`import "bun:test"`)          | Carry no named symbols, so the named-import allowlist does not engage. The guard rejects this shape in test files for the same reason it rejects default/namespace imports: the guard cannot tell which symbols a side-effect import made available. |
| Re-export shims (`export { test } from "bun:test"`) | Would let a downstream `import { test } from "./shim.js"` evade the guard if it were only matching import strings. The guard MUST match the same shapes (named/default/namespace/side-effect) on `export ... from "bun:test"`, in the same files it applies to import statements. |
| `vi.*` aliases (Vitest compatibility shims)        | Out of scope for this spec; if Vitest compatibility becomes a need, that is its own decision. Not guard-enforceable from `bun:test` imports (Vitest globals are not imported from `bun:test`) — listed here for completeness, not as a guard target. |

**Renamed named imports** (e.g. `import { test as bunTest } from "bun:test"`)
are **allowed** when the imported binding (the left-hand name, `test` here)
is on the allowlist, regardless of the local alias. The guard checks the
imported name, not the local binding. A renamed import of a banned symbol
(`import { spyOn as track } from "bun:test"`) is rejected on the imported
side just like the unaliased shape.

Snapshot serializers (`toMatchSnapshot`, `toMatchInlineSnapshot`, custom
serializers) are explicitly **out of scope** for this spec rather than
guarded. They are `expect()` methods rather than `bun:test` imports, so
the import-allowlist guard cannot catch them; if snapshot usage appears,
it should land via its own spec. The CONTRIBUTING.md paragraph (success
criterion 7) mentions this for awareness.

### Scope clause

- The allowlist applies to files matching `**/*.test.js` under the
  monorepo's `bun test` invocation roots: `libraries/`, `services/`,
  `products/`, `tests/`, `websites/`, `.github/workflows/test/`, and
  `.claude/skills/kata-interview/test/`. The last two are the discovery
  roots verified against `package.json` (see § Problem). Today `tests/`,
  `websites/`, `.github/workflows/test/`, and
  `.claude/skills/kata-interview/test/` have zero `bun:test` imports;
  inclusion is preemptive so the policy is uniform across every directory
  the monorepo's test runner walks.
- Files matching `**/*.spec.js` (the Playwright end-to-end tests in
  `tests/`) and any other extension (`*.test.ts`, `*.test.mjs`, …) are
  **not** in test-file scope. They count as non-test source for the
  purposes of this spec — i.e., they are bound by the source-file ban
  below. `bun:test` is intended for the `bun test` runner, which only
  picks up `.test.js`.
- **Non-test source files** (anything not matching `**/*.test.js` under
  the same allowlist directory set) must not import from `bun:test`
  under any condition. This preserves the source/runtime decoupling
  that motivated 0650's custom `spy()`. The source-file ban applies to
  every shape in § Out (named, default, namespace, side-effect,
  re-export); the same shapes are rejected in test files when they fall
  outside the allowlist.
- `libraries/libpack/` and `libraries/libmock/` source code is bound by
  the same source-file ban; their test files are allowlisted on the same
  terms as every other surface. There is no `libpack`-special carve-out
  today and none is being introduced.

**Persona cost (named, not hidden).** Routing `*.spec.js`, `*.test.ts`,
and `*.test.mjs` into the non-test source-file ban is intentional today
but has a known cost: a Platform Builder who adopts one of those
extensions in the future (e.g. moves a test to TypeScript, or adds a
Playwright file that imports from `bun:test` for shared fixtures) will
trip the source-file ban rather than receive a clearer "extension not
yet supported by the allowlist" signal. Lifting this cost is a follow-up
spec, not a change to the current guard; the guard's user-facing message
shape is a design-phase concern (see § Risks for the persona framing).

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
| 1 | A guard enforces the named-import allowlist on every `*.test.js` import from `bun:test`, **and** rejects default, namespace, side-effect, and re-export shapes (`import "bun:test"`, `export ... from "bun:test"`) in `*.test.js` files. The guard's error message contract: for an allowlist symbol violation the message names the offending symbol; for a banned symbol it also names the recommended replacement (`spy()` from `libmock` for `mock`/`spyOn`; "no replacement — out of scope" for `setSystemTime`/`useFakeTimers`); for a banned shape (default/namespace/side-effect/re-export) the message names the shape and points the reader to the named-import allowlist. | A fixture `*.test.js` for each allowed shape (named import of an allowlisted symbol, renamed named import of an allowlisted symbol) exits zero; fixtures for each disallowed shape and each banned symbol exit non-zero, and the error message text matches the per-shape, per-symbol contract above. |
| 2 | The guard forbids `bun:test` imports and re-exports of every shape (named, default, namespace, side-effect, re-export) in any non-test source file, where "non-test source file" means a file under the allowlist directory set (see § Scope clause) that does **not** match `**/*.test.js`. | Running the guard against a fixture source file (non-`*.test.js`) that imports or re-exports anything from `bun:test` exits non-zero, with the same per-shape contract as criterion 1. |
| 3 | The guard runs in CI on every pull request and on `main` as a member of the same aggregator that runs the other `invariants:check-*` scripts. | The aggregator that invokes the other `invariants:check-*` scripts also invokes the new guard; both `bun run check` and the CI workflow that runs invariants execute it. |
| 4 | The guard, run on `main` at the time this spec lands, exits 0: all 37 current `bun:test` imports in test files pass the named-import allowlist, and zero non-test source files under the allowlist directory set import or re-export from `bun:test`. | The four single-command counts in § Problem reproduce 37 / 31 / 6 / 0 (each count names its own command). The two source-side checks below return `0`: <br>• `grep -rlE "from ['\"]bun:test['\"]" libraries/ services/ products/ tests/ websites/ .github/ .claude/ \| grep -v '\.test\.js$' \| wc -l` (no non-`.test.js` file imports from `bun:test`) <br>• `grep -rlE "export .* from ['\"]bun:test['\"]" libraries/ services/ products/ tests/ websites/ .github/ .claude/ \| wc -l` (no file re-exports from `bun:test`, in either test or non-test files — the re-export shape is banned everywhere) |
| 5 | A regression test exercises the allowed and disallowed partition against the rules module: every allowlisted symbol (including renamed-import shape), every banned symbol from § Out, every banned import shape (default, namespace, side-effect, re-export), and the renamed-import-of-banned-symbol case (rejected on the imported name, not the local alias). | The regression test runs under `bun test`, lives somewhere the test runner discovers, and is parameterised over the in/out symbol partition declared in this spec plus every disallowed shape listed above. (Naming/location of the regression test, the guard script, and the rules module is a design-phase choice; see § References for an informative precedent.) |
| 6 | `specs/0650-bun-test-runner/spec.md` has its Non-goals bullet quoted in § Supersession replaced by the Replacement bullet text shown there, followed by a footnote of the form `*[amended by spec 1410](link)*` (no date in the footnote — see § Supersession). | The 0650 spec file on `main` shows the Replacement bullet text and the footnote link to this spec; the original bullet text no longer appears in 0650 outside this spec's quotation; the audit date is observable from the file's git history. |
| 7 | `CONTRIBUTING.md` carries the canonical policy paragraph and is the doc readers are pointed to from 0650's amended bullet and from this spec. The paragraph covers the allowlist, the source/test split, and the snapshot out-of-scope note, and links to this spec. | The diff against the current `CONTRIBUTING.md` shows the added paragraph naming those four items; 0650's amended bullet links to CONTRIBUTING.md or to this spec § Scope; this spec's § Scope clause is consistent with the paragraph (the design phase chooses which doc carries which level of detail — CONTRIBUTING.md the policy paragraph, this spec the audit trail and partition tables). |

## Risks

- **Platform Builder hits an unexpected guard error.** A contributor
  writing a new bridge or service test reaches for `spyOn`, a default
  import, or a TypeScript test file out of habit and the guard rejects
  the PR in CI. The persona-facing failure mode is "I followed the
  pattern I knew and CI failed without telling me why." Mitigation:
  success criterion 1 requires the error message to name the offending
  symbol or import shape and, for banned symbols, the recommended
  replacement (e.g. `libmock`'s `spy()` for `spyOn`). The persona cost
  of the `.test.ts` / `.spec.js` / `.test.mjs` extension routing is
  named explicitly in § Scope clause so a future contributor can find
  the rationale without spelunking.
- **Contributor reads 0650 in isolation and writes a migration PR based
  on the stale Non-goals bullet.** A contributor opens
  `specs/0650-bun-test-runner/spec.md`, sees the original Non-goals
  bullet without the amendment footnote, and proposes removing
  `bun:test` imports from the 31 outside-libpack files against a
  foreclosure that no longer holds. Mitigation: the amendment is
  **in-place** in 0650 (see § Supersession), so any reader of 0650
  sees the new bullet text plus the footnote linking here, not the old
  text. CONTRIBUTING.md is the canonical policy paragraph (success
  criterion 7).
- **Future bun release breaks a universal-subset symbol, or `bun:test`'s
  surface shifts.** Lower probability — the subset is the cross-runtime
  stable surface — but two costs land if it happens: the guard triplet
  (check script + rules module + regression test) needs updating, and a
  runner-version pin may be needed. The monorepo currently expresses
  Bun version only as a **floor** (`engines.bun: ">=1.2.0"` in
  `package.json`); CI installs Bun through the
  `forwardimpact/fit-bootstrap@v1` composite action and no exact pin
  lives in this repo today. Whether to add an exact pin is a separate
  decision out of scope for this spec; the regression test in success
  criterion 5 is the natural place to record one if added.
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
- `scripts/check-libmock.mjs`, `scripts/check-libmock-rules.mjs`, and
  `tests/check-libmock-rules.test.js` — **informative precedent** for
  the guard / rules / regression-test triplet pattern. The naming,
  filename shape, and aggregator entry id are not normative — the
  design phase chooses how to express success criteria 1, 3, and 5
  concretely.

— Product Manager 🌱
