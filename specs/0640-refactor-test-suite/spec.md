# Spec 0640 — Test-Side Hygiene (Re-scoped)

## Re-scope note (2026-06-01)

This spec originally bundled three things: libmock adoption, removal of real I/O
from tests, and **wall-clock speed via reduced file count**. Two sibling specs
have since landed on `main` and subsumed most of that surface:

| Slice                                                                       | Owner                                                                  | Status on `main`                                                                                                                                                                                     |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source-side DI (`fs`/`proc`/`clock`/`subprocess` injected as collaborators) | [1370](../1370-ambient-dependencies-to-injected-collaborators/spec.md) | **Delivered** — ambient `node:fs`/`node:child_process`/`Date.now`/`process.*` gone from src outside allow-listed factories; canonical fakes shipped in libmock.                                      |
| Runner switch (`node:test` → `bun test` via `spy()`)                        | [0650](../0650-bun-test-runner/spec.md)                                | **Delivered** — `package.json` runs `bun test`; `spy()` replaces `mock.fn`; PR #1282 closed as delivered.                                                                                            |
| **Test-side hygiene**                                                       | **0640 (this spec)**                                                   | **Remaining** — adoption gap, the libmock infra fixtures 1370 did not add, oversized files, combinatorial parametrization, and the residual real-tmpdir unit tests that 1370's fs seam now unblocks. |

The most important consequence: **wall-clock is no longer a lever this spec can
pull.** 640's original thesis was that `node --test`'s fork-per-file overhead
(~90 ms × N files) meant only reducing file count cut wall time. 0650 moved the
suite to `bun test`, which does not fork per file, so file count no longer
drives wall time. 1370 then roughly doubled the test count (coarse
subprocess-spawning integration tests replaced by many fine-grained in-process
unit tests) and retired its own wall-time gate for the same reason (see
[1370 § Outcome](../1370-ambient-dependencies-to-injected-collaborators/spec.md#outcome-post-implementation-reconciliation-2026-06-01)).
This spec therefore drops every wall-clock target and reframes around
**maintenance surface and test-fake discoverability**, which are still poor.

## Problem

The test suite is **440 files** today (up from 211 when this spec was first
written — 1370's migration roughly doubled it). The structural problems that
remain are about maintenance cost and fake reuse, not speed:

| Metric                                                        | Original (2026-04) | On `main` (2026-06-01) | Note                                                                                        |
| ------------------------------------------------------------- | ------------------ | ---------------------- | ------------------------------------------------------------------------------------------- |
| Test files                                                    | 211                | 440                    | 1370 split integration tests into unit tests                                                |
| Test files importing `@forwardimpact/libmock`                 | 37 (17.5%)         | 156 (35%)              | up, but far below the helpers' reach                                                        |
| Test files > 400 LOC                                          | (n/a)              | 30                     | maintenance burden                                                                          |
| Test files > 300 LOC                                          | 107                | 86                     |                                                                                             |
| Test files using a real tmpdir (`mkdtemp`)                    | 12                 | 85                     | most are now `*.integration.test.js` (legitimate); a tail of unit tests still does real I/O |
| Test files spawning a subprocess (`execFileSync`/`spawnSync`) | 6                  | 22                     | bounded by 1370's one-smoke-test-per-bin allow-list; audit the rest                         |

Three concrete gaps:

1. **Adoption stalled at one-third.** 156 of 440 test files import libmock. The
   canonical fakes 1370 shipped (`createMockFs`, `createMockProcess`,
   `createMockSubprocess`, `createMockSupabaseClient`, `spy`, the pathway
   fixture atoms) are not yet reached by the majority of files that could use
   them.
2. **libmock has named infra holes 1370 never filled.** The 2026-04 audit named
   seven shared infra fixtures. 1370 shipped most (`createMockS3Client`,
   `createTurtleHelpers`, `createMockSupabaseClient`, reused `MockMetadata`),
   but three remain absent while their inline consumers persist:
   - `createGraphIndexFixture` — `libraries/libgraph/test/` rebuilds the
     `{ n3Store, graphIndex, mockStorage }` triple across `index-items`,
     `prefixes`, `index-loading`, `libgraph-filters`, `libgraph-query`.
   - `createMockGrpcHealthDefinition` — duplicated in
     `libraries/librpc/test/health.test.js` and
     `products/guide/test/status.test.js`.
   - `createReplEnvironment` — the readline/process/formatter/storage bundle
     inlined in `libraries/librepl/test/librepl.test.js`.
3. **Residual real-I/O unit tests now have a seam but were never migrated.**
   1370 gave `PromptLoader`/`TemplateLoader` an injected `runtime`/`fs` (their
   constructors take `runtime` today), yet their _tests_ still create real
   tmpdirs — `libraries/libprompt/test/loader.test.js` (`mkdtemp` ×3) and
   `libraries/libtemplate/test/loader.test.js` (`mkdtemp` ×7). The blocker 640
   originally recorded ("loaders hardcode `readFileSync`") is gone; the
   migration to `createMockFs` is now mechanical and was simply never done.
4. **Combinatorial parametrization persists.**
   `libraries/libskill/test/modifiers.test.js` (387 LOC),
   `policies-predicates.test.js` (349 LOC), and `tests/model-types.test.js` (448
   LOC) still cross-multiply proficiency × modifier / maturity matrices where a
   handful of boundary cases plus one property check would cover the same code
   paths at a fraction of the maintenance surface.

## Goal

Lift fake reuse and cut maintenance surface. Concretely: raise libmock adoption
among files that have a fake available, close the three named infra holes,
migrate the unit tests still doing real I/O onto the seams 1370 opened, and tame
the largest files and the combinatorial matrices. **No wall-clock target** —
wall time is recorded as a trend (consistent with 1370's retired SC6), not
gated.

## Scope

### A. Fill the three remaining libmock infra fixtures

Add to libmock and collapse the inline consumers named in Problem #2:

| Fixture                                                     | Returns                                    | Collapses                                        |
| ----------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------ |
| `createGraphIndexFixture({ storageOverrides?, indexKey? })` | `{ n3Store, graphIndex, mockStorage }`     | the 5 libgraph test files that rebuild it        |
| `createMockGrpcHealthDefinition()`                          | a gRPC health service definition           | librpc `health.test.js` + guide `status.test.js` |
| `createReplEnvironment()`                                   | bundled readline/process/formatter/storage | librepl `librepl.test.js`                        |

These are additive extensions; libmock internals are not rewritten. Each new
export is documented in `libraries/libmock/README.md` under the existing
Collaborators section, and `scripts/check-libmock-rules.mjs` gains a rule that
flags the inline shape it replaces (matching how the guard already catches
`createMockSubprocess` / `createMockFinder` reimplementations).

### B. Migrate residual real-I/O unit tests onto the 1370 seam

Use the `*.integration.test.js` naming convention 1370 established as the
boundary: integration tests keep real collaborators; **unit** tests do not.

- Migrate `libraries/libprompt/test/loader.test.js` and
  `libraries/libtemplate/test/loader.test.js` from real tmpdirs to
  `createMockFs` injected through the loader's existing `runtime` parameter.
- Sweep the remaining non-`integration` test files in the `mkdtemp` / `exec`
  list that exercise pure logic against the real filesystem or a real
  subprocess, and move them to `createMockFs` / `createMockSubprocess`.
- Where a test legitimately needs real I/O, rename it to `*.integration.test.js`
  so the `scripts/check-subprocess-in-tests.mjs` and ambient-deps invariants
  1370 introduced can tell the two apart.

### C. Maintenance surface: large files and parametrization

These are maintainability changes, **not** speed changes — state that explicitly
so reviewers don't expect a wall-time delta.

- Split the test files over ~400 LOC by behaviour family (30 files; start with
  the libeval cluster — `tee-writer`, `trace-collector`, `redaction-pipeline` —
  and `libcli/test/cli.test.js`). Target ceiling: ≤400 LOC per test file.
- Replace the combinatorial matrices in `libskill/test/modifiers.test.js`,
  `policies-predicates.test.js`, and `tests/model-types.test.js` with
  representative boundary cases plus one property-based check each. Audit first
  that the matrix exercises one implementation path before collapsing it.

## Non-goals

- **No runner change.** 0650 delivered `bun test`; this spec assumes it.
- **No source-side DI work.** 1370 owns `fs`/`proc`/`clock`/`subprocess`
  injection in `src`; this spec only consumes the seams it opened.
- **No wall-clock target.** File count no longer drives wall time under bun;
  speed is a recorded trend, not a gate.
- **No coverage cuts.** The original § C coverage-reduction candidates were
  re-examined and found to cover distinct surfaces; they stay. (Retired in the
  first execution pass and not revived here.)
- **No new process guards.** The `check-libmock` guard and the CONTRIBUTING
  READ-DO/DO-CONFIRM libmock entries already exist (delivered alongside 1370);
  this spec only adds per-fixture rules for the three new A-section fakes.

## Success Criteria

| #   | Criterion                                                                                                                                                                                                                                           | How to verify                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | The three named infra fixtures exist in libmock, are exported from `src/index.js`, and are documented in the README Collaborators section.                                                                                                          | a libmock test asserts each export resolves; README lists each with a one-line example.                                                                      |
| 2   | The inline consumers named in Problem #2 import the new fixtures instead of rebuilding them; `scripts/check-libmock.mjs` flags reintroduction of each inline shape.                                                                                 | `bun run invariants:check-libmock` exits non-zero against a corpus fixture for each new rule.                                                                |
| 3   | No non-`integration` unit test under `libraries/`, `products/`, `services/`, `tests/` creates a real tmpdir or spawns a subprocess for assertions that only inspect pure logic; legitimate real-I/O tests carry the `*.integration.test.js` suffix. | the `check-subprocess-in-tests` / ambient-deps invariants pass; `rg -l mkdtemp` over non-integration test files returns only an explicitly allow-listed set. |
| 4   | The three combinatorial matrices are replaced by boundary + property cases with no loss of covered code paths.                                                                                                                                      | the libskill and model test suites still pass; case counts drop while branch coverage of the targeted functions is unchanged.                                |
| 5   | No test file exceeds ~400 LOC except an explicitly allow-listed set.                                                                                                                                                                                | a size check over `*.test.js` reports the over-ceiling set; the set shrinks to the allow-list.                                                               |
| 6   | The full suite reports `0 fail` and `0 errors` under `bun test`.                                                                                                                                                                                    | `bun run test 2>&1` — wall time recorded as a trend, not gated.                                                                                              |

## Expected outcome

- libmock adoption: 35% → meaningfully higher among files with an available fake
  (the three new fixtures plus the unit-test migrations pull in the libgraph,
  librpc, librepl, libprompt, and libtemplate suites).
- Duplicate infra-fixture definitions: the three named holes → 0.
- Residual real-I/O unit tests: migrated onto `createMockFs` /
  `createMockSubprocess`; real I/O confined to `*.integration.test.js`.
- Test files > 400 LOC: 30 → allow-listed minimum.
- Wall time: **not a target.** Recorded as a trend signal only.

## History (superseded passes)

The 2026-04 prototype on `claude/refactor-test-suite-Fx4EQ` lifted libmock
adoption 17.5% → 40.9% (libharness era), added `assertThrowsMessage` adoption (0
→ 40 files), and merged three schema-sibling test pairs. Its central finding —
that `node --test` fork-per-file overhead made file count the only wall-clock
lever — was correct for `node:test` and is **why 0650 was split out and
prioritised**. With 0650 (bun) and 1370 (source DI) both on `main`, that
prototype's remaining items are either delivered, retired (coverage cuts), or
re-expressed in §§ A–C above. The original sprawling A–D scope, the concurrency
work (§ B.1, moot under bun), and the process-guard work (§ D, delivered) are
intentionally not carried forward.
