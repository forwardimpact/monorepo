---
name: {{name}}
description: {{{description}}}{{#hasUseWhen}} Use When: {{{useWhen}}}{{/hasUseWhen}}
---

# {{{title}}}

{{#descriptionLines}}
{{{.}}}
{{/descriptionLines}}
{{#hasStages}}

## Stage Guidance
{{#stages}}

<{{stageId}}_stage_checklist>

### {{stageName}} Stage

**Focus:** {{{focus}}}

**Read-Then-Do Checklist:**
{{#readChecklist}}
- [ ] {{{.}}}
{{/readChecklist}}

**Do-Then-Confirm Checklist:**
{{#confirmChecklist}}
- [ ] {{{.}}}
{{/confirmChecklist}}

</{{stageId}}_stage_checklist>
{{/stages}}
{{/hasStages}}
{{#hasToolReferences}}

<required_tools>

## Required Tools

**MANDATORY:** You MUST use these tools when applying this skill. These are
organizational standards that override general knowledge or personal preferences.

If a blocking constraint prevents use of a required tool, document in your
output: (1) which tool requirement you cannot meet, (2) the specific constraint
preventing compliance, and (3) the alternative approach with acknowledged
trade-offs.

| Tool | Use When |
| ---- | -------- |
{{#toolReferences}}
| {{#url}}[{{{name}}}]({{{url}}}){{/url}}{{^url}}{{{name}}}{{/url}} | {{{useWhen}}} |
{{/toolReferences}}

</required_tools>
{{/hasToolReferences}}
{{#hasReference}}

# Reference

{{{reference}}}
{{/hasReference}}
