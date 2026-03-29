---
title: Summit Internals
description: "Capability aggregation engine — skill matrix aggregation, structural risk detection, and scenario modeling."
---

## Overview

Summit treats a team as a system, not a collection of individuals. It aggregates
individual skill matrices (derived via libskill) into team-level capability
views, detects structural risks, and supports what-if staffing scenarios.

Summit is fully local and deterministic -- no external dependencies, no LLM
calls.

---

## Architecture

Summit consumes two inputs:

1. **Team roster** -- from Map's `organization_people` table, providing each
   person's `discipline`, `level`, and `track`
2. **Individual skill matrices** -- derived via libskill's `deriveSkillMatrix()`
   for each team member

From these inputs, Summit computes team-level aggregations that answer staffing
and capability questions for leadership.

```
Map (roster) -> libskill (individual derivation) -> Summit (team aggregation)
```

---

## Skill Matrix Aggregation

For each skill in the framework, Summit computes the team's collective
proficiency from individual derivations:

- **Coverage count** -- how many team members have each skill at each
  proficiency level
- **Maximum proficiency** -- the highest individual proficiency on the team
- **Distribution** -- the spread of proficiency levels across team members
- **Capability coverage** -- which capabilities have adequate staffing and which
  are understaffed

This produces a team skill matrix that mirrors the structure of individual
matrices but represents the team's collective capability.

---

## Structural Risk Detection

Summit identifies three categories of structural risk:

### Single Points of Failure

A skill where only one engineer is at `practitioner` level or above. If that
person leaves or is unavailable, the team loses its only source of deep
expertise in that area.

### Critical Gaps

A skill where no engineer is at `working` level or above. The team lacks the
competence to handle this skill area independently -- all work requires external
support or guidance.

### Concentration Risks

A skill where the majority of engineers are at the same proficiency level. This
indicates insufficient knowledge distribution -- the team has breadth but lacks
the depth/breadth gradient needed for mentoring and knowledge transfer.

---

## Scenario Modeling

Summit supports what-if simulations that add or remove hypothetical team members
and recompute coverage and risks:

- **Add a member** -- specify discipline, level, and track for a hypothetical
  hire and see how team coverage and risks change
- **Remove a member** -- simulate a departure and identify which risks emerge
- **Change a role** -- model a promotion or track change and see the effect on
  team capability

Scenarios do not persist -- they are computed on demand and discarded. This
enables leadership to explore staffing decisions without affecting real data.

---

## Design Principles

### Teams as Systems

Summit measures the team, not individuals. Individual skill matrices are inputs
to team aggregation, but Summit never presents individual performance.
Leadership sees capability coverage, not individual scores.

### Plan Forward, Not Backward

Summit answers "what capability do we need?" not "who is underperforming?" Risk
detection identifies structural gaps in the team system, not deficiencies in
individual team members.

### No External Dependencies

Summit runs entirely locally with no network calls, no LLM inference, and no
external services. All computation is deterministic -- the same inputs always
produce the same outputs.

### Capability, Not Performance

Summit measures what the team can do (capability coverage), not how well they do
it (performance). Performance measurement is outside its scope.

### Privacy Through Aggregation

Individual skill matrices are aggregated into team views. Summit's output is
always at the team level, preserving individual privacy while giving leadership
the system-level view they need.

---

## Dependency Chain

```
libskill -> Summit
```

Summit depends on libskill for individual skill matrix derivation. It uses the
same `deriveSkillMatrix()` and `deriveBehaviourProfile()` functions that Pathway
uses for job definitions, ensuring consistency between individual and team
views.

Map provides the team roster via `organization_people`, but Summit consumes this
through standard data loading rather than activity-layer queries.

---

## Related Documentation

- [libskill Internals](/docs/internals/libskill/) -- Derivation engine for
  individual skill matrices
- [Team Capability Guide](/docs/guides/team-capability/) -- User-facing team
  capability documentation
