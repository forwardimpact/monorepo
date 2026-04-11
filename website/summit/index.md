---
title: Summit
description: See team capability as a system — coverage, structural risks, what-if staffing scenarios, growth alignment, and quarterly trajectory from your engineering framework.
layout: product
toc: false
hero:
  subtitle: Summit treats a team as a system, not a collection of individuals. It aggregates skill matrices into capability coverage, structural risks, and what-if staffing scenarios so leaders can build teams that succeed.
  cta:
    - label: For Leadership
      href: /docs/getting-started/leadership/
    - label: View on npm
      href: https://www.npmjs.com/package/@forwardimpact/summit
      secondary: true
---

> Map defines skills. Pathway charts individual routes. Basecamp handles daily
> ops. But none of them answer the question engineering leaders ask most often:
> "Does this team have the capability to deliver what we need?" Summit makes
> that visible — not by ranking individuals, but by modelling the team as a
> system with structural properties.

### What you get

- **Capability coverage** — per-skill headcount at working+ across the team.
- **Structural risks** — single points of failure, critical gaps, concentration
  risks.
- **What-if scenarios** — simulate add / remove / move / promote before acting.
- **Growth alignment** — connect team gaps to individual development
  opportunities.
- **Compare** — diff two teams' coverage and risks side by side.
- **Trajectory** — quarterly capability evolution from git history of your
  roster file.
- **Roster / validate** — show the team layout Summit sees and check it against
  your Map framework.

Optional enhancements (require Map's activity layer):

- `--evidenced` — compares derived coverage against practiced capability from
  Guide's evidence rows.
- `--outcomes` — weights growth recommendations by GetDX driver scores.

Without these flags, Summit is fully local and instant — Map data plus a roster.

### Install

```
npm install @forwardimpact/summit
```

### Getting started

Create a roster file `summit.yaml`:

```yaml
teams:
  platform:
    - name: Alice
      email: alice@example.com
      job:
        discipline: software_engineering
        level: J060
        track: platform
    - name: Bob
      email: bob@example.com
      job: { discipline: software_engineering, level: J060 }

projects:
  migration-q2:
    - email: alice@example.com
      allocation: 0.6
    - name: External Consultant
      job: { discipline: software_engineering, level: J060, track: platform }
      allocation: 1.0
```

Then run Summit against your Map data directory:

```
npx fit-summit roster --roster ./summit.yaml
npx fit-summit coverage platform --roster ./summit.yaml
npx fit-summit risks platform --roster ./summit.yaml
npx fit-summit what-if platform --add "{ discipline: software_engineering, level: J060 }" --roster ./summit.yaml
npx fit-summit growth platform --roster ./summit.yaml
```

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
    task_completion — only Bob holds working level [low]

  Critical gaps:
    planning — no engineer at working level
      supporting skill for software_engineering discipline.
    incident_response — no engineer at working level
      broad skill for software_engineering discipline.
```

### What-If Scenarios

Simulate roster changes and see their impact before anyone makes a decision.

```
$ npx fit-summit what-if platform --add "{ discipline: software_engineering, level: J060 }"

  Adding software_engineering J060 to platform:

  Capability changes:
    + task_completion  depth: 1 → 2

  Risk changes:
    - task_completion no longer single point of failure
```

---

## Design Principles

**Teams are systems, not collections.** A team's capability depends on coverage,
depth distribution, redundancy, and complementarity — not the sum of individual
scores.

**Plan forward, don't measure backward.** Landmark looks at past evidence.
Summit looks ahead: what can this team do today, and what could it do with
different composition?

**No external dependencies required.** Core Summit uses only Map data and a team
roster. The `--evidenced` and `--outcomes` flags are opt-in enhancements that
read Map's activity layer; without them Summit runs fully locally, instantly,
deterministically.

**Capability, not performance.** Summit describes what a team _can_ do based on
its skill profile — not how well it's doing it. A planning tool, not a
monitoring tool.

**Privacy through aggregation.** The team view shows collective coverage, not
individual shortcomings. When Summit identifies a gap, it's a team gap — a
structural fact about composition. The `--audience director` flag strips
individual names entirely from cross-team planning views.
