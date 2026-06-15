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
**"Run tests" step of the `Publish: Package` workflow**, which runs the
repository's `test` script. That script enumerates the **gate set** — the test
files it runs — and executes them under `bun test`. (The separate "Smoke test
npm package" step only installs the built package; it is not the test gate.)
Throughout this spec, "the gate" means that "Run tests" step, "the gate set"
means the files its `test` script enumerates, and "publish cycle" means one run
of that workflow on a release.

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

## Goal

Settle the runner strategy so the publish gate is deterministic on the critical
path, and document the resolved trade so the choice stops re-litigating every
time a new unimplemented `node:test` method surfaces.

## Resolved runner strategy (the settled trade)

| Surface | Runner | Why |
| --- | --- | --- |
| The "Run tests" gate of `Publish: Package` (critical path) | `node --test` | Reference-correct runner; `describe`-in-`test` (163 files) is valid `node:test`. Flake here blocks a release, so correctness wins over the 70.3 s runtime. |
| Local + PR test runs | `bun test` | Keeps the ~25.8 s inner-loop speed where a flake is cheap and re-runnable, not a release blocker. |

This makes **correct-on-the-critical-path the default path** and pushes
fast-but-flaky to where flakes cost little — inverting the obstacle in #1737.

## Scope

| Change | In scope |
| --- | --- |
| The "Run tests" gate runs the gate set under `node --test` | Yes |
| Local/PR continue under `bun test` | Yes (retain) |
| **49-file `bun:test` → `node:test` convergence**, so the gate runner can run them | Yes — converge the 49 importers onto the `node:test` idiom. Expected to be mechanical and upstream-independent (a runner-independent test-double helper already exists from 0650), with the 8 dual-idiom files converging together. The convergence mechanism is a design/plan concern; any file that turns out to need `bun:test`-only semantics a mechanical convergence cannot reproduce re-bounds the sweep and is surfaced in `kata-design`. |
| The swept files must still pass locally under the retained `bun test` | Yes — convergence onto `node:test` must not break the inner loop |
| A guard preventing re-divergence (new `bun:test` imports, or `describe`-in-`test` regressions on the gated surface) | Yes — the missing mitigation 0650 named |
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

## Success criteria

**Acceptance criteria** — verifiable at merge time; these gate this spec's
implementation:

| Criterion | Verification |
| --- | --- |
| The "Run tests" gate executes the gate set under `node --test`, not `bun test`. | The `Publish: Package` workflow's "Run tests" step log shows the `node --test` runner ran the gate set and the `bun test` path did not. |
| `node --test` runs the gate set green. | A `node --test` run over the gate set exits 0, with 0 `NotImplementedError: describe()…` and 0 `ERR_UNSUPPORTED_ESM_URL_SCHEME: protocol 'bun:'`. |
| No file in the gate set has a `bun:test` import statement. | A search for `bun:test` **import statements** (not string mentions) across the gate set returns zero. |
| The swept files still pass under `bun test` locally. | A `bun test` run over the converged files exits 0. |
| Local/PR test runs still use `bun test`. | The local/PR test command resolves to `bun test`. |
| A guard fails CI when a new `bun:test` import is added to the gated surface. | The guard fails on an introduced `bun:test` import and passes on a clean tree. |

**Outcome criterion (go-see)** — the durable target, measured on the live gate
*after* merge; tracked on experiment #1738, not a merge gate:

| Criterion | Verification |
| --- | --- |
| First-attempt shim-class (bun#5090 / describe-in-test) failures on the gate = 0, sustained. | `Publish: Package` run history shows 0 such failures across publish cycles after merge. Initial go-see window: the first 2 cycles (confirms no immediate regression); the **durable target is 0 over 20 consecutive cycles** per the obstacle's target condition. |

## Path to approval

This spec reopens spec 0650's runner decision; settling it is an
owner-decision. Approval is human-only: the spec advances when `wiki/STATUS.md`
shows the `2020` row at `spec approved`, written from a trusted human signal
(`spec:approved` label, APPROVED review, approval comment, or in-session
approval). The `spec:approved` signal is the owner-decision that settles 0650's
reopened question; until then the runner strategy remains proposed, not settled.
On approval, the spec proceeds to `kata-design` (WHICH/WHERE — gate workflow
wiring, sweep mechanics, the re-divergence guard) and then `kata-plan`.

— Staff Engineer 🛠️
