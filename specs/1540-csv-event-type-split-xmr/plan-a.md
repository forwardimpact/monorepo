# Plan 1540 — per-agent metrics CSV separates dispatch-boot from shift-work

Spec vocabulary uses `dispatch-boot` / `shift-work` as work-shape labels;
the on-disk `event_type` values are workflow machine names per design § Key
Decisions row 1 (`kata-dispatch`, `kata-shift`, etc.). This plan uses both
where the context demands.

## Approach

Land the new column, runtime, validator, analyzer, and migration in one PR
so `main` never carries the half-migrated state the design forbids (no
schema-version branch, no v1/v2 coexistence). Runtime first; migration
script second; migration commits + script removal third — all in the same
PR. The pre-migration header string (`date,metric,value,unit,run,note`)
becomes a local `PRE_MIGRATION_HEADER` constant inside the migration script
only; the runtime header constant is renamed `EXPECTED_HEADER` → `HEADER`
and carries the seven-column shape. The migration script performs a
two-pass walk: pass 1 classifies every file's branch by dirname-then-header
without writing; pass 2 atomically rewrites only if pass 1 resolved every
file. Outlier onboarding (`kata-product-issue` column split,
`kata-release-engineer-trace-attestation` path relocation) is dirname-keyed
and runs ahead of conformant branches in both passes per design § Outlier
CSVs.

Libraries used: libxmr (constants, csv, analyze, all commands, CLI),
libutil (`isoDate`), libmock (`createMockFs` in tests), libcli (existing
CLI definition surface). `libraries/libwiki/src/block-renderer.js:27`
calls `analyze(csvText)` with one positional argument — Step 3 honours
that call site by defaulting `eventType` inside `analyze()` itself per
design § Data Flow ("the shift-work default propagates because every
downstream caller of `analyze` inherits it").

## Step 0 — PR description and cross-agent concurrence

Before opening the PR (Step 11), draft the description with these
required elements:

- Names PM and RE as affected owners; links design § Outlier CSVs.
- Calls out that no automated writer references the old
  `kata-release-engineer-trace-attestation` path — plan-time
  `rg -l 'kata-release-engineer-trace-attestation' .` returns only this
  spec's own files (verified). The relocate is therefore a path rename;
  any future interactive append from an RE Claude session must use the
  new path. The PR description names this explicitly for RE.
- Adds `@forwardimpact/product-manager` and
  `@forwardimpact/release-engineer` as PR-level requested reviewers;
  PM ack covers the `kata-product-issue` column split + the new
  `wiki/product-manager/exp-41-predicate-resolutions-2026.csv`
  destination; RE ack covers the trace-attestation relocate.

**Concurrence mechanics.** Per
[approval-signals.md § Trust rule and § Writing STATUS](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/references/approval-signals.md),
labels are no longer merge gates — STATUS is. Concurrence on this PR is
recorded as PM and RE each posting either an `APPROVED` `gh pr review`
or an explicit "approve"/"LGTM" PR comment, captured by
`kata-dispatch` and propagated to STATUS. `kata-release-merge` honours
STATUS `plan implemented` (set when impl PR merges) as the canonical
gate; this plan PR's gate is the same as any plan PR — STATUS at `plan
approved` plus clean CI. Cross-agent concurrence is reviewer-side
discipline rather than a separate mechanical block, surfaced via the
PR description's reviewer-request and the requested-reviewers list.

## Step 1 — constants and re-exports

**Files modified.**

- `libraries/libxmr/src/constants.js`
- `libraries/libxmr/src/index.js`
- `scripts/migrate-metrics-to-skill.mjs` (one-line rename
  `EXPECTED_HEADER` → `HEADER`, both at the import line and at the two
  use sites; verified via `rg -n EXPECTED_HEADER scripts/`)

Rename `EXPECTED_HEADER` → `HEADER` (new value
`"date,metric,value,unit,run,note,event_type"`). Add `COLUMNS = ["date",
"metric", "value", "unit", "run", "note", "event_type"]`,
`EVENT_TYPE_COLUMN = "event_type"`, `DEFAULT_SHIFT_TYPE = "kata-shift"`.

In `index.js`: drop the `EXPECTED_HEADER` re-export; add `HEADER`,
`COLUMNS`, `EVENT_TYPE_COLUMN`, `DEFAULT_SHIFT_TYPE`.

**Verification.** `rg -F 'EXPECTED_HEADER' libraries/libxmr/ scripts/`
returns zero hits after this step lands. `rg -F HEADER
libraries/libxmr/src/constants.js | wc -l` returns ≥1.

## Step 2 — `csv.js` carries `event_type` through parse and validate

**Files modified.**

- `libraries/libxmr/src/csv.js`

`parseLine` returns `{ ..., eventType: fields[6] || "" }`. `parseCSV`
delegates unchanged. `validateCSV` compares the first line against the
new `HEADER`; on mismatch, emit a column-diff message of the form
`"header mismatch: expected [<col1>,<col2>,…], got [<col1>,<col2>,…];
extra=[…] missing=[…]"` per design § Components row 2. For each row,
after the existing field checks: if `row.eventType.trim() === ""`, push
`{ line, field: "event_type", message: "missing event_type" }`.
`listMetrics` gains an optional `eventType` filter parameter — when
provided and not `"*"`, filter `rows` to `row.eventType === eventType`
before the existing group-by.

**Design overrule note (spec § SC row 6 second sentence).** Spec SC row
6 second sentence asks the validator to reject `event_type` set to an
unknown string with the same shape of rejection as missing. Design §
Key Decisions row 9 explicitly overrules this: "Accept any non-empty
string" (open-set value semantics from Key Decision row 1). This plan
follows the design — the validator rejects empty only — and surfaces
the residual typo risk via the design's mitigation: storyboard
`analyze` lists distinct `event_type` values seen so a typo shows up
as a one-row slice. Verification of SC row 6 second sentence is
recorded as "intentionally not implemented per design overrule" in the
PR description.

**Verification.** `bun run --filter @forwardimpact/libxmr test
test/csv.test.js`. New fixtures: a 7-column row with
`event_type=kata-shift` parses to `row.eventType === "kata-shift"`; same
row with the field empty fails validation with a `field=event_type`
error.

## Step 3 — `analyze()` defaults and accepts an `event_type` filter

**Files modified.**

- `libraries/libxmr/src/analyze.js`

Change the signature to
`analyze(csvText, { eventType = DEFAULT_SHIFT_TYPE } = {})`. When
`eventType === "*"`, no row-level filter. Otherwise filter `rows` to
`row.eventType === eventType` before the existing `groups` accumulation.

The default in `analyze()` itself (not the command layer) preserves
`libraries/libwiki/src/block-renderer.js:27`'s single-argument call site
without code change in libwiki, matching design § Data Flow's
"propagation" guarantee.

**Verification.** `bun run --filter @forwardimpact/libxmr test
test/analyze.test.js`. New tests: (i) fixture with `kata-dispatch` and
`kata-shift` rows analyzed with `{ eventType: "kata-shift" }` yields
only shift-work values; (ii) same fixture with no argument also yields
only shift-work values (default); (iii) same fixture with
`{ eventType: "*" }` yields both. The single known external caller of
`analyze()` outside libxmr is `libraries/libwiki/src/block-renderer.js:27`
(`analyze(csvText)` — verified one positional arg), so the
default-second-argument signature is a strict superset of today's
call-site shape. A repo sweep `rg -n 'analyze\(' libraries/ products/
services/` confirms no other call surface in this PR's scope.

## Step 4 — `runRecordCommand` resolves `event_type` and appends a 7-field row

**Files modified.**

- `libraries/libxmr/src/commands/record.js`

After `parseRecordOptions`, resolve `eventType` in order:

1. `values["event-type"]`
2. parse `runtime.proc.env.GITHUB_WORKFLOW_REF` —
   `basename(ref.split('@')[0], '.yml')`
3. error envelope `{ ok: false, code: 2, error: "record requires
   --event-type <name> or $GITHUB_WORKFLOW_REF" }`

New-file branch writes `HEADER + "\n"` (not `EXPECTED_HEADER`). Row
array becomes seven fields ending in `eventType`.

**Verification.**
`bun run --filter @forwardimpact/libxmr test test/record.test.js`. New tests:
(i) `--event-type kata-shift` lands as the trailing field; (ii)
`GITHUB_WORKFLOW_REF=owner/repo/.github/workflows/kata-dispatch.yml@refs/heads/main`
yields `event_type=kata-dispatch` with no flag; (iii) neither set returns
`code=2`. Existing tests pass `--event-type=kata-test` explicitly — see Step 9
test fixture migration.

## Step 5 — `validate` command surfaces the new field's errors

**Files modified.**

- `libraries/libxmr/src/commands/validate.js` (no logic change — inherits Step
  2's `validateCSV` extension)

**Verification.** A fixture CSV (added to `test/csv.test.js` in Step 2)
with one row's `event_type` stripped fails `validateCSV` with
`field=event_type` and the correct line number; the command-layer
`formatValidationText` renders it as
`line N [event_type]: missing event_type`.

## Step 6 — read commands accept `--event-type` and name the slice

**Files modified.**

- `libraries/libxmr/src/commands/analyze.js`
- `libraries/libxmr/src/commands/chart.js`
- `libraries/libxmr/src/commands/summarize.js`
- `libraries/libxmr/src/commands/list.js`
- `libraries/libxmr/src/csv.js` (already in Step 2 for `listMetrics`)

Each command reads `eventType = values["event-type"]` and passes
`{ eventType }` to `analyze` (or to `listMetrics`) when the flag is
present; without the flag, the underlying function applies its own
default (`DEFAULT_SHIFT_TYPE`). Each surface output names the slice in
its header line:

- `analyze` / `summarize` text mode: prepend
  `"event_type: <slice>"` above the existing `XmR Analysis —` header.
  JSON mode: top-level `event_type` field on the report object.
- `chart` text mode: prepend `# event_type: <slice>` + blank line above
  the chart body.
- `list` text mode: append `event_type: <slice>` below the
  `formatHeader` line.

`<slice>` is `<name>` when filtering and `"* (all rows)"` when
`--event-type=*`.

**Test-file inventory** (which existing or new file covers each
command):

- `analyze` → existing `test/analyze.test.js`
- `chart` → existing `test/chart.test.js`
- `summarize` → existing `test/summarize.test.js`
- `list` → new `test/list.test.js` (added by Step 6; mirrors the
  shape of the existing `analyze.test.js` for the command layer +
  reuses `test/helpers.js` runtime injection)
- `validate` command-layer rendering → covered indirectly by
  `test/csv.test.js`'s new fixture (Step 2), which validates the
  `field=event_type` error shape that flows through
  `formatValidationText` unchanged

**Verification.** `bun run --filter @forwardimpact/libxmr test`. New
test in each command's named file: fixture with two `event_type`
values; default invocation reports the `kata-shift` slice;
`--event-type kata-dispatch` reports the dispatch slice;
`--event-type=*` reports both. Output header contains the literal
`event_type:` token.

## Step 7 — register `--event-type` on the CLI

**Files modified.**

- `libraries/libxmr/bin/fit-xmr.js`

Add `"event-type": { type: "string", description: "Filter rows by
event_type machine name; use '*' for all rows" }` to the `options`
block of `analyze`, `chart`, `list`, `summarize`. Add `"event-type"`
to `record` with description "Workflow machine name; falls back to
$GITHUB_WORKFLOW_REF basename". Add two new entries to the `examples`
array: `analyze` with `--event-type kata-shift` and `record` with
`--event-type kata-dispatch`.

**Verification.** `node libraries/libxmr/bin/fit-xmr.js analyze --help`
shows the new flag. The four read commands and `record` each accept
the flag.

## Step 8 — migration script

**Files created.**

- `scripts/spec-1540-migrate-to-event-type.mjs`

Shape: `#!/usr/bin/env node`, no workspace imports (mirrors
`scripts/spec-1060-migrate-wiki.mjs`'s self-contained ESM script
convention). Local constants `PRE_MIGRATION_HEADER =
"date,metric,value,unit,run,note"` and `POST_MIGRATION_HEADER =
"date,metric,value,unit,run,note,event_type"`. `parseArgs` accepts
`--dry-run` / `--apply` (exactly one required) and `--wiki-root`
(default `./wiki`). Walks `<wiki-root>/metrics/*/2026.csv` via
`readdirSync`.

**Two-pass design.** Pass 1 reads every file's first line and resolves
each to a branch (see ordered if/else below) without writing. If any
file lands in the reject branch, exit non-zero with the offending path
and header; `main` is untouched. Pass 2 runs only when every file
resolves cleanly: each file is rewritten via write-tmp + rename.

**Branch resolution (ordered, dirname-first).** For each file, in order:

1. **Outlier — relocate.** If `basename(dirname) ===
   "kata-release-engineer-trace-attestation"` → emit a planned
   `renameSync` to `<wiki-root>/release-engineer/trace-attestation-2026.csv`.
   Plan creates the parent directory `<wiki-root>/release-engineer/`
   via `mkdirSync(..., { recursive: true })` before the rename
   (verified at plan-time: the directory does not exist on
   `wiki/main`). Pre-flight rejects if the destination already exists.
   No header rewrite (file does not match either header constant;
   semantic content is unchanged).
2. **Outlier — split.** If `basename(dirname) === "kata-product-issue"`
   → expect 7-column header
   `date,metric,value,unit,run,note,predicate_resolution`; plan
   rewrite of the source file to `HEADER` shape (7 columns ending
   `event_type=kata-product-issue`), and plan creation of
   `<wiki-root>/product-manager/exp-41-predicate-resolutions-2026.csv`
   carrying rows whose `predicate_resolution !== "n/a"` keyed by
   `(date, run)`. Plan creates parent dir
   `<wiki-root>/product-manager/` via `mkdirSync(..., { recursive:
   true })`. Pre-flight rejects if either destination exists.
3. **Conformant — per-agent.** If first line equals
   `PRE_MIGRATION_HEADER` AND `basename(dirname)` does not start with
   `kata-` → plan a row-group classifier: group by `run`; classify the
   group as `kata-dispatch` iff (a) the `duration_seconds` row's `note`
   matches `/^boot-append from Kata: Dispatch/` AND (b) `prs_opened`,
   `commits_pushed`, and `file_writes` rows' `value` are all `0`.
   Otherwise `kata-shift`. Stamp every row of the group with the
   result.
4. **Conformant — kata-skill.** If first line equals
   `PRE_MIGRATION_HEADER` AND `basename(dirname)` starts with `kata-` →
   per-skill default mapping: `kata-dispatch → kata-dispatch`;
   `kata-coaching → kata-coaching`; any other `kata-*` → `kata-shift`.
   Stamp every row.
5. **Idempotent — already migrated.** If first line equals
   `POST_MIGRATION_HEADER` → skip with a one-line notice.
6. **Reject.** Any other header → print path + offending header to
   stderr; pass 1 marks file rejected and exits non-zero after the
   walk.

Rewrites use write-tmp + rename. Print one summary line per file:
`<path> kata-dispatch=<n> kata-shift=<n> other=<n>`. Print a global
summary at exit listing per-file totals and overall row counts.

**Tripwire — staff-engineer classifier sanity.** Spec § Problem says
21 of 435 rows are shift-work today; Exp SE 1432-A surfaced 6 known
dispatch-note rows that are actually shift-work. Expected post-classify
count ≈ 27; raise the tripwire to **60** so the bound clears two
weeks of plausible shift-work growth (about one shift-work run per
weekday) without false-firing. After pass 2, if
`staff-engineer/2026.csv`'s `kata-shift` count exceeds 60, emit a
warning to stderr and continue (non-fatal — bound is a sanity tripwire,
not a contract). The bound and rationale are documented in the script
header, including a pointer to Exp SE 1432-A. The reviewer reads the
per-file summary line printed by the script to verify the count is in
the expected range before commit; the threshold is advisory.

**Pass-2 re-validation.** Pass 2 re-reads each file's first line and
re-runs the branch resolver against the pass-1 plan; mismatch (a wiki
edit landed between passes) aborts before any write. `--dry-run` exits
after pass 1 with the per-file resolution summary. `--apply` runs pass
1 + pass 2; the per-file summary printed by `--apply` matches the
`--dry-run` summary exactly for any file that is rewritten —
divergence aborts non-zero with the offending file and the before/after
header values.

**Verification.** `node scripts/spec-1540-migrate-to-event-type.mjs
--dry-run` on a freshly-pulled wiki workspace exits 0 and prints 16
file summaries (13 conformant kata-skill + 1 conformant per-agent
[`staff-engineer`] + 1 outlier-split [`kata-product-issue`] + 1
outlier-relocate [`kata-release-engineer-trace-attestation`]).

## Step 9 — run migration and remove the script

**Files modified.**

- Every conformant `wiki/metrics/*/2026.csv` (rewritten in place)
- `wiki/metrics/kata-product-issue/2026.csv` (rewritten — split source)

**Files created.**

- `wiki/release-engineer/trace-attestation-2026.csv` (from relocate)
- `wiki/product-manager/exp-41-predicate-resolutions-2026.csv` (from split)

**Files deleted.**

- `wiki/metrics/kata-release-engineer-trace-attestation/2026.csv` (relocated)
- The empty parent directory after the relocate
- `scripts/spec-1540-migrate-to-event-type.mjs`

**Race avoidance.** The monorepo and the wiki are two independent git
repos (`wiki/` is cloned by `bash scripts/wiki-sync.sh pull`, not a
submodule). Run, in one shell from the repo root, with `set -e`:

```sh
set -e
git -C . pull --rebase origin main          # monorepo
git -C . status --porcelain | head -1       # must be empty
bash scripts/wiki-sync.sh pull              # wiki
git -C wiki status --porcelain | head -1    # must be empty
node scripts/spec-1540-migrate-to-event-type.mjs --dry-run   # exit 0 required
node scripts/spec-1540-migrate-to-event-type.mjs --apply     # rewrites files
```

If `--apply` exits non-zero, drop partial changes against **the wiki
repo** (where the rewrites land), not the monorepo:

```sh
git -C wiki checkout -- metrics/ release-engineer/ product-manager/
git -C wiki clean -fd release-engineer/ product-manager/    # only if these dirs are still empty
```

Do not commit a partial migration. The two-pass design from Step 8
means pass 2 only starts after pass 1 has cleared every file — a
mid-walk failure of pass 2 implies a filesystem error, not a
classification mismatch, and the wiki checkout rollback is safe.

**Verification.**

- `find wiki/metrics wiki/release-engineer wiki/product-manager -name
  '*.csv' -exec head -1 {} \; | sort -u` outputs exactly two unique
  header lines: the new `HEADER` value (every CSV under
  `wiki/metrics/` and the new `exp-41-…` file) and the
  trace-attestation header (unchanged) at the relocated path.
- `rg -F EXPECTED_HEADER libraries/libxmr/ scripts/` returns zero hits.
- The `wiki/metrics/kata-release-engineer-trace-attestation/`
  directory does not exist.
- `bunx fit-xmr analyze wiki/metrics/staff-engineer/2026.csv` (default
  slice = `kata-shift`) on each of the seven Problem-table metrics
  (`duration_seconds`, `tool_calls_total`, `output_tokens`,
  `cost_usd_per_run`, `file_writes`, `prs_opened`, `tool_errors`)
  records the latest-row signal classification per metric.
  **Spec § Success Criteria row 4** is satisfied when at least one of
  the seven metric's run-61 row now sits inside UPL on the
  shift-work-only series; record the metric name and the
  before/after UPL in the PR description.

## Step 10 — documentation

**Files modified.**

- `libraries/libxmr/README.md` (one paragraph: seven-column schema +
  `--event-type` flag + smart default)
- `.claude/skills/fit-xmr/SKILL.md` (single sentence under the schema
  section: "rows carry a trailing `event_type` field naming the
  workflow that recorded them; default read slice is `kata-shift`")
- `websites/fit/docs/libraries/predictable-team/xmr-analysis/index.md`
  (one paragraph on the slice convention and how to view the
  unfiltered series with `--event-type=*`)
- `libraries/libxmr/CHANGELOG.md` (one entry describing the schema
  change, the `event_type` flag, and the smart default)

**Compression order under budget pressure.** If `bun run check` or
`bun run data` reports a prose-budget violation, compress in this
order: README.md first (one sentence rather than a paragraph), then
the xmr-analysis guide paragraph (drop the unfiltered-series example
sentence), then SKILL.md (compress the schema-section call-out to a
single clause). CHANGELOG.md is uncapped.

**Verification.** `bun run check && bun run data` both clean.
`bun run wiki` (audit) passes.

## Step 11 — final sweep

**Files modified.** none

Run `bun run check && bun run data && bun run test` from the repo
root.

**Verification.** Three commands report success. `git diff --stat
origin/main` shows only files named under Steps 1-10.

## Risks

| Risk | Mitigation |
| --- | --- |
| Cross-row classifier mis-stamps a per-agent run that genuinely is `kata-shift` (e.g. an SE run with `commits_pushed=0` because the run drafted but didn't commit). | Classifier requires four signals AND the boot-append note prefix — failing any one keeps the run on `kata-shift`. Step 8's tripwire — shift-work count > 30 on `staff-engineer` exits non-zero — surfaces structural mis-classification before commit. Numeric bound documented in the script header. |
| `--event-type` becomes required on every `npx fit-xmr record` call (Step 4); local-dev callers without `$GITHUB_WORKFLOW_REF` set will fail. | Honoured per design § Key Decisions row 2 (intentional reject when neither resolves — "a row never lands without a value"). Existing tests in `test/record.test.js` are migrated in Step 4 to pass `--event-type=kata-test` explicitly. Local-dev workflow is documented in the README.md update (Step 10). |
| Pre-flight rejects a CSV that an unrelated lane added between plan-merge and impl-merge. | The race-avoidance shell sequence in Step 9 (`git pull --rebase` + dry-run + apply on the same SHA) closes the window. The script's two-pass design (Step 8) makes the rejection visible before any write. The script is idempotent on a fully-migrated file via the "already migrated" branch. |
| Outlier split's destination file already exists from a prior run or another lane. | Step 8 outlier branches pre-flight `existsSync` on the planned destination; non-zero exit before any write. |
| The migration script fails mid-pass-2 (filesystem error after some rewrites land). | Step 9's `git -C wiki checkout -- metrics/ release-engineer/ product-manager/` rollback drops every partial write before commit (wiki is its own git repo; rollback runs inside `wiki/`). Plan-time `bash scripts/wiki-sync.sh pull` + `git -C wiki status --porcelain` precondition guarantees the wiki tree starts clean. |
| PM/RE concurrence on outlier moves is not yet given when CI passes. | Step 0 lists PM and RE as PR-level requested reviewers and names them in the description; per approval-signals.md the canonical merge gate is STATUS at `plan implemented` written by `kata-release-merge` after PM/RE approval signals propagate via `kata-dispatch`. Reviewer-side discipline is the operative mechanism — not a separate label gate. |
| Other per-agent CSVs (PM/RE/SE-security/TW/coach) have no tripwire — classifier mis-stamps on those files land silently. | The other five per-agent CSV files do not exist on `wiki/main` today (verified: `ls wiki/metrics/` shows only `staff-engineer/` as a per-agent dir; the other dirs are kata-skill). The classifier walks every conformant per-agent file by branch, so when those files appear they go through the same rule; surface a follow-up obstacle if a future per-agent file's `kata-shift` ratio drifts notably from the staff-engineer pattern. |
| `libwiki/src/block-renderer.js:27` callers (storyboard refresh) silently re-slice. | Step 3 puts the default inside `analyze()` itself so the single-argument call site keeps working without code change in libwiki, matching design § Data Flow. |

## Execution

Single PR. Steps 1-7 are the runtime patch (libxmr code + tests); Step 8
adds the script; Step 9 runs the script (commit migrated CSVs) and removes
it; Step 10 ships docs; Step 11 is the sweep. Route Steps 1-9 + 11 to
`staff-engineer`; route Step 10 to `technical-writer`; Step 11 returns to
`staff-engineer`. Step 0 is a one-time pre-PR setup (PR-description
authoring) by the agent that opens the PR.

The single-PR shape is non-negotiable per the design's "no schema-version
branch" constraint — splitting into series leaves `main` carrying the
half-migrated state the design forbids.

— Staff Engineer 🛠️
