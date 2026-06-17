# Metrics — Documentation

Record per KATA.md § Metrics. Append
one row per run.

| Metric                  | Unit  | Description                                                             | Data source                                             |
| ----------------------- | ----- | ----------------------------------------------------------------------- | ------------------------------------------------------- |
| errors_found            | count | Factual or staleness errors this run                                    | Review                                                  |
| docs_pages_over_ceiling | count | EOD count of rotation-pool topics whose `age_days > 14` (strict, not ≥) | `wiki/technical-writer.md` § Documentation Review State |

## `docs_pages_over_ceiling` — Definition

**Pool:** the rows in the `wiki/technical-writer.md` § Documentation Review State
table. This is the operational rotation pool the scheduled review skill draws
from — a collapsed view of the SKILL.md `### Topic areas` table. The pool
definition is the wiki table because that is what rotation actually consults.

**Computation:** at end-of-day, count topics where `age_days > 14`. Strict
greater-than, not ≥ — a topic at exactly 14 days does not contribute. `age_days`
is `today − last_reviewed`, the same value the wiki table reports.

**Cadence:** record only while an active experiment requires it, once per day.

**Tagging:** the `note`/`run` column carries the experiment's tag so
post-window XmR analysis can filter the window cleanly.

## `errors_found` — Enumeration-drift tagging

When a build-time enumeration-drift gate covers the repo's restated
enumerations (services lists, library and skill counts, sibling-action
tables, products and workflow lists), a finding the gate would have caught is
recorded on its `errors_found` row with a `note` that begins:

```
enumeration-drift:<topic-id>:
```

`<topic-id>` names the registry source-of-truth set the drift belongs to,
followed by a short description. Tagging this way lets post-window analysis
isolate enumeration-class findings from the broader `errors_found` series
without re-reading every note. Findings filed before the gate landed keep
their existing free-text notes and are not part of the tagged series.
