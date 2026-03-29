---
title: "Finding Your Bearing"
description: "Use Guide to navigate your engineering framework — onboarding, growth areas, and contextual help."
---

# Finding Your Bearing

Guide is an AI agent that understands your organization's engineering framework
— skills, levels, behaviours, disciplines, tracks, and career progression — and
reasons about them in context. Instead of reading through YAML files and
documentation, you ask Guide questions in plain language and get answers
grounded in your team's actual definitions.

## What Guide Does

### Onboarding

New to the team? Guide helps you orient quickly. It explains your role's
expectations, what skills matter most at your level, and how your discipline is
structured. Instead of piecing together information from multiple documents, you
get a coherent picture of what is expected from day one.

### Career Advice

Guide identifies growth areas based on gap analysis between your current level
and your target. It reads the skill and behaviour expectations for both levels
and explains what changes, what stays the same, and where the biggest jumps are.
The advice is specific to your discipline and track, not generic career
guidance.

### Skill Assessment

When you want to understand how your work maps to your framework, Guide can
interpret engineering artifacts — pull requests, design documents, code reviews
— against the markers defined for each skill. It explains which markers your
work demonstrates and at what proficiency level.

### Contextual Help

Working on a task and wondering what your framework says about it? Guide
references the right skills and behaviours for your level and discipline. If you
are doing a code review, it can tell you what your framework expects at your
level for that activity. If you are writing a design document, it surfaces the
relevant system design markers.

### Problem-Solving

Engineering decisions benefit from team standards. Guide knows your framework's
expectations around quality, testing, architecture, and collaboration, and can
inform your decisions with that context.

## Example Questions

Guide responds to natural language questions about your framework:

- **"What should I focus on to reach the next level?"** — Guide compares your
  current level's expectations with the next level and highlights the skills and
  behaviours that change.
- **"How does our team approach code review?"** — Guide finds the relevant
  skills and markers for code review in your framework and explains the
  expectations at your level.
- **"I'm new — where do I start?"** — Guide walks you through your discipline's
  structure, your role's core skills, and the behaviours the team values.
- **"What does 'working' proficiency in system design look like?"** — Guide
  reads the markers for that skill at that level and explains them with context.
- **"I wrote this design doc — what skill markers does it demonstrate?"** —
  Guide interprets the artifact against your framework's skill markers and
  explains what it sees.

## How Guide Uses Skill Markers

Guide reads the markers defined in your capability YAML files — the same markers
visible in Pathway's job definitions. When it interprets an artifact or answers
a question, it references specific markers at specific proficiency levels, so
you can see exactly where its answer comes from.

For example, if your framework defines these markers for system design at
"working" proficiency:

- _Designs services with clear API boundaries_
- _Documents trade-offs in design decisions_

Guide will reference those specific markers when assessing your design document,
rather than applying generic criteria.

This grounding in your framework means Guide's answers are consistent with what
your team has defined as good engineering. Two people asking the same question
get the same foundational answer, because the source of truth is shared.

## Getting Started

Guide works with your Map data out of the box. If you have authored a framework
(skills, levels, behaviours defined in YAML) and validated it with Map, Guide
can reason about it immediately. There is no separate setup or configuration —
Guide reads from the same data that Pathway, Landmark, and Summit use.

## Related Documentation

- [Data Model Reference](/docs/reference/model/) — How skills, levels, and
  behaviours are structured
- [Authoring Frameworks Guide](/docs/guides/authoring-frameworks/) — How to
  define the framework that Guide reasons about
