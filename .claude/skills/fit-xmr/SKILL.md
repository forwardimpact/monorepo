---
name: fit-xmr
description: >
  Distinguish signal from noise so the team acts on real changes, not
  fluctuations. Use when a metric changes and the team debates whether it
  is a real shift or just noise, when you need a compact status chart for
  a wiki, PR, or report, or when recording and analyzing time-series
  metrics with Wheeler/Vacanti XmR control charts.
---

# XmR Analysis

`fit-xmr` reads a CSV of dated observations, computes Wheeler/Vacanti XmR
(individuals and moving range) control limits, detects special-cause signals,
and renders a fixed-width 14-line chart that makes the rules visible by
inspection.

It implements **one canonical rendering — no variants** — following Wheeler's
three-rule formulation as adopted by Vacanti for agile flow metrics.

## When to Use

**Decide whether a change is signal or noise:**

- Analyzing a metric over time — `npx fit-xmr analyze observations.csv --metric <name>`
- Viewing the 14-line control chart — `npx fit-xmr chart observations.csv --metric <name>`
- Recording a new observation — `npx fit-xmr record`

**Report on process stability:**

- Compact markdown status table — `npx fit-xmr summarize observations.csv`
- Listing available metrics — `npx fit-xmr list observations.csv`
- Validating CSV schema — `npx fit-xmr validate observations.csv`

If the question is _"how is this metric trending?"_ — this is the right tool. If
the question is _"what target should we set?"_ — this is **not** the right tool.
Natural process limits describe what a process _does_, not what it _should_ do.

## CSV Schema

`fit-xmr` expects exactly this header:

```
date,metric,value,unit,run,note,event_type
```

- `date` — ISO 8601 (`YYYY-MM-DD`)
- `metric` — metric name (one CSV may carry many metrics)
- `value` — numeric
- `unit` — free text (`count`, `days`, `pct`, ...)
- `run` — optional URL or run id
- `note` — annotate when a signal appears, with what you discovered
- `event_type` — the workflow that recorded the row, by its filename without
  `.yml`; the default read slice is `kata-shift`

Validate before analysis:

```sh
npx fit-xmr validate observations.csv
```

## CLI Reference

Install and run via npm:

```sh
npx fit-xmr <command> <csv-path> [options]
```

| Command           | Purpose                                                               |
| ----------------- | --------------------------------------------------------------------- |
| `validate <csv>`  | Check the CSV against the schema                                      |
| `list <csv>`      | One row per metric: count, unit, date range                           |
| `analyze <csv>`   | Full XmR report: chart, limits, signals, classification               |
| `chart <csv>`     | The 14-line Wheeler/Vacanti chart for one metric                      |
| `summarize <csv>` | Compact markdown table across metrics with classification and signals |
| `record`           | Append a metric row to the skill CSV and print a one-line XmR summary |

### Common Options

| Flag                     | Purpose                                                                                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--metric <name>` / `-m` | Filter to a single metric. Optional on `chart` when the CSV has exactly one metric; otherwise required. Filters `analyze` and `summarize` when given. |
| `--event-type <name>`    | Restrict read commands to one `event_type` slice (default: `kata-shift`; `'*'` for all rows). On `record`, sets the row's value, falling back to `$GITHUB_WORKFLOW_REF`. |
| `--format <text\|json>`  | Output format (default: text). `chart` is text-only.                                                                                                  |
| `--ascii`                | Substitute ASCII glyphs for Unicode in chart rendering                                                                                                |
| `--help` / `-h`          | Show help (`--json` formats help itself as JSON)                                                                                                      |

`validate` exits non-zero on schema errors so it can gate CI. Missing CSV path
exits 2 with a friendly error, not a stack trace.

---

## The Three Rules

The three rules from Wheeler's _Understanding Variation_, applied as Vacanti
applies them in _Actionable Agile Metrics_:

| Rule          | Condition                                                           | Applied to |
| ------------- | ------------------------------------------------------------------- | ---------- |
| **X-Rule 1**  | A point falls outside the natural process limits (UPL or LPL)       | X chart    |
| **X-Rule 2**  | 8 consecutive points fall on the same side of the centerline μ      | X chart    |
| **X-Rule 3**  | 3 of any 4 consecutive points fall in the outer zone (beyond ±1.5σ̂) | X chart    |
| **mR-Rule 1** | A moving range point exceeds URL                                    | mR chart   |

Rules 2 and 3 are not applied to the mR chart — its distribution is asymmetric,
so symmetric zone tests don't behave the way they do on the X chart.

When a run-pattern rule fires (Rule 2 or Rule 3), **all** participating slots
are marked, not just the trigger. **No additional rules** — Western Electric,
Nelson, and trend tests are deliberately omitted; they inflate false-alarm rates
for the small-sample contexts XmR charts target.

## The Chart

`fit-xmr chart` renders 14 lines: an X chart (7 rows), a blank separator, and an
mR chart (6 rows including a single shared time axis at the bottom that serves
both charts).

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

- `·` is a non-signal point; `●` is a signal point.
- Drop your eye straight down from any point in the X chart to find its time
  index in the shared axis.
- `+1.5σ̂` and `−1.5σ̂` mark the **outer-zone boundary** for X-Rule 3.

### Computed quantities

`μ` (mean), `R` (mean moving range), `σ̂ = R / 1.128`, `UPL/LPL = μ ± 2.660 × R`
(LPL not clipped to zero), `URL = 3.268 × R`. The constants are exact for
individuals charts and not tunable — that's what makes XmR limits comparable
across processes.

## Report Shape

`analyze --format json` returns one record per metric with `status`,
`classification`, `signals` (per rule, with 1-indexed `slots` and a
description), `latest` observation, and `stats` (μ, R, σ̂, UPL, LPL, URL, zone
bounds).

`status` is one of `predictable`, `signals_present`, or `insufficient_data` (n <
15 — limits not computed). `classification` rolls these up into `stable`,
`signals` (X chart rule fires), `chaos` (mR Rule 1 fires — variation itself is
unstable, making X-chart limits unreliable), or `insufficient`.

`summarize` reduces the report to a markdown table with a compact signal column
(`R1×k`, `R2×len`, `R3×slots`, `mR1×k`). See the linked guide for the full JSON
schema and a worked example.

## Typical Workflow

```sh
npx fit-xmr validate observations.csv
npx fit-xmr analyze observations.csv --metric open_vulnerabilities
npx fit-xmr summarize observations.csv               # paste into a status page
```

## Interpretation Guidance

- **Predictable** processes vary within their natural limits. Reacting to a
  single point is tampering — it makes the process worse on average.
- **X-Rule 1** confirms magnitude; **X-Rule 2 runs** mean the centerline
  shifted; **X-Rule 3 clusters** catch smaller shifts before Rule 2 fires.
- **mR Rule 1 (chaos)** says volatility itself spiked. The X-chart limits are
  computed from `R`, so the rest of the report is unreliable until you
  investigate.
- **Annotate the CSV `note` field** when you investigate a signal — future
  analyses depend on the record of why the process changed.
- **Don't set targets from the limits.** Targets come from the work; limits
  describe the work. See the linked guide for fuller interpretation guidance.

---

## Documentation

- [Operate a Predictable Agent Team](https://www.forwardimpact.team/docs/libraries/predictable-team/index.md)
  — End-to-end guide to wiki memory, XmR charts, and team coordination
- [Chart a Metric and Check Variation](https://www.forwardimpact.team/docs/libraries/predictable-team/xmr-analysis/index.md)
  — CSV schema, the three detection rules, the 14-line chart, and
  interpretation guidance
