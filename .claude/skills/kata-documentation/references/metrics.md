# Metrics — Documentation

Record per KATA.md § Metrics. Append
one row per run.

| Metric                  | Unit  | Description                                                             | Data source                                             |
| ----------------------- | ----- | ----------------------------------------------------------------------- | ------------------------------------------------------- |
| errors_found            | count | Factual or staleness errors this run                                    | Review                                                  |
| docs_pages_over_ceiling | count | EOD count of rotation-pool topics whose `age_days > 14` (strict, not ≥) | `wiki/technical-writer.md` § Documentation Review State |

## `docs_pages_over_ceiling` — definition

**Pool:** the rows in the `wiki/technical-writer.md` § Documentation Review State
table. This is the operational rotation pool the scheduled review skill draws
from. As of 2026-05-05 the pool has 8 rows: `cross-page-consistency`,
`internals`, `root-docs`, `product-pages`, `reference`, `guides`,
`getting-started`, `llms-txt-and-seo`. (Note: this is a collapsed view of the
SKILL.md `### Topic areas` table — `guides` rolls up
`products`/`libraries`/`services`. The pool definition is the wiki table because
that is what rotation actually consults.)

**Computation:** at end-of-day, count topics where `age_days > 14`. Strict
greater-than, not ≥ — a topic at exactly 14 days does not contribute. `age_days`
is `today − last_reviewed`, the same value the wiki table reports.

**Cadence:** record once per day during a dual-record window. Outside a
dual-record window, record only when an experiment requires it.

**Tagging:** the `note`/`run` column should carry the experiment tag (e.g.
`docs-ceiling-stock-W19-W20`) so post-window XmR analysis can filter the
window cleanly.

## Series phasing

- **Phase 0 (pre-protocol)** — series rows up to and including 2026-04-30. First-pass topic discovery; high-variance review behavior (e.g., s4=24 internals-review 4/19 captured 5 phantom code paths from libskill that have since been fixed).
- **Phase 1 (post-ratification)** — series rows from 2026-05-01 forward. Ceiling-first activation rule (TW Exp 30) in force; review-mode-only recording (TW Exp 35) in force.

XmR analysis for ongoing process control should compute on Phase 1 only. Phase 0 rows are retained for historical context but do not characterise current process variance.
