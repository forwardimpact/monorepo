# Spec 2020 — Settle the Test-Runner Strategy: `node --test` on the Publish Gate, bun for Local/PR

Revisits [spec 0650](../0650-bun-test-runner/spec.md), which switched the
default test runner to `bun test`. That decision's load-bearing assumption has
since proven false on the critical path, and the runner choice was never settled
for one surface at a time — so the suite drifted into two incompatible idioms.
This spec reopens 0650's runner decision and settles it.

Serves [JTBD § Teams Using Agents — run a continuously improving agent
team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team):
a release pipeline whose gate is deterministic, not luck of CI timing.

Obstacle [#1737](https://github.com/forwardimpact/monorepo/issues/1737) ·
Experiment [#1738](https://github.com/forwardimpact/monorepo/issues/1738).

## Problem

**The gate, named precisely.** The release-blocking test gate is the
**"Run tests" step of the publish workflows** — there are **two**:
`Publish: Package` (npm, `publish-npm.yml:60`) and `Publish: macOS App`
(`publish-macos.yml:41`). Each runs the repository's `test` script, which
enumerates the **gate set** — the test files it runs — and executes them under
`bun test`. Both carry identical bun#5090 flake exposure, so both are in scope
for the flip. (The separate "Smoke test npm package" step only installs the
built package; it is not the test gate.) Throughout this spec, "the gate" means
those "Run tests" steps, "the gate set" means the files the `test` script
enumerates, and "publish cycle" means one run of either publish workflow on a
release.

The gate intermittently fails on the critical path. The failure class is bun's
incomplete `node:test` shim
([bun#5090](https://github.com/oven-sh/bun/issues/5090)): `describe()` inside
`test()` throws `NotImplementedError` under bun. Under CI contention, when a
per-test timeout is exceeded the unhandled-between-tests error cascades across
test boundaries and reddens the gate. Confirmed firings: **#1723** (fixed via
#1730, merged 2026-06-15) and the **W20** sighting.

Spec 0650 made a deliberate speed-over-correctness trade and bridged the known
gap with a runner-independent `spy()` helper. Two things broke the trade:

1. **0650's stated non-goal was false.** It declared "migrating away from
   `node:test`'s `describe`/`test` … bun supports these identically; no change
   needed." bun does **not** support `describe()` *inside* `test()`. The gate
   inherits this gap because the fast runner is default on every surface,
   including the critical path.
2. **0650's stated risk materialized and its mitigation was never built.** 0650
   flagged "bun's `node:test` interop is … still incomplete … Mitigation: lint
   rule could flag …" — the rule was never written. Worse, contributors worked
   around bun's gaps by importing `bun:test` directly (0650 listed this as an
   explicit non-goal), file by file, with no central runner decision. The result
   is a **split-brained suite**.

### Current condition

Measured 2026-06-15 in the coaching session that produced this spec, by running
the three runner strategies over the gate set as enumerated by the `test`
script's own file-selection command (513 files at that point), bun 1.3.11 /
node 22.22.3, on a 4-core runner. The numbers are single-session and
single-machine; they establish direction and magnitude, not a distribution.

| Runner strategy | Wall-clock | Correctness |
| --- | --- | --- |
| `bun test` default (batched) | 25.8 s | **290 fail** — every one `describe()`-inside-`test()` / bun#5090 |
| `bun test` one-process-per-file | 87.1 s | 0 file failures (isolation masks the cascade) |
| `node --test` | 70.3 s | 63 fail — the `bun:test` importers node cannot resolve |

The "fast AND correct under bun" third option is **dominated**: per-file bun
(87.1 s) is 24 % *slower* than `node --test`'s 70.3 s baseline and still rides
bun's shim. The decision is therefore not speed-vs-correctness on a clean suite — it
is **which idiom the suite converges on**.

### The split-brain (measured file counts)

| Idiom | Count | Consequence |
| --- | --- | --- |
| Files with a `bun:test` import statement | 49 | `node --test` cannot run them (`ERR_UNSUPPORTED_ESM_URL_SCHEME: protocol 'bun:'`) |
| Files using `describe()` inside `test()` | 163 | `bun test` cannot run them (bun#5090) |
| Files in both sets | 8 | converge together |

Counts are of actual import statements, not string mentions: two further files
mention `bun:test` only in comments and are not in the 49. The 49 importers
cluster in recently churned code — libbridge (20), ghbridge (10), msbridge (9),
libpack (6), with the remaining 4 in libeval, libhttp, and pathway. Neither
runner can run the whole suite green today.

**What the 49 actually import — the convergence is an `expect` conversion, not
an import drop.** Measured on `main` 2026-06-15: **0 of the 49** importers use
`spy()` or `mock.fn`, so 0650's runner-independent test-double helper covers
**nothing** here. **All 49** import `expect` from `bun:test` — **880 `expect()`
callsites**. `node:test` ships `node:assert`, **not** `expect`. Dropping the
`bun:test` import therefore leaves 880 unresolved `expect()` calls; the real
work is an **`expect` API conversion**. The matcher surface is bounded and
enumerable from usage: `toBe` 439, `toHaveLength` 105, `toEqual` 103, `toThrow`
78, `toContain` 56, `toBeNull` 39, `toBeUndefined` 22, `.not` 18, with a short
tail below that. This mirrors 0650's own move — there a `spy()` helper replaced
bun's `mock.fn`; here an `expect` shim replaces bun's `expect`.

## Goal

Settle the runner strategy so the publish gate is deterministic on the critical
path, and document the resolved trade so the choice stops re-litigating every
time a new unimplemented `node:test` method surfaces.

## Resolved runner strategy (the settled trade)

**Define the gate once, run it in every place it must block.** The gate is
a single named script — **`test:gate`** — that runs `node --test` **and parses
its reported test count to enforce a floor**. The name names the
release-blocking **role**, not the runner. `node --test` exits 0 on zero
registered tests, so the script is a thin wrapper: it runs `node --test`, reads
the `# tests`/`# pass` count, and exits non-zero on a below-floor or zero-file
run (the floor lifecycle and per-file rule are in Scope and Success criteria).
It reuses the **same `find` file-selector as the existing `test` script** so
there is one source of truth for the gate set: if the selector forks, the gate
set forks. That one script is invoked in **four places** — the PR `Test / gate`
job (node, **required**), `main`, and the "Run tests" step of **both** publish
workflows (`Publish: Package` and `Publish: macOS App`). "Define once" is
load-bearing: there must never be two hand-maintained `node --test` invocations
that drift. Both publish steps are kept as belt-and-suspenders, pointed at the
same script.

| Surface | Runner | Blocking? | Why |
| --- | --- | --- | --- |
| `Test / gate` job — PR + `main` (runs `bun run test:gate`) | `node --test` | **Blocking (required)** | Reference-correct runner; `describe`-in-`test` (163 files) is valid `node:test`. The single blocking PR check; node-only failures block the PR, not the release tag. |
| "Run tests" step of **both** publish workflows — `Publish: Package` and `Publish: macOS App` (same `test:gate` script) | `node --test` | Blocking | Belt-and-suspenders at the release, identical logic to the PR gate. Both run `bun run test` today with identical bun#5090 exposure, so both must converge or the macOS release path keeps the flake. |
| `Test / test` job + local dev inner loop | `bun test` | **Non-blocking / informational** | Keeps the ~25.8 s inner-loop speed for fast, re-runnable iteration. It surfaces the 290-fail bun#5090 cascade, so it must stay informational — making it blocking would just move the flaky blocker from the release tag to the PR queue. |

This makes **correct-on-the-critical-path the default path** and pushes
fast-but-flaky to where flakes cost little — inverting the obstacle in #1737.
The earlier design (node only at publish) is rejected here: it lets a node-only
failure escape review and surface on the release tag, which is exactly the
"flake blocks a release" failure mode this spec exists to remove.

## Scope

| Change | In scope |
| --- | --- |
| Define `test:gate` (one script, `node --test`, reusing the **same `find` selector as `test`**) and invoke it in four places: a **required** `Test / gate` PR/`main` job (`bun run test:gate`) and the "Run tests" step of **both** publish workflows — `Publish: Package` **and** `Publish: macOS App` (both run `bun run test` today with identical bun#5090 exposure) | Yes — one source of truth for the gate set; no second hand-maintained `node --test` invocation that can drift, and no publish path left on the flaky runner |
| `test:gate` enforces a pinned executed-test floor and a per-file ≥1-test rule by parsing the runner's count | Yes — `node --test` returns 0 on zero registered tests, so the wrapper, not node, is what fails an empty or shrunk run. The floor is a **committed value updated in the same PR that changes the test population**; a per-file check catches a single file silently registering zero (import-time throw / erroring `describe`); pointing the selector at zero files must exit non-zero. Threshold-parsing mechanics are a design/plan concern; the contracts are in Success criteria. |
| Local/PR dev inner loop continues under `bun test` (`Test / test` job) | Yes (retain) — **non-blocking / informational only**; it shows the 290-fail bun#5090 cascade, so the single blocking PR check stays `Test / gate` (node) |
| **49-file `bun:test` → `node:test` convergence via a new `expect` shim**, so the gate runner can run them | Yes — converge the 49 importers onto `node:test`. The work is an **`expect` API conversion**, *not* a mechanical import drop: 0/49 use `spy()`/`mock.fn` (0650's test-double helper covers nothing here) and all 49 import `expect` (880 callsites) which `node:test` does not ship. Build a **new dependency-free, runner-independent `expect` shim** (Jest-style matchers, runnable under both `node --test` and `bun test`), mirroring how 0650's `spy()` replaced `mock.fn`. Matcher surface is bounded/enumerable from usage (`toBe` 439, `toHaveLength` 105, `toEqual` 103, `toThrow` 78, `toContain` 56, `toBeNull` 39, `toBeUndefined` 22, `.not` 18, short tail). The 8 dual-idiom files converge together. The shim's API and the per-file mechanics are a design/plan concern; any file needing `bun:test`-only semantics the shim cannot reproduce re-bounds the sweep and is surfaced in `kata-design`. |
| **The `expect` shim ships with its own test, including a per-matcher anti-vacuity property** | Yes — two duties. (1) Explicit coverage of the semantics drift the 49 files rely on: `toEqual` deep-equality on `Map`/`Set`, `toThrow` substring-vs-`RegExp` matching, and async `.rejects`. (2) A **per-matcher anti-vacuity property baked into the shim's own automated test** so a later refactor cannot reintroduce silent passes: for **every matcher in the shim's actual usage surface** (the matchers the 49 converged files use — `toBe`, `toHaveLength`, `toEqual`, `toThrow`, `toContain`, `toBeNull`, `toBeUndefined`, plus the tail), the test asserts both a passing case **and** a failing case (a deliberately wrong expectation must throw — a no-op matcher would pass both and is caught here); `.not` is exercised **explicitly** (a passthrough `.not` makes every negated assertion vacuous, so a negated assertion that should fail must throw); and **at least one async negative case** is covered — an `expect(p).rejects.toThrow()` whose promise does *not* reject must fail, since an unawaited `rejects` chain passes green and a sync `toBe` inversion will not catch it (a live hole in the async-heavy bridge files). The shim must be green under both `node --test` and `bun test`. |
| The swept files must still pass locally under the retained `bun test` | Yes — convergence onto `node:test` (and the shim) must not break the inner loop |
| A guard failing CI on **any** new `bun:test` **import statement anywhere in the repo** (import statements, not string mentions) | Yes — the missing mitigation 0650 named. Post-sweep the baseline is zero, so "zero repo-wide" is simpler and strictly safer than scoping to the gate set. Implement it as `scripts/check-bun-test-imports.mjs` **and wire it as an explicit step in a required CI workflow** — mirror how `scripts/check-dependabot.mjs` is run directly at `check-security.yml:41`, *not* routed through an aggregate. The `bun run check` / `bun run context` aggregates are **local-only convenience scripts; no workflow invokes them**, so an entry that relies on `bun run check` to gate (the way `context:check-dependabot` exists in the aggregate yet is the script CI hand-wires directly) would pass locally and never block a PR — the exact silent-non-enforcement this guard exists to prevent. A `package.json` entry (e.g. `context:check-bun-test`) is fine for local runs, but the gating contract is the explicit required workflow step, not the aggregate. (The `describe`-in-`test` direction protects the local **bun** loop, not the release gate — tracked separately, **not** conflated into this guard.) |
| Document the resolved trade as the settled runner strategy | Yes |

### Excluded

- Fixing bun#5090 or any upstream bun behaviour — not ours to fix; this spec
  designs around it.
- Adding `bun:test`-specific features (snapshot testing, etc.) — still a
  non-goal, as in 0650.
- Restructuring the 163 `describe`-in-`test` files — they are valid under the
  chosen gate runner and need no change.
- Coverage tooling and reporter format — unchanged; CI consumes pass/fail
  counts.

## Sequencing constraint (two PRs)

The sweep and the gate-flip **must land as two separate PRs, in this order**.
`node --test` hard-fails on any remaining `bun:` import, so a single PR that
both flips the gate and migrates the 49 files can never go green incrementally —
the gate is red until the very last file converges, and any mid-review push
leaves CI red.

1. **PR 1 — converge, add the gate script, stand up the required node job.**
   Land the 49-file `bun:test` → `node:test` sweep (including the new `expect`
   shim and its test); add the `test:gate` script (`node --test`); add the
   `Test / gate` `node --test` job and make it **required (blocking)** on PR and
   `main` from this PR onward; add the repo-wide re-divergence guard. Publish
   still calls `bun run test` here — the gate is **not** flipped. The required
   node job proves the sweep is complete and keeps `main` continuously green
   under the node gate before anything depends on it.
2. **PR 2 — flip the publish steps.** Change the "Run tests" step of **both**
   publish workflows (`Publish: Package` and `Publish: macOS App`) from
   `bun run test` to `bun run test:gate` — a one-line, revertable change in
   each. By the time this lands, `main` has been continuously green under the
   required node gate, so the flip is over a suite already proven to pass.

Splitting this way keeps each PR independently green and reviewable, and means
the publish step is only repointed once the node gate has been green on `main`.

## Success criteria

**Acceptance criteria** — verifiable at merge time; these gate this spec's
implementation. Criteria are tagged **[PR 1]** (converge + gate script + required
node job + guard) or **[PR 2]** (one-line publish flip) per the sequencing
constraint above. **Convergence and gate-flip ship as two PRs; the gate-flip PR
may not merge until a required `node --test` job has been green on `main`.**

| Criterion | PR | Verification |
| --- | --- | --- |
| The new `expect` shim is dependency-free and runs under both runners. | PR 1 | The shim imports nothing outside the standard library; its own test exits 0 under both `node --test` and `bun test`. |
| The shim's test covers the semantics drift the 49 files rely on. | PR 1 | The shim test has explicit cases for `toEqual` deep-equality on `Map`/`Set`, `toThrow` substring-vs-`RegExp`, and async `.rejects`. |
| The shim's own test carries a per-matcher anti-vacuity property. | PR 1 | For **every matcher in the shim's usage surface** (those the 49 files use), the shim test asserts both a passing case and a failing case (a wrong expectation throws); `.not` has an explicit negated-assertion-that-should-fail case; and an async negative case (a non-rejecting promise under `rejects.toThrow()`) fails. Replacing any matcher body with a no-op, or `.not` with a passthrough, reddens the shim's own test. |
| `test:gate` is one script (a `node --test` wrapper) reusing the same `find` selector as `test`. | PR 1 | `test:gate` and `test` share the file-selector command (one source of truth for the gate set); there is no second hand-maintained `node --test` invocation. The wrapper runs `node --test` and enforces the count floor (next rows). |
| The `Test / gate` node job is required (blocking) on PR and `main`. | PR 1 | The `Test / gate` job runs `bun run test:gate` and is a required check; an introduced node-only failure reddens it on a PR. |
| `node --test` runs the gate set green. | PR 1 | A `node --test` run over the gate set exits 0, with 0 `NotImplementedError: describe()…` and 0 `ERR_UNSUPPORTED_ESM_URL_SCHEME: protocol 'bun:'`. |
| The gate is non-vacuously green — swept tests still fail when the code under test is broken. | PR 1 | Two layers. **Unit:** the shim's own per-matcher anti-vacuity property (criterion above) proves each matcher and `.not` assert rather than silently pass. **Integration:** on the **converted set** (not just the shim's test), inverting an assertion (or breaking its code-under-test) in a swept file makes `node --test` over that file exit **non-zero** — confirming the shim is wired live into the real tests, not just green in isolation. Both layers required; the unit property is what a later refactor cannot erode. |
| The gate enforces a pinned executed-test floor with a defined lifecycle. | PR 1 | The floor is the **current executed-test count, checked into the repo** (a committed value, not a comment), and is **updated in the same PR that changes the test population**. The `test:gate` wrapper parses node's reported `# tests`/`# pass` count and exits non-zero when the observed count is **below the pinned floor**, printing the new observed value so the fix is to commit it — keeping the floor pinned to current rather than letting an open-ended `≥` decay into a stale-low rubber stamp. |
| Every gate-set file registers at least one test (per-file, not just aggregate). | PR 1 | The gate asserts **per file**, not only on the total: a gate-set file that registers **zero** tests — e.g. an import-time throw or an erroring `describe` that silently drops the file's tests while the aggregate still clears the floor — fails the gate. (Catches the file-level hole a whole-suite count cannot see.) |
| The floor guard is itself falsifiable — zero files fails the gate. | PR 1 | Symmetric to the non-vacuity probe: pointing the `test:gate` selector at **zero files** makes the gate exit **non-zero**. This is explicit because **`node --test` exits 0 on zero registered tests** — the non-zero exit must come from the `test:gate` wrapper parsing the count and exiting, never from node itself. A selector glob miss or discovery failure reddens the gate instead of passing vacuously. |
| No file in the gate set has a `bun:test` import statement. | PR 1 | A search for `bun:test` **import statements** (not string mentions) across the gate set returns zero. |
| The swept files still pass under `bun test` locally. | PR 1 | A `bun test` run over the converged files exits 0. |
| The bun `Test / test` job is non-blocking / informational. | PR 1 | The `Test / test` job runs `bun test` and is not a required check; its failure does not block merge. |
| A guard fails CI on any new `bun:test` import anywhere in the repo, **via an explicit required-workflow step**. | PR 1 | `scripts/check-bun-test-imports.mjs` is invoked as a dedicated step in a **required** CI workflow (mirroring `scripts/check-dependabot.mjs` at `check-security.yml:41`), and that check — not a local `bun run check` aggregate — is the gating contract. A `bun:test` **import statement** introduced anywhere reddens the required check; a clean tree passes it. (Asserting the check is wired into a workflow that runs on `pull_request`, not merely present in `package.json`.) |
| **Both** publish "Run tests" steps run the same `test:gate` script. | PR 2 | The "Run tests" step of `Publish: Package` **and** `Publish: macOS App` each invoke `bun run test:gate`; the change from `bun run test` is a one-line diff in each, and main was green under the required node job before merge. No publish path is left on `bun run test`. |

**Outcome criterion (go-see)** — the durable target, measured on the live gate
*after* merge; tracked on experiment #1738, not a merge gate:

| Criterion | Verification |
| --- | --- |
| First-attempt shim-class (bun#5090 / describe-in-test) failures on the gate = 0, sustained. | `Publish: Package` and `Publish: macOS App` run history shows 0 such failures across publish cycles after merge. Initial go-see window: the first 2 cycles (confirms no immediate regression); the **durable target is 0 over 20 consecutive cycles** per the obstacle's target condition. |

## Path to approval

This spec reopens spec 0650's runner decision; settling it is an
owner-decision. Approval is human-only: the spec advances when `wiki/STATUS.md`
shows the `2020` row at `spec approved`, written from a trusted human signal
(`spec:approved` label, APPROVED review, approval comment, or in-session
approval). The `spec:approved` signal is the owner-decision that settles 0650's
reopened question; until then the runner strategy remains proposed, not settled.
On approval, the spec proceeds to `kata-design` (WHICH/WHERE — the `expect`
shim's API and its per-matcher anti-vacuity test, the `test:gate` count-parsing
wrapper and its floor/per-file/zero-files enforcement, the script's workflow
wiring, sweep mechanics, the two-PR sequencing, and the re-divergence guard
wired as an explicit required-workflow step) and then `kata-plan`.

— Staff Engineer 🛠️
