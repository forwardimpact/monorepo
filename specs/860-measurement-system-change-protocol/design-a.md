# Design 860-A — Measurement-system change protocol

> **Process note:** Spec 860 is not yet merged on `main` at the time
> this design is being written. The design proceeds at user direction;
> under normal kata-design preconditions the spec PR would merge first.

## Architecture summary

Add one new agent-level reference,
`.claude/agents/references/measurement-protocol.md`, that names the
repair-move typology, the Measurement Change Disclosure (MCD) shape, the
no-silent-amendment rule, and the canonical-11 list (the team's
canonical metric set, anchored in this reference rather than re-stated
in storyboard files). KATA.md § Metrics gains one paragraph linking to
it. The `kata-release-merge` skill becomes the producer of one new
canonical metric, `time_to_first_approval_hours`, recorded one row per
run to `wiki/metrics/kata-release-merge/{YYYY}-approval.csv` (sibling
file to its existing `prs_merged` CSV, preserving the one-skill /
one-CSV / one-metric coupling per skill-CSV pair). The
`kata-storyboard` skill's meeting template references the MCD shape and
the canonical-11 list in the new reference, so canonical-11 changes are
gated on a linked MCD without restating the rule. No agent-persona
files change.

## Components

| Component | Lives in | Responsibility |
| --- | --- | --- |
| `measurement-protocol.md` | `.claude/agents/references/` | Names repair-move typology, MCD shape, no-silent-amendment rule, canonical-11 list. Sibling of `coordination-protocol.md` and `memory-protocol.md`. |
| KATA.md § Metrics extension | `KATA.md` | One-paragraph addition pointing to the new reference. No re-statement of the rule or the typology. |
| `time_to_first_approval_hours` metric | `wiki/metrics/kata-release-merge/{YYYY}-approval.csv` | New canonical-11 entry. Producer = `kata-release-merge`. One row per run; value is the median hours-to-first-`<phase>:approved`-signal across PRs the run touched. |
| `kata-release-merge` `references/metrics.md` extension | `.claude/skills/kata-release-merge/references/metrics.md` | Adds the new metric's row alongside `prs_merged`; declares the sibling CSV path. |
| Storyboard MCD hook | `.claude/skills/kata-storyboard/SKILL.md` | Two checklist additions: every canonical-11 change item carries a `MCD:` link; cohort read-out items enumerate the day's MCDs. |
| MCD authoring locus | Existing `experiment` and `obstacle` GitHub issue bodies | The MCD is a section template inside the issue body, not a new artifact type. |

## Repair-move typology (eight named moves)

| Move | Definition | Existing precedent |
| --- | --- | --- |
| `producer-rehoming` | Reassign a metric's producing skill when the original is removed/split/renamed; record continuity tag on first row under new producer. | #788, RFC #804 |
| `mode-restriction` | Narrow recording to one activation mode of a multi-mode skill so the series is unimodal. | #772, PR #773 |
| `historical-phasing` | Annotate a series with a Phase boundary; XmR analysis windows on Phase 1; no CSV backfill. | #809, PR #811 |
| `sidecar-pre-flight` | Record a candidate metric to a sibling CSV while the canonical metric continues; no denominator change until ratification. | #787 |
| `stock-vs-flow-recast` | Replace a flow-rate metric with a stock metric on the same axis when burst architecture trips XmR by construction. | #768, #770 |
| `event-driven-recast` | Replace per-day cadence with per-activation ("no row, no event"). | #810 |
| `rule-semantics-rfc` | Challenge an XmR rule's blocking effect on `predictable` via Discussion RFC; quorum required. | #814 |
| `habit-to-policy` | Promote an undocumented defensive habit into a SKILL.md check after a defect surfaces. | #817, PR #655 |

The list is closed at design time, but the protocol allows new moves to
be added to the reference via an MCD whose `move:` field is `new-move`
and whose body proposes the addition. New entries land via the same
spec/design/plan/implement chain.

## MCD shape

```yaml
mcd:
  move: producer-rehoming | mode-restriction | historical-phasing |
        sidecar-pre-flight | stock-vs-flow-recast | event-driven-recast |
        rule-semantics-rfc | habit-to-policy | new-move
  affected_metrics: [{skill: <skill>, metric: <metric>}]
  falsifier_set: [<predicate>, ...]
  verdict_horizon: <YYYY-MM-DD>
  cohort_readout: <YYYY-MM-DD>
  denominator_effect: none | sidecar | conditional-amend | amend
  links:
    obstacle_issue: <#NNN>?
    experiment_issue: <#NNN>?
    pr: <#NNN>?
```

The MCD is an embeddable YAML block (fenced) inside an experiment or
obstacle issue body, not a new artifact type. Its
`denominator_effect` field is the explicit hook for the no-silent-
amendment rule: any value other than `none` requires a cohort read-out
date and a linked storyboard line.

## No-silent-amendment rule

> No change to the canonical-11 denominator (additions, removals,
> conditional or unconditional amendments) lands without an MCD whose
> `denominator_effect` is non-`none`, a cohort read-out date on or
> before the storyboard meeting at which the change takes effect, and a
> linked storyboard headline that surfaces the change up-front.

This single statement lives in `measurement-protocol.md`. KATA.md § Metrics
links to it; no other file restates it.

## Approval-throughput metric

`time_to_first_approval_hours` (median per run) reads the binding
constraint #572 names. Design choice (decision #5 below) prefers a
per-run median over a per-PR row because (a) it preserves one row per
run as KATA.md § Metrics requires, and (b) median absorbs both
approval-fast and approval-slow PRs without manufacturing ties. The
producer is `kata-release-merge` because that skill already iterates
phase PRs, already reads `<phase>:approved` signals, and already
records `prs_merged` to the same `wiki/metrics/kata-release-merge/`
directory.

## Data flow

```mermaid
flowchart LR
  CHG[Canonical-11 change<br/>proposed in issue] --> MCD[MCD YAML block in issue body]
  MCD --> SB{Storyboard MCD hook}
  SB --> READ[Cohort read-out at horizon date]
  READ --> RAT{Ratify?}
  RAT -- yes --> AMEND[Storyboard line updates;<br/>denominator change lands]
  RAT -- no --> ROLL[Sidecar / phase / mode<br/>change rolled back]
  KATA["KATA.md § Metrics"] -.-> REF[measurement-protocol.md]
  STORY[wiki/storyboard-*.md] -.-> REF
  RM[kata-release-merge run] --> CSV[wiki/metrics/kata-release-merge/<br/>{YYYY}-approval.csv]
  XMR[fit-xmr analyze] --> CSV
  XMR --> CSV2[wiki/metrics/kata-release-merge/{YYYY}.csv]
  REF -.->|enumerates| MOVES[Eight repair moves]
  REF -.->|defines| MCD
  REF -.->|owns| RULE[No-silent-amendment rule]
  REF -.->|lists| C11[canonical-11 set]
```

## Key decisions

| # | Decision | Rejected alternative | Why |
| --- | --- | --- | --- |
| 1 | Locate the typology, MCD, rule, and canonical-11 list in one new agent-level reference (`measurement-protocol.md`). | Inline the typology and rule in KATA.md § Metrics. | KATA.md is identity-and-orientation per the project's "one home per policy" rule (CLAUDE.md § Documentation Map). Protocol detail belongs with siblings `coordination-protocol.md` and `memory-protocol.md`. KATA.md links and does not restate. |
| 2 | MCD is a YAML block embedded in existing experiment/obstacle issues. | New issue type or new file type per change. | Repair moves already coincide with experiment/obstacle issues today; adding a parallel artifact type doubles routing. The YAML block makes the MCD greppable without inventing a new surface. |
| 3 | Repair-move list is closed at design time; extensions land via spec/design/plan/implement. | Open list with free-form move names per issue. | A closed list is the legible part of the protocol; an open list reverts to the current ad-hoc state. Extension path preserves growth. |
| 4 | Producer for `time_to_first_approval_hours` is `kata-release-merge`. | New `kata-approval-meter` skill; or producer = `kata-storyboard`. | `kata-release-merge` already iterates phase PRs and reads `<phase>:approved` signals. New skill adds an agent-team matrix entry for one metric. `kata-storyboard` is a once-daily facilitator and would miss between-meeting churn. |
| 5 | Metric value = median hours from PR open to first `<phase>:approved` signal across PRs the run touched. | Mean; per-PR rows; count of `<2h` PRs. | Mean is volatile under bursty merge cadence (#566 ESCALATION_COST_TRACKED). Per-PR rows violate KATA.md § Metrics' one-row-per-run rule. Count loses magnitude. Median compresses to one row, retains magnitude, and is XmR-stable for the bursty distribution. |
| 6 | Sibling CSV (`{YYYY}-approval.csv`) under the existing `kata-release-merge/` directory rather than a new metric directory. | A new `wiki/metrics/kata-release-throughput/` directory. | KATA.md § Metrics maps directories to skills, not to metrics. The sibling-CSV form preserves the skill-directory mapping while admitting that one skill can produce multiple metrics if each carries one-row-per-run discipline (the existing rule was "one metric per skill" — this design proposes "one metric per skill-CSV pair," which is the minimum extension that admits the binding-constraint metric). |
| 7 | Storyboard hook is two checklist items in the `kata-storyboard` skill, not a template-text edit. | Bake the MCD link requirement into the meeting prose template. | Checklist items are greppable and machine-checkable (criterion 6); prose drifts. |
| 8 | `denominator_effect: conditional-amend` admitted as a first-class value, with a cohort read-out date as the firing condition. | Conditional amendments expressed in free prose per RFC. | The team has already used conditional amendments (#804, Dim 2 → Dim 2/10). A first-class field makes the firing condition machine-readable and lets storyboard pre-surface the conditional line. |

## Migration boundary

`kata-release-merge` records the new metric prospectively from
implementation onwards; no historical backfill (consistent with
`historical-phasing`). Existing experiments and obstacles need not file
retroactive MCDs — the protocol applies to canonical-11 changes
proposed after `measurement-protocol.md` lands on `main`. Storyboard
files updated forward; the canonical-11 list moves authoritatively to
`measurement-protocol.md` on the implementation PR, with one
storyboard line citing the reference.

## Out of scope (re-affirming spec)

`fit-xmr` rule semantics; per-skill metric definitions other than
`time_to_first_approval_hours`; rerunning open experiments; CSV
backfill; branch-protection installation; agent-react routing changes
beyond the storyboard MCD link surface; skill-pack publishing; agent
persona changes; the choice of any other binding-constraint metric.
