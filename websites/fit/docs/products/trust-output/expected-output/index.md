---
title: "See What the Standard Expects Before Reviewing"
description: "Know what to check before you start reviewing — the skill proficiencies, behaviour maturities, and expectations your standard defines for the role."
---

You need to see what the engineering standard expects for a specific role before
reviewing agent-produced work against it.

## Prerequisites

Complete the
[Get Output Review Grounded in the Standard](/docs/products/trust-output/)
guide first -- this page assumes you have an agent-aligned engineering standard
installed and have already run `npx fit-pathway job` at least once.

## Look up the role's skill expectations

Generate the role definition for the discipline and level you are reviewing
against:

```sh
npx fit-pathway job software_engineering J060
```

The Skill Matrix section lists every skill and the proficiency level the
standard expects:

```text
## Skill Matrix

| Skill | Level |
| --- | --- |
| Incident Response | Awareness |
| Planning | Foundational |
| Task Completion | Working |
```

Each row tells you: for this role, this skill should be demonstrated at this
proficiency. When reviewing agent output, check whether the work reflects the
expected proficiency -- not a higher or lower one.

If the role includes a track specialization, add the `--track` flag:

```sh
npx fit-pathway job software_engineering J060 --track=platform
```

Track specializations shift expectations. The Platform track for J060, for
example, raises Incident Response from Awareness to Foundational and adds
track-specific responsibilities in the generated description.

## Understand what a proficiency level means

The skill name and proficiency level alone may not tell you what to look for in
a review. Inspect the skill to see the description for each proficiency level:

```sh
npx fit-pathway skill task_completion
```

```text
# Task Completion

Delivery

Completing work items reliably, from understanding requirements through
implementation to verification.

## Level Descriptions

| Level | Description |
| --- | --- |
| Awareness | You complete well-defined tasks with guidance... |
| Foundational | You break down tasks into steps, estimate effort... |
| Working | You manage your own workload, handle ambiguous requirements... |
| Practitioner | You coordinate task delivery across teams... |
| Expert | You define delivery practices across the organization... |
```

Find the row that matches the expected proficiency from the Skill Matrix. That
description is what the standard considers adequate for this role. Use it as
your review benchmark -- the work should demonstrate the described actions, not
merely the skill name.

## Check behaviour expectations

The Behaviour Profile section of the role definition shows expected maturity
levels:

```sh
npx fit-pathway job software_engineering J060
```

```text
## Behaviour Profile

| Behaviour | Maturity |
| --- | --- |
| Think in Systems | Practicing |
```

To see what "Practicing" means for a specific behaviour:

```sh
npx fit-pathway behaviour systems_thinking
```

```text
# Think in Systems

The ability to see beyond individual components to understand how the entire
system behaves...

## Maturity Levels

| Maturity | Description |
| --- | --- |
| Emerging | Recognizes that systems have interconnected parts... |
| Developing | Identifies upstream and downstream impacts... |
| Practicing | Maps complex system interactions across technical and business domains... |
| Role Modeling | Shapes systems design practices across their function... |
| Exemplifying | Defines organizational systems architecture principles... |
```

The maturity description tells you what the standard expects in terms of
approach and reasoning -- not just output. When reviewing, ask whether the work
reflects the expected maturity level's described pattern.

## Read the expectations section

The Expectations section at the top of the role definition describes the scope,
autonomy, and complexity the standard defines for this level:

```text
## Expectations

- **Impact Scope**: Features and small projects
- **Autonomy Expectation**: Work independently on familiar problems
- **Influence Scope**: Mentor junior team members
- **Complexity Handled**: Moderate complexity with some ambiguity
```

These four dimensions set the boundary for what the role should handle. If the
agent output addresses problems well beyond the role's complexity level, or
falls short of the expected autonomy, the expectations section tells you
where to calibrate.

## Extract skill IDs for scripting

When you need to check multiple skills programmatically, use the `--skills`
flag to get a plain list of skill IDs:

```sh
npx fit-pathway job software_engineering J060 --skills
```

```text
task_completion
planning
incident_response
```

Pipe these IDs into `npx fit-pathway skill` to inspect each one:

```sh
npx fit-pathway job software_engineering J060 --skills | while read id; do
  npx fit-pathway skill "$id"
  echo "---"
done
```

This produces the full description for every skill in the role, which you can
use as a review checklist.

## Verify

You have reached the outcome of this page when you can answer these questions
from your Pathway output:

- **What skills does the role expect, and at what proficiency?** You can list
  the skills and their expected levels from the Skill Matrix.
- **What does each proficiency level look like in practice?** You have inspected
  at least one skill and can describe the actions the expected proficiency
  requires.
- **What behaviours does the role expect?** You can name the expected maturity
  for each behaviour and describe what that maturity looks like.
- **What scope and autonomy does the role imply?** You can state the role's
  impact scope, autonomy expectation, and complexity level.

## What's next

<div class="grid">

<!-- part:card:.. -->
<!-- part:card:../second-opinion -->

</div>
