# Plan 2270-a — Part 04: Documentation

Every surface that documents benchmark output states the eval trace
contract: what a run preserves, the artifact shape, and the
download-then-analyze flow (spec requirement 12). Runs after parts 01–03
(documents their contracts). External-audience rules apply: fully
qualified URLs, `npm`/`npx` only, no monorepo-relative paths.

## Step 1 — gemba-benchmark skill

Files: modified `.claude/skills/gemba-benchmark/SKILL.md`.

- `{{AGENT_TRACE_PATH}}` row: `agent.ndjson` → "the cell's
  `trace--<case>--agent.agent.ndjson` lane".
- Trace section (extend the existing "Each run produces … NDJSON traces"
  paragraph): per cell under `runs/<taskId>/<runIndex>/`, a run preserves
  `trace--<case>.raw.ndjson` (combined, enveloped), agent and supervisor
  lanes, and a judge lane on judged cells, where `<case>` is
  `<taskId>-r<runIndex>`; the action uploads them as `trace--*` workflow
  artifacts (kept on failed/timed-out cells); analyze with `gemba-trace`
  with no benchmark-specific flags.

Verification: `bun run context` (jidoka instruction checks) green.

## Step 2 — gemba-trace skill

Files: modified `.claude/skills/gemba-trace/SKILL.md`.

- `runs` default-pattern mention → `kata|agent|eval|benchmark`; note eval
  runs list by default.
- Download-traces bullet: `find <run-id> <key>` resolves a lane by exact
  filename, case, or participant; an ambiguous key errors with the
  candidates; eval flow is the same `runs` → `download` shape as kata
  runs.

Verification: `bun run context` green.

## Step 3 — Prove Agent Changes: run-benchmark guide

Files: modified
`websites/fit/docs/libraries/prove-changes/run-benchmark/index.md`.

- `{{AGENT_TRACE_PATH}}` table row (line ~223): "Absolute path to
  `agent.ndjson`" → the convention-named agent lane.
- Output-layout prose ("absolute paths to both NDJSON traces"): records
  carry run-output-relative paths; add the per-cell file table from
  design § File naming (raw, agent lane, supervisor lane, judge lane) and
  a short "Traces as artifacts" subsection: the action's `trace` input,
  `trace-dir` output, `trace--*` artifact per shard, and the
  download-then-analyze flow.

Verification: `bun run check` (markdown) green.

## Step 4 — Prove Agent Changes: run-eval guide

Files: modified
`websites/fit/docs/libraries/prove-changes/run-eval/index.md`.

- Add a benchmark-driven-eval subsection: a workflow calling the reusable
  benchmark workflow mints `trace--*` artifacts on every shard with no
  caller-side steps; state what each cell preserves and point the
  analysis flow at the trace-analysis guide. The existing harness-driven
  single-eval example (manual split + upload) stays — it already follows
  the shared convention.

Verification: `bun run check` green.

## Step 5 — Prove Agent Changes: trace-analysis guide

Files: modified
`websites/fit/docs/libraries/prove-changes/trace-analysis/index.md`.

- Eval traces paragraph: benchmark cells emit the same
  `trace--<case>--<participant>.<role>.ndjson` convention with case
  `<taskId>-r<runIndex>`; the judge lane is `--judge.judge.ndjson`; raw
  and judge files are enveloped streams, split lanes unwrapped — every
  file-consuming verb takes them as-is.
- `download` auto-convert note (line ~28): `structured.json` is produced
  only when the artifact carries exactly one `.ndjson` member;
  multi-member bundles (kata dispatch, eval shards) skip it.
- `find` example/description: key may be a participant, case, or exact
  filename; ambiguous keys error with candidates.

Verification: `bun run check` green; criterion-11 sweep from
[plan-a.md](plan-a.md) still clean (docs carry no bare per-cell
filenames).
