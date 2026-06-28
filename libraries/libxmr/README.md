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

```text
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
`summarize`, `list`) default to the `kata-shift` slice, name the active slice in
their output, and accept `--event-type <name>` or `--event-type '*'` for all
rows.

### Route-decision grammar in `note`

A row can tag the decision path its work took with structured tokens at the head
of the `note`, before any free text:

```text
route_taken=<id>; routes_eligible=[<id>,<id>,...];
```

- `route_taken` — the single path taken (a small integer, or the literal
  `none`).
- `routes_eligible` — the comma-separated set of paths that were available,
  including the one taken. Brackets are literal; an empty set is `[]`.

Quote the `note` so the embedded comma does not split the column:

```text
2026-06-20,implementations_shipped,3,count,,"route_taken=2; routes_eligible=[2,3];",kata-shift,local
```

`analyze` partitions on these tokens: `--route <id>` keeps rows whose
`route_taken` matches, and `--routes-eligible-includes <id>` keeps rows whose
`routes_eligible` set contains the id. Each filter is inert when omitted, so a
plain `analyze` charts the whole series. `record --route <id>
[--routes-eligible <ids>]` writes the grammar and quotes the field for you,
rejecting unknown path ids. Both filters compose with `--metric` and
`--event-type`.

## Example output

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

## Classifications

`analyze` stamps each metric with a `classification` that names its
process-behavior shape:

| Classification    | Meaning                                                                   |
| ----------------- | ------------------------------------------------------------------------- |
| `stable`          | Predictable: no rules fire and the series varies within its limits.       |
| `signals`         | At least one X-chart rule fired. Investigate what changed.                |
| `chaos`           | mR Rule 1 fired. The variation itself is unstable; limits are unreliable. |
| `insufficient`    | Fewer than 15 points. Limits are not computed.                            |
| `degenerate-zero` | Predictable, but every observation equals zero — no variation around zero, so the series carries no process signal and a predictability target is not substantively met by it. |

## Signal records

`analyze` reports fired signals keyed by rule (`xRule1`, `xRule2`, `xRule3`,
`mrRule1`). Each record carries `slots` (1-indexed positions in the series) and
a `description`.

Pass a **prior-read anchor** — the metric's series-end date as of the prior read
— and every fired record also carries `provenance`:

- `recomputation-revealed` — every participating slot was already present at the
  prior read (`max(slots)` is at or before the anchor slot). The signal surfaced
  only because recomputing limits over newer data shifted them, not because a
  new point breached anything.
- `new-point` — at least one participating slot postdates the anchor.

```sh
npx fit-xmr analyze corrections.csv --prior-read 2026-06-04
```

The value records anchor-relative **data membership**, not novelty: a signal
that also fired at the prior read still carries `recomputation-revealed`. With
no anchor — or an anchor that does not match a series date — records carry no
`provenance` field and the report is otherwise unchanged. The storyboard refresh
surfaces the value at the cell so a reader tells recomputation-revealed signals
from new-point signals without prose disclaimers.

## Documentation

- [Chart a Metric and Check Variation](https://www.forwardimpact.team/docs/libraries/predictable-team/xmr-analysis/index.md)
  — full guide: CSV schema, commands, the three rules, the chart layout, a
  worked security backlog example, and interpretation guidance.
