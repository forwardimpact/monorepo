# Spec 2030 — `node --test` Owns the Publish Gate; Bun Retained for the Local/PR Inner Loop

## Problem

The npm publish smoke gate runs the test suite to decide whether a release is
safe to ship. Today that gate runs under `bun test`. Bun's test runner carries a
shim-class flake the reference runner does not: `mock.fn` / `t.skip` gaps
([bun#5090](https://github.com/oven-sh/bun/issues/5090)) and `describe`-in-test
idioms that surface as first-attempt failures. When the gate flakes, the failure
lands on an **already-pushed release tag**, the most expensive place to discover
it, instead of on a re-runnable PR.

`node --test` is the reference-correct runner. The existing `describe`-in-test
files are valid `node:test` and run green under it. The one thing stopping
`node --test` from running the test set green today is **49 test files importing
`bun:test`**, which `node --test` cannot load
(`ERR_UNSUPPORTED_ESM_URL_SCHEME: protocol 'bun:'`).

The obstacle ([#1737](https://github.com/forwardimpact/monorepo/issues/1737))
framed the 49-file sweep as mechanical: "drop the `bun:test` import, reuse the
`spy()` helper from spec [0650](../0650-bun-test-runner/spec.md)." **Verified
against the tree, that framing is wrong:**

| Claim in the obstacle | Verified reality |
| --- | --- |
| Files reuse `spy()` / `mock.fn` | **0 of 49** use `spy()` or `mock.fn` |
| Sweep is a one-line import drop | All 49 import `expect` from `bun:test`; `node:test` ships `node:assert`, **not** `expect` |
| Scope is small | **880 `expect()` callsites** across the 49 files |

Dropping the import alone leaves 880 unresolved `expect()` calls. The real work
is an **`expect` API conversion**, not an import swap.

## Persona and Job

**Platform Builders — Build Agent-Capable Systems** ([JTBD.md](../../JTBD.md)).
Platform builders consume `fit-*` and `kata-*` libraries via npm. The pull for
that job is "interoperable libraries that work standalone or together," which
depends on the published packages being correct. A flaky publish gate either
ships a broken package or blocks a release on noise, and both break that pull.
Running the reference-correct runner on the critical path before publish is what
keeps the delivered packages trustworthy. The change also serves the internal
release pipeline that the Kata team operates, since the gate sits inside the
publish loop.

## Goal

Make correct-on-the-critical-path the default, and push fast-but-flaky to where
flakes are cheap:

1. `node --test` owns the publish smoke gate (the critical path).
2. `bun test` is retained for the local and PR inner loop, keeping the ~25.8s
   re-runnable speed where a flake costs nothing.
3. All 49 `bun:test` files run green on **both** runners after the conversion.

## Approach (WHAT, not HOW)

Mirror the precedent set by spec [0650](../0650-bun-test-runner/spec.md), which
made the suite runner-independent by replacing `mock.fn` with a dependency-free
`spy()` helper in libmock. This spec does the same for `expect`. libmock is the
natural home, and the design confirms the placement:

- A **new runner-independent `expect` capability**, dependency-free (it imports
  from neither `bun:test` nor `node:test`), exposing Jest-style matchers. With
  it in place, each of the 49 files changes **one import line** (the `bun:test`
  import becomes the shim plus the `node:test` lifecycle exports) and stays green
  on both runners.
- The shim's **matcher surface is enumerated from actual usage**, not invented.
  The surface present in the 49 files is bounded and known:

  | Matcher | Callsites | Matcher | Callsites |
  | --- | --- | --- | --- |
  | `toBe` | 439 | `toBeTruthy` | 9 |
  | `toHaveLength` | 105 | `toBeGreaterThanOrEqual` | 7 |
  | `toEqual` | 103 | `rejects` | 7 |
  | `toThrow` | 78 | `toBeDefined` | 5 |
  | `toContain` | 56 | `toMatch` / `toBeLessThanOrEqual` / `resolves` | 2 each |
  | `toBeNull` | 39 | `toMatchObject` | 1 |
  | `toBeUndefined` | 22 | `.not` modifier | 18 |
  | `toBeGreaterThan` | 12 | | |

  The counts are the grounding evidence. The conversion is a pure `expect`
  swap with no new spy-assertion sites, so this surface is the bounded set. The
  design re-enumerates from the tree at sweep time and treats that re-derivation,
  not this table, as authoritative.

## Scope

**In scope**

- New runner-independent `expect` shim in libmock with its own test (see
  success criteria), covering the enumerated matcher surface.
- Convert all 49 `bun:test` files to the shim, one import-line change per file.
  Distribution: libbridge 20, ghbridge 10, msbridge 9, libpack 6, libeval 2,
  pathway 1, libhttp 1.
- Define the publish gate **once** as a named script (e.g. `test:gate`) running
  `node --test` over the **gate set**: the same `*.test.js` files the current
  `test` script collects. Run that identical gate on PR and `main`, not only at
  tag time.
- A **no-`bun:test` invariant** that fails CI on any new `bun:test` import after
  the sweep.

**Out of scope**

- Removing `bun test` from the local/PR inner loop. It stays as the fast
  re-runnable path.
- Migrating test files that do not import `bun:test`.
- Any change to the `describe`-in-test idiom (already valid `node:test`).
- Test-set partitioning of the gate. It is a contingency, not part of this
  change (see Falsifier).

## Constraints (release-engineer guardrails)

These are hard requirements on how the change lands, not optional sequencing:

1. **Sweep-then-flip in separate PRs.** Never flip the gate and migrate in one
   PR, because `node --test` hard-fails on any remaining `bun:` import. Land the
   conversion sweep first, prove it green on a `node --test` dry-run job, then
   flip the gate in a second PR.
2. **Define the gate once.** The `node --test` gate is a single named script run
   identically on PR, `main`, and at tag time, so a node-only failure blocks the
   PR, never the already-pushed release tag.
3. **Lock the split.** The no-`bun:test` invariant must fail CI on any new
   `bun:test` import, so the two-runner split does not rot back into a
   single-runner dependency.

## Success Criteria

| # | Criterion | Verification |
| --- | --- | --- |
| 1 | No file imports from `bun:test` after the sweep | `rg "from ['\"]bun:test['\"]"` returns 0 matches |
| 2 | The gate set passes under `node --test` | `node --test` over the gate set exits 0, with 0 `ERR_UNSUPPORTED_ESM_URL_SCHEME: protocol 'bun:'` and 0 `NotImplementedError: describe()…` |
| 3 | The gate set still passes under bun | `bun run test` exits 0 |
| 4 | The `expect` shim has its own dedicated test | A libmock test exercises the shim directly and passes on both runners |
| 5 | `toEqual` deep-equality holds for `Map` and `Set` | The shim test asserts equal `Map`s and equal `Set`s pass and unequal ones fail |
| 6 | `toThrow` accepts a substring and a `RegExp` | The shim test asserts both forms match the thrown message |
| 7 | `.rejects` matches bun's async rejection semantics | The shim test asserts an async rejection is caught and a non-rejection fails the assertion |
| 8 | The gate is one named script run on PR, `main`, and tag | One script (e.g. `test:gate`) referenced by the PR/`main` test workflow and the publish workflow; a `node --test` failure fails the PR check |
| 9 | New `bun:test` imports are blocked | The invariant fails CI when a `bun:test` import is introduced |

## Pre-Registered Falsifier and Go-See

Carried from obstacle [#1737](https://github.com/forwardimpact/monorepo/issues/1737),
which is also the source of the ~70.3s gate and ~25.8s inner-loop baselines below:

- **Falsifier:** `node --test`'s fork-per-file model may surface **its own flake
  class** (timeout/contention) at the ~70s gate runtime, trading one shim flake
  for another. If observed, the runner swap is reconsidered (e.g. test-set
  partitioning).
- **Go-see window:** the **first 2 publish cycles** after the flip, measuring
  shim-class failures per run, extending toward **N≈20** for the durable-zero
  target. Expected outcome: **0 shim-class failures per publish run**.
- **Secondary watch:** the ~70.3s gate runtime against the ~25.8s bun baseline.
  An unacceptable critical-path regression triggers the partitioning contingency.

## Ownership

After `spec:approved`, the **staff-engineer** owns design → plan → implement.
Strategy green-lit by staff-engineer and release-engineer; this spec records
their two consolidated corrections (the `expect`-conversion scope and the three
landing guardrails) as binding.

— Product Manager 🌱
