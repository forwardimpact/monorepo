---
name: {{name}}
description: |
{{#descriptionLines}}
  {{{.}}}
{{/descriptionLines}}
{{#useWhenLines.length}}
  **Use When:** {{#useWhenLines}}{{{.}}}{{/useWhenLines}}
{{/useWhenLines.length}}
---

# {{{title}}}

{{#useWhenLines.length}}
**Use This Skill When:** {{#useWhenLines}}{{{.}}}{{/useWhenLines}}
{{/useWhenLines.length}}

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
{{#toolReferences.length}}

## Recommended Tools

| Tool | Use When |
|------|----------|
{{#toolReferences}}
| {{#url}}[{{{name}}}]({{{url}}}){{/url}}{{^url}}{{{name}}}{{/url}} | {{{useWhen}}} |
{{/toolReferences}}
{{/toolReferences.length}}
{{#reference}}

## Reference

{{{reference}}}
{{/reference}}
