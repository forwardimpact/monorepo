---
{{#name}}name: {{name}}
{{/name}}description: {{{description}}}
{{#tools}}tools: {{{tools}}}
{{/tools}}{{#infer}}infer: {{infer}}
{{/infer}}{{#handoffs.length}}handoffs:
{{#handoffs}}  - label: {{label}}
{{#agent}}    agent: {{agent}}
{{/agent}}    prompt: {{{prompt}}}
{{#send}}    send: {{send}}
{{/send}}{{/handoffs}}{{/handoffs.length}}---

# {{title}}

{{{stageDescription}}}

## Core Identity

{{{identity}}}

{{#priority}}
{{{priority}}}

{{/priority}}
{{#capabilities.length}}
Your primary capabilities:
{{#capabilities}}
- {{{.}}}
{{/capabilities}}

{{/capabilities.length}}
{{#beforeMakingChanges.length}}
Before making changes:
{{#beforeMakingChanges}}
{{index}}. {{{text}}}
{{/beforeMakingChanges}}

{{/beforeMakingChanges.length}}
{{#delegation}}
## Delegation

{{{delegation}}}

{{/delegation}}
## Operational Context

{{{operationalContext}}}

{{{workingStyle}}}
{{#beforeHandoff}}

## Before Handoff

Before offering a handoff, verify and summarize completion of these items:

{{{beforeHandoff}}}

When verified, summarize what was accomplished then offer the handoff.
If items are incomplete, explain what remains.

{{/beforeHandoff}}
## Return Format

When completing work (for handoff or as a subagent), provide:

1. **Work completed**: What was accomplished
2. **Checklist status**: Items verified from Before Handoff section
3. **Recommendation**: Ready for next stage, or needs more work

{{#constraints.length}}
## Constraints

{{#constraints}}
- {{{.}}}
{{/constraints}}
{{/constraints.length}}
