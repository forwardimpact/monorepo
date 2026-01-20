---
name: {{name}}
description: |
{{#descriptionLines}}  {{.}}
{{/descriptionLines}}---

# {{title}}

## Stage Guidance

{{#stages}}
### {{stageName}} Stage

**Focus:** {{focus}}

**Activities:**
{{#activities}}
- {{.}}
{{/activities}}

**Ready for {{nextStageName}} when:**
{{#ready}}
- [ ] {{.}}
{{/ready}}

{{/stages}}
{{#reference}}
## Reference

{{{reference}}}
{{/reference}}