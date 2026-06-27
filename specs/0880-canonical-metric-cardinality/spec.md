# Spec 0880 — Canonical-metric cardinality and the class boundary

> **Superseded — 2026-06-07.** The two-class metric taxonomy
> (`process-throughput` / `system-health`) and the `metric-class-guidance.md`
> reference page this spec introduced have been removed from the Kata system,
> along with the measurement-system change-control subsystem (spec 0860). The
> 11 metrics are now fixed. This document is retained as a historical record
> only; nothing in it is live.

**Persona / job:** Teams Using Agents — *Run an autonomous, continuously
improving development team that plans, ships, studies its own traces, and acts
on findings* ([CLAUDE.md § Primary Products](../../CLAUDE.md#primary-products)).
The autonomous loop reads `KATA.md` § Metrics to govern what each end-to-end
skill records; the rule there must stay load-bearing as the canonical-metric
set grows.

## Problem

`KATA.md` § Metrics § cardinality rule (the sentence beginning "Each such
skill records …", KATA.md:261) today reads "Each such skill records exactly
one metric: the count of units of work the process produced this run." Spec
860's plan-b
([`specs/0860-measurement-system-change-protocol/plan-b.md`](../860-measurement-system-change-protocol/plan-b.md),
PR [#851](https://github.com/forwardimpact/monorepo/pull/851), merged on
`main` 2026-05-11 commit `d62f004e`) § Step 2 Edit 2a directs the next
`kata-implement` run to replace that wording with:

> Each such skill records one or more metrics, each a count of units of work
> the process produced this run … Multiple metrics from one producer land as
> multiple rows in `wiki/metrics/{skill}/{YYYY}.csv`.

That post-Edit-2a wording is the rule this spec is written against. It admits
the second metric (`approvals_recorded_per_run`, produced by
`kata-release-merge` alongside its existing `prs_merged`) and resolves the
immediate cardinality conflict — but it does not name a **class boundary**.
The second-and-subsequent metric a producer records is implicitly any
flow-shaped count, with no semantic distinction from the process-throughput
metric the rule was originally specified for.

The shape spec 0860 has just admitted is a recurring one: metrics that read
**binding constraints on the loop itself** rather than the throughput of a
process. Approval throughput is the first member. The natural producer for
each such metric is a skill that already reads the relevant state for its
existing process-throughput work. Without a named class boundary, every future
binding-constraint metric re-traverses the cardinality question spec 0860 has
already settled, and the XmR-driven rationale paragraph that follows the rule
is re-asked metric by metric — because binding-constraint metrics differ from
process-throughput metrics on the very question that rationale answers.

The shape the rule must resolve is a class, not a singleton — and § Metrics
today is silent on which class a new metric belongs to.

## Goal

After this spec's implementation lands, a reader of `KATA.md` § Metrics §
cardinality rule can determine, by static inspection of that section alone,
which metric class a new entry belongs to and whether it co-locates with an
existing producer skill. Adding the next binding-constraint metric does not
require re-amending § Metrics.

## Scope (in)

- **`KATA.md` § Metrics § cardinality rule.** Amended so it is internally
  consistent with the producer surface spec 0860 introduces *and* names the
  class boundary that distinguishes binding-constraint metrics from
  process-throughput metrics. Design picks the wording shape.
- **`KATA.md` § Metrics rationale paragraph.** Remains consistent with the
  amended rule for both metric classes.
- **Spec/design guidance pointer.** A short pointer placed within `KATA.md`
  § Metrics (reachable in one link hop), telling future spec authors when a
  new metric co-locates with an existing producer versus needs a new
  dedicated one. The pointer's target body must contain the substring
  `co-locates with an existing producer` — the **only** wording constraint
  this spec imposes on design; all other phrasing (including class names,
  rule sentence shape, and pointer prose) is design's choice.

## Scope (out)

- **Spec 0860 implementation (plan-b PR #851).** Plan-b is approved on `main`
  and runs as written. This spec's chain (spec → design → plan → implement)
  **runs after** spec 0860's implementation lands; it amends the post-Edit-2a
  rule, it does not replace the Edit 2a work.
- **The `approvals_recorded_per_run` metric itself.** Defined and produced by
  spec 0860. This spec only governs the rule under which a producer records its
  second-and-subsequent metrics.
- **Future binding-constraint metric definitions.** Members beyond
  `approvals_recorded_per_run` (referenced in § Notes) are tracked by separate
  obstacles and specs. This spec governs only *where they land structurally*.
- **`fit-xmr` semantics.** Rule semantics, URL math, control-limit computation
  are unchanged.
- **Retroactive CSV rewrite or backfill.** No historical row in
  `wiki/metrics/*.csv` is changed.
- **`agent-react` routing changes** (out of spec 0860; out of this).
- **Branch-protection installation** (#564 governance gap, separate
  workstream).

## Success criteria

| # | Claim | Verification |
| --- | --- | --- |
| 1 | `KATA.md` § Metrics enumerates ≥2 named metric classes and a one-sentence membership criterion that determines which class a new entry belongs to. (Class names chosen by design.) | Static inspection of § Metrics: ≥2 distinct class-name tokens introduced by the cardinality rule, plus one sentence stating the membership criterion. |
| 2 | The membership criterion is class-aware, not name-aware: it does not pin to specific metrics. | `rg` the cardinality-rule sentence(s) for each metric name appearing as a data-row identifier in `.claude/skills/kata-*/references/metrics.md` (`prs_merged`, `specs_drafted`, `designs_drafted`, `plans_drafted`, `implementations_shipped`, `prs_actioned`, `findings_count`, `issues_triaged`, `releases_cut`, `summary_corrections`, `errors_found`, `issues_created`, `approvals_recorded_per_run`) — zero hits. |
| 3 | A spec/design guidance pointer reachable in one link hop from § Metrics names when a new metric co-locates with an existing producer skill versus needs a new one. | `rg` within `KATA.md` § Metrics returns a markdown link whose target body contains the substring `co-locates with an existing producer`. (Distinguishes from spec 0860 Edit 2b's `coordination-protocol.md § Measurement-system changes` link, which addresses redefinitions, not co-location.) |
| 4 | The XmR-driven rationale paragraph following § Metrics § cardinality rule covers both classes. | Each class-name token from SC1 appears ≥1 time inside the rationale paragraph immediately following the cardinality rule (verifiable by `rg -c`). |

## Resolution shape (deferred to design)

Design picks the wording shape. Candidate shapes are listed under § Notes as
evidence for design, not as a menu pre-selected here.

## Notes — evidence pointers (for design)

- Post-Edit-2a wording for `KATA.md` § Metrics § cardinality rule:
  [`specs/0860-measurement-system-change-protocol/plan-b.md`](../860-measurement-system-change-protocol/plan-b.md)
  § Step 2 Edit 2a.
- Producer surface for the first binding-constraint metric:
  `kata-release-merge` records `approvals_recorded_per_run` per plan-b Step 3.
- Class boundary already named at spec level for 0860: spec 0860 § Goal
  distinguishes XmR throughput metrics from binding-constraint metrics on the
  loop itself; this spec elevates that distinction into `KATA.md` § Metrics.
- Producer co-location precedent: design-b for spec 0860 § Decision #3 selected
  `kata-release-merge` because the skill already reads `<phase>:approved` label
  state. Future class members are plausibly co-locatable on the same
  reasoning.
- Existing metric registry pattern:
  `.claude/skills/kata-*/references/metrics.md` (one file per producer skill).
- Class membership beyond `approvals_recorded_per_run`: no enumerated members
  yet. The design phase surfaces the candidate set — round-1 review named
  queue dwell, ratification-cycle length, and agent-react fan-in delay as
  plausible shapes, but none has a tracking issue framed as a metric proposal
  today. The class-breadth claim rests on the structural argument (these
  metrics differ from process-throughput on the question § Metrics rationale
  answers), not on a populated member list.
- Candidate wording shapes for design to weigh: (a) admit a named
  system-health class alongside process-throughput; (b) hold the
  one-skill-per-process-throughput-metric invariant and constrain producer
  selection for binding-constraint metrics elsewhere. Design picks.

## Sequencing

This spec's chain (spec → design → plan → implement) runs **after** spec 0860's
plan-b implementation lands on `main`. The author opens spec 0880 now — rather
than after spec-0860 implementation — so the class-boundary question is on the
record and the design phase can begin in parallel with the spec-0860
implementation run. The `kata-implement` step for this spec waits on the
spec-0860 Edit 2a wording being live in `KATA.md`.

**Pre-flight check** (run before this spec's implementation):
`rg -n 'one or more metrics' KATA.md` returns ≥1 hit. Zero hits means Edit 2a
has not landed yet — block implementation until it does.
