---
title: "Ask a Growth Question"
description: "Get growth advice grounded in your organization's actual skill and behaviour definitions — not generic career guidance."
---

You need to ask a focused question about your career growth and get an answer
grounded in your organization's engineering standard -- not generic advice.

## Prerequisites

Complete the
[Get Career Guidance Grounded in the Standard](/docs/products/growth-areas/)
guide first. The steps below assume you have Guide installed, codegen complete,
and the service stack running.

You should also know your role coordinates (discipline, level, and track). If
you have not identified those yet, work through
[See What's Expected at Your Level](/docs/products/career-paths/) first.

## Start a Guide session

Launch Guide in interactive mode:

```sh
npx fit-guide
```

Guide opens a conversational session backed by your organization's engineering
standard data. You type questions at the prompt and Guide responds with answers
drawn from your skill definitions, behaviour expectations, and markers.

Lines starting with `>` in the examples below are prompts you type inside the
Guide session -- they are not shell commands.

## Ask about a specific skill gap

The most useful questions name a concrete skill and a direction. Start with the
area you want to understand:

```text
> What does practitioner-level code review look like in our standard?
```

Guide responds with the markers and expectations defined for that skill at the
requested proficiency level:

```text
At Practitioner level, Code Review involves three key shifts from Working:

- **Mentoring on review quality** — You help others improve their reviews, not
  just review code yourself. This means pairing on reviews, giving feedback on
  feedback, and raising the bar for the whole team.

- **Defining review standards** — You shape what reviews should cover for your
  area. This goes beyond style guides into design intent, cross-cutting
  concerns, and architectural alignment.

- **Cross-boundary awareness** — Reviews catch issues that span services or
  teams, not just local correctness.

The markers your standard defines for this level are:
  - Provides actionable feedback on design intent, not just style
  - Catches cross-cutting concerns during review
  - Mentors others on review quality
  - Defines review standards for the area
```

Every element in that answer comes from your capability YAML -- not from a
generic model of what "senior" means.

## Ask about behaviour shifts between levels

Behaviours change between levels just as skills do. Ask Guide about a specific
behaviour to see what the next level expects:

```text
> How is Think in Systems different at Role Modeling vs Practicing?
```

```text
The shift from Practicing to Role Modeling in Think in Systems is about
influence scope:

**Practicing** — You consistently apply systems thinking in your own work. You
trace effects across components, consider feedback loops, and design for the
system rather than the part.

**Role Modeling** — You shape how the team approaches problems systemically.
Others learn systems thinking by watching you work. You introduce frameworks,
ask questions that reframe local problems as system problems, and make the
team's default mode of reasoning more systemic.

The key difference: at Practicing you do it; at Role Modeling the team does it
because of you.
```

## Ask for the biggest shifts between levels

When you are not sure where to focus, ask Guide to identify the largest changes
between your current level and your target:

```text
> Which skills have the biggest jump from J060 to J070 in Software Engineering?
```

```text
Moving from Engineer (J060) to Senior Engineer (J070) in Software Engineering
involves 12 changes across skills and behaviours.

**Biggest skill jumps:**

- **Architecture Design** — Working to Practitioner. At Practitioner, you lead
  architecture for a product or platform area, defining module boundaries and
  integration patterns. The key shift is from designing within a given
  architecture to shaping the architecture itself.

- **Code Review** — Working to Practitioner. At Practitioner, you mentor others
  on review quality and define review standards for your area.

Focus on Architecture Design first — it represents the largest shift in scope
and autonomy.
```

## Ask how to build evidence for a marker

Once you know which markers are missing from your evidence record, ask Guide
how to demonstrate growth in that area:

```text
> How can I build evidence for "Leads architecture for a product or platform
> area"? I'm at working-level Architecture Design and need practitioner.
```

Guide suggests concrete activities drawn from your standard -- actions that
would produce artifacts your evidence record can capture:

```text
To build evidence for this marker, look for opportunities that produce
observable architecture work:

1. **Lead an RFC or design document** for a new product area or a significant
   migration. The document itself becomes evidence -- it should define module
   boundaries, integration patterns, and trade-offs.

2. **Own the architecture review** for your team's next major feature. Move
   from participating in reviews to running them -- set the agenda, define
   what reviewers should focus on, and document the outcome.

3. **Define service boundaries** for an upcoming decomposition. Write the
   boundary rationale as a design document that names responsibilities,
   contracts, and failure modes.

Each of these produces an artifact -- a design document, an RFC, a PR with
architectural rationale -- that evidences practitioner-level architecture work.
```

## Use piped input for quick lookups

When you want a single answer without entering an interactive session, pipe
your question directly:

```sh
echo "What markers define practitioner-level architecture design?" | npx fit-guide
```

Guide prints the answer and exits. This is useful for quick lookups during your
workday when you want to check a specific definition without starting a full
session.

## Verify

You have reached the outcome of this guide when:

- **You asked a specific question and got a standards-grounded answer.** The
  response referenced your organization's skill definitions, behaviour
  expectations, or markers -- not generic career advice.
- **You can name the skill or behaviour you are working on.** Guide pointed you
  to specific areas defined in your engineering standard, and you can describe
  what the next proficiency level expects in concrete terms.
- **You know how to get back here.** For the full workflow -- finding gaps,
  checking your evidence record, and tracking progress over time -- return to
  [Get Career Guidance Grounded in the Standard](/docs/products/growth-areas/).

## What's next

<div class="grid">

<!-- part:card:.. -->

</div>
