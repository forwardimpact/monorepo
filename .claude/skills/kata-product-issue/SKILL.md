---
name: kata-product-issue
description: >
  Triage open GitHub issues against the product vision. Classify each as
  mechanical fix, product-aligned spec, or out-of-scope, and produce a report
  the agent acts on. Operates on issues only — PR mergeability is
  kata-release-merge.
---

# Product Issue Triage

Triage open GitHub issues against the product vision and decide the appropriate
action for each — but do not take it. The triage produces a report; the agent
then uses follow-up skills (`kata-spec` for features, direct git operations for
mechanical fixes) to execute on the recommendations.

This is the Study half of the product feedback loop. The Act half lives in the
agent's workflow, calling `kata-spec` or making fix PRs directly based on the
triage decisions captured here.

## When to Use

- A scheduled run finds open issues awaiting triage
- A specific issue needs an on-demand product-alignment decision
- Never for PRs — use [`kata-release-merge`](../kata-release-merge/SKILL.md)

## Prerequisites

All comment templates are in `references/templates.md`.

For grading experiments from agent traces, the procedure for locating trace
slices inside the dispatch workflow's artifacts is in
`references/trace-discovery.md`.

## Checklists

<read_do_checklist goal="Hold the triage boundary before classifying issues">

- [ ] This skill stops at the triage report — do not implement fixes or write
      specs from within triage.
- [ ] Classify against the product vision (CLAUDE.md § Products), not personal
      judgement about usefulness.
- [ ] Skip issues already labeled `triaged` or `wontfix`.
- [ ] Record reasoning for each classification — future runs audit decisions.

</read_do_checklist>

## Classification

The mechanical-vs-structural-vs-unsettled-vs-out-of-scope tests are defined once
in
[work-definition.md § Classification tests](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/x-work-definition.md#classification-tests);
this table maps those work-types to the triage-specific action and labels.
Product alignment (the **Product-aligned** row) is this skill's own criterion —
see § Product Vision Alignment below.

Triage also assigns each issue's product-vs-internal value from the shared
rubric in
[work-definition.md § Product-aligned vs internal](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/x-work-definition.md#product-aligned-vs-internal),
and the resulting spec or fix carries the matching `product` / `internal`
label. The § Product Vision Alignment judgement decides whether an issue is in
scope; the axis value itself comes from the rubric, not a private definition.

| Category                 | Recommended action                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| **Mechanical fix/bug**   | Fix PR (direct git ops, no spec)                                                                                    |
| **Product-aligned**      | Write spec via the `kata-spec` skill                                                                                |
| **Cross-product policy** | Open Discussion (per [coordination-protocol.md](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/x-coordination-protocol.md)); label `triaged` |
| **Out of scope**         | Comment + label `triaged`/`wontfix`                                                                                 |

## Product Vision Alignment

Read the project's CLAUDE.md § Users and § Products for product definitions and
personas. If a JTBD.md exists, use it to determine which persona and job the
issue serves. An issue is product-aligned if it describes a job one of the
project's products should fulfil for its personas.

## Process

### Step 0: Read Memory

Read `wiki/MEMORY.md` then run `Bash: fit-wiki boot --agent <self>` (per
[Memory Protocol § On-Boot Read Set](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/x-memory-protocol.md#on-boot-read-set)).
The boot digest's `owned_priorities`, `claims`, and (when this skill reads
Tier-2 surfaces) `storyboard_items` seed the rest of this skill's Process.
Extract issues previously processed and recurring themes from prior entries.

### Step 1: List Open Issues

`list` open issues (cap ~50), excluding `experiment` and `obstacle` labels,
reading number, title, body, author, labels, and timestamps
([work-trackers.md](../../agents/x-work-trackers.md)).

Skip issues with `triaged` or `wontfix` labels.

### Step 2: Read and Classify Each Issue

`read` the issue's title, body, comments, labels, and author
([work-trackers.md](../../agents/x-work-trackers.md)).

Classify against the table above. Record reasoning briefly so a future run can
audit the decision.

### Step 3: Produce the Triage Report

For each issue, record: number, title, category, recommended action, and a
one-line rationale. The report is the deliverable of this skill.

### Step 4: Hand Off

The triage report is consumed by the calling agent, which acts on each category
per the classification table above. Templates are in `references/templates.md`.
Label each processed issue `triaged`.

The READ-DO checklist defines this phase boundary.

## Memory: What to Record

Append to the current week's log (see agent profile for the file path):

- **Issue triage table** — Each issue with category, action, and rationale
- **Recurring themes** — Patterns across issues, with frequency and alignment
- **Hand-offs** — Which follow-up skills were invoked for which issues
- **Metrics** — Append one row per run to `wiki/metrics/{skill}/`
  per `references/metrics.md`. See KATA.md § Metrics for the
  recording-eligibility rule.

## Coordination Channels

This skill produces these non-wiki outputs (per
[coordination-protocol.md](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/x-coordination-protocol.md)):

- **Issue comment** — Triage classification, clarification requests, "not now"
  closures with rationale.
- **Discussion** — Cross-product policy questions surfaced from triage.

[Citation integrity](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/x-citation-integrity.md):
every cited SHA must resolve on its referenced repo, or the body is not
published.

If an inbound issue comment addressed to this agent is ambiguous, follow
[coordination-protocol.md § Inbound: unclear addressed comments](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/x-coordination-protocol.md#inbound-unclear-addressed-comments).
