{{#frontmatter}}---
name: {{name}}
{{#description}}description: |
{{#lines}}  {{.}}
{{/lines}}{{/description}}{{#descriptionSingleLine}}description: {{descriptionSingleLine}}
{{/descriptionSingleLine}}---

{{/frontmatter}}{{{body}}}
