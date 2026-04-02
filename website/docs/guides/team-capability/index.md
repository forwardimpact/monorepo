---
title: "Team Capability"
description: "Model team capability with Summit — coverage heatmaps, structural risks, and what-if staffing scenarios."
---

Summit treats a team as a system, not a collection of individuals. It aggregates
individual skill matrices into team-level views — capability coverage,
structural risks, and what-if staffing scenarios. Everything runs locally with
no external dependencies and no LLM calls. Results are fully deterministic.

## Capability Coverage

Summit builds a coverage heatmap by combining each team member's skill
proficiencies into an aggregate view. This shows where the team is strong and
where it has gaps:

```
$ fit-summit coverage platform

  Platform team — 5 engineers

  Capability: Delivery
    task_decomposition        ████████░░  depth: 3 engineers at working+
    estimation                ██████░░░░  depth: 2 engineers at working+
    incident_response         ████░░░░░░  depth: 1 engineer at working+

  Capability: Architecture
    system_design             ████████░░  depth: 3 engineers at working+
    api_design                ██████████  depth: 4 engineers at working+
    infrastructure            ████░░░░░░  depth: 1 engineer at working+
```

"Depth" indicates how many engineers can operate at working proficiency or above
for that skill. Higher depth means the team can sustain work in that area even
if someone is unavailable.

## Structural Risks

Summit identifies three categories of structural risk:

**Single points of failure** — Skills where only one engineer has working-level
proficiency or above. If that person is on leave or leaves the team, the
capability disappears.

**Critical gaps** — Skills that are important for the team's mission but where
no one has reached working-level proficiency.

**Concentration risks** — Skills where proficiency is concentrated in one
engineer at a much higher level than everyone else, creating a bottleneck.

```
$ fit-summit risks platform

  Platform team — Structural Risks

  Single Points of Failure:
    infrastructure            Only: alice.chen (practitioner)
    incident_response         Only: bob.kumar (working)

  Critical Gaps:
    observability             No engineer at working+
    capacity_planning         No engineer at working+

  Concentration:
    system_design             alice.chen (expert) vs team avg (foundational)
```

## What-If Scenarios

Summit lets you simulate roster changes before they happen:

```
$ fit-summit what-if platform --remove alice.chen

  Removing alice.chen from Platform team

  New Single Points of Failure:
    system_design             Only: carlos.ruiz (working)  [was: covered by 3]
    api_design                Only: carlos.ruiz (working)  [was: covered by 4]

  New Critical Gaps:
    infrastructure            No engineer at working+  [was: alice.chen]

  Coverage Change:
    Architecture capability   ████████░░ → ████░░░░░░  (-40%)
```

```
$ fit-summit what-if platform --add diana.lee

  Adding diana.lee to Platform team

  Resolved Risks:
    observability             diana.lee (practitioner) resolves critical gap
    infrastructure            diana.lee (working) resolves single point of failure

  Coverage Change:
    Architecture capability   ████████░░ → ██████████  (+20%)
```

What-if scenarios help leaders make staffing decisions with full visibility into
capability impact.

## Who Summit is For

- **Engineering leaders** — Staff teams to succeed by understanding capability
  coverage before it becomes a problem.
- **Tech leads** — Identify growth priorities for the team and make the case for
  hiring.
- **Engineers in 1:1s** — See how your skills contribute to team capability and
  where growth has the most impact.

## Design Principles

Summit follows a specific philosophy:

- **Teams as systems** — A team's capability is more than the sum of individual
  skills. Coverage, depth, and distribution matter.
- **Plan forward** — What-if scenarios help you act before a gap becomes a
  crisis.
- **Capability, not performance** — Summit measures what a team can do, not how
  hard anyone is working.
- **Privacy through aggregation** — Individual data feeds the model, but outputs
  focus on team-level patterns.
- **No external dependencies** — Runs entirely locally. No API calls, no LLM, no
  network access required.

## Related Documentation

- [CLI Reference](/docs/reference/cli/) — Full command options for Summit
- [Data Model Reference](/docs/reference/model/) — How skills, levels, and
  disciplines define team capability
