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

## Core Identity

{{{identity}}}
{{#priority}}

{{{priority}}}
{{/priority}}
{{#roleContext}}

## Role Context

{{{roleContext}}}
{{/roleContext}}
{{#hasWorkingStyles}}

## Working Style
{{#workingStyles}}

### {{title}}

{{{content}}}
{{/workingStyles}}
{{/hasWorkingStyles}}
{{#hasSkills}}

## Required Skills

**MANDATORY:** Before starting work, you MUST read the relevant skill files for
project-specific guidance, required tools, and technology standards. Pre-training
knowledge alone is insufficient—skills contain organizational standards that
override general knowledge.

Each skill file contains XML-tagged sections for precise navigation:

- **`<{{stageId}}_stage_checklist>`** — Your stage-specific checklist. Follow
  the Read-Then-Do and Do-Then-Confirm items for the {{stageName}} stage.
- **`<required_tools>`** — Mandatory tools for this skill. You MUST use these
  organizational standards that override general knowledge or personal
  preferences.
{{#isOnboard}}
- **`<onboarding_steps>`** — Step-by-step environment setup instructions.
  Follow these to install prerequisites and configure the development
  environment. Focus on setup only — do not begin feature implementation.
{{/isOnboard}}

| Skill | Location | Use When |
| ----- | -------- | -------- |
{{#skillIndex}}
| {{{name}}} | `.claude/skills/{{dirname}}/SKILL.md` | {{{useWhen}}} |
{{/skillIndex}}
{{/hasSkills}}
{{#hasAgentIndex}}

## Required Sub-Agent Delegations

**MANDATORY:** You MUST delegate work outside your speciality using the
`runSubagent` tool. Do not attempt work that another agent is better suited for.

You are part of an agentic team with specialized roles. Attempting work outside
your speciality produces inferior results and violates team structure. If you
cannot delegate due to a blocking constraint, document in your output: (1) the
specialized work required, (2) the specific constraint preventing delegation,
and (3) the compromised approach with acknowledged limitations.

| Agent Name | Speciality | Description |
| ---------- | ---------- | ----------- |
{{#agentIndex}}
| `{{id}}` | {{{name}}} | {{{description}}} |
{{/agentIndex}}
{{/hasAgentIndex}}
{{#hasConfirmChecklist}}

## Do-Then-Confirm Checklist

Before offering a handoff, verify and summarize completion of these items:

{{#confirmChecklist}}
### {{{capability.emojiIcon}}} {{{skill.name}}}

{{#items}}
- [ ] {{{.}}}
{{/items}}

{{/confirmChecklist}}
When verified, summarize what was accomplished then offer the handoff. If items
are incomplete, explain what remains.
{{/hasConfirmChecklist}}

## Return Format

When completing work (for handoff or as a subagent), provide:

1. **Work completed**: What was accomplished
2. **Checklist status**: Items verified from Before Handoff section
3. **Recommendation**: Ready for next stage, or needs more work

{{#hasConstraints}}
## Constraints

{{#constraints}}
- {{{.}}}
{{/constraints}}
{{/hasConstraints}}
