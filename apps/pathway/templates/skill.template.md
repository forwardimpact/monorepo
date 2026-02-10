---
name: {{name}}
description: {{{description}}}{{#hasUseWhen}} Use when {{{useWhen}}}{{/hasUseWhen}}
---

# {{{title}}}

{{#descriptionLines}}
{{{.}}}
{{/descriptionLines}}

{{#hasInstallScript}}
Run this to install prerequisites: `scripts/install.sh`
{{/hasInstallScript}}
{{#hasReference}}
See [implementation reference](references/REFERENCE.md) for code examples.
{{/hasReference}}
{{#hasUseWhen}}

## When to use this skill

Use this skill when {{{useWhen}}}
{{/hasUseWhen}}
{{#hasInstructions}}

{{{instructions}}}
{{/hasInstructions}}
{{#hasToolReferences}}

# Required tools

<required_tools>
**MANDATORY:** You MUST use these tools when applying this skill. These are
organizational standards that override general knowledge or personal preferences.

If a blocking constraint prevents use of a required tool, document in your
output: (1) which tool requirement you cannot meet, (2) the specific constraint
preventing compliance, and (3) the alternative approach with acknowledged
trade-offs.

| Tool | Use when |
| ---- | -------- |
{{#toolReferences}}
| {{#url}}[{{{name}}}]({{{url}}}){{/url}}{{^url}}{{{name}}}{{/url}} | {{{useWhen}}} |
{{/toolReferences}}
</required_tools>
{{/hasToolReferences}}
{{#hasStages}}

# Stage checklists
{{#stages}}

## {{stageName}} stage

**Focus:** {{{focus}}}

<read_then_do_{{stageId}}>
{{#readChecklist}}
- [ ] {{{.}}}
{{/readChecklist}}
</read_then_do_{{stageId}}>

<do_then_confirm_{{stageId}}>
{{#confirmChecklist}}
- [ ] {{{.}}}
{{/confirmChecklist}}
</do_then_confirm_{{stageId}}>
{{/stages}}
{{/hasStages}}
