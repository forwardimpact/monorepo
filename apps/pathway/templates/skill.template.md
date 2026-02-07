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

### {{stageName}} Stage

**Focus:** {{{focus}}}

**Read Checklist:**
{{#readChecklist}}
- {{{.}}}
{{/readChecklist}}

**Confirm Checklist (verify before {{nextStageName}}):**
{{#confirmChecklist}}
- [ ] {{{.}}}
{{/confirmChecklist}}
{{/stages}}
{{/hasStages}}
{{#hasToolReferences}}

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
{{/hasToolReferences}}
{{#hasReference}}

# Reference

{{{reference}}}
{{/hasReference}}
