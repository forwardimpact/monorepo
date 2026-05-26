# Spec 0720 — Landmark health view readability

## Problem

`fit-landmark health` output is unreadable for first-time users. Captured during
the `landmark-first-time-user` evaluation scenario (issue #357):

- An 8-person team produces ~100KB of text from one invocation.
- Each driver (Clear Direction, Codebase Experience, Code Review, …) appears as
  a paragraph with a single percentile score and a `vs_org` delta — but the
  paragraph is not visually anchored as a row, section, or table cell, so
  readers cannot tell whether successive paragraphs are different drivers,
  different people, or different time periods.
- Growth recommendations like "Neoptolemus (J040) could develop \[skill]" repeat
  verbatim across drivers whenever a single contributing skill flows into
  multiple drivers. Repetition reads as a rendering bug.
- The score line ("63rd percentile, vs_org: -4") suppresses the other
  comparisons the renderer already has on hand (`vs_prev`, `vs_50th`, `vs_75th`,
  `vs_90th`), so the user sees one anchor without knowing what was hidden or
  why.

The view's data model is team-level (one row per driver, aggregating across the
team). The current rendering does not make that dimension visible, so users
mistakenly look for a per-person or per-period dimension that is not there.

## Why

Landmark's value is letting leadership and engineers read driver-level health at
a glance and act on it. When the default output is unreadable on the first
encounter, the product fails its own "answer _what milestones has my engineering
reached?_" job. This blocks adoption by leaders who do not have the patience to
learn the layout from the source code.

## Scope

### In scope

- The default output of `fit-landmark health` for `--format text` and
  `--format markdown` — both emitted by `toText` and `toMarkdown` in
  `products/landmark/src/formatters/health.js`.
- A new `--verbose` flag on the `health` command. `--format json` retains its
  current full-fidelity shape regardless of `--verbose`.
- The product page (`websites/fit/landmark/index.md`) and the leadership
  getting-started page
  (`websites/fit/docs/getting-started/leadership/landmark/index.md`) health-view
  section, updated to match the new defaults.

### Out of scope

- Adding new data sources (per-person breakdowns, time-series comparisons). This
  spec is purely about presenting the data the renderer already receives.
- Changing the underlying view shape produced by
  `products/landmark/src/commands/health.js` — the contract between command and
  formatter is unchanged.
- The `--manager` filter or any other scoping flag.
- JSON output structure.

## Success criteria

Verified against the synthetic team in `products/landmark/test/fixtures.js`,
which the existing `products/landmark/test/health.test.js` suite exercises.

| Claim                                                                                                                                                    | Verifiable by                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The view's row dimension is unambiguous: a reader can tell, before the first driver paragraph, that subsequent rows are drivers (not people or periods). | Manual read of `bunx fit-landmark health` text output against the fixture; no driver paragraph stands alone without a section anchor.                                                                                                                                         |
| The default text output fits within one screen on a standard terminal (≤50 lines) for the fixture's six drivers.                                         | `bunx fit-landmark health \| wc -l` ≤ 50 on the fixture. ≤50 chosen so the output fits a typical 80×50 pane without scroll.                                                                                                                                                   |
| `--verbose` produces output that includes every field currently emitted by today's text formatter — no information loss.                                 | Field-level checklist drawn from `products/landmark/src/formatters/health.js` `toText` (driver name, score, all four percentile deltas, contributing skills, evidence counts, comments, recommendations, initiatives) appears in `bunx fit-landmark health --verbose` output. |
| Growth recommendations that target the same `(candidate, skill)` pair across multiple drivers appear at most once.                                       | `bunx fit-landmark health \| grep -c "could develop"` equals the number of distinct `(candidate, skill)` pairs in the fixture's recommendations array.                                                                                                                        |
| Score lines disclose which comparison anchor is shown by default and signal that more anchors are available in `--verbose`.                              | Manual read: each driver's score line includes a labelled anchor and a hint pointing to `--verbose`.                                                                                                                                                                          |
| The product page and leadership getting-started page describe the `--verbose` flag and show a sample of the new default output.                          | Both pages contain a literal `--verbose` mention, a sample block of the new default output, and no stale claims that contradict the new layout.                                                                                                                               |

## Notes

- Issue #357 — first-time user feedback that motivates this spec.
- The renderer already receives `vs_prev`, `vs_50th`, `vs_75th`, `vs_90th`, and
  full skill/candidate/initiative arrays per driver. HOW to disclose them is the
  design phase's call.

— Product Manager 🌱
