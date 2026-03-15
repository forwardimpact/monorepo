---
name: synthesize-deck
description: Synthesize PowerPoint decks into engineer-friendly markdown briefs covering Jobs-To-Be-Done, dependencies, and synthetic data needs. Use when the user asks to break down, summarize, or make sense of a slide deck (.pptx) for engineering work.
compatibility: Node.js only — no external dependencies.
---

# Synthesize Deck

Turn messy PowerPoint specification decks into clear, actionable markdown briefs
that forward deployed engineers can actually build from. Strips out business
jargon and focuses on what matters: what needs to be built, what blocks
progress, and what data you need to start prototyping.

## Trigger

Run when the user asks to:

- Summarize, synthesize, or break down a `.pptx` deck
- Make sense of a specification or proposal deck for engineering
- Create an engineering brief from a slide deck
- Understand what a project deck is actually asking for

## Prerequisites

- Node.js 18+
- Input files must be `.pptx` format

## Inputs

- One or more `.pptx` file paths
- Optional: specific focus areas the engineer cares about

## Outputs

- One markdown file per deck (or one combined file for related decks) written to
  `knowledge/Projects/` with the naming pattern
  `{Project Name} - Engineering Brief.md`

---

## Workflow

### Step 1: Extract Text from PPTX

Use the extraction script to pull all slide text from the deck:

```bash
node .claude/skills/synthesize-deck/scripts/extract-pptx.mjs "$FILE_PATH"
```

For multiple decks, pass all files at once:

```bash
node .claude/skills/synthesize-deck/scripts/extract-pptx.mjs deck1.pptx deck2.pptx
```

To save the extracted text for analysis:

```bash
node .claude/skills/synthesize-deck/scripts/extract-pptx.mjs "$FILE_PATH" -o /tmp/deck_extract.txt
```

Read the full extracted text before proceeding.

### Step 2: Identify the Core Problem

Read through all slides and answer:

- What process or workflow exists today?
- What is broken, slow, or painful about it?
- Who suffers from these problems (the actual humans doing the work)?

Write this up in plain language. Avoid repeating the deck's marketing framing.
Describe the problem like you're explaining it to a teammate over coffee.

### Step 3: Extract Jobs-To-Be-Done

JTBD captures what users actually need to accomplish. For each distinct user
role identified in the deck, extract jobs using this format:

```
When [situation], I need to [action], so that [outcome].
```

**Rules for good JTBDs:**

- Focus on the user's goal, not the proposed solution
- Use concrete, specific language (not "leverage AI to optimize")
- One job per statement — don't combine multiple needs
- Include the "so that" — the outcome matters for prioritization
- Group by user role/persona

**Common traps to avoid:**

- Don't just restate the deck's feature list as jobs
- Don't use the deck's jargon ("orchestration engine", "intelligence hub")
- A job should make sense even if you threw away the proposed solution

### Step 4: Map Dependencies

Engineers need to know what blocks them before they can build. Extract three
categories:

#### 4a. Data Dependencies

For each data source mentioned or implied:

| Data        | Where It Lives             | Format                             | Access                          | Blocker?       |
| ----------- | -------------------------- | ---------------------------------- | ------------------------------- | -------------- |
| _What data_ | _System/team that owns it_ | _Structured/unstructured/API/file_ | _Do we have it? Can we get it?_ | _Yes/No + why_ |

Flag any data that is:

- Mentioned but doesn't seem to exist yet
- Locked behind systems the team may not have access to
- Unstructured and would need significant preprocessing
- Subject to compliance/privacy constraints

#### 4b. System Dependencies

List every external system, API, or platform the solution needs to integrate
with. For each, note:

- What the integration does
- Whether it's read-only or read-write
- Whether an API exists or if it's manual/scraping
- Whether access has been confirmed

#### 4c. People Dependencies

List approvals, reviews, or co-creation required from specific roles or teams
before engineering work can proceed. Flag anything that looks like a long
lead-time dependency (legal review, compliance sign-off, vendor contracts).

### Step 5: Define Synthetic Data Needs

Engineers need data to prototype before real data pipelines exist. For each core
feature or use case, specify:

**What to generate:**

- The data entity (e.g., "copay claims", "enrollment forms", "contract
  documents")
- Key fields and their types
- Realistic value ranges and distributions
- Edge cases that matter (e.g., incomplete forms, anomalous claims)
- Volume needed for meaningful testing

**What to simulate:**

- Workflows and state transitions (e.g., case moving from intake to BV to PA)
- Time-series patterns (e.g., weekly claims with seasonal variation)
- Multi-actor interactions (e.g., patient submits, specialist reviews, payer
  responds)
- Error conditions and failure modes

**Format guidance:**

- Prefer CSV/JSON for structured data
- Include realistic PII-shaped data (fake names, addresses, IDs) — never real
  PII
- Include both happy-path and adversarial examples
- Consider what data would be needed to train/evaluate ML models

### Step 6: Summarize the Proposed Solution

Describe what the deck is proposing to build, but translate it into engineering
terms:

- What are the core system components?
- What does each component actually do (in plain terms)?
- How do they connect to each other?
- What is the data flow end-to-end?
- What AI/ML capabilities are needed and what are they actually doing?

Avoid just listing the deck's branded feature names. Translate:

- "Intelligent Intake Hub" → "OCR + NLP pipeline that extracts structured fields
  from scanned enrollment forms"
- "Case Intelligence Hub" → "Dashboard pulling case status from CRM + ML risk
  score for each active case"
- "Copay Guardian" → "Anomaly detection model on weekly claims data that flags
  unusual patterns"

### Step 7: Identify What's Missing

Call out gaps an engineer would notice:

- Features described without clear data sources
- AI capabilities mentioned without training data strategy
- Integrations assumed but not detailed
- User workflows that skip important error/edge cases
- Metrics promised without measurement infrastructure
- Timeline vs. scope mismatches

### Step 8: Write the Brief

Assemble into a single markdown document with this structure:

```markdown
---
project: {Project Name}
source: {list of deck filenames}
date_synthesized: {today's date}
status: engineering-brief
---

# {Project Name} — Engineering Brief

> One-paragraph plain-English summary of what this project is and why it exists.

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

### Step 9: Save and Report

1. Write the brief to `knowledge/Projects/{Project Name} - Engineering Brief.md`
2. Tell the user where the file is and give a 3-sentence summary of the project

## Writing Style

- **Plain language.** Write like you're briefing a smart engineer who has zero
  context on this project. No "synergize", no "orchestrate", no "leverage".
- **Concrete over abstract.** "Parse PDF enrollment forms into structured JSON"
  beats "Intelligent document processing capability".
- **Honest about uncertainty.** If the deck is vague about something important,
  say so. Don't fill gaps with assumptions.
- **Opinionated where helpful.** If a dependency looks like it will block the
  team for weeks, flag it clearly. If a timeline looks unrealistic given the
  scope, say that.
- **Short sentences.** Engineers scan, they don't read essays.

## Constraints

- Never invent requirements not present in the source deck
- Always flag when you're interpreting vs. directly extracting
- Keep the brief under 2000 lines — this is a summary, not a transcription
- Use the knowledge base for additional context about mentioned people, orgs, or
  projects
- If multiple decks describe related projects, create one combined brief with
  clear sections per project and a shared dependencies section
