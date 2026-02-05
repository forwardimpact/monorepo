---
name: {{name}}
description: |
{{#descriptionLines}}
  {{{.}}}
{{/descriptionLines}}
{{#hasUseWhen}}
  **Use When:** {{#useWhenLines}}{{{.}}}{{/useWhenLines}}
{{/hasUseWhen}}
---

# {{{title}}}
{{#hasUseWhen}}

**Use This Skill When:**
{{#useWhenLines}}{{{.}}}{{/useWhenLines}}
{{/hasUseWhen}}
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

# Recommended Tools

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
