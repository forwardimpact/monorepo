---
spec: 720
title: Landmark health view readability — design A
status: design draft
---

# Design A — Landmark Health View Readability

The spec is a rendering problem with the data already in hand. The view shape
emitted by `products/landmark/src/commands/health.js` is unchanged; everything
ships in the `text` and `markdown` formatters and one new boolean meta field.
JSON output is exempt by spec.

## Components

```mermaid
flowchart LR
  Parse[CLI parse] -->|values.verbose| CLI[bin/fit-landmark.js]
  Cmd[commands/health] -->|view, meta| CLI
  CLI -->|sets meta.verbose| Disp[formatters/index — formatResult]
  Disp -->|view, meta| Fmt[formatters/health]
  Fmt -->|toText / toMarkdown| Out[stdout]
  subgraph formatters/health
    Mode{meta.verbose?}
    Mode -- false --> Default[renderDefault]
    Mode -- true --> Verbose[renderVerbose]
    Default --> Dedup[dedupeRecommendations]
    Verbose --> Dedup
  end
```

| Component                              | Module                                         | Role                                                                                                                 |
| -------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `verbose` per-command option           | landmark CLI binary                            | Surface a boolean flag on the `health` command only; `values.verbose` flows out of `cli.parse(...)`.                 |
| `meta.verbose` augmentation            | landmark CLI binary, after the handler returns | The handler builds `meta`; the binary copies `values.verbose` into `meta.verbose` before invoking `formatResult`.    |
| `formatters/health` default formatters | shared formatter module                        | Function declarations extend from `(view)` to `(view, meta)`; dispatcher already passes `meta`. JSON path unchanged. |
| `dedupeRecommendations(drivers)`       | private helper inside `formatters/health`      | Walk `drivers[].recommendations[].candidates[]`; collapse to one `DedupedRec` per `(candidate.email, rec.skill)`.    |
| `renderScoreCells(driver, verbose)`    | private helper inside `formatters/health`      | Returns the cell tuple for a driver row in default mode and the multi-anchor block in verbose mode.                  |

## Data Flow

```mermaid
sequenceDiagram
  participant U as User
  participant CLI as fit-landmark
  participant H as runHealthCommand
  participant D as formatResult
  participant F as formatters/health
  U->>CLI: fit-landmark health [--verbose]
  CLI->>H: options{manager}, format
  H-->>CLI: { view, meta{format, warnings, emptyState?} }
  CLI->>CLI: meta.verbose = values.verbose ?? false
  CLI->>D: formatResult("health", { view, meta })
  D->>F: toText(view, meta) or toMarkdown(view, meta)
  F->>F: dedupeRecommendations(view.drivers)
  alt meta.verbose
    F->>F: renderVerbose(view, deduped) — current paragraph layout
  else default
    F->>F: renderDefault(view, deduped) — table + recs trailer
  end
  F-->>U: text or markdown
```

The view shape (`drivers[]` with `score`, all four `vs_*` deltas,
`contributingSkills`, `comments`, `initiatives`, `recommendations`) is produced
by the command today and passed through unchanged. The command's per-driver
recommendation fan-out is kept; the formatter is the single owner of dedup.

## Default Layout

Driver iteration order matches `view.drivers`; no new sort. The plural header
`Drivers (N)` is the row-dimension anchor (success criterion 1).

**Text:**

```
  {teamLabel} — health view

  Drivers (N)
  ────────────────────────────────────────────────────────────
  #  Driver          Percentile  vs_org   More
  1  Quality         42nd        -10      +3 anchors via --verbose
  2  Reliability     n/a         n/a      -
  ...

  Recommendations (K unique)
  ────────────────────────────────────────────────────────────
  - Bob (Level II) could develop planning -- for Quality (critical)
  - Alice (Level I) could develop incident_response -- for Reliability (high)
  ...
```

**Markdown:**

```markdown
# {teamLabel} — health view

## Drivers (N)

| #   | Driver      | Percentile | vs_org | More                       |
| --- | ----------- | ---------- | ------ | -------------------------- |
| 1   | Quality     | 42nd       | -10    | +3 anchors via `--verbose` |
| 2   | Reliability | n/a        | n/a    | -                          |

## Recommendations (K unique)

- **Bob** (Level II) could develop `planning` — for Quality (critical)
- **Alice** (Level I) could develop `incident_response` — for Reliability (high)
```

`More` reads `+N anchors via --verbose` where N = count of non-null hidden
anchors (`vs_prev`, `vs_50th`, `vs_75th`, `vs_90th`); the displayed `vs_org` is
not counted. `-` if all hidden anchors are null. No literal arrow glyphs.

## Verbose Layout

`meta.verbose === true` reuses today's paragraph form (driver heading,
contributing skills, evidence counts, comments, recommendations, initiatives).
Score line lists all four hidden anchors; recs render inline per driver but each
`(candidate, skill)` appears only on its first occurrence — the same
`DedupedRec` set powers both modes (success criterion 3).

## Multi-Candidate Recommendation Dedup

`recommendations[].candidates` is an array. Dedup is keyed per
`(candidate.email, rec.skill)` — a rec naming two candidates yields two
`DedupedRec` entries. The helper walks `drivers → recommendations → candidates`,
emits one entry per first-seen key, and appends `driver.name` to `driverNames`
on later hits. `impact` is taken from the first occurrence.

## Key Decisions

| Decision                            | Choice                                                                            | Rejected alternative                                       | Why                                                                                                                        |
| ----------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Where the verbose flag lives        | `meta.verbose` boolean alongside `meta.format`                                    | A new `view.verbose` field, or a third formatter argument  | `meta` already carries rendering control; `view` is data; the formatter signature extends from `(view)` to `(view, meta)`. |
| Where recommendation dedup happens  | Formatter pre-pass, keyed by `(candidate.email, rec.skill)`                       | Move dedup into `runHealthCommand` (single rec per driver) | Spec freezes the command/formatter contract. Dedup is presentation, not data.                                              |
| Default layout shape                | Compact table + separate `Recommendations` trailer                                | Keep paragraphs but trim per-driver lines                  | A table makes the row dimension unambiguous (spec success criterion 1) and trivially fits ≤50 lines.                       |
| What the default score column shows | One anchor (`vs_org`) + a `More` cell hinting `--verbose`                         | Show all four anchors inline in one row                    | Four numeric columns plus driver name explodes column width; spec calls out anchor disclosure as the goal.                 |
| What verbose adds beyond default    | All four anchors per row + comments + initiatives + per-driver paragraph richness | A different layout — table with extra columns              | Spec requires "every field currently emitted by today's text formatter"; reusing today's layout proves it.                 |
| Recommendation home in default      | Single trailer section under the table                                            | Inline under each driver                                   | Inline placement is what causes the verbatim-repetition bug (success criterion 4).                                         |
| Initiatives + comments in default   | Hidden in default, visible in `--verbose`                                         | A truncated trailer in default                             | Default budget is ≤50 lines for 6 drivers; trailer truncation reintroduces the "what's hidden?" ambiguity.                 |

## Interfaces

```ts
// formatters/health.js — public exports
// Today's signatures are (view); this design extends both to (view, meta).
toText(view: HealthView, meta: Meta): string
toMarkdown(view: HealthView, meta: Meta): string
toJson(view: HealthView, meta: Meta): string // unchanged

// new internal helpers, not exported
function dedupeRecommendations(drivers: Driver[]): DedupedRec[]
function renderScoreCells(driver: Driver, verbose: boolean):
  | { percentile: string; vsOrg: string; more: string } // default mode → table cells
  | string[] // verbose mode → multiple anchor lines

// Meta — additive shape change. Existing fields (format, warnings, emptyState)
// stay; verbose is the only new field.
interface Meta {
  format: "text" | "markdown" | "json"
  warnings: string[]
  emptyState?: string // pre-existing — preserved
  verbose?: boolean // new — undefined treated as false
}

interface DedupedRec {
  candidate: { name?: string; email: string; currentLevel: string }
  skill: string
  impact: string
  driverNames: string[] // driver.name values, for the trailer "for Quality, Reliability" phrase
}
```

`HealthView` and `Driver` are the shape produced by `runHealthCommand` today —
this design does not modify them.

## Scope-Faithful Notes

- **JSON path untouched.** `toJson` ignores `meta.verbose`; full view shape
  emitted as today.
- **No view-shape mutation.** Dedup state is per-render and local; the command
  remains the sole producer of `view.drivers[].recommendations`.

## Risks

| Risk                                                            | Mitigation                                                                       |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Markdown table cells with `n/a` percentiles widen unpredictably | Pin column widths in text via `padRight`; let markdown reflow naturally.         |
| Dedup hides recs the user wants to see per driver               | Trailer line names every driver the rec applies to (`for Quality, Reliability`). |
| `--verbose` becomes the new default in users' muscle memory     | Default layout's `More` cell hints `--verbose` so discovery is self-evident.     |

## Out of Scope (for the planner)

File-level edits, doc wording, execution ordering, test assertions. Doc pages in
spec scope (landmark product page + leadership getting-started) each own one
`--verbose` mention and one sample of the new default; planner picks placement.

— Staff Engineer 🛠️
