# Plan 2270-a — Part 03: Action and reusable workflow

The benchmark action mints `trace--*` artifacts and exposes the trace
contract; the reusable workflow forwards it. Design refs:
[design-a.md](design-a.md) § Contracts § Benchmark action surface, Key
Decision 8. No library code; may run in parallel with parts 01–02.

## Step 1 — Benchmark action: trace input, output, upload

Files: modified `products/gemba/actions/benchmark/action.yml`.

Inputs — add:

```yaml
trace:
  description: |
    Upload every trace file as a trace--* workflow artifact and expose the
    trace-dir output (run mode). Capture is unconditional in the runner —
    cost derivation and the judge depend on the traces existing — so
    disabling this skips only the artifact upload and empties the outputs.
    Deliberate asymmetry with the harness action's same-named input, which
    disables capture.
  required: false
  default: "true"
```

Outputs — add:

```yaml
trace-dir:
  description: |
    Absolute path of <output>/runs; every trace file of the run sits
    beneath it at <taskId>/<runIndex>/trace--*. Empty when trace is
    disabled.
  value: ${{ steps.resolve-paths.outputs.trace-dir }}
```

`Resolve paths` step — extend (env gains `TRACE_ENABLED:
${{ inputs.trace }}`, `FAMILY: ${{ inputs.family }}`):

- Fail fast on delimiter breakage before anything else:

  ```bash
  if [[ "$ARTIFACT_NAME" == *--* ]]; then
    echo "::error::artifact-name must not contain '--' (trace-name delimiter)"
    exit 1
  fi
  ```

- Compute the trace artifact name next to the existing results name:
  `trace-artifact-name=trace--${ARTIFACT_NAME}` unsharded,
  `trace--${ARTIFACT_NAME}-shard-${SHARD_INDEX}` when `SHARD_TOTAL != 1`.
- Emit `trace-dir=$(realpath "$OUTPUT_DIR")/runs` when `TRACE_ENABLED` is
  `true`, else `trace-dir=`.
- When `TRACE_ENABLED` is `true`, write the artifact's root anchor
  **before the run** so a timed-out shard's upload still roots at
  `<output>` (decision 8):

  ```bash
  {
    echo "family=$FAMILY"
    echo "shard=${SHARD_INDEX}/${SHARD_TOTAL}"
    echo "artifact=trace-artifact-name value"
  } > "$OUTPUT_DIR/trace-manifest.txt"
  ```

New step after `Upload shard results`:

```yaml
- name: Upload traces
  if: always() && inputs.mode == 'run' && inputs.trace == 'true'
  uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4
  with:
    name: ${{ steps.resolve-paths.outputs.trace-artifact-name }}
    path: |
      ${{ inputs.output }}/runs/*/*/trace--*.ndjson
      ${{ inputs.output }}/trace-manifest.txt
    if-no-files-found: warn
```

The exact-depth glob is deliberate — never `**`, so files an agent plants
inside its `cwd/` cannot enter the evidence. The manifest misses the
`trace--` filename prefix, so member-name matching ignores it. The results
artifact keeps its existing `benchmark-shard-<i>` scheme (pre-existing,
out of scope).

Verification: `bun run check` (workflow lint via repo checks); a
dry-review that the upload set at depth `runs/*/*/` matches the part-02
workdir layout.

## Step 2 — Reusable workflow forwards the contract

Files: modified
`products/gemba/actions/benchmark/.github/workflows/benchmark.yml`.

- Add `workflow_call` input `trace` (type `string`, default `"true"`) and
  forward `trace: ${{ inputs.trace }}` in the shard job's benchmark action
  step. No other change — each shard mints its own collision-safe
  artifact, so eval workflows get trace artifacts with no caller-side
  steps.

Verification: `bun run check`; the shard step's `with:` block carries
`trace`.

## Step 3 — Action READMEs state the contract

Files: modified `products/gemba/actions/benchmark/README.md`,
`products/gemba/actions/harness/README.md`.

- Benchmark README: document the `trace` input (upload/outputs gate only;
  capture unconditional), the `trace-dir` output, the per-shard
  `trace--<artifact-name>[-shard-<i>]` artifact naming, the extracted
  member shape `runs/<taskId>/<runIndex>/trace--*` matching the record's
  relative paths, the `--`-in-`artifact-name` fail-fast, and the
  download-then-analyze flow (`gemba-trace runs` / `find` / `download`).
- Harness README: one short note on the same-named `trace` input
  asymmetry — harness `trace` disables capture; benchmark `trace` only
  gates upload/outputs — mirroring the note added to the benchmark README.

Verification: `bun run check` (markdown lint); both READMEs state the
asymmetry.
