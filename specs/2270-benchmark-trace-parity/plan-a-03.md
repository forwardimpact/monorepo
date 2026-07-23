# Plan 2270-a — Part 03: Action and reusable workflow

The benchmark action mints `trace--*` artifacts and exposes the trace
contract; the reusable workflow forwards it; an action-contract test
verifies spec criterion 10 on the PR. Design refs:
[design-a.md](design-a.md) § Contracts § Benchmark action surface, Key
Decision 8. No library code; independent of parts 01–02.

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

- Compute the trace artifact name next to the existing results name and
  keep it in a shell variable for the manifest:

  ```bash
  if [ "$SHARD_TOTAL" != "1" ]; then
    TRACE_ARTIFACT="trace--${ARTIFACT_NAME}-shard-${SHARD_INDEX}"
  else
    TRACE_ARTIFACT="trace--${ARTIFACT_NAME}"
  fi
  echo "trace-artifact-name=${TRACE_ARTIFACT}" >> "$GITHUB_OUTPUT"
  ```

- Emit `trace-dir=$(realpath "$OUTPUT_DIR")/runs` when `TRACE_ENABLED` is
  `true`, else `trace-dir=`.
- When `TRACE_ENABLED` is `true`, write the artifact's root anchor
  **before the run** so a timed-out shard's upload still roots at
  `<output>` (decision 8):

  ```bash
  {
    echo "family=$FAMILY"
    echo "shard=${SHARD_INDEX}/${SHARD_TOTAL}"
    echo "artifact=${TRACE_ARTIFACT}"
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

Verification: the action-contract test in step 3.

## Step 2 — Reusable workflow forwards the contract

Files: modified
`products/gemba/actions/benchmark/.github/workflows/benchmark.yml`.

- Add `workflow_call` input `trace` (type `string`, default `"true"`) and
  forward `trace: ${{ inputs.trace }}` in the shard job's benchmark action
  step. No other change — each shard mints its own collision-safe
  artifact, so eval workflows get trace artifacts with no caller-side
  steps.
- Sequencing note (also in [plan-a.md](plan-a.md) § Risks): the shard step
  pins the published `forwardimpact/benchmark@v1.0.8`, so the forwarded
  input is inert until that pin advances to the release carrying this
  change — a post-release step for the release engineer.

Verification: the shard step's `with:` block carries `trace`; `bun run
check` (markdown/format surfaces only — the repo has no workflow linter,
which is why step 3 exists).

## Step 3 — Action-contract test (spec criterion 10)

A test executes the action's shell contract so `trace-dir` and the upload
set verify on the PR, not just post-release.

Files: created `products/gemba/test/benchmark-action-contract.test.js`;
modified `products/gemba/package.json` (add `yaml` to `devDependencies`).

The test parses `products/gemba/actions/benchmark/action.yml` with `yaml`
and:

- asserts the `trace-dir` output wires to
  `steps.resolve-paths.outputs.trace-dir`, and the `Upload traces` step's
  `if:` gates on `always()`, run mode, and `inputs.trace`, with the
  exact-depth `runs/*/*/trace--*.ndjson` + `trace-manifest.txt` path set;
- extracts the `Resolve paths` step's `run` script and executes it with
  `bash` in a temp dir (env: `OUTPUT_DIR`, `SHARD_INDEX`, `SHARD_TOTAL`,
  `ARTIFACT_NAME`, `TRACE_ENABLED`, `FAMILY`, `GITHUB_OUTPUT` → temp
  file), asserting: `trace-dir` equals `<output>/runs` (absolute) when
  enabled and empty when disabled; `trace-artifact-name` is
  `trace--<name>` unsharded and `trace--<name>-shard-<i>` sharded; an
  `artifact-name` containing `--` exits non-zero; the manifest lands at
  `<output>/trace-manifest.txt` with the family/shard/artifact lines;
- seeds `<output>/runs/x/0/trace--x-r0--agent.agent.ndjson` plus a decoy
  `<output>/runs/x/0/cwd/trace--planted.raw.ndjson`, then asserts the
  upload glob (via `fs.globSync` with the same pattern) matches the
  convention file beneath the emitted `trace-dir` and not the decoy —
  the criterion-10 "read the output and list convention-named files
  beneath it" assertion.

Verification: `cd products/gemba && bun test
test/benchmark-action-contract.test.js`.

## Step 4 — Action READMEs state the contract

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
