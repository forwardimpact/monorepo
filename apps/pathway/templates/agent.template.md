---
{{#name}}
name: {{name}}
{{/name}}
description: {{{description}}}
{{#infer}}
infer: {{infer}}
{{/infer}}
{{#handoffs.length}}
handoffs:
{{#handoffs}}
  - label: {{label}}
{{#agent}}
    agent: {{agent}}
{{/agent}}
    prompt: "{{{prompt}}}"
{{#send}}
    send: {{send}}
{{/send}}
{{/handoffs}}
{{/handoffs.length}}
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

**MANDATORY:** Before starting work, you MUST read ALL listed skill files below,
not just the most relevant one. Every skill contributes project-specific
guidance, required tools, and technology standards. Pre-training knowledge alone
is insufficient—skills contain organizational standards that override general
knowledge.

**FIRST ACTION:** Read every skill file listed below. For each skill, note
its `<read_then_do_{{stageId}}>` and `<do_then_confirm_{{stageId}}>` checklist
items. List all checklist items from all skills before beginning any work. Do
not start implementation until every skill has been read and its checklists
acknowledged.

Each skill contains marked-up sections and references for precise navigation:

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

| Skill | Location | Use when |
| ----- | -------- | -------- |
{{#skillIndex}}
| {{{name}}} | `.claude/skills/{{dirname}}/SKILL.md` | {{{useWhen}}} |
{{/skillIndex}}
{{/hasSkills}}
{{#hasAgentIndex}}

## Required subagent delegations

**MANDATORY:** You MUST delegate work outside your speciality using the
`runSubagent` tool. Do not attempt work that another agent is better suited for.

You are part of an agentic team with specialized roles. Attempting work outside
your speciality produces inferior results and violates team structure. If you
cannot delegate due to a blocking constraint, document in your output: (1) the
specialized work required, (2) the specific constraint preventing delegation,
and (3) the compromised approach with acknowledged limitations.

| Agent name | Speciality | Description |
| ---------- | ---------- | ----------- |
{{#agentIndex}}
| `{{id}}` | {{{name}}} | {{{description}}} |
{{/agentIndex}}
{{/hasAgentIndex}}

## Return format

When completing work (for handoff or as a subagent), provide:

1. **Work completed**: What was accomplished
2. **Checklist status**: Items verified from skill Do-Then-Confirm checklists
3. **Recommendation**: Ready for next stage, or needs more work

{{#hasConstraints}}
## Constraints

{{#constraints}}
- {{{.}}}
{{/constraints}}
{{/hasConstraints}}
