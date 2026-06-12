---
title: "See What's Expected at Your Level"
description: "Stop guessing what your level requires — see the skills, behaviours, and scope so expectations are clear before your next review."
---

You have started a new role, and the review form says "meets expectations" --
but nobody can point to a definition of what that means. Pathway makes those
expectations visible: the skills your level requires, the behaviours the
organization values, and the scope and autonomy your role implies. By the end of
this guide you will have a concrete picture of what your level expects, grounded
in your organization's own engineering standard. For the other half of this
job, configuring agents against the same standard, see
[Configure Agents to Meet Your Engineering Standard](/docs/products/agent-teams/).

## Prerequisites

Install Pathway and initialize your standard data before continuing. If you
have not done that yet, follow the
[Getting Started: Pathway for Engineers](/docs/getting-started/engineers/pathway/)
guide, then return here.

## Find your role coordinates

Every role in Pathway is defined by three coordinates: a **discipline**, a
**level**, and an optional **track**. Before you can see your expectations, you
need to identify which values describe your current role.

List the disciplines defined in your standard:

```sh
npx fit-pathway discipline --list
```

Expected output (your organization's values will differ):

```text
clinical_informatics
data_engineering
engineering_management
quality_engineering
software_engineering
```

Each line is a discipline ID. Note the one that matches your current role; you
will use it in later commands.

List the levels:

```sh
npx fit-pathway level --list
```

```text
J040
J060
J070
J080
J090
J100
```

Each line is a level code. Find the one that matches your current role.

If your discipline supports track specializations, list them:

```sh
npx fit-pathway track --list
```

```text
ml_ops
platform
security
sre
```

Note down your discipline ID, level code, and track ID (if applicable). These
three values are all you need for the remaining steps.

## View your full role definition

Generate the complete expectation profile for your role:

```sh
npx fit-pathway job software_engineering J060
```

The output has four sections:

1. **Expectations** -- your level's impact scope, autonomy, influence scope, and
   the complexity you are expected to handle.
2. **Behaviour Profile** -- each behaviour the organization values and the
   maturity level expected at your role.
3. **Skill Matrix** -- every skill relevant to your discipline, with the
   proficiency level expected.
4. **Driver Coverage** -- how your skill and behaviour profile maps to
   engineering effectiveness drivers.

Here is what the Expectations section looks like for an Engineer (J060) in
Software Engineering:

```text
## Expectations

- **Impact Scope**: Features and small projects
- **Autonomy Expectation**: Work independently on familiar problems
- **Influence Scope**: Mentor junior team members
- **Complexity Handled**: Moderate complexity with some ambiguity
```

If your role has a track specialization, add the `--track` flag to see how the
profile shifts:

```sh
npx fit-pathway job software_engineering J060 --track=platform
```

Track specializations add track-specific skills and may adjust behaviour
maturity expectations. For example, a Platform Engineering track adds skills
like Change Management, Incident Management, Observability, and Performance
Optimization -- and raises the Think in Systems behaviour maturity from
Practicing to Role Modeling.

## Understand your skill expectations

The Skill Matrix in your role definition shows what proficiency level each
skill requires. Skills fall into three tiers:

| Tier          | Depth    | Purpose                                       |
| ------------- | -------- | --------------------------------------------- |
| `core`        | deepest  | the skills that define your discipline         |
| `supporting`  | moderate | skills that enable your core work              |
| `broad`       | lightest | cross-cutting skills for organizational impact |

To understand what a specific proficiency level means in practice, inspect any
skill:

```sh
npx fit-pathway skill architecture_design
```

```text
# Architecture Design

Scale

Designs system structures that meet functional, scalability, and regulatory
requirements. Balances modularity, integration, and validated computer system
constraints typical of pharmaceutical environments.

## Level Descriptions

| Level | Description |
| --- | --- |
| Awareness | You recognize common architectural styles... |
| Foundational | You implement components inside a defined architecture... |
| Working | You design services and module boundaries for a bounded domain... |
| Practitioner | You lead architecture for a product or platform area... |
| Expert | You define architectural strategy and reference patterns... |
```

Each proficiency level describes concrete, observable actions -- not vague
aspirations. Compare the level description for your expected proficiency
against your current practice to identify where you are strong and where you
have room to grow.

The five proficiency levels follow a consistent progression:

| Proficiency    | Autonomy              | Scope                    |
| -------------- | --------------------- | ------------------------ |
| `awareness`    | with guidance         | team                     |
| `foundational` | with minimal guidance | team                     |
| `working`      | independently         | team                     |
| `practitioner` | lead, mentor          | area (2--5 teams)        |
| `expert`       | define, shape         | business unit / function |

## Understand your behaviour expectations

Behaviours describe how engineers approach their work -- not what they know,
but how they operate. Your role definition's Behaviour Profile shows each
behaviour and the maturity level expected.

Inspect a specific behaviour to see what each maturity level looks like:

```sh
npx fit-pathway behaviour systems_thinking
```

```text
# Think in Systems

Systems thinking is the practice of understanding how components, processes,
and people interact across a wider whole rather than viewing problems in
isolation...

## Maturity Levels

| Maturity | Description |
| --- | --- |
| Emerging | You recognise that your work connects to broader processes... |
| Developing | You actively trace dependencies beyond your immediate scope... |
| Practicing | You consistently reason about systems end-to-end... |
| Role Modeling | You shape how teams approach problems... |
| Exemplifying | You set the standard for systems thinking... |
```

Like skill proficiencies, behaviour maturities describe observable patterns.
Read the description for your expected maturity level and ask yourself: does
this describe how I work today? That self-assessment is the starting point for
identifying growth areas.

The five maturity levels:

| Maturity        | What it looks like                                   |
| --------------- | ---------------------------------------------------- |
| `emerging`      | Shows interest, needs prompting                      |
| `developing`    | Regularly applies with some guidance                 |
| `practicing`    | Consistently demonstrates in daily work              |
| `role_modeling` | Influences the team's approach, others seek them out |
| `exemplifying`  | Shapes organizational culture in this area           |

## See what changes at the next level

Once you know what your current level expects, the natural next question is:
what would need to change to reach the next level?

Run the `progress` command for your current role to see the progression to the
next level:

```sh
npx fit-pathway progress software_engineering J060
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

## Skill Changes

| Skill | Type | From |  | To | Change |
| --- | --- | --- | --- | --- | --- |
| Architecture Design | Core | Working | -> | Practitioner | +1 |
| Code Review | Core | Working | -> | Practitioner | +1 |
| Full Stack Development | Core | Working | -> | Practitioner | +1 |
| Cloud Platforms | Supporting | Foundational | -> | Working | +1 |
| SRE Practices | Supporting | Foundational | -> | Working | +1 |
| Data Modeling | Broad | Awareness | -> | Foundational | +1 |
| Stakeholder Management | Broad | Awareness | -> | Foundational | +1 |

## Behaviour Changes

| Behaviour | From |  | To | Change |
| --- | --- | --- | --- | --- |
| Build Polymathic Knowledge | Practicing | -> | Role Modeling | +1 |
| Communicate with Precision | Developing | -> | Practicing | +1 |
| Own the Outcome | Developing | -> | Practicing | +1 |
| Stay Relentlessly Curious | Developing | -> | Practicing | +1 |
| Think in Systems | Practicing | -> | Role Modeling | +1 |
```

The output makes promotion criteria concrete. Instead of a vague "you need to
be more senior," you can see that moving from J060 to J070 in Software
Engineering means growing Architecture Design from Working to Practitioner,
moving Think in Systems from Practicing to Role Modeling, and eleven other
specific changes.

Add a track to see progression within a specialization:

```sh
npx fit-pathway progress software_engineering J060 --track=platform
```

Track specializations often add more skill changes -- in this case, the
Platform Engineering track shows 16 total changes instead of 12, because
track-specific skills like Change Management, Incident Management,
Observability, and Performance Optimization all need to grow as well.

To compare any two specific levels (not just adjacent ones), use `--compare`:

```sh
npx fit-pathway progress software_engineering J040 --compare=J060
```

```text
# Career Progression

**From**: Associate Engineer Software Engineer
**To**: Engineer Software Engineer

## Summary

- Skills to improve: 10
- Behaviours to improve: 4
- New skills: 0
- Total changes: 14
```

This shows every skill and behaviour change between Associate Engineer (J040)
and Engineer (J060), regardless of the number of levels between them.

## Verify

You have reached the outcome of this guide when you can answer these
questions from your Pathway output:

- **What is my role formula?** You can name your discipline, level, and track
  (e.g., Software Engineering x J060 x Platform Engineering).
- **What skills does my role expect, and at what proficiency?** You have
  reviewed the Skill Matrix and understand the difference between core,
  supporting, and broad skill tiers.
- **What behaviours does my role expect, and at what maturity?** You have
  reviewed the Behaviour Profile and can describe what your expected maturity
  level looks like in practice.
- **What does my level imply about scope and autonomy?** You have read the
  Expectations section and can describe your level's impact scope, autonomy
  expectation, and influence scope.
- **What changes at the next level?** You have run the `progress` command and
  can name the specific skills and behaviours that would need to grow.

If any of these are unclear, re-run the relevant command and inspect the
detail for any skill or behaviour using `npx fit-pathway skill <id>` or
`npx fit-pathway behaviour <id>`.

## What's next

<div class="grid">

<!-- part:card:autonomy-scope -->
<!-- part:card:../agent-teams -->
<!-- part:card:../growth-areas -->

</div>
