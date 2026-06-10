---
title: Chart a Metric and Check Variation
description: Know whether a metric has actually changed or just varied — natural process limits and Wheeler's detection rules separate signal from noise.
---

You need to chart a metric and see whether the latest point is within expected
variation. `fit-xmr` reads a time-series CSV, computes natural process limits
from the data itself, and tells you whether the newest observation is routine
noise or worth investigating.

No external targets required. The limits come from how the metric actually
behaves.

## Prerequisites

- Node.js 18+
- A CSV with at least 15 data points (fewer points are accepted but limits
  will not be computed)

## Prepare the CSV

`fit-xmr` expects the header `date,metric,value,unit,run,note,event_type` with
one row per observation:

```csv
date,metric,value,unit,run,note,event_type
2026-01-06,cycle_time,4.2,days,,,kata-shift
2026-01-07,cycle_time,3.8,days,,,kata-shift
2026-01-08,cycle_time,5.1,days,,first Monday spike,kata-shift
```

| Field        | Required | Notes                                                               |
| ------------ | -------- | ------------------------------------------------------------------- |
| `date`       | yes      | ISO 8601 (`YYYY-MM-DD`). Sort key.                                  |
| `metric`     | yes      | Metric name. One CSV may carry multiple metrics; they are grouped.  |
| `value`      | yes      | Numeric. Non-numeric values are rejected by `validate`.             |
| `unit`       | yes      | Free text (`count`, `days`, `pct`, ...). Empty `unit` is rejected.  |
| `run`        | no       | URL or identifier of the run that produced this observation.        |
| `note`       | no       | Free text. Use it to record what you discovered when a signal fires.|
| `event_type` | yes      | The workflow that recorded the row — its filename without `.yml`.   |

`event_type` keeps structurally different work out of the same baseline: a
30-second boot-and-yield and a 20-minute end-to-end run recorded against one
metric would drag μ toward the cheaper shape and flag every real run as an
outlier. The read commands therefore analyze one slice at a time — `kata-shift`
by default — and name the active slice in their output. Pass
`--event-type <name>` for a different slice, or `--event-type '*'` to see the
unfiltered series.

Validate the file before analysis:

```sh
npx fit-xmr validate observations.csv
```

A non-zero exit code means the file does not match the schema.

## Chart a single metric

Render the chart to see where every point falls relative to the limits:

```sh
npx fit-xmr chart observations.csv --metric cycle_time
```

When the CSV carries exactly one metric, `--metric` is optional.

The output is a 14-line X+mR chart:

```
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
  and zone boundaries. `·` is routine; `●` is a signal.
- **Bottom half (mR chart)** -- consecutive point-to-point changes
  (`|x_i - x_{i-1}|`) against the upper range limit.
- The shared time axis at the bottom serves both halves.

If your terminal mishandles Unicode, add `--ascii`:

```sh
npx fit-xmr chart observations.csv --metric cycle_time --ascii
```

## Check whether the latest point is a signal

The `analyze` command combines the chart with limits, signals, and a
classification:

```sh
npx fit-xmr analyze observations.csv --metric cycle_time
```

For structured output that agents and scripts can parse:

```sh
npx fit-xmr analyze observations.csv --metric cycle_time --format json
```

The JSON report for each metric carries:

- **`stats`** -- `mu`, `R`, `sigmaHat`, `UPL`, `LPL`, `URL`, `zoneUpper`,
  `zoneLower`.
- **`latest`** -- the most recent observation as `{ date, value, mr }`. The `mr`
  field is the moving range at that point, answering "is today's change
  unusual?"
- **`signals`** -- keyed by rule (`xRule1`, `xRule2`, `xRule3`, `mrRule1`). Each
  entry carries `slots` (1-indexed positions) and a `description`.
- **`classification`** -- `stable`, `signals`, `chaos`, or `insufficient`.

Read `classification` first. If it says `stable`, the latest point is within
expected variation and no action is needed. If it says `signals`, look at the
`signals` object to see which rules fired and where.

## One process per chart

Before the rules mean anything, the centerline (μ) and average moving range
(R̄) must come from a single process. If a CSV mixes two processes -- for
example, fast dispatch-boots interleaved with much slower shift-work -- μ and
R̄ are computed across the mixture and the limits describe neither. The rules
still fire, but they fire on the mixture artifact, not on either underlying
system.

If your CSV mixes processes, split them into separate metrics (or separate
CSVs) before charting. The `metric` column is the natural seam: name each
process distinctly so they group separately. After a confirmed shift in a
single process, see the recompute step in
[What to do when signals appear](#what-to-do-when-signals-appear).

## The three detection rules

`fit-xmr` applies the three rules from Wheeler's _Understanding Variation_:

| Rule          | What it catches                                                      | Applied to |
| ------------- | -------------------------------------------------------------------- | ---------- |
| **X-Rule 1**  | A point outside the natural process limits (UPL or LPL)              | X chart    |
| **X-Rule 2**  | 8 consecutive points on the same side of the centerline              | X chart    |
| **X-Rule 3**  | 3 of any 4 consecutive points strictly beyond +/-1.5 sigma on one side | X chart    |
| **mR-Rule 1** | A moving range point exceeds URL                                     | mR chart   |

Treat each fired rule as a prompt to investigate, not a verdict.

When Rule 2 or Rule 3 fires, all participating slots are listed -- the run as a
whole carries the diagnostic information, not just the final point.

### Classifications

| Classification   | Meaning                                                    | What to do                                          |
| ---------------- | ---------------------------------------------------------- | --------------------------------------------------- |
| `stable`         | No rules activated. The process is predictable.            | Leave it alone. Intervening makes things worse.     |
| `signals`        | At least one X-chart rule activated.                       | Investigate what changed.                           |
| `chaos`          | mR Rule 1 activated. The variation itself is unstable.     | Investigate the outsized moves before trusting any limits. |
| `insufficient`   | Fewer than 15 points. Limits are not computed.             | Keep recording.                                     |

## Summarize across metrics

When you track multiple metrics in one CSV, `summarize` produces a markdown
table:

```sh
npx fit-xmr summarize observations.csv
```

Each row shows the metric, sample count, latest value, centerline, limits,
classification, and a compact signal summary (`R1x2`, `R2x8`, etc.). Metrics
with fewer than 15 points are listed separately so they do not crowd the active
signals.

## Orientation commands

List what is in the file before charting:

```sh
npx fit-xmr list observations.csv
```

Prints one row per metric with the observation count and date range.

## What to do when signals appear

1. **Look at the chart.** The visual pattern tells you more than the rule name.
   A Rule 2 run of 8 points above the centerline looks different from a single
   Rule 1 breach, and the response is different too.
2. **Annotate the CSV.** Fill in the `note` field on the observation where the
   shift happened with what you discovered. The note is the durable record.
3. **Recompute after a confirmed shift.** If the process has genuinely changed
   (a new deployment, a policy change), pre- and post-shift data are now two
   different processes -- see [One process per chart](#one-process-per-chart).
   Re-run analysis against post-shift data only.

Do not set targets based on the natural process limits. They describe what the
process does, not what it should do.

Do not react to individual data points when the classification is `stable`.
Routine variation is common-cause noise; treating it as a problem and
intervening makes the process worse on average.

## What's next

<div class="grid">

<!-- part:card:.. -->

</div>
