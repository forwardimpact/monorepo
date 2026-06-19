# Engineering Brief Template

Reference template for `deck-summarize` Step 8. Save the assembled brief to
`Knowledge/Projects/{Project Name} - Engineering Brief.md`.

```markdown
---
project: {Project Name}
source: {list of deck filenames}
date_synthesized: {today's date}
status: engineering-brief
---

# {Project Name} — Engineering Brief

> One-paragraph plain-English summary of what this project is and why it
> exists.

## The Problem

{Step 2 output — what's broken, who it affects, why it matters}

## Jobs-To-Be-Done

### {Persona 1}
- When [situation], I need to [action], so that [outcome].
- ...

### {Persona 2}
- ...

## What They Want to Build

{Step 6 output — solution in engineering terms, components, data flow}

### System Architecture (Simplified)

{Text-based diagram or description of how components connect}

### AI/ML Components

{What models/capabilities are needed, what they do, what data they need}

## Dependencies

### Data
{Step 4a table}

### Systems & Integrations
{Step 4b list}

### People & Approvals
{Step 4c list}

## Synthetic Data for Prototyping

### {Feature/Use Case 1}
{Step 5 output}

### {Feature/Use Case 2}
{Step 5 output}

## Gaps & Open Questions

{Step 7 output as a numbered list}

## Phasing

{Timeline and wave structure from the deck, with engineering commentary on
what's realistic and what depends on what}

## Key Metrics

{What success looks like, translated into measurable engineering terms}
```

## Data dependencies table

For Step 4a, fill in this table. Flag any data that doesn't seem to exist yet,
is locked behind inaccessible systems, is unstructured and would need heavy
preprocessing, or carries compliance/privacy constraints.

| Data        | Where It Lives             | Format                             | Access                          | Blocker?       |
| ----------- | -------------------------- | ---------------------------------- | ------------------------------- | -------------- |
| _What data_ | _System/team that owns it_ | _Structured/unstructured/API/file_ | _Do we have it? Can we get it?_ | _Yes/No + why_ |
