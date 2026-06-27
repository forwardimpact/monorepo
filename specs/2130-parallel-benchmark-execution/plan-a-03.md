# Plan 2130-a Part 03 — Layer 2 (distribution): action, reusable workflow, migration, docs

Composes the Part 01/02 CLI surfaces into cross-machine sharding, per
[design 2130-a § Layer 2](design-a.md#layer-2--sharding-and-distribution-playwright-inspired)
and § `fit-bootstrap` and the matrix. **Depends on Parts 01 and 02** — the
`--concurrency`, `--shard`, and recursive-`report` surfaces must be merged and
green first. Spans the `forwardimpact/fit-benchmark` sibling, `.github/`, and
`websites/`.

Libraries used: none (CI + docs).

## Cross-sibling coordination (precondition)

The composite action and the reusable workflow live in the
`forwardimpact/fit-benchmark` **sibling repo**, not this tree. The new
`fit-benchmark → fit-bootstrap` `uses:` edge and the `fit-bootstrap`
parallel-safety requirement touch shared CI governed by
[`.github/CLAUDE.md`](../../.github/CLAUDE.md). Per
[spec § Path to approval](spec.md): coordinate with the sibling owners, land the
sibling changes as **append-only patch tags**, and consume them here via a
SHA-pinned `uses:` bumped through Dependabot — `v1` is never moved to deliver
this. Steps 1–2 below state the required sibling interface; Steps 3–5 are the
monorepo-side changes that consume it.

## Step 1 — Composite action gains `mode` + shard inputs (sibling)

One action, two operations, no legacy path.

- **Sibling:** `forwardimpact/fit-benchmark/action.yml` (+ its action script)

Add inputs: `concurrency`, `shard-index`, `shard-total`, `mode` (`run`|`merge`,
default `run`). `mode: run` executes one shard —
`fit-benchmark run --concurrency=<c> --shard=<shard-index>/<shard-total>` — and
uploads a **shard-scoped** artifact `benchmark-shard-<shard-index>` (the shard
index plays the `case:` disambiguation role from `.github/CLAUDE.md`). `mode:
merge` runs `fit-benchmark report` over the downloaded shard artifacts and writes
the step summary + combined artifact. An unsharded run is the identity
`shard-index: 1, shard-total: 1`. `IS_SANDBOX=1` stays on the `run` agent step;
`merge` spawns no agent.

Verification (sibling CI): action smoke for `mode: run --shard=1/2` produces
`benchmark-shard-1`; `mode: merge` over two shard artifacts emits one report.

## Step 2 — Reusable workflow `benchmark.yml` (sibling)

A `workflow_call` workflow owns the matrix a step-level action cannot.

- **Sibling (new):** `forwardimpact/fit-benchmark/.github/workflows/benchmark.yml`

Topology: a `prepare` job emits `[1..N]` as JSON from the `shard-total` input; a
`shard` matrix job (`matrix: fromJSON(needs.prepare.outputs.shards)`) runs
`fit-bootstrap@<sha>` (full env) then the action `mode: run
--shard=<i>/<shard-total>`, uploading `benchmark-shard-<i>`; a `merge` job
(`needs: shard`) uses **minimal `setup-node` only — no `fit-bootstrap`**,
downloads `benchmark-shard-*`, and runs the action `mode: merge`. Inputs mirror
the action plus `shard-total`; `ANTHROPIC_API_KEY` is a `secret`. External
consumers reference `@v1`; the monorepo SHA-pins it (Step 3).

`fit-bootstrap` parallel-safety (coordinated with its owner): cache keys are
shard-independent (reads only) and `N` concurrent wiki-token mints are
tolerated — confirmed before `eval-kata.yml` migrates.

Verification (sibling CI): a `shard-total=3` dispatch produces 3 shard jobs + 1
merge job; the merge downloads all 3 artifacts and emits one combined report.

## Step 3 — Migrate `eval-kata.yml` to the reusable workflow

The monorepo's own eval calls the reusable workflow; its bespoke single-job
invocation is deleted, not kept alongside.

- **Modified:** `.github/workflows/eval-kata.yml`

Replace the `benchmark` job's `steps:` (checkout + `fit-bootstrap` +
`fit-benchmark` action) with a job-level
`uses: forwardimpact/fit-benchmark/.github/workflows/benchmark.yml@<sha>` (SHA
of the patch-tagged sibling release, `# v1` marker), passing `with:` (family,
runs, max-turns, judge-profile, `shard-total`, optional `concurrency`) and
`secrets: { ANTHROPIC_API_KEY }`. Carry the `filesystem` work-tracker as a
workflow input or document it as the reusable workflow's env contract. Drop the
`timeout-minutes: "360"` workaround — sharding, not a raised ceiling, is the
fix. **Refresh the stale `env:`/budget comment** (eval-kata.yml:18-36) which
still says "runs:5 × 4 tasks": the family is 6 tasks, and the cancellation
narrative is superseded by the sharding fix — replace it with a one-line pointer
to the reusable-workflow fan-out.

`.github/CLAUDE.md` needs **no enumeration edit**: the
`enum:sibling-composite-actions` count (`Five`) is unchanged — `fit-benchmark`
is still one sibling, now also shipping a reusable workflow. Confirm only that
the `# v1` SHA-pin note still describes the new job-level `uses:` line.

Verification: `actionlint` clean; `bunx coaligned` / context checks pass and the
enum markers resolve; a manual `workflow_dispatch` fans out the configured
shards and finishes with a verdict (the outcome go-see in spec § Success
criteria).

## Step 4 — Documentation (technical-writer)

Document the two new axes and the reusable-workflow path for external readers.

- **Modified:**
  `websites/fit/docs/libraries/prove-changes/run-benchmark/ci-workflow/index.md`,
  `websites/fit/docs/libraries/prove-changes/run-benchmark/index.md`

- `run-benchmark/index.md`: document `--concurrency` (on by default, the
  resolution order flag > `LIBHARNESS_BENCHMARK_CONCURRENCY` > CPU-aware
  default) and `--shard=<i>/<N>` (per-shard partial ledger; `report --input`
  merges recursively across shard dirs).
- `ci-workflow/index.md`: add the reusable-workflow usage (`uses:
  forwardimpact/fit-benchmark/.github/workflows/benchmark.yml@v1` with
  `shard-total`) alongside the existing single-job action usage; explain the
  fan-out + merge model and that the merge job carries no agent scaffold. Use
  fully-qualified public URLs and `npx`/external phrasing per
  [libraries/CLAUDE.md](../../libraries/CLAUDE.md).

No new doc slug, so the skill↔CLI documentation-parity test
(`benchmark-parity.test.js`) needs no change unless a new `documentation` entry
is added; if one is, mirror it in `benchmark-definition.js` and the
`fit-benchmark` SKILL.md in the same order.

Verification: `fit-doc` build clean; links resolve; parity test green.
