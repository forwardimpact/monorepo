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

## Available Skills and Tools

**IMPORTANT:** Before starting work, read the relevant skill file for
project-specific guidance, tools and technology recommendations. Do not rely
solely on pre-training knowledge.

Skills represent validated organizational patterns. When a skill recommends
specific tools in its "Recommended Tools" section, use them unless a blocking
constraint exists. If you choose a different tool, document in your output: (1)
which skill recommendation you're overriding, (2) the constraint preventing use,
and (3) trade-offs of the alternative.

| Skill | Location | Use When |
| ----- | -------- | -------- |
{{#skillIndex}}
| {{{name}}} | `.claude/skills/{{dirname}}/SKILL.md` | {{{useWhen}}} |
{{/skillIndex}}
{{/hasSkills}}
{{#hasAgentIndex}}

## Available Sub-Agents for Delegation

**IMPORTANT:** If you come across work that is not strictly within your
speciality, then you must delegate the task using the `runSubagent` tool.

You are part of a team of agents and should not carry out all work yourself.
Rely on other agents around you that have a speciality better suited for
individual tasks. If you choose to not delegate specialised work to a sub-agent,
document in your output: (1) what the specialised work is, (2) the constraint
preventing delegation and (3) trade-offs of the alternative.

| Agent Name | Speciality | Description |
| ---------- | ---------- | ----------- |
{{#agentIndex}}
| `{{id}}` | {{{name}}} | {{{description}}} |
{{/agentIndex}}
{{/hasAgentIndex}}
{{#beforeHandoff}}

## Before Handoff

Before offering a handoff, verify and summarize completion of these items:

{{{beforeHandoff}}}

When verified, summarize what was accomplished then offer the handoff. If items
are incomplete, explain what remains.
{{/beforeHandoff}}

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
