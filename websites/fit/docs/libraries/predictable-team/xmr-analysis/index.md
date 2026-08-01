---
title: Chart a Metric and Check Variation
description:
  Know whether a metric changed or only varied. Natural process limits and
  Wheeler's detection rules separate signal from noise.
---

You need to chart a metric and see whether the latest point is within expected
variation. `gemba-xmr` reads a time-series CSV. It computes natural process
limits from the data itself. It tells you whether the newest observation is
routine noise or something to investigate.

You need no external targets. The limits come from how the metric actually
behaves.

## Prerequisites

- Node.js 22+
- A CSV with at least 15 data points (the command accepts fewer points but does
  not compute limits)

## Prepare the CSV

`gemba-xmr` expects the header `date,metric,value,unit,run,note,event_type` with
one row per observation:

```csv
date,metric,value,unit,run,note,event_type
2026-01-06,cycle_time,4.2,days,,,kata-shift
2026-01-07,cycle_time,3.8,days,,,kata-shift
2026-01-08,cycle_time,5.1,days,,first Monday spike,kata-shift
```

| Field        | Required | Notes                                                                |
| ------------ | -------- | -------------------------------------------------------------------- |
| `date`       | yes      | ISO 8601 (`YYYY-MM-DD`). Sort key.                                   |
| `metric`     | yes      | Metric name. One CSV may carry many metrics. The command groups them. |
| `value`      | yes      | Numeric. `validate` rejects a non-numeric value.                     |
| `unit`       | yes      | Free text (`count`, `days`, `pct`, ...). Do not leave `unit` empty.  |
| `run`        | no       | URL or identifier of the run that produced this observation.         |
| `note`       | no       | Free text. Use it to record what you discovered when a signal fires. |
| `event_type` | yes      | The workflow that recorded the row. Use its filename without `.yml`. |

`event_type` keeps structurally different work out of the same baseline. Take a
30-second boot-and-yield and a 20-minute end-to-end run recorded against one
metric. The pair would drag μ toward the cheaper shape. It would flag every real
run as an outlier. So the read commands analyze one slice at a time. The default
slice is `kata-shift`. Each command names the active slice in its output. Pass
`--event-type <name>` for a different slice. Pass `--event-type '*'` to see the
unfiltered series.

Validate the file before analysis:

```sh
npx gemba-xmr validate observations.csv
```

A non-zero exit code means the file does not match the schema.

## Chart a single metric

Render the chart to see where every point falls relative to the limits:

```sh
npx gemba-xmr chart observations.csv --metric cycle_time
```

When the CSV carries exactly one metric, `--metric` is optional.

The output is a 14-line X+mR chart:

```text
 UPL 12.5 ──────────────────────────────●───────────────
          │
+1.5σ 9.4 │        ·           ·  ·              ·
    μ 6.4 ┼╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
-1.5σ 3.4 │  ·  ·     ·  ·  ·        ·     ·  ·     ·  ·
          │
  LPL 0.3 ──────────────────────────────────────────────

  URL 7.5 ─────────────────────────────────●────────────
          │                    ·        ·
    R 2.3 ┼╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
          │     ·  ·  ·  ·  ·     ·  ·        ·  ·  ·  ·
      0.0 ──────────────────────────────────────────────
             1  2  3  4  5  6  7  8  9 10 11 12 13 14 15
```

- **Top half (X chart)** -- each observation against the natural process limits
  and zone boundaries. `·` is routine. `●` is a signal.
- **Bottom half (mR chart)** -- consecutive point-to-point changes
  (`|x_i - x_{i-1}|`) against the upper range limit.
- The shared time axis at the bottom serves both halves.

If your terminal mishandles Unicode, add `--ascii`:

```sh
npx gemba-xmr chart observations.csv --metric cycle_time --ascii
```

## Check whether the latest point is a signal

The `analyze` command combines the chart with limits, signals, and a
classification:

```sh
npx gemba-xmr analyze observations.csv --metric cycle_time
```

For structured output that agents and scripts can parse:

```sh
npx gemba-xmr analyze observations.csv --metric cycle_time --format json
```

The JSON report for each metric carries:

- **`stats`** -- `mu`, `R`, `sigmaHat`, `UPL`, `LPL`, `URL`, `zoneUpper`,
  `zoneLower`.
- **`latest`** -- the most recent observation as `{ date, value, mr }`. The `mr`
  field is the moving range at that point. It answers the question "is today's
  change unusual?"
- **`signals`** -- keyed by rule (`xRule1`, `xRule2`, `xRule3`, `mrRule1`). Each
  entry carries `slots` (1-indexed positions) and a `description`. When you pass
  a prior-read anchor (`analyze`'s `priorReadAnchor`, the CLI's `--prior-read`),
  each entry also carries `provenance`. The value is `recomputation-revealed`
  when every participating slot was already present at the prior read. The value
  is `new-point` when at least one slot postdates the prior read. A
  `recomputation-revealed` signal surfaced because newer data shifted the
  recomputed limits. No new point breached anything. Without an anchor, the
  entry carries no `provenance` field.
- **`classification`** -- `stable`, `signals`, `chaos`, `insufficient`, or
  `degenerate-zero`.

Read `classification` first. If it says `stable`, the latest point is within
expected variation. You need no action. If it says `degenerate-zero`, the series
is also quiet, but every observation is zero. The series carries no process
signal at all. It does not substantively meet a predictability target. If it
says `signals`, look at the `signals` object. It shows which rules fired and
where. When `provenance` is present, check whether the fired signals are
`recomputation-revealed` (old data that crosses freshly tightened limits). Check
that before you treat the flip as a new event.

## One process per chart

Before the rules mean anything, the centerline (μ) and average moving range (R̄)
must come from a single process. A CSV can mix two processes, for example fast
dispatch-boots interleaved with much slower shift-work. The command then
computes μ and R̄ across the mixture, and the limits describe neither process.
The rules still fire, but they fire on the mixture artifact. They do not fire on
either underlying system.

If your CSV mixes processes, split them into separate metrics (or separate CSVs)
before you chart them. The `metric` column is the natural seam. Name each
process distinctly so they group separately. After a confirmed shift in a single
process, see the recompute step in
[What to do when signals appear](#what-to-do-when-signals-appear).

## Partition one metric by decision path

Sometimes a single metric covers work that took different paths. You want to
chart each path separately without a new metric. A row can carry that path as
structured tokens inside its `note` field. The read commands can filter on those
tokens.

The grammar lives at the head of the `note`, before any free text:

```text
route_taken=<id>; routes_eligible=[<id>,<id>,...];
```

- **`route_taken`** — the single path this observation took. The id is a small
  integer (or the literal `none` when the work took no path).
- **`routes_eligible`** — the comma-separated set of paths that were available
  for this observation. The set includes the path taken. The brackets are
  literal. An empty set is `[]`.

Quote the `note` so the embedded comma does not break the column. A row then
reads:

```csv
date,metric,value,unit,run,note,event_type,host_run
2026-06-20,implementations_shipped,3,count,,"route_taken=2; routes_eligible=[2,3];",kata-shift,local
```

Any free text follows the trailing semicolon:
`"route_taken=2; routes_eligible=[2,3]; reverted a flaky test"`.

### Filter to a path

Two `analyze` options read the grammar:

```sh
npx gemba-xmr analyze observations.csv --metric implementations_shipped --route 2
```

`--route 2` keeps only rows whose `route_taken` is `2`. The command then
computes the chart, limits, and signals over that subset alone. A path with its
own process behavior gets its own baseline.

```sh
npx gemba-xmr analyze observations.csv --metric implementations_shipped \
  --routes-eligible-includes 4
```

`--routes-eligible-includes 4` keeps rows whose `routes_eligible` set contains
`4`, whether or not `4` was the path taken. Use it to ask "across every
observation where path 4 was on the table, how does the metric behave?"

Both options compose with `--event-type` and `--metric`. Each option is inert
when you omit it. A plain `analyze` charts the whole series exactly as before. A
narrow partition often falls under the 15-point floor and reports
`insufficient`. Keep recording until each path has enough observations.

### Record a path

`gemba-xmr record` writes the grammar for you. Pass `--route` (and optionally
`--routes-eligible`). The command prepends the tokens to the `note`. It quotes
the field automatically:

```sh
npx gemba-xmr record --skill kata-implement --metric implementations_shipped \
  --value 2 --route 2 --routes-eligible 2,3
```

The command appends a row whose `note` is
`route_taken=2; routes_eligible=[2,3];`. Draw the ids from the metric's known
path set, or `record` rejects the row.

## The three detection rules

`gemba-xmr` applies the three rules from Wheeler's _Understanding Variation_:

| Rule          | What it catches                                                        | Applied to |
| ------------- | ---------------------------------------------------------------------- | ---------- |
| **X-Rule 1**  | A point outside the natural process limits (UPL or LPL)                | X chart    |
| **X-Rule 2**  | 8 consecutive points on the same side of the centerline                | X chart    |
| **X-Rule 3**  | 3 of any 4 consecutive points strictly beyond +/-1.5 sigma on one side | X chart    |
| **mR-Rule 1** | A moving range point exceeds URL                                       | mR chart   |

Treat each fired rule as a prompt to investigate. It is not a verdict.

When Rule 2 or Rule 3 fires, the report lists all participating slots. The run
as a whole carries the diagnostic information. The final point alone does not.

### Classifications

| Classification   | Meaning                                                    | What to do                                          |
| ---------------- | ---------------------------------------------------------- | --------------------------------------------------- |
| `stable`         | No rules activated. The process is predictable.            | Leave it alone. If you intervene, you make things worse. |
| `signals`        | At least one X-chart rule activated.                       | Investigate what changed.                           |
| `chaos`          | mR Rule 1 activated. The variation itself is unstable.     | Investigate the outsized moves before you trust any limits. |
| `insufficient`   | Fewer than 15 points. Limits are not computed.             | Keep recording.                                     |
| `degenerate-zero` | Every observation is zero. Predictable, but the series carries no process signal. | Nothing to react to. It does not substantively meet a predictability target. |

## Summarize across metrics

When you track multiple metrics in one CSV, `summarize` produces a markdown
table:

```sh
npx gemba-xmr summarize observations.csv
```

Each row shows the metric, sample count, latest value, centerline, limits,
classification, and a compact signal summary (`R1x2`, `R2x8`, etc.). The command
lists metrics with fewer than 15 points separately so they do not crowd the
active signals.

## Orientation commands

List what is in the file before you chart it:

```sh
npx gemba-xmr list observations.csv
```

The command prints one row per metric with the observation count and date range.

## What to do when signals appear

1. **Look at the chart.** The visual pattern tells you more than the rule name.
   A Rule 2 run of 8 points above the centerline looks different from a single
   Rule 1 breach. Your response is different too.
2. **Annotate the CSV.** Record what you discovered in the `note` field of the
   observation where the shift happened. The note is the durable record.
3. **Recompute after a confirmed shift.** If the process genuinely changed
   (a new deployment, a policy change), pre- and post-shift data are now two
   different processes. See [One process per chart](#one-process-per-chart).
   Re-run analysis against post-shift data only.

Do not set targets based on the natural process limits. They describe what the
process does. They do not describe what it should do.

Do not react to individual data points when the classification is `stable` or
`degenerate-zero`. Both are quiet verdicts. `stable` is routine common-cause
noise. `degenerate-zero` is a flat-zero series with no signal at all. If you
treat either one as a problem and intervene, you make the process worse on
average.

## What's next

<div class="grid">

<!-- part:card:.. -->

</div>
