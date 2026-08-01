# Metrics — Documentation

Record per KATA.md § Metrics. Append
one row per run.

| Metric                  | Unit  | Description                                                             | Data source                                             |
| ----------------------- | ----- | ----------------------------------------------------------------------- | ------------------------------------------------------- |
| errors_found            | count | Factual or staleness errors this run                                    | Review                                                  |
| docs_pages_over_ceiling | count | End-of-day count of rotation-pool topics whose `age_days > 14` (strict) | `wiki/technical-writer.md` § Documentation Review State |

## `docs_pages_over_ceiling` — Definition

**Pool:** the rows in the `wiki/technical-writer.md` § Documentation Review
State table. The scheduled review skill draws its rotation from this pool. The
pool is a collapsed view of the SKILL.md `### Topic areas` table. The wiki table
defines the pool, because rotation consults the wiki table.

**Computation:** at end-of-day, count the topics where `age_days > 14`. The
comparison is a strict greater-than. A topic at exactly 14 days does not
contribute. `age_days` is `today − last_reviewed`. The wiki table reports the
same value.

**Cadence:** record only while an active experiment requires it, once per day.

**Tagging:** the `note`/`run` column carries the experiment's tag so
post-window XmR analysis can filter the window cleanly.

## `errors_found` — Enumeration-drift tagging

When a build-time enumeration-drift gate covers the repo's restated
enumerations (services lists, library and skill counts, sibling-action
tables, products and workflow lists), record a finding the gate would catch on
its `errors_found` row. Begin that row's `note` with:

```text
enumeration-drift:<topic-id>:
```

`<topic-id>` names the registry source-of-truth set the drift belongs to. A
short description follows it. This tag lets post-window analysis isolate
enumeration-class findings from the broader `errors_found` series. The
analysis does not read every note again. Findings filed before the gate landed
keep their existing free-text notes. They are not part of the tagged series.
