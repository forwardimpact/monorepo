# Plan 2130-a Part 03 — Layer 2 (distribution): sibling action + workflow, migration, skill, docs

Composes the Part 01/02 CLI surfaces into cross-machine sharding, per
[design 2130-a § Layer 2](design-a.md#layer-2--sharding-and-distribution-playwright-inspired)
and § `fit-bootstrap` and the matrix. **Depends on Parts 01 and 02** — the
`--concurrency`, `--shard`, and recursive-`report` surfaces must be merged and
green first. Spans the `forwardimpact/fit-benchmark` sibling, `.github/`,
`.claude/skills/`, and `websites/`.

Libraries used: none (CI + docs).

## Sibling-edit mechanics (how Steps 1–3 land)

The composite action and reusable workflow live in the
`forwardimpact/fit-benchmark` sibling repo. Per
[`.github/CLAUDE.md`](../../.github/CLAUDE.md), the environment's `GH_TOKEN` +
`gh` CLI carry **content read/write**, so these edits are made directly against
the sibling — not delegated:

1. Edit the sibling on a branch and merge to its `main` through the sibling's
   branch protection (`gh` API / a PR on the sibling).
2. **Tag the interface before the consumer uses it** — cut an **append-only**
   `v1.0.x` patch tag on the sibling release commit (`gh release`/`git tag`;
   tags are content-level, no admin write). Never move `v1` — it is advisory for
   external consumers only.
3. Consume in the monorepo by **SHA-pinning** the new tag's commit on the
   `uses:` line with a `# v1` marker (Step 5). Dependabot's weekly sweep would
   also open this bump; doing it inline keeps the migration atomic.

Token scope is content-level only: if any step needs admin write (e.g. changing
sibling branch-protection), stop and route to `security-engineer` — do not widen
the standing token.

## Step 1 — Composite action gains `mode` + shard inputs (sibling)

One action, two operations, no legacy path.

- **Sibling:** `forwardimpact/fit-benchmark/action.yml` (+ its action script)

Add inputs: `concurrency`, `shard-index`, `shard-total`, `mode` (`run`|`merge`,
default `run`). `mode: run` executes one shard —
`fit-benchmark run --concurrency=<c> --shard=<shard-index>/<shard-total>` — and
uploads a **shard-scoped** artifact `benchmark-shard-<shard-index>` (the shard
index plays the `case:` disambiguation role from `.github/CLAUDE.md`).
`mode: merge` runs `fit-benchmark report` over the downloaded shard artifacts
and writes the step summary + combined artifact. An unsharded run is the
identity `shard-index: 1, shard-total: 1`. `IS_SANDBOX=1` stays on the `run`
agent step; `merge` spawns no agent. Existing inputs (`summary`,
`upload-results`, `artifact-name`, `timeout-minutes`, `k`, `format`) are
preserved.

Verification (sibling CI): action smoke for `mode: run --shard=1/2` produces
`benchmark-shard-1`; `mode: merge` over two shard artifacts emits one report.

## Step 2 — Reusable workflow `benchmark.yml` (sibling)

A `workflow_call` workflow owns the matrix a step-level action cannot.

- **Sibling (new):**
  `forwardimpact/fit-benchmark/.github/workflows/benchmark.yml`

Topology: a `prepare` job emits `[1..N]` as JSON from the `shard-total` input; a
`shard` matrix job (`matrix: fromJSON(needs.prepare.outputs.shards)`) runs
`fit-bootstrap@<sha>` (full env) then the action `mode: run
--shard=<i>/<shard-total>`, uploading `benchmark-shard-<i>`; a `merge` job
(`needs: shard`) uses **minimal `setup-node` only — no `fit-bootstrap`**,
downloads `benchmark-shard-*`, and runs the action `mode: merge`. Inputs mirror
the action plus `shard-total`; `ANTHROPIC_API_KEY` is a `secret`. The internal
`fit-bootstrap@<sha>` pin is the sibling's own (a sibling's internal `uses:` is
governed by the sibling per `.github/CLAUDE.md`). External consumers reference
`@v1`; the monorepo SHA-pins it (Step 5).

Verification (sibling CI): a `shard-total=3` dispatch produces 3 shard jobs + 1
merge job; the merge downloads all 3 artifacts and emits one combined report.

## Step 3 — Confirm (or harden) `fit-bootstrap` parallel-safety (sibling)

`benchmark.yml` runs `fit-bootstrap` in `N` concurrent shard jobs, so it must be
shard-independent.

- **Sibling:** `forwardimpact/fit-bootstrap` (read; edit only if unsafe)

Read-only confirmation against the live `fit-bootstrap`: cache keys are
read-only/shard-stable (no per-run cache *writes* that collide) and `N`
concurrent wiki-checkout token mints are tolerated. If already safe, no edit is
needed — record the confirmation and proceed.

If a collision exists (e.g. a shared cache-write key), **do not edit
`fit-bootstrap` inline.** Spec § Path to approval (spec.md:207-210) reserves
cross-sibling `fit-bootstrap` changes for coordination "with the owners of those
siblings." Route the fix to its owner; it lands as that sibling's own
append-only patch tag, then the ordered sub-sequence is: (1) tag fit-bootstrap,
(2) bump `benchmark.yml`'s internal `fit-bootstrap@<sha>` pin (Step 2), (3) tag
fit-benchmark (Step 4). This dependency gates Step 4 only when a fix is needed.

Verification: a `shard-total=3` dispatch shows three independent bootstrap
setups with no cache-write contention or token-mint failure in the job logs.

## Step 4 — Tag the sibling and pin it

Make the new interface consumable.

- **Sibling:** the next append-only `v1.0.N` patch tag on the fit-benchmark
  release commit (after Steps 1–3 merge to its `main`).

Resolve the concrete version: list existing `v1.0.*` tags on the sibling and cut
`N+1` (do **not** use a literal `v1.0.x`). Record the new tag's commit SHA for
Step 5. Do this **before** Step 5 references it (interface tagged before the
consumer). Do not touch the `v1` tag — it is human-only and moving it is never
how a change reaches the monorepo (`.github/CLAUDE.md`).

Verification: `gh api repos/forwardimpact/fit-benchmark/git/refs/tags/v1.0.<N>`
resolves to the release commit, and that commit is **reachable from the
sibling's `main`** (the append-only-tag check — *not* the `v1`-descendant
relation, which is the separate human-only `v1`-move check).

## Step 5 — Migrate `eval-kata.yml` to the reusable workflow

The monorepo's own eval calls the reusable workflow; its bespoke single-job
invocation is deleted, not kept alongside.

- **Modified:** `.github/workflows/eval-kata.yml`

Replace the `benchmark` job's `steps:` (checkout + `fit-bootstrap` +
`fit-benchmark` action) with a job-level
`uses: forwardimpact/fit-benchmark/.github/workflows/benchmark.yml@<sha>` (the
Step 4 SHA, `# v1` marker), passing `with:` (family, runs, max-turns,
judge-profile, `shard-total`, optional `concurrency` — the design's input list,
design-a.md:141-142) and `secrets: { ANTHROPIC_API_KEY }`. The `filesystem`
work-tracker is **not** a new workflow input (the design's input list omits it);
set it as the job's `env:` (the reusable workflow's env contract), matching how
`eval-kata.yml` carries it today. Drop the `timeout-minutes: "360"` workaround —
sharding, not a raised ceiling, is the fix. **Refresh the stale `env:`/budget
comment** (eval-kata.yml:18-36) which still says "runs:5 × 4 tasks": the family
is 6 tasks and the cancellation narrative is superseded — replace it with a
one-line pointer to the reusable-workflow fan-out.

The inline SHA pin makes the next Dependabot SHA-bump PR for this `uses:` a
no-op against the same target; let it close itself or close it manually — do not
leave it dangling. `.github/CLAUDE.md` needs **no enumeration edit**: the
`enum:sibling-composite-actions:count` (`Five`) is unchanged — `fit-benchmark`
is still one sibling, now also shipping a reusable workflow. Confirm only that
the `# v1` SHA-pin note still describes the new job-level `uses:` line.

Verification: `actionlint` clean; `bunx coaligned` / context checks pass and the
enum markers resolve; a manual `workflow_dispatch` fans out the configured
shards and finishes with a verdict (the outcome go-see in spec § Success
criteria).

## Step 6 — Update the `fit-benchmark` skill (action + workflow)

Keep the published skill's CI coverage current with the new surfaces.

- **Modified:** `.claude/skills/fit-benchmark/SKILL.md`

Extend the existing `## GitHub Action` section: note the new action inputs
(`concurrency`, `shard-index`, `shard-total`, `mode`), and add a short
**reusable-workflow** snippet showing cross-machine sharding from one input:

```yaml
jobs:
  benchmark:
    uses: forwardimpact/fit-benchmark/.github/workflows/benchmark.yml@v1
    with:
      family: ./benchmarks/my-family
      shard-total: 4
    secrets:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

Keep it brief and generic per `.claude/skills/CLAUDE.md` (no monorepo paths;
`@v1` form is allowed; one or two lines on the fan-out → merge model and that
`report --input` merges shard ledgers recursively). This edits the prose body
only, not the `## Documentation` list, so the `benchmark-parity.test.js`
documentation-parity gate is unaffected (it checks only the Documentation
list ↔ CLI `documentation` array). The skill-genericity invariant does not gate
`fit-*` skills, so the only mechanical gate here is parity — leave it untouched.

Verification: `benchmark-parity.test.js` green; the snippet uses only
externally-valid references.

## Step 7 — Documentation (technical-writer)

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

Both target guides already exist (and are already listed in SKILL.md's
`## Documentation` and `benchmark-definition.js`), so this updates existing
pages — no new slug, no parity change. Keep the same two `## Documentation`
entries.

Verification: `fit-doc` build clean; links resolve; `benchmark-parity.test.js`
green.

## Execution within Part 03

Steps 1–4 are sibling-side and sequential (action + workflow + bootstrap check →
tag). Step 5 (eval-kata migration) consumes the Step 4 tag. Steps 6–7 (skill +
docs) depend only on the finished input/flag surface and can run in parallel
with 5 — route Step 7 to `technical-writer`, Steps 1–6 to an engineering agent.
