# libxmr

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

Wheeler/Vacanti XmR control charts — distinguish signal from noise so agent
teams act on real changes, not fluctuations.

<!-- END:description -->

## Getting Started

```sh
npx fit-xmr --help
npx fit-xmr chart observations.csv --metric latency
npx fit-xmr record --skill kata-product-issue --metric issues_triaged --value 3
```

```js
import {
  analyze,
  renderChart,
  computeXmR,
  detectSignals,
} from "@forwardimpact/libxmr";
```

## CSV schema

```
date,metric,value,unit,run,note,event_type
2026-01-01,latency,124,ms,,,kata-shift
2026-01-02,latency,131,ms,,,kata-shift
```

`date` is ISO 8601, `value` is numeric, `metric`, `unit`, and `event_type` are
required. `run` and `note` are optional. At least 15 points per metric are
needed before limits are computed.

`event_type` names the kind of work a row records — the machine name of the
workflow that recorded it (its filename without `.yml`). `record` takes the
value from `--event-type`, falls back to parsing `$GITHUB_WORKFLOW_REF`, and
rejects the row when neither resolves. The read commands (`analyze`, `chart`,
`summarize`, `list`) default to the `kata-shift` slice, name the active slice
in their output, and accept `--event-type <name>` or `--event-type '*'` for
all rows.

## Example output

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

## Documentation

- [XmR Analysis](https://www.forwardimpact.team/docs/libraries/xmr-analysis/index.md)
  — full guide: CSV schema, commands, the three rules, the chart layout, a
  worked security backlog example, and interpretation guidance.
