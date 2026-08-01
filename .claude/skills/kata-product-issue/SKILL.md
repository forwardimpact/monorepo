---
name: kata-product-issue
description: >
  Triage open GitHub issues against the product vision. Classify each as
  mechanical fix, product-aligned spec, or out-of-scope, and produce a report
  the agent acts on. This skill operates on issues only. kata-release-merge
  handles PR mergeability.
---

# Product Issue Triage

Triage open GitHub issues against the product vision. Decide the appropriate
action for each. Do not take the action. The triage produces a report. The
agent then uses follow-up skills (`kata-spec` for features, direct git
operations for mechanical fixes) to execute on the recommendations.

This is the Study half of the product feedback loop. The Act half lives in
the agent's workflow. That workflow calls `kata-spec` or makes fix PRs
directly from the triage decisions this skill captures.

## When to Use

- A scheduled run finds open issues that await triage
- A specific issue needs an on-demand product-alignment decision
- Never for PRs. Use [`kata-release-merge`](../kata-release-merge/SKILL.md)

## Prerequisites

All comment templates are in `references/templates.md`.

To grade experiments from agent traces, use the procedure in
`references/trace-discovery.md`. It locates trace slices inside the dispatch
workflow's artifacts.

## Checklists

<read_do_checklist goal="Hold the triage boundary before classifying issues">

- [ ] Stop at the triage report. Do not implement fixes or write specs
      inside triage.
- [ ] Classify against the product vision (CLAUDE.md § Products). Do not
      classify on personal judgment about usefulness.
- [ ] Skip issues already labeled `triaged` or `wontfix`.
- [ ] Record reasoning for each classification. Future runs audit decisions.

</read_do_checklist>

## Classification

[work-definition.md § Classification tests](../../agents/x-work-definition.md#classification-tests)
defines the mechanical-vs-structural-vs-unsettled-vs-out-of-scope tests once.
This table maps those work-types to the triage-specific action and labels.
Product alignment (the **Product-aligned** row) is this skill's own criterion.
See § Product Vision Alignment below.

Triage also assigns each issue's product-vs-internal value from the shared
rubric in
[work-definition.md § Product-aligned vs internal](../../agents/x-work-definition.md#product-aligned-vs-internal).
The spec or fix that follows carries the `product` or `internal` label that
matches. The § Product Vision Alignment judgment decides whether an issue is
in scope. The axis value itself comes from the rubric. No private definition
sets it.

| Category                 | Recommended action                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| **Mechanical fix/bug**   | Fix PR (direct git ops, no spec)                                                                                    |
| **Product-aligned**      | Write a spec with the `kata-spec` skill                                                                             |
| **Cross-product policy** | Open Discussion (per [coordination-protocol.md](../../agents/x-coordination-protocol.md)), then label `triaged` |
| **Out of scope**         | Comment + label `triaged`/`wontfix`                                                                                 |

## Product Vision Alignment

Read the project's CLAUDE.md § Users and § Products for product definitions and
personas. If a JTBD.md exists, use it to determine which persona and job the
issue serves. An issue is product-aligned if it describes a job one of the
project's products should fulfil for its personas.

## Process

### Step 0: Read Memory

Read `wiki/MEMORY.md`, then run `gemba-wiki boot --agent <self>` per
[memory-protocol § On-Boot Read Set](../../agents/x-memory-protocol.md#on-boot-read-set).
The digest's `owned_priorities`, `claims`, and `storyboard_items` seed this
Process. Extract the issues you processed before and recurring themes from
prior entries.

### Step 1: List Open Issues

`list` open issues (cap ~50). Exclude the `experiment` and `obstacle` labels.
Read number, title, body, author, labels, and timestamps
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

The agent that called this skill consumes the triage report. It acts on each
category per the classification table above. Templates are in
`references/templates.md`. Label each processed issue `triaged`.

The READ-DO checklist defines this phase boundary.

## Memory: What to Record

Append to the current week's log (see agent profile for the file path):

- **Issue triage table** — Each issue with category, action, and rationale
- **Recurring themes** — Patterns across issues, with frequency and alignment
- **Hand-offs** — Which follow-up skills you invoked for which issues
- **Metrics** — Append one row per run to `wiki/metrics/{skill}/`
  per `references/metrics.md`. See KATA.md § Metrics for the
  recording-eligibility rule.

## Coordination Channels

This skill produces these non-wiki outputs (per
[coordination-protocol.md](../../agents/x-coordination-protocol.md)):

- **Issue comment** — Triage classification, clarification requests, "not now"
  closures with rationale.
- **Discussion** — Cross-product policy questions that triage surfaces.

Hold every published body to
[citation integrity](../../agents/x-citation-integrity.md).

If an inbound issue comment for this agent is ambiguous, follow
[coordination-protocol.md § Inbound: unclear addressed comments](../../agents/x-coordination-protocol.md#inbound-unclear-addressed-comments).
