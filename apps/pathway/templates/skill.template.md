---
name: {{name}}
description: |
  {{#descriptionLines}}{{{.}}} {{/descriptionLines}}
{{#hasUseWhen}}
  Use When: {{#useWhenLines}}{{{.}}} {{/useWhenLines}}
{{/hasUseWhen}}
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

**Activities:**
{{#activities}}
- {{{.}}}
{{/activities}}

**Ready for {{nextStageName}} when:**
{{#ready}}
- [ ] {{{.}}}
{{/ready}}
{{/stages}}
{{/hasStages}}
{{#hasToolReferences}}

# Required Tools

Use these tools when applying this skill. Alternative tools require documented
justification with acknowledged trade-offs.

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
