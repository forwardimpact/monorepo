# FIT Benchmark

Run coding-agent benchmarks via the
[fit-benchmark](https://www.npmjs.com/package/@forwardimpact/libharness) CLI.
Handles task-family execution, pass@k reporting, and result artifact upload.

## Usage

```yaml
- uses: forwardimpact/benchmark@v1
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
  with:
    family: ./benchmarks/kata-skills
    runs: "5"
    max-turns: "25"
    judge-profile: judge
```

## Prerequisites

- Node.js 18+ or Bun 1.2+
- `@forwardimpact/libharness` installed (via `npm install` or in a Bun workspace)
- `ANTHROPIC_API_KEY` set as an environment variable

## Inputs

| Input              | Required | Default            | Description                               |
| ------------------ | -------- | ------------------ | ----------------------------------------- |
| `family`           | Yes      | —                  | Path or git URL to a task family          |
| `output`           | No       | `benchmark-runs`   | Run-output directory                      |
| `runs`             | No       | `5`                | Runs per task (integer >= 1)              |
| `agent-model`      | No       | `claude-sonnet-4-6`| Claude model for the agent-under-test     |
| `supervisor-model` | No       | `claude-opus-4-7`  | Claude model for the supervisor           |
| `judge-model`      | No       | `claude-opus-4-7`  | Claude model for the judge                |
| `agent-profile`    | No       | —                  | Agent-under-test profile name             |
| `judge-profile`    | No       | —                  | Judge profile name                        |
| `max-turns`        | No       | `50`               | Agent turn budget (0 = unlimited)         |
| `k`                | No       | `1,3,5`            | Comma-separated k values for pass@k       |
| `format`           | No       | `text`             | Report output format (`json` or `text`)   |
| `concurrency`      | No       | —                  | Max cells run concurrently in-process (empty uses the CPU-aware CLI default, on by default) |
| `shard-index`      | No       | `1`                | 1-based shard index (run mode)            |
| `shard-total`      | No       | `1`                | Total shard count; `1` runs the whole family |
| `mode`             | No       | `run`              | `run` executes one shard; `merge` aggregates every shard's partial ledger |
| `merge-input`      | No       | `benchmark-merge`  | Directory shard ledgers download into (merge mode) |
| `summary`          | No       | `true`             | Append report to GITHUB_STEP_SUMMARY      |
| `upload-results`   | No       | `true`             | Upload results.jsonl as artifact          |
| `artifact-name`    | No       | `benchmark-results`| Name for the uploaded artifact (run mode with `shard-total` > 1 uploads `benchmark-shard-<i>`) |
| `timeout-minutes`  | No       | `60`               | Max runtime for the run step (minutes)    |

## Outputs

| Output         | Description                        |
| -------------- | ---------------------------------- |
| `results-path` | Absolute path to `results.jsonl`   |

## Behaviour

The action executes three steps in sequence:

1. **Run** — invokes `fit-benchmark run` with the configured inputs. The run
   step streams one JSON line per result to stdout and appends to
   `<output>/results.jsonl`.
2. **Report** — runs `fit-benchmark report` and appends the output to
   `GITHUB_STEP_SUMMARY`. Fires even when the run step fails (`if: always()`).
   Disable with `summary: "false"`.
3. **Upload** — uploads `results.jsonl` as a workflow artifact. Fires even when
   earlier steps fail. Disable with `upload-results: "false"`.

In `mode: merge` the action skips the run/agent steps, downloads every
`benchmark-shard-*` artifact, and runs `fit-benchmark report` recursively over
them to emit one combined pass@k summary plus a merged `results.jsonl`.

## Sharding across machines

One machine has a CPU and per-job time ceiling. The bundled reusable workflow
fans a family across `shard-total` machines and merges the partial ledgers into
one pass@k — cross-machine parallelism from a single input:

```yaml
jobs:
  benchmark:
    uses: forwardimpact/benchmark/.github/workflows/benchmark.yml@v1
    with:
      family: ./benchmarks/my-family
      shard-total: 4
    secrets:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

The workflow runs a `prepare` job (emits the shard list), `shard-total` parallel
`shard` jobs (each runs its slice with Layer-1 concurrency and uploads
`benchmark-shard-<i>`), and one dependent `merge` job (no agent scaffold — only
the report CLI) that aggregates the combined report. Calling the action directly
with `shard-total` unset is the identity case: the whole family in one job.
