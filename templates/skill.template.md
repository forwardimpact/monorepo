---
name: {{name}}
description: |
{{#descriptionLines}}  {{.}}
{{/descriptionLines}}---

# {{title}}

{{#applicability.length}}
## When to Use This Skill

{{#applicability}}
- {{.}}
{{/applicability}}

{{/applicability.length}}
{{{guidance}}}

{{#verificationCriteria.length}}
## Verification Criteria

{{#verificationCriteria}}
- [ ] {{.}}
{{/verificationCriteria}}
{{/verificationCriteria.length}}
