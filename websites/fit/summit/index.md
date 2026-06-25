---
title: Summit
description: See whether a team has the capability to deliver — coverage, structural risks, what-if staffing scenarios, and quarterly trajectory.
layout: product
toc: false
hero:
  image: /assets/scene-summit.svg
  alt: An engineer, an AI robot, and a business professional gather around a map on a flat rock, planning an ascent to the peak
  subtitle: Reach the peak. Summit shows whether a team has the capability to deliver what it needs to — modelling the team as a system with coverage, structural risks, and what-if scenarios so staffing decisions are evidence-based, not guesswork.
  cta:
    - label: View on GitHub
      href: https://github.com/forwardimpact/monorepo/tree/main/products/summit
    - label: View on npm
      href: https://www.npmjs.com/package/@forwardimpact/summit
      secondary: true
---

A post-mortem surfaces the same skill gap that caused the last incident —
nobody saw it before staffing. A team's capability depends on coverage, depth,
redundancy, and complementarity — not the sum of individual scores. Summit
makes that visible.

## What becomes possible

### For Engineering Leaders

Make staffing decisions you can defend by seeing what each role requires. Spot
capability gaps and check whether a candidate fills them. Simulate roster
changes and see their impact before anyone makes a decision.

- Capability coverage per skill across the team
- Structural risk identification (single points of failure, critical gaps)
- What-if scenario simulation (add / remove / move / promote before acting)
- Side-by-side team comparison and quarterly trajectory tracking
- Optional: `--evidenced` for practiced capability, `--outcomes` for
  GetDX-weighted growth recommendations

### For Empowered Engineers

Align personal growth with what the team actually needs. See which skills make
the biggest difference and where your development closes a real gap.

- Growth alignment connecting team gaps to individual development
- Team capability views that show where depth is needed

---

## Three Views

### Capability Coverage

For each skill in the agent-aligned engineering standard, Summit computes the
team's collective proficiency by aggregating individual skill matrices derived
through Pathway.

```
$ npx fit-summit coverage platform

  platform team — 3 members

  Capability: Delivery
    Planning              ░░░░░░░░░░  gap — no engineers at working+
    Task Completion       ██████████  depth: 1 engineer at working+

  Capability: Reliability
    Incident Response     ░░░░░░░░░░  gap — no engineers at working+
```

For project teams with allocation, coverage reports allocation-weighted
effective depth:

```
$ npx fit-summit coverage --project migration-q2

  migration-q2 project — 3 members (2.0 FTE)

  Capability: Delivery
    Task Completion       ██████████  effective depth: 1.6 at working+
```

### Structural Risks

Summit identifies single points of failure, critical gaps, and concentration
risks — structural facts about team composition, not judgments about
individuals.

```
$ npx fit-summit risks platform

  platform team — structural risks

  Single points of failure:
    task-completion — only Bob holds working level [low]

  Critical gaps:
    planning — no engineer at working level
      supporting skill for software-engineering discipline.
    incident-response — no engineer at working level
      broad skill for software-engineering discipline.
```

The severity tag on single points of failure reflects the engineer's allocation
to the team: **high** when allocation is below 0.5 (less than half-time),
**medium** between 0.5 and 1.0 (part-time), and **low** at 1.0 (full-time). In
reporting teams where members default to full allocation, every SPOF shows
`[low]`. The tag differentiates in project teams where partial allocation makes
a single point of failure more acute.

### What-If Scenarios

Simulate roster changes and see their impact before anyone makes a decision.

Adding an engineer may resolve existing risks, but can also introduce new ones
(for example, two engineers at the same level creates a concentration risk in
skills neither covers at working+). Summit shows both directions:

```
$ npx fit-summit what-if platform --add "{ discipline: software-engineering, level: J060 }"

  Adding software-engineering J060 to platform:

  Capability changes:
    + task-completion  depth: 1 → 2

  Risk changes:
    - task-completion no longer single point of failure
    + incident-response concentration risk: 2 engineers, none at working+
```

`-` lines are risks resolved by the change. `+` lines are risks the change
introduces. A staffing change that looks straightforwardly positive can still
surface second-order gaps — Summit shows both so you can make the decision with
the full picture.

---

## Getting Started

```sh
npm install @forwardimpact/summit
npx fit-summit coverage platform --roster ./summit.yaml
npx fit-summit risks platform --roster ./summit.yaml
```

<div class="grid">

<!-- part:card:../docs/getting-started/leaders/summit -->

</div>
