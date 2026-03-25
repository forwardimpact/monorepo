---
{{#name}}
name: {{name}}
{{/name}}
description: {{{description}}}
model: sonnet
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

### {{title}}

{{{content}}}
{{/workingStyles}}
{{/hasWorkingStyles}}
{{#hasSkills}}

## Required skills

Skills listed in the `skills:` frontmatter are automatically loaded into your
context. Each skill contains stage-specific checklists:

- `<read_then_do_{{stageId}}>` — Read-Then-Do checklist for the
  {{stageName}} stage. Read and understand these items BEFORE starting work.
  These are prerequisites and context you must absorb first.
- `<do_then_confirm_{{stageId}}>` — Do-Then-Confirm checklist for the
  {{stageName}} stage. Complete your work, then verify each item. These are
  quality gates to check AFTER implementation.
- `<required_tools>` — Mandatory tools for this skill. You MUST use these
  organizational standards that override general knowledge or personal
  preferences.
{{#isOnboard}}
- `scripts/install.sh` — Self-contained install script for environment setup.
  **Step 1 of onboarding — run FIRST:** Execute
  `bash .claude/skills/<skill-name>/scripts/install.sh` for each skill before
  doing any manual setup. Only install manually if the script is missing or
  fails. Do not skip this step even if you can install the same tools manually.
- `references/REFERENCE.md` — Detailed code examples and reference material.
  Consult this for implementation patterns, common pitfalls, and verification
  steps.
{{/isOnboard}}

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

## Return format

When completing work, provide:

1. **Work completed**: What was accomplished
2. **Checklist status**: Items verified from skill Do-Then-Confirm checklists
3. **Recommendation**: Ready for next stage, or needs more work

{{#hasConstraints}}
## Constraints

{{#constraints}}
- {{{.}}}
{{/constraints}}
{{/hasConstraints}}
