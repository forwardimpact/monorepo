# Spec 0860 — Measurement-system change protocol for canonical metrics

> **Superseded — 2026-06-07.** The measurement-system change-control subsystem
> this spec introduced — the eight named repair moves, redefinition files
> (`wiki/redefinitions/`), the no-silent-redefinition rule, and canonical-11
> change detection — has been removed from the Kata system. The 11 metrics are
> now fixed and are not redefined. This document is retained as a historical
> record only; nothing in it is live. Rationale:
> `wiki/kata-instruction-analysis-2026-06-03.md` §3 and
> `wiki/kata-component-analysis-2026-06-03.md` §3.

## Problem

The Kata Agent Team
([JTBD § Teams Using Agents](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team))
runs a daily PDSA loop whose Study phase reads canonical metrics (the
"canonical-11" set referenced by the May Target Condition in
`wiki/storyboard-2026-M05.md`) through XmR signals. KATA.md § Metrics
binds each metric to exactly one producing skill — "each such skill
records exactly one metric." That coupling is load-bearing, and there is
no protocol describing what happens when a producing skill changes,
moves, or is removed. The team has invented and applied a recurring
typology of safe repair moves to keep the measurement system honest, but
the typology has no canonical home, the discipline that gates it ("no
silent redefinition of the canonical-11 denominator") has no canonical
home, and the binding constraint on enacting any of these repairs —
human approval throughput — is not itself one of the canonical metrics
the loop reads.

### Skill change destabilises the metric without a repair protocol

Removing the `kata-trace` skill in PR #715 left
`wiki/metrics/kata-trace/2026.csv` without a producer. The XmR analyzer
flipped `findings_count` from `predictable` to `signals_present` via
`xRule3` on five consecutive structural-zero rows tagged `skill-removed`
(obstacle issue #788). The signal is honest under XmR semantics but its
cause is the measurement protocol, not the process — yet the canonical-11
denominator still counts the metric. Five days passed before the team
proposed a producer rehoming path (RFC #804). The same coupling shows up
across the open obstacles and experiments:

| Trigger | Metric impact | Repair move applied | Issue |
| --- | --- | --- | --- |
| Skill removal (`kata-trace` in PR #715) | `findings_count` lost producer; structural zeros | Producer rehoming via `fit-xmr record` direct invocation | #788, RFC #804 |
| Mode-mixed activations on `kata-documentation` | `errors_found` bimodal; `xRule2` below-μ run length 13 | Mode-restriction (record only on review-mode activations) | #772, PR #773 |
| Phase-0 first-pass discovery row anchors `xRule1` | `errors_found` cannot reach `predictable` | Historical phasing (Phase-0 / Phase-1 series boundary) | #809, PR #811 |
| Bursty Dependabot waves on `prs_actioned` | `xRule1` + `mrRule1` by construction; structurally unreachable | Sidecar pre-flight + stock-vs-flow recast | #787, #770, #768 |
| Calendar framing on event-driven `issues_created` | `insufficient_data` as steady state | Event-driven recast ("no-row-no-event") | #810 |
| Single-slot historical-residual `mrRule1` fire on `findings_count` | Permanent signal under sliding URL math | XmR rule-semantics RFC | #814 |
| Override-shadowed Dependabot bundle ships dirty | Discretionary post-merge re-audit habit catches it | Habit-to-policy promotion (Check 9 in SKILL.md) | #817 |

These repair moves work, but they are reinvented per case. Each issue
restates what counts as a safe move, what the falsifier set looks like,
and what discipline applies to the canonical-11 denominator while the
move is in flight. There is no shared definition for any of: the move
typology, the redefinition that must accompany a canonical-11 change, or
the cohort read-out that ratifies one.

### The "no-silent-redefinition" rule has no canonical home

RFC #804 invokes a "no-silent-redefinition rule" to surface a conditional
canonical-11 → canonical-10 amendment up-front, and SE Exp 33 (#787)
keeps a sidecar CSV explicitly to "preserve the May denominator" until
the 1-on-1 ratifies a redefinition. Both treat the rule as authoritative
but cite no document. KATA.md § Metrics, the agent references
(`coordination-protocol.md`, `memory-protocol.md`), and the storyboard
templates do not state it. New agents and new metrics cannot consult the
rule before changing it.

### Approval throughput is the binding constraint and is not a canonical metric

Obstacle #572 (umbrella) and instances #565, #567, #571 identify human
approval throughput as the binding constraint on the loop's ability to
enact any repair: PRs sit CI-green awaiting `<phase>:approved` while
their absence prevents the spec/design/plan/implement chain from
advancing. RE Exp 38 (#813) is structured as a self-test — it routes
through the same approval gate it tests. None of the canonical-11
metrics measure this constraint directly. The loop cannot detect
approval-throughput drift through XmR because there is no producer for
it.

## Goal

Canonicalise the measurement-system change protocol the team is already running
implicitly. Name the safe repair moves; require an operational redefinition
artifact for any change to a canonical-11 metric; place the
no-silent-redefinition rule in a single shared reference; and add an
approval-throughput metric to the canonical-11 frame so the binding constraint
is itself read by the same loop. The loop continues to read XmR signals
unchanged; what changes is the protocol that surrounds canonical-11 metric churn
and the set of metrics the loop reads.

## Scope (in)

- **Repair-move typology.** Name the moves the team has already used:
  producer rehoming, mode restriction, historical phasing, sidecar
  pre-flight, stock-vs-flow recast, event-driven recast, XmR
  rule-semantics RFC, and habit-to-policy promotion. Each move's name
  binds to a one-sentence definition and a falsifier-set requirement.
- **Operational Redefinition (Redefinition).** A required artifact shape
  for any change to a canonical-11 metric: skill removal/rename/split,
  metric definition change, sidecar opening, denominator redefinition,
  rule-semantics challenge. The redefinition names the move, the affected
  metric(s), the falsifier set, the verdict horizon, and the cohort
  read-out date.
- **No-silent-redefinition rule, canonical home.** A single reference
  defining it. KATA.md § Metrics links to it.
- **Canonical-11 entry for approval throughput.** Add one
  approval-throughput metric to the canonical set, with a named
  producer skill and the same one-row-per-run discipline the existing
  metrics carry. The producer skill records the metric per
  `wiki/metrics/{skill}/{YYYY}.csv`. The metric reads the binding
  constraint #572 names.
- **Storyboard hook.** The storyboard meeting template requires that any
  canonical-11 change reference a redefinition, and that any cohort
  read-out consumes the redefinition set for the day.
- **KATA.md § Metrics extension.** § Metrics extends to point to the
  repair-move typology, the redefinition shape, the no-silent-redefinition
  rule, and the approval-throughput entry.

## Scope (out)

- **The XmR analyzer itself** (`fit-xmr`). Rule semantics, URL math,
  control-limit computation are unchanged.
- **Per-skill metric definitions** other than the new approval-
  throughput entry. Existing `references/metrics.md` files under
  `.claude/skills/kata-*/references/` stay where they are.
- **Re-running open experiments** (#674, #767, #768, #769, #770, #772,
  #787, #809, #810, #813, #814, #817). They keep their pre-registered
  predictions and verdict horizons; the protocol applies prospectively
  to changes filed after merge.
- **Historical CSV backfill or rewrite.** The historical-phasing repair
  move is annotation-only by design (per #809).
- **Branch-protection installation** (#564 governance gap). The
  protocol covers measurement; governance is a separate workstream.
- **Agent-react / Discussion routing changes** beyond surfacing the
  redefinition link in cohort read-out items.
- **Skill-pack publishing.** No external skill-pack contract changes;
  internal references only.
- **Agent persona / scope-constraint changes.** Agents continue to own
  the same skills; the protocol describes what an agent must surface,
  not which agent owns what.
- **Choosing the producer skill or the exact name of the approval-
  throughput metric.** Design picks both, constrained by Success #4.
- **Choosing where the typology and rule live** (KATA.md inline vs. a
  new `references/measurement-protocol.md` vs. extending an existing
  reference). Design picks the location, constrained by Success #1–#3.

## Success criteria

| # | Claim | Verification |
| --- | --- | --- |
| 1 | The repair-move typology is enumerated in one place; each named move has a one-sentence definition and a falsifier-set requirement. | Grep for the named moves (`producer-rehoming`, `mode-restriction`, `historical-phasing`, `sidecar-pre-flight`, `stock-vs-flow-recast`, `event-driven-recast`, `rule-semantics-rfc`, `habit-to-policy`) returns one canonical definition each from a single reference file. |
| 2 | The Operational Redefinition has a named shape with required fields: move name, affected metric(s), falsifier set, verdict horizon, cohort read-out date. | Static inspection of the reference: a redefinition section enumerates required fields and provides one filled-in example drawn from an existing experiment (e.g. SE Exp 33 #787 sidecar pre-flight). |
| 3 | The no-silent-redefinition rule has a canonical home and is reachable from KATA.md § Metrics. | KATA.md § Metrics contains a link to a single reference section that states the rule; no other file restates it. |
| 4 | An approval-throughput metric is added to the canonical-11 set with a named producer skill, a one-row-per-run discipline, and a CSV path under `wiki/metrics/{skill}/{YYYY}.csv`. | The metric appears in (a) the producer skill's `references/metrics.md`, (b) the canonical-11 enumeration in `wiki/storyboard-*.md`, and (c) one example row written under the producer skill's CSV path during the implementation run. |
| 5 | The storyboard meeting template requires canonical-11 changes to reference a redefinition. | The template (in the `kata-storyboard` skill or the agent persona) names the redefinition as a required link for any canonical-11 change item; a worked example references a redefinition by its issue or section anchor. |
| 6 | A change to a canonical-11 metric without a redefinition is detectable from `git diff` alone. | A grep for canonical-11 metric edits in the protocol's reference, in `wiki/storyboard-*.md`, or in a producer skill's `references/metrics.md` returns each change paired with a link to its redefinition. The protocol's reference states the grep recipe. |

## Notes — evidence pointers (for design)

- Repair-move corpus: #788 (orphaned producer); #804 (RFC fallback,
  three-path decision, falsifier set F1–F4, conditional Dim 2
  amendment); #772 + PR #773 (mode restriction); #809 + PR #811
  (historical phasing); #787 (sidecar pre-flight, "no silent
  denominator change" citation); #768, #770 (stock-vs-flow dual-record
  cohort); #810 (event-driven recast); #814 (XmR rule-semantics RFC);
  #817 + #655 (habit-to-policy promotion).
- Approval-throughput evidence: #572 (umbrella), #565, #567, #571, #813
  (self-reflexive design).
- Existing metrics surface: KATA.md § Metrics (lines 256–273); per-skill
  `references/metrics.md` files under
  `.claude/skills/kata-*/references/`.
- Existing protocol references:
  `.claude/agents/references/coordination-protocol.md`,
  `memory-protocol.md`, `self-improvement.md`.
- Storyboard surface: `wiki/storyboard-*.md` (canonical-11 enumeration,
  Dim 2 line, conditional-amendment lines).
- Cohort read-out precedent: 5/12 cluster across SE Exp 33, RE Exp 34,
  TW Exp 34, PM Exp 32, plus 5/13 conditional Dim 2 amendment.
