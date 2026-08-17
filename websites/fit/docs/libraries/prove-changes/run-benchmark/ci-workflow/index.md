---
title: Automate with GitHub Actions
description: Run gemba-benchmark in CI with the forwardimpact/gemba-benchmark composite action. You get step summaries, artifact upload, and PR-triggered benchmarks.
---

You have a task family that works locally. Now you want benchmarks to run
automatically. They can run on pull requests that touch your skills, on a
weekly schedule, or on demand. The `forwardimpact/gemba-benchmark` GitHub Action
wraps the CLI. It adds step summaries and artifact upload. It also handles
timeout control.

## Prerequisites

- A task family (see
  [Run a Benchmark](/docs/libraries/prove-changes/run-benchmark/))
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
      - uses: forwardimpact/gemba-benchmark@v1
        with:
          family: ./benchmarks/my-family
          runs: "5"
          judge-profile: judge
```

The action handles everything after checkout. It installs dependencies. It
runs each task N times. It appends the pass@k report to the GitHub step
summary. It uploads `results.jsonl` as a workflow artifact.

## What the Action Does

1. **Install apm** — downloads and caches the apm binary if it is not already
   present.
2. **Resolve CLI** — uses a local `gemba-benchmark` if one is available. Falls
   back to `bunx`, then `npx`.
3. **Run** — executes `gemba-benchmark run` with the provided inputs.
4. **Report** — appends the text report to `GITHUB_STEP_SUMMARY` (when
   `summary` is `"true"`). Set `summary-detail` to `"compact"` for a short
   status + pass@k summary instead of the full per-task detail.
5. **Upload** — uploads `results.jsonl` as a workflow artifact (when
   `upload-results` is `"true"`).

## Inputs

The action exposes all `gemba-benchmark run` CLI flags as action inputs. It
also adds CI-specific inputs that have no CLI equivalent:

| Input | Default | Description |
| --- | --- | --- |
| `family` | *(required)* | Path or git URL to a task family |
| `output` | `"benchmark-runs"` | Run-output directory |
| `runs` | `"5"` | Runs per task |
| `agent-model` | *(CLI default)* | Claude model for the agent-under-test. Empty falls through to the `gemba-benchmark` CLI default |
| `lead-model` | *(CLI default)* | Claude model for the lead role. Empty falls through to the `gemba-benchmark` CLI default |
| `judge-model` | *(CLI default)* | Claude model for the judge. Empty falls through to the `gemba-benchmark` CLI default |
| `agent-profile` | | Agent-under-test profile name |
| `judge-profile` | | Judge profile name |
| `max-turns` | `"50"` | Agent turn budget (`0` = unlimited) |
| `allowed-tools` | `"Bash,Read,Glob,Grep,Write,Edit,Agent,TodoWrite"` | Agent tool allowlist |
| `concurrency` | *(CLI default)* | Max cells run concurrently in-process. Empty uses the CPU-aware CLI default (on by default) |
| `shard-index` | `"1"` | 1-based shard index (run mode) |
| `shard-total` | `"1"` | Total shard count. `"1"` runs the whole family |
| `mode` | `"run"` | `run` executes one shard. `merge` aggregates every shard's partial ledger |
| `merge-input` | `"benchmark-merge"` | Directory that shard ledgers download into (merge mode) |
| `k` | `"1,3,5"` | Comma-separated k values for pass@k |
| `format` | `"text"` | Report output format |
| `summary` | `"true"` | Append report to `GITHUB_STEP_SUMMARY` |
| `summary-detail` | `"full"` | Run-mode summary verbosity (`full` or `compact`). `compact` renders status + pass@k only |
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
      - uses: forwardimpact/gemba-benchmark@v1
        with:
          family: ./benchmarks/my-family
          runs: "5"
```

The harness reads the task's `.env.local` for var names. It resolves each name
from `process.env`, where the GitHub secrets live. It then renders the file
into the agent's working directory. You need no `prepare.sh`. You stage
nothing by hand.

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

Each run invokes Claude for the agent-under-test, for invariants, and for the
judge. Control cost with:

- **`runs`** — fewer runs means lower cost but weaker statistical signal.
  Five runs is a reasonable floor for pass@k.
- **`max-turns`** — caps agent turns per run. Tasks that finish fast rarely
  need more than 25.
- **`timeout-minutes`** — hard cancellation. The default is 60. Adjust it to
  the family size.
- **PR path filters** — only run when relevant files change.

## Matrix Workflows

When you run benchmarks across multiple families in a matrix, use
`artifact-name` to avoid upload collisions:

```yaml
strategy:
  matrix:
    family:
      - { path: "./benchmarks/kata-skills", name: "kata" }
      - { path: "./benchmarks/fit-skills", name: "fit" }
steps:
  - uses: forwardimpact/gemba-benchmark@v1
    with:
      family: ${{ matrix.family.path }}
      artifact-name: benchmark-${{ matrix.family.name }}
```

## Scale One Family Across Machines

A single machine has a CPU and a per-job time ceiling. One family can be too
large to finish in one job. The run then hits the timeout. Fan it across
machines with the bundled reusable workflow. A single `shard-total` input runs
a deterministic, balanced subset of the cells on each machine. It merges the
partial ledgers into one pass@k:

```yaml
jobs:
  benchmark:
    uses: forwardimpact/gemba-benchmark/.github/workflows/benchmark.yml@v1
    with:
      family: ./benchmarks/my-family
      runs: "5"
      shard-total: 4
    secrets:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

The workflow runs three stages. A `prepare` job emits the shard list. Four
parallel `shard` jobs each run their slice with in-process concurrency and
upload a `benchmark-shard-<i>` partial ledger. A dependent `merge` job
aggregates the combined report. The merge job carries **no agent scaffold**.
It provisions only the report CLI, because `report --input` discovers and
unions every shard's `results.jsonl` recursively. Effective parallelism is
`shard-total` × the per-machine concurrency. If you leave `shard-total` unset,
the whole family runs in one shard job. That is the identity case.

Each shard job emits a compact summary (status + pass@k). So a many-shard run
stays quick to scan. The merge job emits the single full report over the
combined ledger.

## Verify

After the workflow runs, confirm:

1. The step summary shows a pass@k table.
2. You can download the `benchmark-results` artifact from the workflow run.
3. The exit code reflects the aggregate verdict. It is `0` when all tasks
   pass and `1` otherwise.

## What's Next

<div class="grid">

<!-- part:card:.. -->
<!-- part:card:../../run-eval -->
<!-- part:card:../../trace-analysis -->

</div>
