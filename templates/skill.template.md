---

name: {{name}}
description: |
{{#descriptionLines}}  {{{.}}}
{{/descriptionLines}}{{#useWhenLines.length}}  Use when: {{#useWhenLines}}{{{.}}}
{{/useWhenLines}}{{/useWhenLines.length}}---

# {{{title}}}

## Stage Guidance

{{#stages}}

### {{stageName}} Stage

**Focus:** {{{focus}}}

**Activities:** {{#activities}}

- {{{.}}} {{/activities}}

**Ready for {{nextStageName}} when:** {{#ready}}

- [ ] {{{.}}} {{/ready}}

{{/stages}} {{#reference}}

## Reference

{{{reference}}} {{/reference}}
