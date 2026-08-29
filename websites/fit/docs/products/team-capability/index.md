---
title: "Make Staffing Decisions You Can Defend"
description: "Replace staffing intuition with evidence: coverage heatmaps, structural risks, and what-if scenarios that show what each role requires."
---

A post-mortem surfaces the same skill gap that caused the last incident. Nobody
saw the gap before you staffed the team. You need to make staffing decisions you
can defend. To do that, see what each role requires.

This guide walks through the full workflow. You define role requirements with
Pathway. You model team composition with Summit. You simulate changes before
you commit to them.

## Prerequisites

This guide assumes you completed the setup below. If you did not, follow each
link. Then return here.

- [Getting Started: Map for Leaders](/docs/getting-started/leaders/map/) to
  initialize the standard data
- [Getting Started: Pathway for Leaders](/docs/getting-started/leaders/pathway/)
  to install Pathway
- [Getting Started: Summit for Leaders](/docs/getting-started/leaders/summit/)
  to install Summit and create the roster

You need a `summit.yaml` roster file that describes your teams. The
getting-started guide for Summit shows how to create one.

## Clarify what each role requires

Before you can see where a team is strong or weak, you need to know what each
role on the team demands. Pathway derives role requirements from your
organization's engineering standard. The requirements do not come from a
generic framework.

First, generate the full role definition for a position on the team. For
example, see what the standard expects of a Software Engineer (J060) on a
platform track:

```sh
npx fit-pathway job software-engineering J060 --track=platform
```

The output has four sections:

1. **Expectations**: the level's impact scope, autonomy, influence, and
   complexity.
2. **Behaviour Profile**: each behaviour the organization values and the
   maturity expected at this level.
3. **Skill Matrix**: every skill relevant to the discipline and track, with
   the expected proficiency level.
4. **Driver Coverage**: how the skill and behaviour profile maps to
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
five engineers across two disciplines and two tracks, you may need only three
or four definitions. Each unique combination needs one definition. Use the
`--list` flag to see all valid combinations:

```sh
npx fit-pathway job --list
```

This gives you the vocabulary of roles your standard supports. Summit uses the
Skill Matrix from each role definition to compute team coverage. The sections
below build on these requirements.

## See what the team covers

When you understand the role requirements, model the team as a whole. Summit
derives each team member's skill matrix from their role definition. It
aggregates the matrices into a team-level coverage view.

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
even when someone is unavailable. A blank bar signals a gap. Nobody on the team
covers that skill at the working level.

Start every staffing conversation here. Point to the depth numbers. The
numbers ground the discussion.

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

**Single points of failure** are skills where only one engineer has
working-level proficiency or above. If that person is on leave or leaves the
team, the capability disappears.

**Critical gaps** are skills the team's disciplines and tracks require but no
one currently covers at the working level. These are the gaps that show up in
post-mortems.

**Concentration risks** flag skills where one engineer holds a much higher
proficiency level than everyone else. That engineer becomes a bottleneck even
while present.

Each category gives you evidence for a staffing conversation. You can name a
specific single point of failure instead of a general request for headcount.

## Simulate roster changes before you decide

You identified the risks. Now evaluate your options before you commit. The
`what-if` command simulates roster changes. It shows how coverage and risks
shift as a result.

### Model a new position

Describe the role you have in mind. Then see what it resolves:

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
changes. You can now articulate exactly why this position matters. Say "A J060
platform engineer resolves both the observability gap and the infrastructure
single point of failure."

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

The output makes retention conversations concrete. You can show that Alice's
departure creates two new single points of failure and a 40% drop in
architecture coverage.

### Model an internal move

When you consider a transfer between teams, use `--move` with `--to`:

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

A promotion moves the member to the next level. The new level changes their
expected proficiencies. It may also shift coverage and risks.

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

Compare two teams directly when you restructure, or when two teams of similar
size perform differently:

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

The command diffs coverage and risks across both teams. It makes structural
differences visible. Use it when you allocate a new position or consider a
reorganization.

## Match the audience to the conversation

Summit has a privacy model that adjusts individual-level detail based on
context. Use the `--audience` flag to match the output to your conversation:

| Audience     | Detail level                    | Use for                                  |
| ------------ | ------------------------------- | ---------------------------------------- |
| `engineer`   | individual names visible        | 1:1s, self-assessment                    |
| `manager`    | individual names visible        | team-level planning (the default)        |
| `director`   | names stripped, aggregates only | cross-team planning, executive artifacts |

```sh
npx fit-summit coverage platform --roster ./summit.yaml --audience director
```

When you share coverage or risk reports beyond the team manager, use
`--audience director`. It strips individual names and shows only aggregated
counts.

## Verify

You reach the outcome of this guide when you can answer these questions from
your Pathway and Summit output:

- **What does each role on the team require?** You generated role definitions
  with `npx fit-pathway job` for each distinct position. You can describe the
  skills, behaviours, and scope each role expects.
- **Where is the team strong and where are the gaps?** You ran
  `npx fit-summit coverage`. You can point to depth numbers for each capability
  area.
- **What structural risks does the team carry?** You ran
  `npx fit-summit risks`. You can name the single points of failure, critical
  gaps, and concentration risks.
- **What would a specific roster change do?** You ran at least one
  `npx fit-summit what-if` scenario. You can describe the coverage and risk
  impact of the change you have in mind.
- **Can you defend the decision with evidence?** For your next staffing
  conversation, you can show the coverage gap or structural risk the decision
  addresses. You do not rely on a general claim of need.

## What's next

<div class="grid">

<!-- part:card:evaluate-candidate -->
<!-- part:card:surface-gaps -->

</div>
