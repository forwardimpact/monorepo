---
title: Summit
description: See whether a team has the capability to deliver. Get coverage, structural risks, what-if staffing scenarios, and quarterly trajectory.
layout: product
toc: false
hero:
  image: /assets/scene-summit.svg
  alt: An engineer, an AI robot, and a business professional gather around a map on a flat rock, planning an ascent to the peak
  subtitle: Reach the peak. Summit shows whether a team has the capability to deliver what it needs to. It models the team as a system with coverage, structural risks, and what-if scenarios. Staffing decisions then rest on evidence. They do not rest on guesswork.
  cta:
    - label: View on GitHub
      href: https://github.com/forwardimpact/monorepo/tree/main/products/summit
    - label: View on npm
      href: https://www.npmjs.com/package/@forwardimpact/summit
      secondary: true
---

A post-mortem surfaces the same skill gap that caused the last incident. Nobody
saw it before the staffing decision. A team's capability depends on coverage,
depth, redundancy, and complementarity. It is not the sum of individual scores.
Summit makes that visible.

## What becomes possible

### For Engineering Leaders

See what each role requires. Then make staffing decisions you can defend. Spot
capability gaps and check whether a candidate fills them. Simulate roster
changes and see their impact before anyone decides.

- Capability coverage per skill across the team
- Structural risk identification (single points of failure, critical gaps)
- What-if scenario simulation (add / remove / move / promote before you act)
- Side-by-side team comparison and a quarterly trajectory you can track
- Optional: `--evidenced` for practiced capability, `--outcomes` for
  GetDX-weighted growth recommendations

### For Empowered Engineers

Align personal growth with what the team actually needs. See which skills make
the biggest difference and where your development closes a real gap.

- Growth alignment that connects team gaps to individual development
- Team capability views that show where the team needs depth

---

## Three Views

### Capability Coverage

For each skill in the agent-aligned engineering standard, Summit computes the
team's collective proficiency. It aggregates individual skill matrices derived
through Pathway.

```text
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

```text
$ npx fit-summit coverage --project migration-q2

  migration-q2 project — 3 members (2.0 FTE)

  Capability: Delivery
    Task Completion       ██████████  effective depth: 1.6 at working+
```

### Structural Risks

Summit identifies single points of failure, critical gaps, and concentration
risks. These are structural facts about team composition. They are not
judgments about individuals.

```text
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
to the team. It shows **high** when allocation is below 0.5 (less than
half-time). It shows **medium** between 0.5 and 1.0 (part-time). It shows
**low** at 1.0 (full-time). In reporting teams where members default to full
allocation, every SPOF shows `[low]`. The tag differentiates in project teams
where partial allocation makes a single point of failure more acute.

### What-If Scenarios

Simulate roster changes and see their impact before anyone decides.

When you add an engineer, the change may resolve existing risks. It can also
introduce new ones. For example, two engineers at the same level create a
concentration risk in skills neither covers at working+. Summit shows both
directions:

```text
$ npx fit-summit what-if platform --add "{ discipline: software-engineering, level: J060 }"

  Adding software-engineering J060 to platform:

  Capability changes:
    + task-completion  depth: 1 → 2

  Risk changes:
    - task-completion no longer single point of failure
    + incident-response concentration risk: 2 engineers, none at working+
```

`-` lines are risks the change resolves. `+` lines are risks the change
introduces. A staffing change that looks straightforwardly positive can still
surface second-order gaps. Summit shows both, so you decide with the full
picture.

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
