# FIT Benchmark

Run coding-agent benchmarks with the
[gemba-benchmark](https://www.npmjs.com/package/@forwardimpact/gemba) CLI. The
action runs a task family, reports pass@k, and uploads the result artifact.

## Usage

```yaml
- uses: forwardimpact/gemba-benchmark@v1
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
- `@forwardimpact/gemba` installed (with `npm install` or in a Bun workspace)
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
| `concurrency`      | No       | —                  | Max cells run concurrently in-process. An empty value uses the CPU-aware CLI default, which is on by default |
| `shard-index`      | No       | `1`                | 1-based shard index (run mode)            |
| `shard-total`      | No       | `1`                | Total shard count. `1` runs the whole family |
| `mode`             | No       | `run`              | `run` executes one shard. `merge` aggregates every shard's partial ledger |
| `merge-input`      | No       | `benchmark-merge`  | Directory that shard ledgers download into (merge mode) |
| `summary`          | No       | `true`             | Append the report to GITHUB_STEP_SUMMARY  |
| `summary-detail`   | No       | `full`             | Run-mode summary verbosity (`full` or `compact`). `compact` renders status + pass@k only. Merge always renders full. |
| `upload-results`   | No       | `true`             | Upload results.jsonl as an artifact       |
| `artifact-name`    | No       | `benchmark-results`| Name for the uploaded artifact. Run mode with `shard-total` > 1 uploads `benchmark-shard-<i>` |
| `timeout-minutes`  | No       | `60`               | Max runtime for the run step (minutes)    |

## Outputs

| Output         | Description                        |
| -------------- | ---------------------------------- |
| `results-path` | Absolute path to `results.jsonl`   |

## Behaviour

The action executes three steps in sequence:

1. **Run** — invokes `gemba-benchmark run` with the configured inputs. The run
   step streams one JSON line per result to stdout and appends to
   `<output>/results.jsonl`.
2. **Report** — runs `gemba-benchmark report` and appends the output to
   `GITHUB_STEP_SUMMARY`. Fires even when the run step fails (`if: always()`).
   Disable with `summary: "false"`. Set `summary-detail: compact` to emit a short
   status + pass@k summary instead of the full per-task detail.
3. **Upload** — uploads `results.jsonl` as a workflow artifact. Fires even when
   earlier steps fail. Disable with `upload-results: "false"`.

In `mode: merge` the action skips the run and agent steps. It downloads every
`benchmark-shard-*` artifact. It then runs `gemba-benchmark report` recursively
over them. The report emits one combined pass@k summary and a merged
`results.jsonl`.

## Sharding across machines

One machine has a CPU ceiling and a per-job time ceiling. The bundled reusable
workflow fans a family across `shard-total` machines. It merges the partial
ledgers into one pass@k. A single input gives you cross-machine parallelism:

```yaml
jobs:
  benchmark:
    uses: forwardimpact/gemba-benchmark/.github/workflows/benchmark.yml@v1
    with:
      family: ./benchmarks/my-family
      shard-total: 4
    secrets:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

The workflow runs a `prepare` job that emits the shard list. It then runs
`shard-total` parallel `shard` jobs. Each `shard` job runs its slice with
Layer-1 concurrency and uploads `benchmark-shard-<i>`. The workflow also runs
one dependent `merge` job that aggregates the combined report. The `merge` job
has no agent scaffold and runs only the report CLI. If you call the action
directly and leave `shard-total` unset, you get the identity case. The whole
family runs in one job.

Each `shard` job emits a **compact** summary (status + pass@k, no per-task
detail). So a many-shard run is quick to scan. The `merge` job emits the single
**full** report over the combined ledger. A direct, unsharded call keeps the
full summary by default.
