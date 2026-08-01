---
title: "Get Output Review Grounded in the Standard"
description: "Catch convention violations that look correct on the surface. Review agent output against your engineering standard. Do not read every line."
---

An engineer approved agent output. The engineer did not check it against the
standard. The code looked correct, but it violated an organizational convention
that only the standard data showed. If you read every line, you lose the
productivity gain that agents give. This guide shows how to verify agent work
against your organization's actual engineering standard. You then review by
exception. You do not review by default. Two products work together.
**Pathway** makes the role's expected skills, behaviours, and conventions
visible so you know what to look for. **Guide** reviews specific deliverables
against those expectations. For the other half of this job, career guidance
from the same standard, see
[Get Career Guidance Grounded in the Standard](/docs/products/growth-areas/).

## Prerequisites

This guide assumes you completed the setup for both products:

- [Getting Started: Pathway for Engineers](/docs/getting-started/engineers/pathway/)
  -- install Pathway, initialize a `data/pathway/` directory with your
  organization's standard data or the starter content.
- [Getting Started: Guide for Engineers](/docs/getting-started/engineers/guide/)
  -- install Guide, run codegen, authenticate with Anthropic, process your
  standard data, and start the service stack.

You should also know the role coordinates (discipline, level, and track) for
the agent that produced the work. If you do not know them yet, work through
[See What's Expected at Your Level](/docs/products/career-paths/) first. That
guide covers how to find role coordinates and what each level expects.

## See what the standard expects for this role

Before you review agent output, make the quality bar explicit. Pathway derives
the full expectation profile for any role from your organization's standard
data. It is not a generic checklist.

Generate the role definition for the discipline and level you configured the
agent to work at. For example, the agent may operate as a Software Engineer
(J060) on a platform track:

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

The Skill Matrix is the most useful section for output review. It lists every
skill the role requires and the proficiency level expected at each one. An
agent configured for this role should produce output consistent with
`working`-level Architecture Design, `working`-level Code Quality, and so on.
When a skill shows `foundational` or `awareness`, the standard expects less
depth in that area. Calibrate your review accordingly.

### Inspect specific skills the output touches

If the agent's deliverable involves architecture decisions, inspect the skill
definition to see what the expected proficiency level looks like in practice:

```sh
npx fit-pathway skill architecture-design
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

Each proficiency level describes concrete, observable actions. Compare the
level description for the agent's expected proficiency against what the agent
actually produced. If the role expects `working`-level Architecture Design, the
output should show that the agent designed services and module boundaries for a
bounded domain. An agent that only implements components inside someone else's
architecture works at `foundational` level.

Repeat for each skill the deliverable touches. The Skill Matrix tells you which
skills are relevant. The skill detail tells you what the expected proficiency
looks like.

### Check behaviour expectations

Agent output can be technically correct and still violate how the organization
expects people to approach work. Behaviours describe those expectations.

If the agent was supposed to demonstrate systems thinking in its design, check
what the standard expects:

```sh
npx fit-pathway behaviour systems-thinking
```

```text
# Think in Systems

## Maturity Levels

| Maturity | Description |
| --- | --- |
| Emerging | You recognise that your work connects to broader processes... |
| Developing | You actively trace dependencies beyond your immediate scope... |
| Practicing | You consistently reason about systems end-to-end... |
| Role Modeling | You shape how teams approach problems... |
| Exemplifying | You set the standard for systems thinking... |
```

If the role expects `developing`-level systems thinking, the output should
actively trace dependencies beyond the immediate scope. An agent may solve the
problem in isolation and ignore upstream or downstream effects. That output
violates the behaviour expectation even if the code itself works.

## Review the deliverable with Guide

You now know what the standard expects. Guide applies that knowledge to a
specific deliverable. Do not read every line yourself. Describe the output to
Guide. Ask Guide to evaluate it against the standard.

Start Guide. Describe what the agent produced. Lines that start with `>` are
prompts you type inside the Guide session:

```sh
npx fit-guide
```

```text
> I'm reviewing a PR from an agent configured as a J060 Software Engineer on
> the platform track. The PR introduces a new service for processing webhook
> events. Does this align with what our standard expects at working-level
> architecture design?
```

Guide responds with an evaluation grounded in your organization's skill
definitions:

```text
At working-level Architecture Design, your standard expects the engineer to
design services and module boundaries for a bounded domain. For a webhook
processing service, I'd look for:

1. **Clear service boundary** — The service should have a well-defined API
   contract. Check whether the PR documents what events it handles and what
   it delegates to other services.

2. **Module boundaries within the service** — Internal structure should
   separate concerns (event parsing, validation, routing, handlers). If
   everything lives in a single file or handler, that's below working level.

3. **Integration points documented** — Working-level architecture means the
   engineer considers how this service connects to the broader system. Look
   for documentation of dependencies, data flow, and failure modes.

Your standard does not expect a J060 to lead architecture for the platform
area (that's practitioner level) — so the scope should be bounded to this
service, not a platform-wide webhook strategy.
```

Guide tells you what to check and what is out of scope for this level. You do
not review every line. You review the specific areas Guide identifies.

### Ask about specific concerns

When something in the output looks off, ask Guide whether it violates the
standard:

```text
> The PR doesn't handle retry logic for failed webhook deliveries. Is that
> expected at J060 on the platform track?
```

```text
> The agent used a synchronous request pattern instead of an event queue.
> Does our standard say anything about that at working level?
```

Guide checks each question against the skill definitions, behaviour
expectations, and conventions in your standard. Two engineers who ask the same
question get the same foundational answer. They share one source of truth.

### Pipe a focused question

For a quick check outside the interactive session, pipe a question directly:

```sh
echo "Does our standard expect working-level code review to catch cross-cutting concerns?" | npx fit-guide
```

Guide references the specific markers from your capability YAML and returns a
grounded answer.

## Build a review checklist from the standard

You may review the same kind of work again and again, such as all agent PRs for
one service. Use Pathway to build a reusable checklist grounded in the
standard.

Generate the skill IDs relevant to the agent's role:

```sh
npx fit-pathway job software-engineering J060 --track=platform --skills
```

```text
architecture-design
code-quality
full-stack-development
cloud-platforms
sre-practices
change-management
incident-management
observability
performance-optimization
data-modeling
stakeholder-management
```

Each skill ID maps to a set of concrete expectations in your standard. For the
skills most relevant to the deliverable type (e.g., `architecture-design` and
`code-quality` for a new service PR), look up the proficiency descriptions:

```sh
npx fit-pathway skill code-quality
```

The proficiency description at the expected level becomes a checklist item. For
example, if `working`-level Code Quality says "writes clean, well-structured
code with consistent style and meaningful naming," that is what you verify in
the agent's output. Everything else is noise you can skip.

## Verify

You reach the outcome of this guide when you can answer these questions:

- **What does the standard expect for this role?** You generated the role
  definition with `npx fit-pathway job`. You can name the skills, proficiency
  levels, and behaviour maturities relevant to the deliverable.
- **What does each expected proficiency look like in practice?** You inspected
  at least one skill with `npx fit-pathway skill`. You can describe the
  concrete actions the expected proficiency level involves.
- **Can you articulate what to check and what to skip?** You asked Guide to
  evaluate the deliverable. You received specific areas to review, grounded in
  the standard.
- **Do you review by exception?** You do not read every line. You check the
  areas Guide identified as relevant to the role's expectations. You skip areas
  where the output meets or exceeds the standard.

If any of these are unclear, revisit the relevant step. You shift from "review
everything" to "review by exception" when you trust the standard to define the
quality bar and Guide to apply it.

## What's next

<div class="grid">

<!-- part:card:second-opinion -->
<!-- part:card:expected-output -->
<!-- part:card:../growth-areas -->

</div>
