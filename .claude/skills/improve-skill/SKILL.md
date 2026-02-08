---
name: improve-skill
description:
  "Review and improve skills in capability files for agent documents. Use when
  improving toolReferences and implementationReference sections of skills."
---

# Improve Skills for Agent Documents

Review and improve skills in a capability file to produce excellent agent skill
documents. Focus on `toolReferences` and `implementationReference` sections.

## When to Use

- Reviewing skills with `agent:` sections in capability files
- Improving tool references for better agent skill documents
- Restructuring implementation references for clarity
- Ensuring generated SKILL.md files are useful and complete

## Context

Skills with `agent:` sections generate SKILL.md files using
`apps/pathway/templates/skill.template.md`. The template:

- Renders `toolReferences` as a **Required Tools** table automatically
- Renders `implementationReference` as a **Reference** section

Because the template handles tool rendering separately, the
`implementationReference` must NOT duplicate tool information.

## Core Principles

### Outcome-Oriented Instructions

Skills exist to help someone achieve an outcome. The `implementationReference`
should provide **clear step-by-step instructions** that guide the reader from
start to finish—not a scattered collection of code snippets or best practices.

Ask: _"If I follow these instructions, will I achieve the skill's stated
purpose?"_

### Minimal Essential Tooling

Recommend only the **core tools required** to achieve the skill's outcome. A
focused set of 2-4 essential tools is more valuable than an exhaustive list.

Ask: _"Could someone complete this skill without this tool?"_ If yes, omit it.

## Process

1. **Identify the capability** to review (ask if not specified)
2. **Read the capability file** from
   `apps/schema/examples/capabilities/{id}.yaml`
3. **For each skill with an `agent:` section**, review and improve
4. **Study the updated skill** by running `npx fit-pathway skill <name> --agent`
5. **Iterate** until the skill document is clear, complete, and well-structured

### Tool References Review

Aim for **2-4 essential tools** per skill. Check that `toolReferences`:

- **Include only tools essential** to achieve the skill's core outcome
- Include the primary tool used in `implementationReference` code samples
- Prefer open source tools and libraries over commercial offerings (exceptions:
  ubiquitous platforms like AWS, GitHub, Azure, GCP are fine)
- Have accurate, concise `description` fields
- Have specific `useWhen` guidance relevant to this skill (not generic)
- Include `url` for official documentation where available
- Include `icon` field where appropriate using Simple Icons names (use `task`,
  `python`, `typescript` as generic fallbacks)

**Exclude:**

- Nice-to-have tools that aren't central to the implementation
- Alternative tools (pick one, don't list options)
- Generic utilities (linters, formatters) unless skill-specific
- Tools mentioned only in passing

### Implementation Reference Review

Check that `implementationReference`:

- **Follows a logical sequence** from setup to implementation to verification
- **Does NOT contain** tool tables or "Technology Stack" sections (duplicates
  `toolReferences`)
- **Provides step-by-step guidance** to achieve the skill's purpose
- **Shows complete, working code** (not fragments or pseudocode)
- **Connects the steps** so the reader understands the flow
- **Includes verification** so the reader knows when they've succeeded

### Common Problems to Fix

| Problem                 | Fix                                             |
| ----------------------- | ----------------------------------------------- |
| Too many tools          | Keep only 2-4 essential tools for core outcome  |
| Scattered snippets      | Restructure as numbered steps or logical flow   |
| Tool lists in reference | Remove (already in `toolReferences`)            |
| Code without context    | Add prose explaining what each section achieves |
| Missing setup           | Add installation/configuration steps            |
| No verification         | Add "you'll know it works when..." guidance     |
| Generic best practices  | Make specific to achieving the skill's outcome  |

### Good Structure Pattern

```markdown
## Setup

[Installation and configuration]

## Step 1: [First action]

[Explanation + code]

## Step 2: [Next action]

[Explanation + code]

## Verification

[How to confirm success]

## Common Pitfalls

[What to watch out for]
```

## Output

1. Summarize issues found
2. Apply fixes directly to the capability file
3. Run `npx fit-schema validate` to verify changes
