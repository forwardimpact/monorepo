# FIT Benchmark

Run coding-agent benchmarks via the
[gemba-benchmark](https://www.npmjs.com/package/@forwardimpact/gemba) CLI.
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
- `@forwardimpact/gemba` installed (via `npm install` or in a Bun workspace)
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
| `summary-detail`   | No       | `full`             | Run-mode summary verbosity (`full` or `compact`); `compact` renders status + pass@k only. Merge always renders full. |
| `upload-results`   | No       | `true`             | Upload results.jsonl as artifact          |
| `artifact-name`    | No       | `benchmark-results`| Name for the uploaded artifact (run mode with `shard-total` > 1 uploads `benchmark-shard-<i>`). Must not contain `--` (the trace-name delimiter) — the action fails fast otherwise |
| `timeout-minutes`  | No       | `60`               | Max runtime for the run step (minutes)    |
| `trace`            | No       | `true`             | Upload every trace file as a `trace--*` workflow artifact and expose the `trace-dir` output. Gates upload and outputs only — trace capture is unconditional in the runner (cost derivation and the judge depend on it). Deliberate asymmetry with the harness action's same-named input, which disables capture |

## Outputs

| Output         | Description                        |
| -------------- | ---------------------------------- |
| `results-path` | Absolute path to `results.jsonl`   |
| `trace-dir`    | Absolute path of `<output>/runs`; every trace file of the run sits beneath it at `<taskId>/<runIndex>/trace--*`. Empty when `trace` is disabled |

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
4. **Upload traces** — uploads every per-cell trace file as one `trace--*`
   workflow artifact. Fires even when earlier steps fail (`if: always()`), so
   failed and timed-out cells keep their evidence. Disable with
   `trace: "false"`.

In `mode: merge` the action skips the run/agent steps, downloads every
`benchmark-shard-*` artifact, and runs `gemba-benchmark report` recursively over
them to emit one combined pass@k summary plus a merged `results.jsonl`.

## Trace artifacts

Every run preserves, per cell under `runs/<taskId>/<runIndex>/`, the raw
combined envelope trace (`trace--<case>.raw.ndjson`), the agent and supervisor
lanes (`trace--<case>--<participant>.<role>.ndjson`), and a judge lane on
judged cells, where `<case>` is `<taskId>-r<runIndex>`. The upload step
archives them as `trace--<artifact-name>` (unsharded) or
`trace--<artifact-name>-shard-<shard-index>` (sharded) — collision-safe across
shards and matrix callers. A `trace-manifest.txt` anchor written before the
run pins the archive root at `<output>`, so extracted members land at
`runs/<taskId>/<runIndex>/trace--*` — exactly the run-output-relative paths
each result record carries.

Download and analyze with the `gemba-trace` CLI, the same flow used for any
other agent run:

```sh
npx gemba-trace runs                    # eval runs list by default
npx gemba-trace find <run-id> <key>     # key: exact filename, case, or participant
npx gemba-trace download <run-id> --artifact trace--benchmark-results
npx gemba-trace overview --file 'runs/<taskId>/<runIndex>/trace--*--agent.agent.ndjson'
```

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

Each `shard` job emits a **compact** summary (status + pass@k, no per-task
detail), so a many-shard run is quick to scan; the `merge` job emits the single
**full** report over the combined ledger. Calling the action directly (unsharded)
keeps the full summary by default.
