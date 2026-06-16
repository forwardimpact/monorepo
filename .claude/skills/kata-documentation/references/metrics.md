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
