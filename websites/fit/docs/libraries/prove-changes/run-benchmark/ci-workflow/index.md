---
title: Automate with GitHub Actions
description: Run fit-benchmark in CI with the forwardimpact/fit-benchmark composite action — step summaries, artifact upload, and PR-triggered benchmarks.
---

You have a task family that works locally. Now you want benchmarks to run
automatically — on pull requests that touch your skills, on a weekly schedule,
or on demand. The `forwardimpact/fit-benchmark` GitHub Action wraps the CLI,
adds step summaries and artifact upload, and handles timeout control.

## Prerequisites

- A task family (see [Run a Benchmark](/docs/libraries/prove-changes/run-benchmark/))
- `ANTHROPIC_API_KEY` stored as a repository secret

## Minimal Workflow

```yaml
name: Benchmark

on:
  workflow_dispatch:
  pull_request:
    paths:
      - ".claude/skills/**"
      - "benchmarks/my-family/**"

permissions:
  contents: read

jobs:
  benchmark:
    runs-on: ubuntu-latest
    env:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    steps:
      - uses: actions/checkout@v4
      - uses: forwardimpact/fit-benchmark@v1
        with:
          family: ./benchmarks/my-family
          runs: "5"
          judge-profile: judge
```

The action handles everything after checkout: install dependencies, run each
task N times, append the pass@k report to the GitHub step summary, and upload
`results.jsonl` as a workflow artifact.

## What the Action Does

1. **Install apm** — downloads and caches the apm binary if not already present.
2. **Resolve CLI** — uses a local `fit-benchmark` if available, falls back to
   `bunx`, then `npx`.
3. **Run** — executes `fit-benchmark run` with the provided inputs.
4. **Report** — appends the text report to `GITHUB_STEP_SUMMARY` (when
   `summary` is `"true"`).
5. **Upload** — uploads `results.jsonl` as a workflow artifact (when
   `upload-results` is `"true"`).

## Inputs

All `fit-benchmark run` CLI flags are exposed as action inputs. The action adds
CI-specific inputs that have no CLI equivalent:

| Input | Default | Description |
| --- | --- | --- |
| `family` | *(required)* | Path or git URL to a task family |
| `output` | `"benchmark-runs"` | Run-output directory |
| `runs` | `"5"` | Runs per task |
| `agent-model` | *(CLI default)* | Claude model for the agent-under-test; empty falls through to the `fit-benchmark` CLI default |
| `lead-model` | *(CLI default)* | Claude model for the lead role; empty falls through to the `fit-benchmark` CLI default |
| `judge-model` | *(CLI default)* | Claude model for the judge; empty falls through to the `fit-benchmark` CLI default |
| `agent-profile` | | Agent-under-test profile name |
| `judge-profile` | | Judge profile name |
| `max-turns` | `"50"` | Agent turn budget (`0` = unlimited) |
| `allowed-tools` | `"Bash,Read,Glob,Grep,Write,Edit,Agent,TodoWrite"` | Agent tool allowlist |
| `concurrency` | *(CLI default)* | Max cells run concurrently in-process; empty uses the CPU-aware CLI default (on by default) |
| `shard-index` | `"1"` | 1-based shard index (run mode) |
| `shard-total` | `"1"` | Total shard count; `"1"` runs the whole family |
| `mode` | `"run"` | `run` executes one shard; `merge` aggregates every shard's partial ledger |
| `merge-input` | `"benchmark-merge"` | Directory shard ledgers download into (merge mode) |
| `k` | `"1,3,5"` | Comma-separated k values for pass@k |
| `format` | `"text"` | Report output format |
| `summary` | `"true"` | Append report to `GITHUB_STEP_SUMMARY` |
| `upload-results` | `"true"` | Upload `results.jsonl` as artifact |
| `artifact-name` | `"benchmark-results"` | Name for the uploaded artifact (run mode with `shard-total` > `"1"` uploads `benchmark-shard-<i>`) |
| `timeout-minutes` | `"60"` | Maximum minutes before cancellation |

## Outputs

| Output | Description |
| --- | --- |
| `results-path` | Absolute path to `results.jsonl` |

Use `results-path` in downstream steps to consume or compare results
programmatically.

## Task Secrets

Tasks that declare `.env` or `.env.local` files resolve their variables
from the runner environment. Add the required secrets alongside
`ANTHROPIC_API_KEY`:

```yaml
jobs:
  benchmark:
    runs-on: ubuntu-latest
    env:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      LLMHUB_NONPROD_API_KEY: ${{ secrets.LLMHUB_NONPROD_API_KEY }}
      LLMHUB_PROD_API_KEY: ${{ secrets.LLMHUB_PROD_API_KEY }}
    steps:
      - uses: actions/checkout@v4
      - uses: forwardimpact/fit-benchmark@v1
        with:
          family: ./benchmarks/my-family
          runs: "5"
```

The harness reads the task's `.env.local` for var names, resolves each
from `process.env` (where the GitHub secrets live), and renders the file
into the agent's working directory. No `prepare.sh` or manual staging
needed.

## Scheduled Runs

Add a cron trigger to track outcomes over time:

```yaml
on:
  schedule:
    - cron: "0 6 * * 1"
  workflow_dispatch:
```

Scheduled runs on `main` create a weekly baseline. Compare the latest
`results.jsonl` artifact against a previous week's to detect regressions.

## Cost Control

Each run invokes Claude for the agent-under-test, invariants, and judging. Control
cost with:

- **`runs`** — fewer runs means lower cost but weaker statistical signal.
  Five runs is a reasonable floor for pass@k.
- **`max-turns`** — caps agent turns per run. Tasks that finish fast rarely
  need more than 25.
- **`timeout-minutes`** — hard cancellation. Default is 60; adjust based on
  family size.
- **PR path filters** — only run when relevant files change.

## Matrix Workflows

When running benchmarks across multiple families in a matrix, use
`artifact-name` to avoid upload collisions:

```yaml
strategy:
  matrix:
    family:
      - { path: "./benchmarks/kata-skills", name: "kata" }
      - { path: "./benchmarks/fit-skills", name: "fit" }
steps:
  - uses: forwardimpact/fit-benchmark@v1
    with:
      family: ${{ matrix.family.path }}
      artifact-name: benchmark-${{ matrix.family.name }}
```

## Scale One Family Across Machines

A single machine has a CPU and a per-job time ceiling. When one family is too
large to finish in one job — the run hits the timeout — fan it across machines
with the bundled reusable workflow. A single `shard-total` input runs a
deterministic, balanced subset of the cells on each machine and merges the
partial ledgers into one pass@k:

```yaml
jobs:
  benchmark:
    uses: forwardimpact/fit-benchmark/.github/workflows/benchmark.yml@v1
    with:
      family: ./benchmarks/my-family
      runs: "5"
      shard-total: 4
    secrets:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

The workflow runs three stages: a `prepare` job emits the shard list, four
parallel `shard` jobs each run their slice (with in-process concurrency) and
upload a `benchmark-shard-<i>` partial ledger, and a dependent `merge` job
aggregates the combined report. The merge job carries **no agent scaffold** —
it provisions only the report CLI, since `report --input` discovers and unions
every shard's `results.jsonl` recursively. Effective parallelism is
`shard-total` × the per-machine concurrency. Leaving `shard-total` unset runs
the whole family in one shard job — the identity case.

## Verify

After the workflow runs, confirm:

1. The step summary shows a pass@k table.
2. The `benchmark-results` artifact is downloadable from the workflow run.
3. The exit code reflects the aggregate verdict — `0` when all tasks pass,
   `1` otherwise.

## What's Next

<div class="grid">

<!-- part:card:.. -->
<!-- part:card:../../run-eval -->
<!-- part:card:../../trace-analysis -->

</div>
