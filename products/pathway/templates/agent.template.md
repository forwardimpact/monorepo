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

{{{stageDescription}}}

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
**{{title}}**

{{{content}}}

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
{{#hasStageTransitions}}

## Stage transitions
{{#stageTransitions}}

When your work is complete, the next stage is **{{targetStageName}}**.

{{{summaryInstruction}}}
{{#hasEntryCriteria}}

The {{targetStageName}} stage requires the following entry criteria:
{{#entryCriteria}}
- [ ] {{{.}}}
{{/entryCriteria}}

If critical items are missing, continue working in the current stage.
{{/hasEntryCriteria}}
{{/stageTransitions}}
{{/hasStageTransitions}}

{{#hasReturnFormat}}

## Return format

When completing work, provide:

{{#returnFormat}}
1. {{{.}}}
{{/returnFormat}}
{{/hasReturnFormat}}

{{#hasConstraints}}
## Constraints

{{#hasStageConstraints}}
{{#stageConstraints}}
- {{{.}}}
{{/stageConstraints}}
{{/hasStageConstraints}}
{{#hasDisciplineOrTrackConstraints}}

**General:**
{{#disciplineConstraints}}
- {{{.}}}
{{/disciplineConstraints}}
{{#trackConstraints}}
- {{{.}}}
{{/trackConstraints}}
{{/hasDisciplineOrTrackConstraints}}
{{/hasConstraints}}
