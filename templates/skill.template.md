---

name: {{name}}
description: |
{{#descriptionLines}}  {{{.}}}
{{/descriptionLines}}

{{#useWhenLines.length}}  **Use When:** {{#useWhenLines}}{{{.}}}
{{/useWhenLines}}{{/useWhenLines.length}}---

# {{{title}}}

{{#useWhenLines.length}}
**Use This Skill When:** {{#useWhenLines}}{{{.}}}
{{/useWhenLines}}{{/useWhenLines.length}}

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
{{/stages}} {{#reference}}

## Reference

{{{reference}}} {{/reference}}
