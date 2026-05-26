# Design 0860-A — Measurement-system change protocol

## Architecture summary

Add one new agent-level reference,
`.claude/agents/references/measurement-protocol.md`, that names the
repair-move typology, the Operational Redefinition shape and one
filled-in example, the no-silent-redefinition rule, and the
detection-grep recipe that satisfies Success #6. KATA.md § Metrics
gains one paragraph linking to it plus one sentence admitting the
binding-constraint metric (decision #7). The canonical-11 enumeration
gains an explicit bulleted list in `wiki/storyboard-*.md` (replacing
the inline "11 canonical metrics" prose), with the new metric included.
The `kata-release-merge` skill becomes the producer of one new
canonical metric, `time_to_first_approval_hours`, written one row per
run to its existing `wiki/metrics/kata-release-merge/{YYYY}.csv` (the
file is already long-format — `date,metric,value,unit,run,note` — so
the new metric joins as additional rows tagged by the `metric` column,
alongside the existing `prs_merged` rows). The `kata-session` skill's
team-storyboard overlay gains two `<do_confirm_checklist>` items so
canonical-11 changes are gated on a linked redefinition without
restating the rule. No agent-persona files change.

## Components

| Component | Lives in | Responsibility |
| --- | --- | --- |
| `measurement-protocol.md` | `.claude/agents/references/` | Names the typology, redefinition shape (with one worked example), no-silent-redefinition rule, and the detection-grep recipe. Sibling of `coordination-protocol.md` and `memory-protocol.md`. |
| KATA.md § Metrics extension | `KATA.md` | One paragraph linking to the new reference, plus one sentence admitting the binding-constraint duration metric (decision #7) — this is the constitutional delta, not just a pointer addition. |
| `time_to_first_approval_hours` metric | `wiki/metrics/kata-release-merge/{YYYY}.csv` (additional rows; `metric` column distinguishes from `prs_merged`; `unit=hours`) | New canonical-11 entry. Producer = `kata-release-merge`. One row per run; value defined under "Approval-throughput metric" below. |
| Canonical-11 enumeration | `wiki/storyboard-*.md` | New bulleted list under § Metrics, one bullet per metric mapping `{metric → producer skill}`. Replaces the current inline "11 canonical metrics" prose. |
| `kata-release-merge` `references/metrics.md` extension | `.claude/skills/kata-release-merge/references/metrics.md` | Adds the new metric's row alongside `prs_merged`; documents the cohort predicate. |
| Storyboard redefinition hook | `.claude/skills/kata-session/references/team-storyboard.md` | Two `<do_confirm_checklist>` items: every canonical-11 change item carries a `Redefinition:` link; cohort read-out items enumerate the day's redefinitions. |
| Redefinition authoring locus | Existing experiment/obstacle GitHub issue bodies, or a code PR body when the canonical-11 change rides on a PR with no preceding issue (e.g. skill removal in a feature PR). | The redefinition is a YAML section template inside the host body, not a new artifact type. The change diff cites it by issue or PR link. |

## Repair-move typology (eight named moves)

Each move binds a one-sentence definition and the kind of falsifier-set
predicates an instance redefinition must include. The list is closed:
extensions land via the spec/design/plan/implement chain, not via the
redefinition form.

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

## Redefinition shape

```yaml
redefinition:
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

The redefinition is an embeddable YAML block (fenced) inside its host
body. `verdict_horizon` is the date the falsifier predicates are
checked; `cohort_readout` is the storyboard meeting at which the cohort
ratifies. The two may coincide; `verdict_horizon` ≤ `cohort_readout`
is the only ordering constraint (predicates are checked before
ratification, not after). `denominator_effect` is the explicit hook for
the no-silent-redefinition rule: any value other than `none` requires a
cohort read-out date and a linked storyboard line. The reference
`measurement-protocol.md` carries one filled-in example (illustrating
the SE Exp 33 #787 sidecar pre-flight pattern), satisfying spec Success #2.

## Detection (Success #6)

Spec Success #6 requires a `git diff` recipe that pairs canonical-11
metric edits with their redefinition link. The recipe lives in
`measurement-protocol.md`: any line in `measurement-protocol.md`,
`wiki/storyboard-*.md`, or `.claude/skills/*/references/metrics.md`
that names a canonical-11 metric must, in the same diff hunk, carry a
`Redefinition: #NNN` link to the host issue or PR. The reference states
the ripgrep invocation as the canonical detection.

## No-silent-redefinition rule

> No change to the canonical-11 denominator (additions, removals,
> conditional or unconditional redefinitions) lands without a
> redefinition whose `denominator_effect` is non-`none`, a cohort
> read-out date on or before the storyboard meeting at which the change
> takes effect, and a linked storyboard headline that surfaces the
> change up-front.

This single statement lives in `measurement-protocol.md`. KATA.md § Metrics
links to it; no other file restates it.

## Approval-throughput metric

`time_to_first_approval_hours` reads the binding constraint #572 names.
The metric is a **duration**, not a count — KATA.md § Metrics today
binds metrics to the count of units of work; admitting a duration
binding-constraint metric is the smallest extension that satisfies
spec Success #4 (decision #7).

- **Producer:** `kata-release-merge`. The skill already reads
  current label/review snapshots via `gh pr view`; the new metric adds
  the issue/PR timeline API (`gh api repos/.../issues/{n}/timeline`)
  for first-event timestamps — an additive read-side surface on the
  existing producer, not a new component.
- **Cohort:** all open phase PRs surveyed this run (the set the skill
  already visits via `gh pr list`). For each PR, compute hours from
  PR open to its first `<phase>:approved` signal if approved, or to
  the run start time if still open (right-censored). This matches the
  rolling-cohort dwell already recorded in the existing CSV `note`
  column (`Mean dwell=… / median=… / max=…` from run-68 onward). An
  empty cohort (zero open PRs surveyed) skips the row for that run —
  `event-driven-recast` semantics applied from day 1, avoiding the
  empty-`value`-parses-as-`0` failure mode decision #5 cites.
- **Signal source:** GitHub label-event timeline (`<phase>:approved`
  label-adds) plus first-approval-review events. The earlier of the
  two per PR is the first-approval timestamp. `plan:implemented` is a
  state label, not an approval signal — excluded.
- **Aggregation:** median across the cohort, in hours. Median is
  XmR-stable for bursty cadence (mean volatile under Dependabot
  waves). The metric is intentionally **stock-shaped** —
  carry-forward dwell drift IS the binding-constraint signal #572
  names; XmR here reads "approval-queue dwell stability," not
  "per-event throughput rate."
- **Cadence:** one row per run. `kata-release-merge` runs three times
  daily; each row is distinguished by the `run` column, matching the
  existing `prs_merged` shape.

## Data flow

```mermaid
flowchart LR
  CHG[Canonical-11 change<br/>proposed in issue/PR] --> RDF[Redefinition YAML block in host body]
  RDF --> SB{Storyboard redefinition hook}
  SB --> READ[Cohort read-out at horizon date]
  READ --> RAT{Ratify?}
  RAT -- yes --> AMEND[Storyboard line updates;<br/>denominator change lands]
  RAT -- no --> ROLL[Sidecar / phase / mode<br/>change rolled back]
  KATA["KATA.md § Metrics"] -.->|links to| REF[measurement-protocol.md]
  STORY[wiki/storyboard-*.md] -.->|links to| REF
  RM[kata-release-merge run] --> CSV[wiki/metrics/kata-release-merge/{YYYY}.csv]
  CSV --> XMR[fit-xmr analyze]
  REF -.->|enumerates| MOVES[Eight repair moves]
  REF -.->|defines| RDF
  REF -.->|owns| RULE[No-silent-redefinition rule]
```

## Key decisions

| # | Decision | Rejected alternative | Why |
| --- | --- | --- | --- |
| 1 | Locate the typology, redefinition shape, rule, and grep recipe in one new agent-level reference (`measurement-protocol.md`). | Inline in KATA.md § Metrics. | KATA.md is identity-and-orientation per CLAUDE.md § Documentation Map. Protocol detail belongs with siblings `coordination-protocol.md` and `memory-protocol.md`. |
| 2 | Redefinition is a YAML block embedded in the host issue/PR body. | New issue type or new file type per change. | Repair moves already coincide with existing issues/PRs. The YAML block is greppable inside its host; the change diff carries the host link. |
| 3 | Repair-move list is closed at design time; extensions land via spec/design/plan/implement. | Open list with a `move: new-move` enum value usable at redefinition time. | A closed list is the legible part of the protocol; an open list reverts to the current ad-hoc state. Forcing extensions through the spec chain preserves growth without diluting closure. |
| 4 | Producer for `time_to_first_approval_hours` is `kata-release-merge`. | New `kata-approval-meter` skill; or producer = `kata-session`. | `kata-release-merge` already iterates phase PRs and reads `<phase>:approved` signals. A new skill adds an agent-team matrix entry for one metric; `kata-session` is once-daily and would miss between-meeting churn. |
| 5 | Cohort = all surveyed open phase PRs (right-censored on carry-forwards); aggregation = median in hours. | Fresh-approval-only cohort (drops carry-forwards); mean; per-PR rows; count of `<2h` PRs. | Fresh-approval-only requires cross-run state and creates empty cohorts that `libxmr/csv.js` cannot represent (empty `value` parses as `0`, recreating the #788 structural-zero failure). Mean is volatile under bursty cadence; per-PR rows violate one-row-per-run; count loses magnitude. The right-censored rolling cohort matches the skill's existing run-note practice. |
| 6 | New metric joins the existing `kata-release-merge/{YYYY}.csv` as additional rows (long-format CSV; `metric` column distinguishes). | Sibling CSV (`{YYYY}-approval.csv`); new metric directory. | The CSV is already long-format with a `metric` column; adding rows is the lightest possible extension and matches the spec's literal `{YYYY}.csv` path. |
| 7 | KATA.md § Metrics extends to admit one binding-constraint **duration** metric per producer skill alongside its count metric. | A count proxy such as `approvals_signaled_per_run`; a separate "binding-constraint" recording surface outside KATA.md. | A count proxy loses dwell magnitude (the binding constraint #572 is fundamentally a dwell, not a rate). A separate surface fragments KATA.md § Metrics' "one home per policy" stance. The named extension is the smallest delta that admits the binding-constraint metric. |
| 8 | Storyboard hook is two `<do_confirm_checklist>` items in `kata-session/references/team-storyboard.md`. | Bake into prose; add to `kata-session/SKILL.md`; add to `wiki/storyboard-*.md` template. | `<do_confirm_checklist>` items are greppable and machine-checkable (Success #6). The team-storyboard overlay is the canonical home for storyboard-meeting checks; SKILL.md is the umbrella; prose drifts. Exit-gate placement (do-confirm) is correct because the check is "did this meeting surface the day's redefinitions?", not a pre-meeting prerequisite. |
| 9 | `denominator_effect: conditional-amend` admitted as a first-class value, with a cohort read-out date as the firing condition. | Conditional amendments expressed in free prose per RFC. | The team has already used conditional amendments (#804, Dim 2 → Dim 2/10). A first-class field makes the firing condition machine-readable and lets storyboard pre-surface the conditional line. |

## Migration boundary

`kata-release-merge` records the new metric prospectively from the
implementation run forward; no historical backfill (consistent with
`historical-phasing`). Existing experiments and obstacles need not
file retroactive redefinitions — the protocol applies to canonical-11
changes proposed after `measurement-protocol.md` lands on `main`. The
implementation PR for spec 0860 is itself grandfathered: it lands the
rule and its first canonical-set addition together; subsequent
canonical changes use the redefinition form. Each storyboard file's existing
inline canonical-11 prose is replaced with the bulleted enumeration on
the implementation PR; the set's cardinality grows from 11 to 12, and
the storyboard's "≥6 of 11" target-condition denominator is updated to
"≥6 of 12" in the same diff. The name "canonical-11" is retained
historically as a corpus identifier even after the cardinality change.

## Out of scope (re-affirming spec)

`fit-xmr` rule semantics; per-skill metric definitions other than
`time_to_first_approval_hours`; rerunning open experiments; CSV
backfill; branch-protection installation; agent-react routing changes
beyond the storyboard redefinition link surface; skill-pack publishing; agent
persona changes; the choice of any other binding-constraint metric.
