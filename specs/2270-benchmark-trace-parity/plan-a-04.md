# Plan 2270-a — Part 04: Documentation

Every surface that documents benchmark output states the eval trace
contract: what a run preserves, the artifact shape, and the
download-then-analyze flow (spec requirement 12). This part also carries
the documentation consequence of decision 12: `download` stops minting
`structured.json` on every multi-member bundle (kata dispatch, harness
matrix, eval shards), so every documented `structured.json` flow is
rewritten to drive the verbs off the downloaded `.ndjson` members, which
`loadTrace` accepts natively. Runs after parts 01–03 (documents their
contracts). External-audience rules apply: fully qualified URLs,
`npm`/`npx` only, no monorepo-relative paths.

## Step 1 — gemba-benchmark skill

Files: modified `.claude/skills/gemba-benchmark/SKILL.md`.

- `{{AGENT_TRACE_PATH}}` row: `agent.ndjson` → "the cell's
  `trace--<case>--agent.agent.ndjson` lane".
- Extend the existing "Each run produces … NDJSON traces" paragraph with
  the trace contract: per cell under `runs/<taskId>/<runIndex>/`, a run
  preserves `trace--<case>.raw.ndjson` (combined, enveloped), agent and
  supervisor lanes, and a judge lane on judged cells, where `<case>` is
  `<taskId>-r<runIndex>`; the action uploads them as `trace--*` workflow
  artifacts (kept on failed/timed-out cells); analyze with `gemba-trace`
  with no benchmark-specific flags.

Verification: `bun run context` (jidoka instruction checks) green.

## Step 2 — gemba-trace skill

Files: modified `.claude/skills/gemba-trace/SKILL.md`.

- Intro paragraph (lines ~12–15): "turns raw trace artifacts into
  structured JSON and provides a query interface" describes the flow
  decision 12 disables on common bundles — rewrite it around reading
  NDJSON traces directly (structured JSON only for single-member
  artifacts).
- Command reference: add the default `runs` pattern
  (`kata|agent|eval|benchmark` — eval runs list by default) next to the
  existing `runs [pattern]` line, and add `find <run-id> <key>` (resolves
  a lane by exact filename, case, or participant; an ambiguous key errors
  with the candidates). These are additions — the skill currently
  documents neither.
- Rewrite the `download` reference line (line 36) and the Typical
  Workflow (lines ~121–127): `download` extracts the artifact's `.ndjson`
  members (nested per cell for eval artifacts) and the analysis verbs
  take those files directly; `structured.json` appears only when the
  artifact carries a single `.ndjson` member. The current
  `download → structured.json` walkthrough is replaced, not annotated.

Verification: `bun run context` green.

## Step 3 — Prove Agent Changes: run-benchmark guide

Files: modified
`websites/fit/docs/libraries/prove-changes/run-benchmark/index.md`.

- `{{AGENT_TRACE_PATH}}` table row (line ~223): "Absolute path to
  `agent.ndjson`" → the convention-named agent lane.
- Output-layout prose ("absolute paths to both NDJSON traces"): records
  carry run-output-relative paths; add the per-cell file table from
  design § File naming (raw, agent lane, supervisor lane, judge lane) and
  a new "Traces as artifacts" subsection: the action's `trace` input,
  `trace-dir` output, `trace--*` artifact per shard, and the
  download-then-analyze flow.

Verification: `bun run check` (markdown) green.

## Step 4 — Prove Agent Changes: run-eval guide

Files: modified
`websites/fit/docs/libraries/prove-changes/run-eval/index.md`.

- Rewrite the "Read the results" block (lines ~155–166): its
  `download` → `overview/timeline/tool structured.json` flow dies with
  decision 12 (the documented artifact carries three `.ndjson` members —
  raw plus two lanes), so the examples point the verbs at the downloaded
  lane files (`--file trace--default--agent.agent.ndjson`, etc.).
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

- Rework the `download` walkthrough and every worked example that pipes
  `/tmp/trace-<run-id>/structured.json` (the command examples span lines
  ~25–213): `download` yields the artifact's `.ndjson` members and every
  verb consumes them as-is; `structured.json` is produced only when the
  artifact carries exactly one `.ndjson` member. This is a rewrite of the
  guide's primary flow, not a one-line note — after part 01 the file the
  examples reference is no longer produced for dispatch or eval bundles.
- Add an eval-traces paragraph: benchmark cells emit the same
  `trace--<case>--<participant>.<role>.ndjson` convention with case
  `<taskId>-r<runIndex>`; the judge lane is `--judge.judge.ndjson`; raw
  and judge files are enveloped streams, split lanes unwrapped — every
  file-consuming verb takes them as-is.
- Document `find <run-id> <key>` where the guide covers discovery: key
  may be a participant, case, or exact filename; ambiguous keys error
  with candidates (addition — the guide does not cover `find` today).

Verification: `bun run check` green; criterion-11 sweep from
[plan-a.md](plan-a.md) still clean (docs carry no bare per-cell
filenames).

## Step 6 — Internal runbook touch-up

Files: modified
`.claude/skills/kata-product-issue/references/trace-discovery.md`.

- The claim "participant filtering, which the `gemba-trace` CLI does not
  provide directly" (lines ~36–37) becomes false once `find <run-id>
  <key>` ships — update the note to point at `find` with the ambiguity
  error, keeping the `grep` recipe as the multi-match fallback. Internal
  reference, so relative links are fine.

Verification: `bun run context` green.
