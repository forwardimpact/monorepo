---
title: "Understand Autonomy and Scope"
description: "Understand what independence, decision-making authority, and complexity look like at your level, so scope conversations start from shared definitions."
---

You need to understand what your level's expectations mean in practice. They
cover how independently you work, what decisions you own, and how far your
influence reaches.

## Prerequisites

Complete the
[See What's Expected at Your Level](/docs/products/career-paths/) guide first.
This page assumes you know your role coordinates (discipline, level, and
optional track). It also assumes you ran `npx fit-pathway job` at least once.

## Read the Expectations section

Generate your role definition. Focus on the Expectations section:

```sh
npx fit-pathway job software-engineering J060
```

The Expectations section appears at the top of the output:

```text
## Expectations

- **Impact Scope**: Features and small projects
- **Autonomy Expectation**: Work independently on familiar problems
- **Influence Scope**: Mentor junior team members
- **Complexity Handled**: Moderate complexity with some ambiguity
```

Each expectation describes a different dimension of your role:

| Expectation              | What it answers                                          |
| ------------------------ | -------------------------------------------------------- |
| **Impact Scope**         | How large is the blast radius of your work?              |
| **Autonomy Expectation** | How much direction do you need, and from whom?           |
| **Influence Scope**      | Whose technical decisions can you shape?                 |
| **Complexity Handled**   | How ambiguous and multi-variable are your problems?      |

Replace `software-engineering J060` with your own discipline and level to see
the expectations that apply to your role.

## Compare expectations across levels

The `progress` command shows which skills and behaviours change between levels.
It does not show how expectations shift. To see that, generate the role
definition at two levels. Then compare the Expectations sections side by side.

Generate your current level and the next one:

```sh
npx fit-pathway job software-engineering J060
npx fit-pathway job software-engineering J070
```

Here is what the Expectations section looks like at each of those levels:

**Engineer (J060):**

```text
- **Impact Scope**: Features and small projects
- **Autonomy Expectation**: Work independently on familiar problems
- **Influence Scope**: Mentor junior team members
- **Complexity Handled**: Moderate complexity with some ambiguity
```

**Senior Engineer (J070):**

```text
- **Impact Scope**: Drives outcomes that span an entire team or product area,
  including cross-functional dependencies.
- **Autonomy Expectation**: Operates autonomously across the full delivery
  lifecycle, setting direction for assigned scope.
- **Influence Scope**: Influences technical strategy within the team and is a
  trusted voice in adjacent teams.
- **Complexity Handled**: Handles complex, ambiguous problems requiring
  trade-off analysis across quality, compliance, and timelines.
```

Read these side by side to see the concrete shifts. From J060 to J070, impact
scope grows from team-level components to an entire product area. Autonomy also
shifts. At J060 you work independently on defined deliverables. At J070 you set
direction across the full delivery lifecycle. Influence extends beyond the
immediate team into adjacent teams. Complexity moves from "moderately complex
with known variables" to "ambiguous problems requiring trade-off analysis."

If your role includes a track, add the `--track` flag to both commands to see
how specialization affects expectations:

```sh
npx fit-pathway job software-engineering J060 --track=platform
npx fit-pathway job software-engineering J070 --track=platform
```

## Connect expectations to skill and behaviour changes

Expectation shifts do not happen in isolation. Related changes in skills
and behaviours support them. Use the `progress` command to see those changes:

```sh
npx fit-pathway progress software-engineering J060
```

```text
# Career Progression

**From**: Engineer Software Engineer
**To**: Senior Engineer Software Engineer

## Summary

- Skills to improve: 7
- Behaviours to improve: 5
- New skills: 0
- Total changes: 12
```

Each skill and behaviour change in the progression output maps to one or more
expectation shifts. For example, Architecture Design grows from Working to
Practitioner. That growth supports the broader impact scope ("spans an entire
team or product area"). The Think in Systems behaviour matures from Practicing
to Role Modeling. That change supports work on "ambiguous problems requiring
trade-off analysis."

Review your progression. For each expectation shift, ask which skill or
behaviour changes make that shift possible.

## View the full expectations ladder

To see how expectations evolve across the entire career ladder, generate role
definitions at multiple levels:

```sh
npx fit-pathway job software-engineering J040
npx fit-pathway job software-engineering J060
npx fit-pathway job software-engineering J070
npx fit-pathway job software-engineering J080
```

Read only the Expectations section from each output. The progression tells a
story:

| Level | Autonomy pattern                              | Impact pattern                          |
| ----- | --------------------------------------------- | --------------------------------------- |
| J040  | works under close direction with regular review | discrete tasks within a single team    |
| J060  | works independently on defined deliverables     | components and features for team goals |
| J070  | operates autonomously, sets direction           | spans an entire team or product area   |
| J080  | defines goals with minimal oversight            | shapes outcomes across multiple teams  |

This table is a summary for illustration. Your organization's standard may
use different words. Always read the actual output of `npx fit-pathway job`
for the authoritative definition.

## Verify

You reach the outcome of this guide when you can answer these questions
from your Pathway output:

- **What does your level expect for independence?** You can describe your
  autonomy expectation in concrete terms. "I should be independent" is not
  concrete. Name the specific scope and boundaries of that independence.
- **How far does your influence reach?** You can name the boundary. The
  boundary is the immediate team, adjacent teams, the department, or the
  organization. You can also say what "influence" means at that boundary.
- **What complexity are you expected to handle?** You can describe the type of
  problems your level owns. You can also say how much ambiguity your level
  expects.
- **What changes at the next level?** You compared expectations across two
  levels. You can name the specific shifts in each dimension.
- **Which skills support those shifts?** You connected at least one
  expectation change to the skill or behaviour growth that makes it possible.

If any of these are unclear, run `npx fit-pathway job <discipline> <level>`
again at two adjacent levels. Then compare the Expectations sections.

## What's next

<div class="grid">

<!-- part:card:.. -->
<!-- part:card:../../growth-areas -->

</div>
