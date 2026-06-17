# Spec 2070 — A product-vs-internal work axis that biases agent routing toward product

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
|---|---|---|
| Teams Using Agents | [Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team) | The team's value to a user is product and service improvement. Today the team spends roughly four of every five PRs improving itself, and nothing in the work-selection path notices or corrects the imbalance. The owner watching the team cannot tell whether a quiet product surface is a deliberate choice or an unmeasured drift. |
| Engineering Leaders | [Measure Engineering Outcomes](../../JTBD.md#engineering-leaders-measure-engineering-outcomes) | The team produces a system-level outcome, its own output mix, that no current metric exposes. Without the mix as a tracked signal, a leader cannot separate a real shift in priorities from week-to-week noise, and cannot defend where the team's capacity went. |

## Problem

The agent team's output is dominated by self-improvement and infrastructure
work, not the product and service improvements its users hire it for. Two
different populations show the same skew: the closed output mix and the open
backlog composition. They measure different things, output versus backlog, and
both lean heavily internal.

**Closed work (last 100 closed PRs, classified by title and scope):**

| Bucket | Share |
|---|---|
| Kata self-improvement (skills, agents, wiki/memory, harness, bridges, gates) | ~64% |
| Infrastructure (dependencies, CI, build/publish, distribution, model upgrades) | ~17% |
| Product / service | ~19% |

Fewer than ten of those 100 PRs are genuine product feature or bug work. The
rest of the product slice is documentation fixes.

**Open work (the 60-PR backlog mapped in [issue #1758](https://github.com/forwardimpact/monorepo/issues/1758);
the issue title says 63, its per-PR map enumerates 60):**
the two largest clusters are wiki shared-state (18 PRs) and release-gate
authority (9 PRs). Both are the team maintaining its own ability to operate.
Product work is one cluster of eight.

This is a feedback-structure problem, not a discipline problem. Three causes
compound:

1. **The Study phase is internally weighted.** `KATA.md` § The PDSA Loop defines
   four Study streams: security audits, external feedback triage, doc review,
   and trace grounded-theory. Three of the four draw on the team's own state.
   Only external feedback triage points at users, and it can only triage
   findings that already exist as issues.
2. **Obstacle-driven work self-amplifies.** An agent that hits friction writes a
   spec. More internal machinery produces more internal friction, which produces
   more internal specs. The wiki shared-state cluster is friction the team's own
   concurrency created.
3. **Nothing in work selection privileges product.** On-Boot Routing
   ([memory-protocol.md § On-Boot Routing](../../.claude/agents/references/memory-protocol.md))
   selects by owned priorities, storyboard items, domain assess, then
   cross-cutting fallback. None of those levels distinguishes product-aligned
   work from internal work. The classification rubric
   ([work-definition.md](../../.claude/agents/references/work-definition.md))
   sorts work by mechanical-vs-structural, never by product-vs-internal, so the
   mix is neither chosen nor measured.

Issue #1758 names a terminal constraint, the environmentally-failing `wiki` CI
check that blocks every merge, and a flow constraint, the human spec/design
approval bandwidth that gates the two busiest stations. Once the CI constraint
is lifted, approval bandwidth sets the ceiling. Either way, input-side fixes are
insufficient on their own: better product findings generated upstream of a
saturated approval gate simply queue behind the internal specs already waiting.
Rebalancing requires changing what the work-selection and measurement paths
privilege, not only what feeds them.

## Decision

Introduce **product-aligned vs internal** as a first-class axis on the team's
work, and use it in two places: the routing path that agents apply when they
select work, and the storyboard that the team studies.

- **Classify on two axes, not one.** Every spec and every actionable finding
  carries a product-vs-internal classification alongside the existing
  mechanical-vs-structural one. *Product-aligned* work changes a product or
  service surface a JTBD persona hires (CLAUDE.md § Products). *Internal* work
  changes the agent team's own machinery, infrastructure, or process.
- **Bias routing toward product.** When an agent chooses among candidate work
  that ties within a single routing level (the levels stay strictly ordered;
  an owned priority still preempts everything below it), product-aligned work
  outranks internal work. The one exception
  is theory-of-constraints discipline: internal work that lifts a constraint
  currently blocking product delivery keeps its priority, because it buys
  product throughput. The agent records which case applied in its decision
  block.
- **Make the mix visible.** The storyboard tracks the product-vs-internal ratio
  of completed work as a metric, so a drift in the mix reads as signal the team
  acts on rather than an invisible default.

The classification axis is the prerequisite; the routing bias and the visible
metric are its two minimal applications. They land together so the axis is
never introduced without being used both to select work and to measure the
result.

The bias is a tie-break and a default, not a quota. It changes which work an
agent reaches for first; it does not forbid internal work or override an owned
priority or an active claim.

## Scope

### In scope

| Component | What changes |
|---|---|
| The classification rubric in [work-definition.md](../../.claude/agents/references/work-definition.md). | Gains a second classification axis, product-aligned vs internal, with a decision test naming how to sort a finding and a note that the two axes are independent. |
| On-Boot Routing in [memory-protocol.md](../../.claude/agents/references/memory-protocol.md). | Gains a product-priority rule applied when selecting among candidate work of otherwise-equal routing level, with the explicit constraint-lifting exception, and an instruction to record the case in the decision block. |
| Spec authoring via the `kata-spec` skill. | A new spec states its product-vs-internal classification. The `kata-product-issue` triage path applies the same axis when it classifies an incoming issue. |
| The storyboard surface the team reviews each period. | Records the product-vs-internal ratio of the period's completed work as a tracked metric so the balance is reviewable over time. Each completed item carries its classification forward so the ratio is computed from recorded data, not asserted. The skill or workflow that emits the series is a design choice. |

### Out of scope

- **Weighting the human approval gate.** Imposing a product-to-internal ratio on
  what humans approve is a policy decision reserved to a trusted human and is
  not granted here. The axis this spec introduces is the prerequisite that makes
  such a policy expressible later; the policy itself is a separate decision.
- **Scheduling `kata-interview` on a cron.** Feeding the external-feedback Study
  stream on a fixed cadence is a separate, complementary change with its own
  spec.
- **Changing the count or definition of the four Study streams** in `KATA.md`.
- **Retroactive reclassification** of already-closed or already-merged work. The
  axis applies to work selected and authored after this spec lands.
- **Any change to the mechanical-vs-structural fork** or to the fix/spec branch
  separation. The new axis is additive and orthogonal.

## Success Criteria

| Claim | Verification |
|---|---|
| The rubric defines the product-vs-internal axis. | `work-definition.md` contains a section defining product-aligned and internal work and a decision test for sorting a finding into one, and states the axis is independent of the mechanical-vs-structural fork. |
| Routing documents the product bias and its exception. | `memory-protocol.md` § On-Boot Routing names the rule that product-aligned work outranks internal work among otherwise-equal candidates, and names the constraint-lifting exception. |
| The routing guidance requires the decision block to record the case. | `memory-protocol.md` instructs that when a selection ties between a product-aligned and an internal candidate, the `### Decision` entry names the chosen axis value and, if internal was chosen, the constraint it lifts. A sample run that makes such a selection shows the recorded value. |
| New specs carry the classification. | A spec authored after this lands states its product-vs-internal value; `kata-spec` guidance requires it. |
| Issue triage applies the same axis. | `kata-product-issue` classifies a triaged issue on the product-vs-internal axis using the shared rubric, not a private definition. |
| The mix is a tracked metric computed from classified work. | Completed work carries a product-vs-internal classification; the storyboard renders the ratio of those classifications for the period as a metric series, and the series is reproducible from the recorded classifications rather than entered by hand. |
| The bias is a default, not a quota. | The routing text states the bias does not override an owned priority, an active claim, or forbid internal work; an agent with an internal owned priority still routes to it. |

— Product Manager 🌱
