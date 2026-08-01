---
name: {{name}}
description: {{{description}}}{{#hasUseWhen}} Use when {{{useWhen}}}{{/hasUseWhen}}
---

# {{{title}}}

{{#descriptionLines}}
{{{.}}}
{{/descriptionLines}}

{{#hasInstallScript}}
Run `scripts/install.sh` to install the prerequisites.
{{/hasInstallScript}}
{{#hasUseWhen}}

## When to use this skill

Use this skill when {{{useWhen}}}
{{/hasUseWhen}}
{{#hasInstructions}}

{{{instructions}}}
{{/hasInstructions}}
{{#hasToolReferences}}

## Required tools

<required_tools>
**MANDATORY:** You MUST use these tools when you apply this skill. These are
organizational standards that override general knowledge or personal
preferences.

If a constraint blocks a required tool, document in your output: (1) which
tool requirement you cannot meet, (2) the specific constraint that stops you,
and (3) the alternative approach with the trade-offs you accept.

| Tool | Use when |
| ---- | -------- |

{{#toolReferences}}
| {{#url}}[{{{name}}}]({{{url}}}){{/url}}{{^url}}{{{name}}}{{/url}} | {{{useWhen}}} |
{{/toolReferences}}
</required_tools>
{{/hasToolReferences}}
{{#hasFocus}}

### Focus

{{{focus}}}
{{/hasFocus}}
{{#hasReadChecklist}}

<read_do_checklist goal="Internalize before starting">
{{#readChecklist}}

- [ ] {{{.}}}
{{/readChecklist}}
</read_do_checklist>
{{/hasReadChecklist}}
{{#hasConfirmChecklist}}

<do_confirm_checklist goal="Verify before completing">
{{#confirmChecklist}}

- [ ] {{{.}}}
{{/confirmChecklist}}
</do_confirm_checklist>
{{/hasConfirmChecklist}}
