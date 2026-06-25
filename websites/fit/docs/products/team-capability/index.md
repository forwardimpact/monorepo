---
title: "Make Staffing Decisions You Can Defend"
description: "Replace staffing intuition with evidence — coverage heatmaps, structural risks, and what-if scenarios that show what each role requires."
---

A post-mortem surfaces the same skill gap that caused the last incident —
nobody saw it before staffing. You need to make staffing decisions you can
defend by seeing what each role requires. This guide walks through the full workflow: defining
role requirements with Pathway, modeling team composition with Summit, and
simulating changes before committing to them.

## Prerequisites

This guide assumes you have completed the following setup. If you have not,
follow each link and return here.

- [Getting Started: Map for Leaders](/docs/getting-started/leaders/map/) --
  standard data initialized
- [Getting Started: Pathway for Leaders](/docs/getting-started/leaders/pathway/) --
  Pathway installed
- [Getting Started: Summit for Leaders](/docs/getting-started/leaders/summit/) --
  Summit installed and roster created

You will need a `summit.yaml` roster file describing your teams. The
getting-started guide for Summit walks through creating one.

## Clarify what each role requires

Before you can see where a team is strong or weak, you need to know what each
role on the team actually demands. Pathway derives role requirements from your
organization's engineering standard -- it is not a generic framework.

Start by generating the full role definition for a position on the team. For
example, to see what is expected of a Software Engineer (J060) on a platform
track:

```sh
npx fit-pathway job software-engineering J060 --track=platform
```

The output has four sections:

1. **Expectations** -- the level's impact scope, autonomy, influence, and
   complexity.
2. **Behaviour Profile** -- each behaviour the organization values and the
   maturity expected at this level.
3. **Skill Matrix** -- every skill relevant to the discipline and track, with
   the proficiency level expected.
4. **Driver Coverage** -- how the skill and behaviour profile maps to
   engineering effectiveness drivers.

Here is what the Expectations section looks like:

```text
## Expectations

- **Impact Scope**: Features and small projects
- **Autonomy Expectation**: Work independently on familiar problems
- **Influence Scope**: Mentor junior team members
- **Complexity Handled**: Moderate complexity with some ambiguity
```

Generate a role definition for each distinct position on your team. If you have
five engineers across two disciplines and two tracks, you may only need three or
four definitions -- one per unique combination. Use the `--list` flag to see all
valid combinations:

```sh
npx fit-pathway job --list
```

This gives you the vocabulary of roles your standard supports. The Skill Matrix
from each role definition is what Summit uses to compute team coverage, so
understanding these requirements is the foundation for everything that follows.

## See what the team covers

With role requirements understood, model the team as a whole. Summit aggregates
each team member's skill matrix (derived from their role definition) into a
team-level coverage view.

Run the coverage command for your team:

```sh
npx fit-summit coverage platform --roster ./summit.yaml
```

Expected output:

```text
  Platform team — 5 engineers

  Capability: Delivery
    task_decomposition        ████████░░  depth: 3 engineers at working+
    estimation                ██████░░░░  depth: 2 engineers at working+
    incident-response         ████░░░░░░  depth: 1 engineer at working+

  Capability: Architecture
    system_design             ████████░░  depth: 3 engineers at working+
    api_design                ██████████  depth: 4 engineers at working+
    infrastructure            ████░░░░░░  depth: 1 engineer at working+
```

"Depth" is the number of engineers who hold working-level proficiency or above
for a given skill. Higher depth means the team can sustain work in that area
even when someone is unavailable. A blank bar signals a gap -- nobody on the
team covers that skill at the working level.

This is the starting point for any staffing conversation. Instead of debating
whether the team "feels" strong in architecture, you can point to the depth
numbers and have a grounded discussion.

## Identify structural risks

Coverage shows breadth. Risks reveal the fragile points. Summit detects three
categories of structural risk in your team's composition:

```sh
npx fit-summit risks platform --roster ./summit.yaml
```

Expected output:

```text
  Platform team — Structural Risks

  Single Points of Failure:
    infrastructure            Only: alice.chen (practitioner)
    incident-response         Only: bob.kumar (working)

  Critical Gaps:
    observability             No engineer at working+
    capacity_planning         No engineer at working+

  Concentration:
    system_design             alice.chen (expert) vs team avg (foundational)
```

**Single points of failure** are skills where only one engineer has working-level
proficiency or above. If that person is on leave or leaves the team, the
capability disappears entirely.

**Critical gaps** are skills the team's disciplines and tracks require but no one
currently covers at the working level. These are the gaps that show up in
post-mortems.

**Concentration risks** flag skills where proficiency is concentrated in one
engineer at a much higher level than everyone else, creating a bottleneck even
while they are present.

Each of these categories gives you evidence you can bring to a staffing
conversation. "We have a single point of failure on infrastructure" is a
different argument from "I think we need another infrastructure person."

## Simulate roster changes before deciding

You have identified the risks. Now evaluate your options before committing. The
`what-if` command simulates roster changes and shows how coverage and risks
shift as a result.

### Model a new position

Describe the role you are considering and see what it resolves:

```sh
npx fit-summit what-if platform --roster ./summit.yaml \
  --add "{ discipline: software-engineering, level: J060, track: platform }"
```

Expected output:

```text
  Adding hypothetical member to Platform team

  Resolved Risks:
    observability             resolves critical gap
    infrastructure            resolves single point of failure

  Coverage Change:
    Architecture capability   ████████░░ → ██████████  (+20%)
```

The output shows which risks the new role would resolve and how coverage
changes. You can now articulate exactly why this position matters: "Adding a
J060 platform engineer resolves both the observability gap and the
infrastructure single point of failure."

### Model a departure

See what happens when a team member leaves:

```sh
npx fit-summit what-if platform --roster ./summit.yaml \
  --remove alice@example.com
```

Expected output:

```text
  Removing alice@example.com from Platform team

  New Single Points of Failure:
    system_design             Only: carlos.ruiz (working)  [was: covered by 3]
    api_design                Only: carlos.ruiz (working)  [was: covered by 4]

  New Critical Gaps:
    infrastructure            No engineer at working+  [was: alice@example.com]

  Coverage Change:
    Architecture capability   ████████░░ → ████░░░░░░  (-40%)
```

This makes retention conversations concrete. Instead of "Alice is important to
the team," you can show that her departure creates two new single points of
failure and a 40% drop in architecture coverage.

### Model an internal move

When considering a transfer between teams, use `--move` with `--to`:

```sh
npx fit-summit what-if platform --roster ./summit.yaml \
  --move carol@example.com --to delivery
```

```text
  Moving carol@example.com from Platform to Delivery

  New Single Points of Failure (Platform):
    api_design                Only: carlos.ruiz (working)  [was: covered by 3]

  Resolved Risks (Delivery):
    estimation                carol@example.com resolves single point of failure

  Coverage Change (Platform):
    Delivery capability       ████████░░ → ██████░░░░  (-20%)
```

### Model a promotion

See how a promotion changes the team's coverage profile:

```sh
npx fit-summit what-if platform --roster ./summit.yaml \
  --promote bob@example.com
```

```text
  Promoting bob@example.com from J060 to J070

  Resolved Risks:
    incident-response         bob@example.com (now practitioner) no longer single point of failure risk

  Coverage Change:
    Delivery capability       ████████░░ → ██████████  (+20%)
```

Promotion bumps the member to the next level, which changes their expected
proficiencies and may shift coverage and risks.

### Focus on a single capability

When the full diff is too broad, narrow the output to one capability area:

```sh
npx fit-summit what-if platform --roster ./summit.yaml \
  --add "{ discipline: software-engineering, level: J060, track: platform }" \
  --focus architecture
```

```text
  Adding hypothetical member to Platform team (focus: architecture)

  Capability: Architecture
    system_design             ████████░░ → ████████░░  (unchanged)
    api_design                ██████████ → ██████████  (unchanged)
    infrastructure            ████░░░░░░ → ██████░░░░  (+1 depth)
    observability             ░░░░░░░░░░ → ████░░░░░░  (resolved gap)
```

## Compare teams side by side

When restructuring or understanding why two similarly-sized teams feel different,
compare them directly:

```sh
npx fit-summit compare platform delivery --roster ./summit.yaml
```

```text
  Comparison: Platform vs Delivery

  Skill                 Platform depth   Delivery depth   Delta
  task_decomposition    3                4                -1
  estimation            2                1                +1
  incident-response     1                3                -2
  system_design         3                1                +2
  api_design            4                2                +2

  Risks unique to Platform:  infrastructure (single point of failure)
  Risks unique to Delivery:  estimation (single point of failure)
```

This diffs coverage and risks across both teams, making structural differences
visible. It is especially useful when deciding where to allocate a new position
or when a reorganization is under consideration.

## Match the audience to the conversation

Summit has a privacy model that adjusts individual-level detail based on context.
Use the `--audience` flag to match the output to your conversation:

| Audience     | Detail level                    | Use for                                  |
| ------------ | ------------------------------- | ---------------------------------------- |
| `engineer`   | individual names visible        | 1:1s, self-assessment                    |
| `manager`    | individual names visible        | team-level planning (the default)        |
| `director`   | names stripped, aggregates only | cross-team planning, executive artifacts |

```sh
npx fit-summit coverage platform --roster ./summit.yaml --audience director
```

When sharing coverage or risk reports beyond the team manager, use
`--audience director` to strip individual names and show only aggregated counts.

## Verify

You have reached the outcome of this guide when you can answer these questions
from your Pathway and Summit output:

- **What does each role on the team require?** You have generated role
  definitions with `npx fit-pathway job` for each distinct position and can
  describe the skills, behaviours, and scope each role expects.
- **Where is the team strong and where are the gaps?** You have run
  `npx fit-summit coverage` and can point to depth numbers for each capability
  area.
- **What structural risks does the team carry?** You have run
  `npx fit-summit risks` and can name the single points of failure, critical
  gaps, and concentration risks.
- **What would a specific roster change do?** You have run at least one
  `npx fit-summit what-if` scenario and can describe the coverage and risk
  impact of the change you are considering.
- **Can you defend the decision with evidence?** For your next staffing
  conversation, you can show the coverage gap or structural risk the decision
  addresses -- not just assert that the team "needs" something.

## What's next

<div class="grid">

<!-- part:card:evaluate-candidate -->
<!-- part:card:surface-gaps -->

</div>
