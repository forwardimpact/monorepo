# Spec 880 — Canonical-metric cardinality for system-health metrics

## Problem

`KATA.md` § Metrics line 261 binds: "Each such skill records exactly one
metric: the count of units of work the process produced this run." The rule
was specified for XmR-readable **process throughput** — flow-shaped counts
plotted run-over-run to distinguish stable processes from special-cause
shifts. It does not distinguish process-throughput metrics from
**system-health metrics** that read binding constraints on the loop itself.

Spec 860 [`specs/860-measurement-system-change-protocol/spec.md`](../860-measurement-system-change-protocol/spec.md)
§ Scope (in) admits a new canonical-set entry for approval throughput with a
"named producer skill" recording "one row per run," but defers the choice of
producer skill to design. Design-b for 860
([`design-b.md`](../860-measurement-system-change-protocol/design-b.md))
selected `kata-release-merge` as the producer because that skill already
iterates phase PRs and reads `<phase>:approved` label state. Decision #3 of
design-b explicitly **rejected** the alternative of a new single-metric
`kata-approval-meter` skill: "new skill adds matrix entry for one metric;
`kata-session` runs once daily and would miss between-meeting churn."

That producer choice creates a cardinality conflict with line 261:
`kata-release-merge` already records `prs_merged` (its process-throughput
metric); adding `approvals_recorded_per_run` makes its on-disk cardinality
in `.claude/skills/kata-release-merge/references/metrics.md` equal 2. Plan-b
for spec 860 (PR #851) surfaces this as Risk 1, refuses to resolve a
design-internal contradiction unilaterally, and is on hold pending this
governance spec.

The conflict is not unique to approval throughput. Obstacle #572 (umbrella)
identifies approval throughput as **one of a class** of binding-constraint
metrics — alongside queue dwell, ratification-cycle length, and
agent-react fan-in delay. Each such metric shares the same shape: the
natural producer is a skill that already reads the relevant state for its
existing process-throughput work. Forcing each binding-constraint metric to
a dedicated skill replicates the structural cost design-b decision #3
rejected, once per metric, in perpetuity.

### Evidence that the rule needs a class boundary, not a loophole

- `kata-release-merge` reads `<phase>:approved` label-add events as part of
  its existing Step 1 PR sweep. Approval-throughput counting is a derived
  use of state the skill already loads.
- Spec 860 § Goal distinguishes "canonical metrics the loop reads" (XmR
  throughput, plotted on the storyboard) from "the binding constraint on
  enacting any repair" (approval throughput, read by the same loop). The
  class boundary is already named at the spec level for 860; it has no home
  in `KATA.md`.
- KATA.md § Metrics lines 265–269 argue the cardinality rule from XmR
  semantics: "stocks and sawtooth functions, not process data, freezing
  them into CSV adds noise without signal. Process throughput is the only
  shape that, plotted run-over-run, distinguishes a stable process from a
  special-cause shift." A flow-shaped binding-constraint metric (a count of
  approval events per run, not a stock of pending approvals) preserves the
  XmR argument while occupying a different conceptual slot than
  process-throughput.

## Goal

Resolve the cardinality contradiction between `KATA.md` § Metrics line 261
and the producer surface spec 860 introduces, in a form that generalises to
future binding-constraint metrics. After this spec's implementation, a
reader of `KATA.md` § Metrics can derive — without consulting any spec or
design — where the next binding-constraint metric belongs, and the on-disk
metric count in each end-to-end skill's `references/metrics.md` matches the
rule on inspection.

## Scope (in)

- **`KATA.md` § Metrics cardinality rule.** Lines 257–263 (the "exactly one
  metric" rule and its rationale). Either widen the rule to admit a bounded
  system-health class, or hold the rule strict and constrain producer
  selection on the other side.
- **`KATA.md` § Metrics rationale.** Lines 265–269 (the XmR-driven
  rationale). Whichever resolution lands, the rationale must still support
  it; flow-shaped binding-constraint metrics must remain XmR-legible.
- **Skill `references/metrics.md` conformance.** Whichever resolution
  lands, the on-disk count of recorded metrics in
  `.claude/skills/kata-*/references/metrics.md` must match the rule by
  static inspection.
- **Spec/design guidance pointer.** A short addition (location to be picked
  by design) describing when a new metric belongs to an existing producer
  skill versus a new dedicated one.
- **Spec 860 unblock.** Whichever resolution lands, spec 860's plan-b PR
  (#851) is unblocked — either Risk 1 disappears, or plan-b is revised to
  follow a new producer-placement rule.

## Scope (out)

- **The spec 860 implementation itself.** This spec is its precondition,
  not a replacement. Sub-scope of spec 860 (the redefinition typology, the
  redefinition file artifact shape, the storyboard hook) is untouched.
- **`fit-xmr` semantics.** Rule semantics (`xRule1`, `xRule2`, `xRule3`,
  `mrRule1`), URL math, control-limit computation are unchanged.
- **Existing per-skill metric definitions** other than the cardinality
  rule's interpretation. Existing `prs_merged`, `errors_found`,
  `findings_count`, etc. remain as they are.
- **Retroactive CSV rewrite or backfill.** No historical row is changed
  regardless of resolution.
- **Branch-protection installation** (#564 governance gap). Separate
  workstream.
- **The choice of any binding-constraint metric beyond
  `approvals_recorded_per_run`.** Future metrics (queue dwell,
  ratification-cycle length, agent-react fan-in delay) are out of this
  spec; this spec only constrains where they land structurally.
- **`agent-react` routing changes.** Out of 860; out of this.

## Success criteria

| # | Claim | Verification |
| --- | --- | --- |
| 1 | `KATA.md` § Metrics is internally consistent with the producer surface spec 860 introduces. | After 860's implementation lands, `rg -c '^\| \w' .claude/skills/kata-release-merge/references/metrics.md` returns a count whose interpretation under `KATA.md` § Metrics produces no textual contradiction. |
| 2 | A reader of `KATA.md` § Metrics can determine, without consulting any spec or design, where the next binding-constraint metric belongs. | Static inspection of `KATA.md` § Metrics: the section either (a) defines the system-health class and its producer-co-location rule explicitly, or (b) restates the one-skill-per-metric invariant and points to the spec-design chain for new producers. Either form is self-contained. |
| 3 | Spec 860's plan-b PR (#851) is unblocked. | One of: (path a) the plan body's Risk 1 paragraph is removed by a follow-on commit, with no further change to the plan's eight steps; (path b) plan-b is superseded by a revised plan (plan-b-rev or plan-c) that re-points the producer. |
| 4 | The new rule generalises to the named binding-constraint metric class without re-amending `KATA.md`. | Static inspection: the rule's wording is class-aware (path a) or class-neutral (path b). Adding a second binding-constraint metric in a future spec does not require touching `KATA.md` § Metrics again. |
| 5 | The XmR rationale (`KATA.md` § Metrics lines 265–269 today) still supports the post-amendment rule. | Static inspection: the post-amendment rationale text either covers both metric classes explicitly (path a) or remains the original argument unchanged (path b). |

## Resolution paths (to be evaluated in design)

The choice between the two paths below is the central architectural call
this spec defers to design. Both resolve the contradiction; they differ on
how the constraint scales and on the diff blast radius.

### Path (a) — System-health class admitted into `KATA.md` § Metrics

`KATA.md` § Metrics § cardinality rule widens to:

- Each end-to-end skill records **exactly one process-throughput metric**
  — the count of units of work the process produced this run.
- Each end-to-end skill **may additionally record system-health metrics**
  that read binding constraints on the loop itself. Each system-health
  metric is named by an approved spec; its definition lives in the
  producer skill's `references/metrics.md`.

`approvals_recorded_per_run` is the first system-health metric, produced
by `kata-release-merge` alongside its existing `prs_merged`
process-throughput metric. Spec 860 plan-b's Step 3 — the `metrics.md`
row append — runs as written; Risk 1 is dropped from the implementation
PR body.

### Path (b) — One-skill-per-metric invariant preserved

`KATA.md` § Metrics line 261 is unchanged. A new producer skill is
introduced for every binding-constraint metric, including
`approvals_recorded_per_run`. The new skill (working name
`kata-approval-meter` or similar) records exactly one metric and is
registered in the agent-team workflow alongside the existing kata skills.
Design-b decision #3 for spec 860 — which rejected this path on the
merits — is re-opened, and spec 860 advances with a revised design
(design-c or design-b-rev) and revised plan that re-point the producer.

## Author's leaning

Author leans toward **path (a)**. Three reasons; spec-review picks.

1. **Architectural fit.** Design-b decision #3 for spec 860 already
   rejected the new-skill-per-metric path on the merits, independent of
   the cardinality conflict: "`kata-release-merge` already iterates phase
   PRs and reads label state; new skill adds matrix entry for one metric;
   `kata-session` runs once daily and would miss between-meeting churn."
   That analysis stands; it predates this spec and was not contingent on
   the cardinality argument.
2. **Class-extension shape.** The binding-constraint metric class is not
   closed at one. Queue dwell, ratification-cycle length, agent-react
   fan-in delay are natural future entries — each will share the
   producer-co-location pattern (the skill that already reads the state).
   Path (a)'s class-aware rule lets each future entry land via
   spec/design/plan without re-litigating the cardinality invariant in
   `KATA.md`. Path (b) replicates the matrix-entry cost design-b decision
   #3 rejected, once per future metric.
3. **Diff blast radius.** Path (a) is one wording amendment in `KATA.md`
   § Metrics plus a class-pointer in the producer skill's `metrics.md`.
   Path (b) introduces a new top-level skill directory under
   `.claude/skills/`, a new memory-protocol entry, a new agent-team
   workflow registration, and forces spec 860 to re-run its design phase.
   Path (b)'s blast radius is structural, not just textual; path (a)'s is
   textual.

The trade-off path (a) accepts: `KATA.md` § Metrics becomes a longer rule
with two cases instead of a one-line invariant. Reviewers should weigh
whether the longer rule is a fair price for the open extension path, or
whether the simpler invariant warrants the structural overhead of path
(b).

The XmR rationale on `KATA.md` lines 265–269 — "stocks and sawtooth
functions, not process data" — still applies under path (a) provided
system-health metrics are flow-shaped (counts of events per run, not
stocks of pending state). `approvals_recorded_per_run` is flow-shaped by
design-b decision #4. Future system-health entries that need to be
stock-shaped (queue dwell is the obvious one) would require their own
spec — the `move: sidecar-pre-flight` precedent in spec 860's typology
already handles that progression.

## Notes — evidence pointers (for design)

- Precipitating context: spec 860
  ([`spec.md`](../860-measurement-system-change-protocol/spec.md)),
  design-b
  ([`design-b.md`](../860-measurement-system-change-protocol/design-b.md)),
  plan-b PR
  [#851](https://github.com/forwardimpact/monorepo/pull/851).
- Cardinality rule current location: `KATA.md` lines 257–263; XmR
  rationale lines 265–269.
- Producer chosen by design-b for `approvals_recorded_per_run`:
  `kata-release-merge` (`.claude/skills/kata-release-merge/`).
- Existing metric registry pattern: `.claude/skills/kata-*/references/metrics.md`
  (one file per producer skill; current cardinality 1 in each).
- Class boundary already named at spec level for 860: spec 860 § Goal
  distinguishes XmR throughput metrics from binding-constraint metrics;
  path (a) elevates that distinction into `KATA.md`.
- Binding-constraint class breadth: #572 (umbrella), #565, #567, #571,
  #813. Approval throughput is the first; queue dwell and
  ratification-cycle length are natural follow-ons.

## Migration notes

- This spec is a hard precondition for spec 860's `kata-implement` run.
  Spec 860 plan-b is on hold until this spec → design → plan → implement
  chain merges to `main`.
- If design picks path (a): spec 860 plan-b is unblocked with no rework
  beyond removing the Risk 1 paragraph from the implementation PR body
  on landing.
- If design picks path (b): spec 860 needs a new design variant
  (design-c or design-b-rev) and a revised plan re-pointing the
  producer. This spec's design phase must call that out as a downstream
  task with a named owner.
- Neither path requires backfilling existing `wiki/metrics/*.csv` rows.
- "canonical-11" prose in `wiki/storyboard-*.md` becomes "canonical-12"
  via spec 860's plan-b Step 7 (path a) or via the revised plan (path b)
  — this spec does not own that increment.
