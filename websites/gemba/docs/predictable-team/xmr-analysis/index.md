---
title: Chart a Metric and Check Variation
description:
  Know whether a metric changed or only varied. Natural process limits and
  Wheeler's detection rules separate signal from noise.
---

You need to chart a metric and see whether the latest point is within expected
variation. `gemba-xmr` reads a time-series CSV, computes natural process limits
from the data itself, and tells you whether the newest observation is routine
noise or something to investigate.

You need no external targets, because the limits come from how the metric
behaves.

## Prerequisites

- Node.js 22+
- The `gemba-xmr` command. Run it with `npx gemba-xmr`, or install the command
  family with `npm install -g @forwardimpact/gemba`
- A CSV with at least 15 data points (the command accepts fewer points but does
  not compute limits)

## Prepare the CSV

`gemba-xmr` expects the header
`date,metric,value,unit,run,note,event_type,host_run` with one row per
observation:

```csv
date,metric,value,unit,run,note,event_type,host_run
2026-01-06,cycle_time,4.2,days,,,nightly-review,local
2026-01-07,cycle_time,3.8,days,,,nightly-review,local
2026-01-08,cycle_time,5.1,days,,first Monday spike,nightly-review,local
```

| Field        | Required | Notes                                                                |
| ------------ | -------- | -------------------------------------------------------------------- |
| `date`       | yes      | ISO 8601 (`YYYY-MM-DD`). Sort key.                                   |
| `metric`     | yes      | Metric name. One CSV may carry multiple metrics. The command groups them. |
| `value`      | yes      | Numeric. `validate` rejects a non-numeric value.                     |
| `unit`       | yes      | Free text (`count`, `days`, `pct`, ...). `validate` rejects an empty `unit`. |
| `run`        | no       | URL or identifier of the run that produced this observation.         |
| `note`       | no       | Free text. Use it to record what you discovered when a signal fires. |
| `event_type` | yes      | The stream the row belongs to: the host workflow's filename without `.yml`, else the reserved `interactive`. |
| `host_run`   | no       | The CI run that produced the row. `record` writes `local` when no run id is available. |

The earlier seven-column header, without `host_run`, is also still valid, so
an existing file keeps working.

`event_type` keeps different kinds of work out of the same baseline. If you
record a 30-second boot-and-yield check and a 20-minute end-to-end run against
one metric, the pair pulls μ toward the cheaper shape and flags every real run
as an outlier. For that reason each read command analyzes one slice at a time.

`record` takes `event_type` from `--event-type`. Without the flag, it takes
the host workflow's filename (without `.yml`) from `$GITHUB_WORKFLOW_REF`.
Without either, it writes the reserved value `interactive`. No workflow file
may take that name.

A read takes its slice from `--event-type`. Without the flag, a file with one
value reads that value. On a file with several values, the read fails, and the
error lists each value with its row count. `--event-type '*'` reads every row.
A named slice that matches no row of a non-empty file fails the same way. Every
read names the slice it reports.

The sample file holds one `event_type` value, so `chart`, `list`, and
`summarize` below omit the flag. The `analyze` examples name the slice, so they
also work on a file with several streams.

Validate the file before analysis:

```sh
npx gemba-xmr validate observations.csv
```

A non-zero exit code means that the file does not match the schema.

## Chart a single metric

Render the chart to see where every point falls relative to the limits:

```sh
npx gemba-xmr chart observations.csv --metric cycle_time
```

When the CSV contains exactly one metric, `--metric` is optional.

The output names the slice, then draws a 14-line X+mR chart:

```text
# event_type: nightly-review

 UPL 10.9 ┬                       ●
          │
+1.5σ 8.2 │                    ·           ·
    μ 5.5 ┼
-1.5σ 2.8 │  ·  ·  ·  ·  ·  ·        ·  ·     ·  ·  ·  ·
          │
  LPL 0.2 ┴

  URL 6.6 ┬                       ●  ●
          │
    R 2.0 ┼
          │     ·  ·  ·  ·  ·  ·        ·  ·  ·  ·  ·  ·
      0.0 ┴
             1  2  3  4  5  6  7  8  9 10 11 12 13 14 15
```

- **Top half (X chart).** Each observation against the natural process limits
  and zone boundaries. `·` is routine. `●` is a signal.
- **Bottom half (mR chart).** Consecutive point-to-point changes
  (`|x_i - x_{i-1}|`) against the upper range limit.
- The shared time axis at the bottom serves both halves.

If your terminal cannot display Unicode correctly, add `--ascii`:

```sh
npx gemba-xmr chart observations.csv --metric cycle_time --ascii
```

## Check whether the latest point is a signal

The `analyze` command combines the chart with limits, signals, and a
classification:

```sh
npx gemba-xmr analyze observations.csv --event-type nightly-review --metric cycle_time
```

For structured output that agents and scripts can parse:

```sh
npx gemba-xmr analyze observations.csv --event-type nightly-review --metric cycle_time --format json
```

The JSON report for each metric contains:

- **`stats`.** `mu`, `R`, `sigmaHat`, `UPL`, `LPL`, `URL`, `zoneUpper`,
  `zoneLower`.
- **`latest`.** The most recent observation as `{ date, value, mr }`. The `mr`
  field is the moving range at that point, and it shows whether the latest
  change is unusual.
- **`signals`.** Keyed by rule (`xRule1`, `xRule2`, `xRule3`, `mrRule1`). Each
  entry has `slots` (1-indexed positions) and a `description`. When you pass
  a prior-read anchor (`analyze`'s `priorReadAnchor`, the CLI's `--prior-read`),
  each entry also has `provenance`. The value is `recomputation-revealed`
  when every participating slot was already present at the prior read, and
  `new-point` when at least one slot came after the prior read. A
  `recomputation-revealed` signal appeared because newer data shifted the
  recomputed limits, and not because a new point breached a limit. Without an
  anchor, the entry has no `provenance` field.
- **`classification`.** `stable`, `signals`, `chaos`, `insufficient`, or
  `degenerate-zero`.

Read `classification` first. If it says `stable`, the latest point is within
expected variation and you need no action. If it says `degenerate-zero`, the
series is also quiet, but every observation is zero. The series has no process
signal at all, and it does not count as meeting a predictability target. If it
says `signals`, look at the `signals` object to see which rules fired and
where. When `provenance` is present, check whether the fired signals are
`recomputation-revealed` (old data that crosses freshly tightened limits)
before you treat the change as a new event.

## One process per chart

Before the rules mean anything, the centerline (μ) and average moving range (R̄)
must come from a single process. A CSV can mix two processes, for example quick
boot-and-yield checks mixed with much slower end-to-end runs. The command then
computes μ and R̄ across the mixture, and the limits describe neither process.
The rules still fire, but they respond to the mixture and not to either real
process.

If your CSV mixes processes, split them into separate metrics (or separate
CSVs) before you chart them. The `metric` column is the natural place to
split. Give each process its own name so that the processes group separately.
After a confirmed shift in a single process, see the recompute step in
[What to do when signals appear](#what-to-do-when-signals-appear).

## Partition one metric by decision path

Sometimes a single metric covers work that took different paths, and you want
to chart each path separately without a new metric. A row can carry that path
as structured tokens inside its `note` field, and the read commands can filter
on those tokens.

The grammar goes at the head of the `note`, before any free text:

```text
route_taken=<id>; routes_eligible=[<id>,<id>,...];
```

- **`route_taken`** is the single path this observation took. The id is a small
  integer (or the literal `none` when the work took no path).
- **`routes_eligible`** is the comma-separated set of paths that were available
  for this observation. The set includes the path taken. The brackets are
  literal. An empty set is `[]`.

Quote the `note` so that the embedded comma does not break the column. A row
then reads:

```csv
date,metric,value,unit,run,note,event_type,host_run
2026-06-20,implementations_shipped,3,count,,"route_taken=2; routes_eligible=[2,3];",nightly-review,local
```

Any free text follows the trailing semicolon:
`"route_taken=2; routes_eligible=[2,3]; reverted a flaky test"`.

The shipped route registry is small and closed. It holds one route-bearing
metric, `implementations_shipped`, and the four paths of the reference tenant's
`kata-implement` skill. `record` writes route tokens for that metric only, and
it rejects an id outside that set. The read filters below work for any metric.
They partition any row that uses the grammar.

### Filter to a path

Two `analyze` options read the grammar:

```sh
npx gemba-xmr analyze observations.csv --event-type nightly-review \
  --metric implementations_shipped --route 2
```

`--route 2` keeps only rows whose `route_taken` is `2`. The command then
computes the chart, limits, and signals over that subset alone. A path with its
own process behavior gets its own baseline.

```sh
npx gemba-xmr analyze observations.csv --event-type nightly-review \
  --metric implementations_shipped --routes-eligible-includes 4
```

`--routes-eligible-includes 4` keeps rows whose `routes_eligible` set contains
`4`, whether or not `4` was the path taken. Use it to study how the metric
behaves across every observation where path 4 was available.

Both options combine with `--event-type` and `--metric`, and each one has no
effect when you omit it. A plain `analyze` with neither option charts the
whole slice. A narrow partition often
falls under the 15-point floor and reports `insufficient`. Keep recording
until each path has enough observations.

### Record a path

`gemba-xmr record` writes the grammar for you. Pass `--route` (and optionally
`--routes-eligible`). The command puts the tokens at the front of the `note`
and quotes the field for you:

```sh
npx gemba-xmr record --skill kata-implement --metric implementations_shipped \
  --value 2 --event-type nightly-review --route 2 --routes-eligible 2,3
```

The command appends a row whose `note` is
`route_taken=2; routes_eligible=[2,3];`. Take the ids from the metric's known
path set, or `record` rejects the row.

`record` appends to one CSV per skill and per year, `metrics/<skill>/<year>.csv`
under the wiki root. It creates the directory and the header when they are
absent. Pass `--wiki-root <path>` to write somewhere else.

## The three detection rules

`gemba-xmr` applies the three rules from Wheeler's _Understanding Variation_:

| Rule          | What it catches                                                        | Applied to |
| ------------- | ---------------------------------------------------------------------- | ---------- |
| **X-Rule 1**  | A point outside the natural process limits (UPL or LPL)                | X chart    |
| **X-Rule 2**  | 8 consecutive points on the same side of the centerline                | X chart    |
| **X-Rule 3**  | 3 of any 4 consecutive points strictly beyond +/-1.5 sigma on one side | X chart    |
| **mR-Rule 1** | A moving range point exceeds URL                                       | mR chart   |

A fired rule means that you should investigate. It does not tell you what
changed or why.

When Rule 2 or Rule 3 fires, the report lists all participating slots. Look at
the whole run, because the final point alone does not show the pattern.

### Classifications

| Classification   | Meaning                                                    | What to do                                          |
| ---------------- | ---------------------------------------------------------- | --------------------------------------------------- |
| `stable`         | No rules activated. The process is predictable.            | Leave it alone. If you intervene, you make things worse. |
| `signals`        | At least one X-chart rule activated.                       | Investigate what changed.                           |
| `chaos`          | mR Rule 1 activated. The variation itself is unstable.     | Investigate the outsized moves before you trust any limits. |
| `insufficient`   | Fewer than 15 points. The command does not compute limits. | Keep recording.                                     |
| `degenerate-zero` | Every observation is zero. Predictable, but the series has no process signal. | Nothing to react to. It does not count as meeting a predictability target. |

## Summarize across metrics

When you track multiple metrics in one CSV, `summarize` produces a markdown
table:

```sh
npx gemba-xmr summarize observations.csv
```

Each row shows the metric, sample count, latest value, centerline, limits,
classification, and a compact signal summary (`R1×2`, `R2×8`, `mR1×1`, etc.).
The command lists metrics with fewer than 15 points separately, so that they
do not crowd the active signals.

## Orientation commands

List what is in the file before you chart it:

```sh
npx gemba-xmr list observations.csv
```

The command prints one row per metric with the observation count and date range.

## What to do when signals appear

1. **Look at the chart.** The visual pattern tells you more than the rule name.
   A Rule 2 run of 8 points above the centerline looks different from a single
   Rule 1 breach, and your response is different too.
2. **Annotate the CSV.** Record what you discovered in the `note` field of the
   observation where the shift happened. The note is the durable record.
3. **Recompute after a confirmed shift.** If the process did change (a new
   deployment, a policy change), the data before and after the shift
   now belong to two different processes. See
   [One process per chart](#one-process-per-chart). Re-run the analysis
   against the post-shift data only.

Do not set targets based on the natural process limits. They describe what the
process does, and not what it should do.

Do not react to individual data points when the classification is `stable` or
`degenerate-zero`. Both are quiet verdicts. `stable` means routine
common-cause noise, and `degenerate-zero` means a flat-zero series with no
signal at all. If you treat either one as a problem and intervene, you make
the process worse on average.

## What's next

<div class="grid">

<!-- part:card:.. -->
<!-- part:card:../wiki-operations -->
<!-- part:card:../wiki-integrity -->
<!-- part:card:../collision-ledger -->

</div>
