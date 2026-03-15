---
title: Summit
description: See team capability as a system — coverage, structural risks, and what-if staffing scenarios from your engineering framework.
layout: product
toc: false
hero:
  subtitle: Summit treats a team as a system, not a collection of individuals. It aggregates skill matrices into capability coverage, structural risks, and what-if staffing scenarios so leaders can build teams that succeed.
  cta:
    - label: Read the spec
      href: https://github.com/forwardimpact/monorepo/tree/main/specs/090-summit-product
    - label: Coming soon
      href: /docs/
      secondary: true
---

> Map defines skills. Pathway charts individual routes. Basecamp handles daily
> ops. But none of them answer the question engineering leaders ask most often:
> "Does this team have the capability to deliver what we need?" Summit makes
> that visible — not by ranking individuals, but by modelling the team as a
> system with structural properties.

### What you get

- Capability coverage heatmaps across all skills in the framework
- Structural risk detection — single points of failure, critical gaps,
  concentration risks
- What-if scenario simulation for roster changes before making them
- Growth alignment connecting team gaps to individual development opportunities
- Team roster from Map's unified person model or a local YAML planning file

---

### Who it's for

**Engineering leaders** staffing teams and planning hires. Summit shows whether
a team has the capability to deliver — and what composition changes would close
gaps.

**Tech leads** managing risk. Know which skills depend on a single person and
where cross-training would have the most impact.

**Engineers in 1:1s** aligning personal growth with team needs. See which skills
the team needs most and where your development can make the biggest difference.

---

## Three Views

### Capability Coverage

For each skill in the framework, Summit computes the team's collective
proficiency by aggregating individual skill matrices derived through Pathway.

```
$ fit-summit coverage platform

  Platform team — 5 engineers

  Capability: Delivery
    task_decomposition        ████████░░  depth: 3 engineers at working+
    incremental_delivery      ████████░░  depth: 3 engineers at working+
    technical_debt_management ██████░░░░  depth: 2 engineers at working+

  Capability: Reliability
    observability             ██░░░░░░░░  depth: 1 engineer at foundational
    incident_response         ░░░░░░░░░░  gap — no engineers at working+
```

### Structural Risks

Summit identifies single points of failure, critical gaps, and concentration
risks — structural facts about team composition, not judgments about
individuals.

```
$ fit-summit risks platform

  Single points of failure:
    capacity_planning — only Eve (L5) holds practitioner level

  Critical gaps:
    incident_response — no engineer at working level
    Consider: hiring, cross-training, or borrowing from another team.

  Concentration risks:
    delivery skills — 3 of 5 engineers at L3 working level
```

### What-If Scenarios

Simulate roster changes and see their impact before anyone makes a decision.

```
$ fit-summit what-if platform --add "{ discipline: se, level: L3, track: platform }"

  Capability changes:
    + observability             depth: 1 → 2 engineers at working+
    + incident_response         gap closed — 1 engineer at working

  Risk changes:
    - incident_response         no longer a critical gap

  This hire addresses the team's primary structural gap.
```

---

## Design Principles

**Teams are systems, not collections.** A team's capability depends on coverage,
depth distribution, redundancy, and complementarity — not the sum of individual
scores.

**Plan forward, don't measure backward.** Landmark looks at past evidence.
Summit looks ahead: what can this team do today, and what could it do with
different composition?

**No external dependencies.** Summit uses only Map data and a team roster. No
GitHub App, no webhooks, no LLM calls. It runs locally, instantly,
deterministically.

**Capability, not performance.** Summit describes what a team _can_ do based on
its skill profile — not how well it's doing it. A planning tool, not a
monitoring tool.

**Privacy through aggregation.** The team view shows collective coverage, not
individual shortcomings. When Summit identifies a gap, it's a team gap — a
structural fact about composition.
