---
name: gemba-xmr
description: >
  Distinguish signal from noise so the team acts on real changes instead of
  fluctuations. Use when a metric changes and the team debates whether it is a
  real shift or just noise, when you need a compact status chart for a wiki, PR,
  or report, or when you record and analyze time-series metrics with
  Wheeler/Vacanti XmR control charts.
---

# XmR Analysis

`gemba-xmr` reads a CSV of dated observations. It computes Wheeler/Vacanti XmR
(individuals and moving range) control limits. It detects special-cause
signals. It renders a fixed-width 14-line chart that makes the rules visible by
inspection.

It renders **one canonical chart, with no variants**. It follows Wheeler's
three-rule formulation, which Vacanti adopted for agile flow metrics.

## When to Use

**Decide whether a change is signal or noise:**

- Analyze a metric — `npx gemba-xmr analyze observations.csv --metric <name>`
- View the 14-line chart —
  `npx gemba-xmr chart observations.csv --metric <name>`
- Record a new observation — `npx gemba-xmr record`

**Report on process stability:**

- Compact markdown status table — `npx gemba-xmr summarize observations.csv`
- List the available metrics — `npx gemba-xmr list observations.csv`
- Validate the CSV schema — `npx gemba-xmr validate observations.csv`

Use this tool for _"how is this metric trending?"_. Do not use it for _"what
target should we set?"_. Natural process limits describe what a process _does_.
They do not describe what it _should_ do.

## CSV Schema

`gemba-xmr` expects exactly this header:

```text
date,metric,value,unit,run,note,event_type
```

- `date` — ISO 8601 (`YYYY-MM-DD`)
- `metric` — metric name (one CSV may carry many metrics)
- `value` — numeric
- `unit` — free text (`count`, `days`, `pct`, ...)
- `run` — optional URL or run id
- `note` — annotate when a signal appears, with what you discovered
- `event_type` — the filename of the workflow that recorded the row, without
  `.yml`. Reads default to the `kata-shift` slice

Validate before you analyze: `npx gemba-xmr validate observations.csv`

## CLI Reference

Install and run with npm:

```sh
npx gemba-xmr <command> <csv-path> [options]
```

| Command           | Purpose                                                               |
| ----------------- | --------------------------------------------------------------------- |
| `validate <csv>`  | Check the CSV against the schema                                      |
| `list <csv>`      | One row per metric: count, unit, date range                           |
| `analyze <csv>`   | Full XmR report: chart, limits, signals, classification               |
| `chart <csv>`     | The 14-line Wheeler/Vacanti chart for one metric                      |
| `summarize <csv>` | Compact markdown table across metrics with classification and signals |
| `record`          | Append a metric row to the skill CSV and print a one-line XmR summary |

### Common Options

| Flag                     | Purpose                                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--metric <name>` / `-m` | Filter to a single metric. Optional on `chart` when the CSV has exactly one metric. Required otherwise. Filters `analyze` and `summarize` when you give it.               |
| `--event-type <name>`    | Restrict read commands to one `event_type` slice (default: `kata-shift`; `'*'` for all rows). On `record`, sets the row's value. Without the flag, `record` falls back to `$GITHUB_WORKFLOW_REF`. |
| `--format <text\|json>`  | Output format (default: text). `chart` is text-only.                                                                                                                     |
| `--ascii`                | Substitute ASCII glyphs for Unicode in the chart                                                                                                                         |
| `--help` / `-h`          | Show help (`--json` formats help itself as JSON)                                                                                                                         |

`validate` exits non-zero on schema errors so it can gate CI. A missing CSV
path exits 2 with a friendly error. It does not print a stack trace.

## The Three Rules

These three rules come from Wheeler's _Understanding Variation_. `gemba-xmr`
applies them as Vacanti does in _Actionable Agile Metrics_:

| Rule          | Condition                                                           | Applied to |
| ------------- | ------------------------------------------------------------------- | ---------- |
| **X-Rule 1**  | A point falls outside the natural process limits (UPL or LPL)       | X chart    |
| **X-Rule 2**  | 8 consecutive points fall on the same side of the centerline μ      | X chart    |
| **X-Rule 3**  | 3 of any 4 consecutive points fall in the outer zone (beyond ±1.5σ̂) | X chart    |
| **mR-Rule 1** | A moving range point exceeds URL                                    | mR chart   |

Rules 2 and 3 do not apply to the mR chart. Its asymmetric distribution breaks
symmetric zone tests. When a run-pattern rule fires, `gemba-xmr` marks **all**
the slots in the pattern. It does not mark the trigger alone. **No additional
rules** apply. `gemba-xmr` omits the Western Electric, Nelson, and trend tests.
They inflate false-alarm rates for the small-sample contexts XmR charts target.

## The Chart

`gemba-xmr chart` renders 14 lines: an X chart (7 rows), a blank separator, and
an mR chart (6 rows, with a single shared time axis at the bottom that serves
both charts).

```text
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

- `·` is a non-signal point. `●` is a signal point.
- Drop straight down from any X-chart point to find its index in the shared
  axis.
- `+1.5σ̂` and `−1.5σ̂` mark the **outer-zone boundary** for X-Rule 3.

### Computed quantities

`μ` (mean), `R` (mean moving range), `σ̂ = R / 1.128`, `UPL/LPL = μ ± 2.660 × R`
(LPL not clipped to zero), `URL = 3.268 × R`. The constants are exact for
individuals charts. They are not tunable. This makes XmR limits comparable
across processes.

## Report Shape

`analyze --format json` returns one record per metric. Each record carries
`status`, `classification`, `signals`, the `latest` observation, and `stats`.
`signals` holds one entry per rule, with 1-indexed `slots` and a description.
`stats` holds μ, R, σ̂, UPL, LPL, URL, and the zone bounds.

Pass `--prior-read <YYYY-MM-DD>`, the series-end date at the prior read. Each
fired record then also carries `provenance`. The value is
`recomputation-revealed` when the prior read already held every slot in the
pattern. The value is `new-point` when at least one slot postdates the prior
read. A `recomputation-revealed` signal surfaced because newer data tightened
the recomputed limits. It did not surface because a new point breached
anything. Without the anchor, the record carries no `provenance` field.

`status` is `predictable`, `signals_present`, or `insufficient_data` (n < 15).
`classification` rolls these up into `stable`, `signals` (the X chart fires),
`chaos` (mR Rule 1 fires, so the limits are unreliable), `insufficient`, or
`degenerate-zero` (every observation is zero, so there is no signal at all).

`summarize` reduces the report to a markdown table with a compact signal column
(`R1×k`, `R2×len`, `R3×slots`, `mR1×k`). The linked guide has the full JSON
schema and a worked example.

## Typical Workflow

```sh
npx gemba-xmr validate observations.csv
npx gemba-xmr analyze observations.csv --metric open_vulnerabilities
npx gemba-xmr summarize observations.csv               # paste into a status page
```

## Interpretation Guidance

- **Predictable** processes vary within their natural limits. If you react to a
  single point, that is tampering. It makes the process worse on average.
- **X-Rule 1** confirms magnitude. **X-Rule 2 runs** mean the centerline
  shifted. **X-Rule 3 clusters** catch smaller shifts before Rule 2 fires.
- **mR Rule 1 (chaos)** says volatility spiked. X-chart limits derive from `R`,
  so the rest of the report is unreliable until you investigate.
- **Annotate the CSV `note` field** when you investigate a signal. Future
  analyses depend on the record of why the process changed.
- **Don't set targets from the limits.** Targets come from the work. Limits
  describe the work. See the linked guide for fuller interpretation guidance.

## Documentation

- [Operate a Predictable Agent Team](https://www.gemba.team/docs/predictable-team/index.md)
  — End-to-end guide to wiki memory, XmR charts, and team coordination
- [Chart a Metric and Check Variation](https://www.gemba.team/docs/predictable-team/xmr-analysis/index.md)
  — CSV schema, the three detection rules, the 14-line chart, and interpretation
  guidance
