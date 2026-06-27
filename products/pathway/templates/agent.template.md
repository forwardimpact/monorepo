---
{{#name}}
name: {{name}}
{{/name}}
description: {{{description}}}
model: opus
{{#skills.length}}
skills:
{{#skills}}
  - {{.}}
{{/skills}}
{{/skills.length}}
---

# {{title}}

## Core identity

{{{identity}}}
{{#priority}}

{{{priority}}}
{{/priority}}
{{#roleContext}}

## Role context

{{{roleContext}}}
{{/roleContext}}
{{#hasWorkingStyles}}

## Working style

{{#workingStyles}}

- **{{title}}** — {{{content}}}
{{/workingStyles}}
{{/hasWorkingStyles}}
{{#hasSkills}}

## Required skills

| Skill | Use when |
| ----- | -------- |

{{#skillIndex}}
| {{{name}}} | {{{useWhen}}} |
{{/skillIndex}}
{{/hasSkills}}

{{#hasConstraints}}

## Constraints

{{#disciplineConstraints}}

- {{{.}}}
{{/disciplineConstraints}}
{{#trackConstraints}}
- {{{.}}}
{{/trackConstraints}}
{{/hasConstraints}}
