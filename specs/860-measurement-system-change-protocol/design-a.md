# Design 860-A — Measurement-system change protocol

## Architecture summary

Add one new agent-level reference,
`.claude/agents/references/measurement-protocol.md`, that names the
repair-move typology, the Measurement Change Disclosure (MCD) shape, and
the no-silent-amendment rule. KATA.md § Metrics gains one paragraph
linking to it and a small extension admitting the binding-constraint
metric (see decision #6). The canonical-11 enumeration stays where it
lives today (`wiki/storyboard-*.md`); the reference defines the
protocol around it, not the list itself. The `kata-release-merge`
skill becomes the producer of one new canonical metric,
`time_to_first_approval_hours`, written one row per run to its existing
`wiki/metrics/kata-release-merge/{YYYY}.csv` (the file is already long-
format — `date,metric,value,unit,run,note` — so the new metric joins as
additional rows, distinguished by the `metric` column, alongside the
existing `prs_merged` rows). The `kata-session` skill's team-storyboard
overlay gains two checklist items so canonical-11 changes are gated on a
linked MCD without restating the rule. No agent-persona files change.

## Components

| Component | Lives in | Responsibility |
| --- | --- | --- |
| `measurement-protocol.md` | `.claude/agents/references/` | Names repair-move typology, MCD shape, no-silent-amendment rule. Sibling of `coordination-protocol.md` and `memory-protocol.md`. |
| KATA.md § Metrics extension | `KATA.md` | One paragraph linking to the new reference, plus one sentence admitting the binding-constraint metric (decision #6). |
| `time_to_first_approval_hours` metric | `wiki/metrics/kata-release-merge/{YYYY}.csv` (additional rows; `metric` column distinguishes from `prs_merged`) | New canonical-11 entry. Producer = `kata-release-merge`. One row per run; value is the median hours-to-first-`<phase>:approved`-signal across qualifying PRs (cohort and empty-day rules below). |
| `kata-release-merge` `references/metrics.md` extension | `.claude/skills/kata-release-merge/references/metrics.md` | Adds the new metric's row alongside `prs_merged`; documents the cohort predicate and the empty-day rule. |
| Storyboard MCD hook | `.claude/skills/kata-session/references/team-storyboard.md` | Two checklist additions: every canonical-11 change item carries an `MCD:` link; cohort read-out items enumerate the day's MCDs. |
| MCD authoring locus | Existing `experiment` and `obstacle` GitHub issue bodies | The MCD is a YAML section template inside the issue body, not a new artifact type. Canonical-11 change diffs cite it by issue link. |

## Repair-move typology (eight named moves)

Each move binds a one-sentence definition and the kind of falsifier-set
predicates an instance MCD must include. The list is closed: extensions
land via the spec/design/plan/implement chain, not via the MCD form.

| Move | Definition | Falsifier-set kind | Existing precedent |
| --- | --- | --- | --- |
| `producer-rehoming` | Reassign a metric's producing skill when the original is removed/split/renamed; record continuity tag on first row under new producer. | "structural-zero rows present after rehoming run" | #788, RFC #804 |
| `mode-restriction` | Narrow recording to one activation mode of a multi-mode skill so the series is unimodal. | "post-restriction series remains bimodal under XmR" | #772, PR #773 |
| `historical-phasing` | Annotate a series with a Phase boundary; XmR analysis windows on Phase 1; no CSV backfill. | "Phase 1 cannot reach `predictable` after horizon" | #809, PR #811 |
| `sidecar-pre-flight` | Record a candidate metric to a sibling CSV while the canonical metric continues; no denominator change until ratification. | "sidecar diverges from canonical at horizon" | #787 |
| `stock-vs-flow-recast` | Replace a flow-rate metric with a stock metric on the same axis when burst architecture trips XmR by construction. | "stock series fires `xRule1` or `mrRule1` post-recast" | #768, #770 |
| `event-driven-recast` | Replace per-day cadence with per-activation ("no row, no event"). | "per-activation series remains `insufficient_data` at horizon" | #810 |
| `rule-semantics-rfc` | Challenge an XmR rule's blocking effect on `predictable` via Discussion RFC; quorum required. | "RFC quorum not reached by horizon" | #814 |
| `habit-to-policy` | Promote an undocumented defensive habit into a SKILL.md check after a defect surfaces. | "post-promotion defect of the same shape recurs" | #817, PR #655 |

## MCD shape

```yaml
mcd:
  move: producer-rehoming | mode-restriction | historical-phasing |
        sidecar-pre-flight | stock-vs-flow-recast | event-driven-recast |
        rule-semantics-rfc | habit-to-policy
  affected_metrics: [{skill: <skill>, metric: <metric>}]
  falsifier_set: [<predicate>, ...]   # at least one predicate of the kind named for the move
  verdict_horizon: <YYYY-MM-DD>
  cohort_readout: <YYYY-MM-DD>
  denominator_effect: none | sidecar | conditional-amend | amend
  links:
    obstacle_issue: <#NNN>?
    experiment_issue: <#NNN>?
    pr: <#NNN>?
```

The MCD is an embeddable YAML block (fenced) inside an experiment or
obstacle issue body. `denominator_effect` is the explicit hook for the
no-silent-amendment rule: any value other than `none` requires a cohort
read-out date and a linked storyboard line. Spec Success #6 is satisfied
because every canonical-11 change diff carries an `MCD: #NNN` link
inline (in the producer skill's `references/metrics.md`, in the
`measurement-protocol.md` reference's change log, or in the storyboard
file): the link sits in `git diff`; the body lives in the issue.

## No-silent-amendment rule

> No change to the canonical-11 denominator (additions, removals,
> conditional or unconditional amendments) lands without an MCD whose
> `denominator_effect` is non-`none`, a cohort read-out date on or
> before the storyboard meeting at which the change takes effect, and a
> linked storyboard headline that surfaces the change up-front.

This single statement lives in `measurement-protocol.md`. KATA.md § Metrics
links to it; no other file restates it.

## Approval-throughput metric

`time_to_first_approval_hours` reads the binding constraint #572 names.
The metric is a **duration**, not a count — KATA.md § Metrics today
binds metrics to the count of units of work; admitting a duration metric
for the binding constraint is the smallest extension that satisfies the
spec's Success #4 (decision #6).

- **Producer:** `kata-release-merge` — the skill already iterates phase
  PRs and reads `<phase>:approved` signals.
- **Cohort:** PRs whose **first** `<phase>:approved` signal was observed
  for the first time during this run (the "fresh-approval" cohort). A
  PR contributes its time-to-first-approval value once, not on every
  subsequent run that touches it.
- **Empty cohort:** a run with zero qualifying PRs appends a row with
  empty `value` (preserving one-row-per-run discipline). `fit-xmr`
  treats an empty value as a missing observation, not as zero — distinct
  from the structural-zero failure mode #788 surfaced.
- **Signal predicate:** label-add events for `spec:approved`,
  `design:approved`, `plan:approved`, and `plan:implemented` (read via
  `gh api repos/.../issues/{n}/timeline`), plus PR-review APPROVED
  events (read via `gh pr view --json reviews`). The earlier of the two
  per PR is the first-approval timestamp.
- **Aggregation:** median hours from PR open to first-approval timestamp
  across the cohort. Median compresses to one row, retains magnitude,
  and is XmR-stable for the bursty distribution (mean is volatile under
  Dependabot waves).

## Data flow

```mermaid
flowchart LR
  CHG[Canonical-11 change<br/>proposed in issue] --> MCD[MCD YAML block in issue body]
  MCD --> SB{Storyboard MCD hook}
  SB --> READ[Cohort read-out at horizon date]
  READ --> RAT{Ratify?}
  RAT -- yes --> AMEND[Storyboard line updates;<br/>denominator change lands]
  RAT -- no --> ROLL[Sidecar / phase / mode<br/>change rolled back]
  KATA["KATA.md § Metrics"] -.->|links to| REF[measurement-protocol.md]
  STORY[wiki/storyboard-*.md] -.->|links to| REF
  RM[kata-release-merge run] --> CSV[wiki/metrics/kata-release-merge/{YYYY}.csv]
  CSV --> XMR[fit-xmr analyze]
  REF -.->|enumerates| MOVES[Eight repair moves]
  REF -.->|defines| MCD
  REF -.->|owns| RULE[No-silent-amendment rule]
```

## Key decisions

| # | Decision | Rejected alternative | Why |
| --- | --- | --- | --- |
| 1 | Locate the typology, MCD, and rule in one new agent-level reference (`measurement-protocol.md`). | Inline the typology and rule in KATA.md § Metrics. | KATA.md is identity-and-orientation per CLAUDE.md § Documentation Map. Protocol detail belongs with siblings `coordination-protocol.md` and `memory-protocol.md`. |
| 2 | MCD is a YAML block embedded in existing experiment/obstacle issues. | New issue type or new file type per change. | Repair moves already coincide with existing issues. The YAML block makes the MCD greppable inside its issue body; the change-diff carries the issue link. |
| 3 | Repair-move list is closed at design time; extensions land via spec/design/plan/implement. | Open list with a `move: new-move` enum value usable at MCD time. | A closed list is the legible part of the protocol; an open list reverts to the current ad-hoc state. Forcing extensions through the spec chain preserves growth without diluting closure. |
| 4 | Producer for `time_to_first_approval_hours` is `kata-release-merge`. | New `kata-approval-meter` skill; or producer = `kata-session`. | `kata-release-merge` already iterates phase PRs and reads `<phase>:approved` signals. A new skill adds an agent-team matrix entry for one metric. `kata-session` is a once-daily facilitator and would miss between-meeting churn. |
| 5 | Metric value = median across the fresh-approval cohort, with empty `value` on zero-cohort runs. | Mean; per-PR rows; rolling-cohort with all carry-forward PRs; row omission on zero-cohort runs. | Mean is volatile under bursty cadence. Per-PR rows violate one-row-per-run. Rolling cohort double-counts a PR's dwell across runs. Row omission breaks `fit-xmr`'s expectation of one row per run; an empty value preserves the discipline and is treated as a missing observation, not a structural zero. |
| 6 | New metric joins the existing `kata-release-merge/{YYYY}.csv` as additional rows (long-format CSV; `metric` column distinguishes). KATA.md § Metrics extends to admit one binding-constraint duration metric per producer skill alongside its count metric. | Sibling CSV (`{YYYY}-approval.csv`); new directory. | The CSV is already long-format with a `metric` column; adding rows is the lightest possible extension. The KATA.md edit is the minimum a duration binding-constraint metric requires (count rule preserved as the default; binding-constraint metric admitted as the named exception). |
| 7 | Storyboard hook is two checklist items in `kata-session/references/team-storyboard.md`. | Bake the MCD link requirement into prose; add to `kata-session/SKILL.md`; add to `wiki/storyboard-*.md` template. | Checklists are greppable and machine-checkable (Success #6). The team-storyboard overlay is the canonical home for storyboard-meeting checks; SKILL.md is the umbrella, prose drifts. |
| 8 | `denominator_effect: conditional-amend` admitted as a first-class value, with a cohort read-out date as the firing condition. | Conditional amendments expressed in free prose per RFC. | The team has already used conditional amendments (#804, Dim 2 → Dim 2/10). A first-class field makes the firing condition machine-readable and lets storyboard pre-surface the conditional line. |

## Migration boundary

`kata-release-merge` records the new metric prospectively from the
implementation run forward; no historical backfill (consistent with
`historical-phasing`). Existing experiments and obstacles need not file
retroactive MCDs — the protocol applies to canonical-11 changes
proposed after `measurement-protocol.md` lands on `main`. The
canonical-11 enumeration stays in `wiki/storyboard-*.md`; the new
reference is linked from KATA.md § Metrics and from each storyboard
file's canonical-11 section.

## Out of scope (re-affirming spec)

`fit-xmr` rule semantics; per-skill metric definitions other than
`time_to_first_approval_hours`; rerunning open experiments; CSV
backfill; branch-protection installation; agent-react routing changes
beyond the storyboard MCD link surface; skill-pack publishing; agent
persona changes; the choice of any other binding-constraint metric.
