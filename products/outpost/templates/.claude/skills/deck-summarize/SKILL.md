---
name: deck-summarize
description: Synthesize PowerPoint decks into engineer-friendly markdown briefs. Each brief covers Jobs-To-Be-Done, dependencies, and synthetic data needs. Use when the user asks to break down, summarize, or make sense of a slide deck (.pptx) for engineering work.
compatibility: Node.js only — no external dependencies.
---

# Synthesize Deck

Turn messy PowerPoint specification decks into clear, actionable markdown briefs
that forward deployed engineers can build from. Strip business jargon. Focus on
what matters: what the team must build, what blocks progress, and what data you
need to start a prototype.

## Trigger

Run when the user asks to summarize, synthesize, or break down a `.pptx` deck.
Run when the user wants to make sense of a specification or proposal deck for
engineering. Run when the user asks for an engineering brief from a slide deck.
Run when the user wants to understand what a project deck really asks for.

## Prerequisites

- Node.js 18+.
- Input files must be `.pptx`.

## Inputs

- One or more `.pptx` file paths.
- Optional: focus areas the engineer cares about.

## Outputs

- One markdown file per deck (or one combined file for related decks) written to
  `Knowledge/Projects/{Project Name} - Engineering Brief.md`.

<do_confirm_checklist goal="Verify the brief is engineer-actionable before
delivering">

- [ ] No invented requirements. Every claim traces to the deck.
- [ ] Plain language, with no marketing jargon (no "synergize", "orchestrate",
      "leverage", "intelligent \_\_\_ hub").
- [ ] JTBDs describe the user's goal. They do not describe the proposed
      solution. One job per statement. Each job includes the "so that".
- [ ] The data-dependencies table flags blockers (missing, locked, compliance).
- [ ] Synthetic data needs name fields, ranges, edge cases, and volume.
- [ ] Gaps and open questions list what an engineer would notice missing.
- [ ] The brief is under 2,000 lines. It summarizes the deck. It does not
      transcribe it.
- [ ] You looked up mentioned people, orgs, and projects in the knowledge base.

</do_confirm_checklist>

Output template and the data dependencies table:
[references/brief-template.md](references/brief-template.md).

## Procedure

### 1. Extract text

```bash
node .claude/skills/deck-summarize/scripts/extract-pptx.mjs "$FILE_PATH"
```

For multiple decks, pass all files at once. To save the extracted text:

```bash
node .claude/skills/deck-summarize/scripts/extract-pptx.mjs "$FILE_PATH" -o /tmp/deck_extract.txt
```

Read all extracted text before you continue.

### 2. Identify the core problem

Give plain-language answers. Name the process that exists today. Name what is
broken, slow, or painful. Name who suffers. Don't restate how the deck frames
the problem.

### 3. Extract Jobs-To-Be-Done

Format: `When [situation], I need to [action], so that [outcome].`

Group by user role/persona. One job per statement. Use the user's goal. Do not
use the proposed solution. A job should still make sense if you discard the
deck's solution. Don't restate the deck's feature list as jobs. Don't reuse its
jargon.

### 4. Map dependencies

**4a. Data** — fill the table in
[references/brief-template.md](references/brief-template.md#data-dependencies-table).
Flag blockers (missing, locked, unstructured, compliance).

**4b. Systems & integrations** — list every external system, API, and platform.
For each one, say what the integration does. Say whether it is read-only or
read-write. Say whether access runs through an API or through manual work or
scraping. Say whether someone confirmed access.

**4c. People & approvals** — list the approvals, reviews, or co-creation that
must happen before engineering can proceed. Flag long lead-time items (legal,
compliance, vendor contracts).

### 5. Define synthetic-data needs

For each core feature/use case:

- **Generate:** entity, key fields and types, realistic value ranges and
  distributions, edge cases that matter, volume for a meaningful test.
- **Simulate:** workflows and state transitions, time-series patterns,
  multi-actor interactions, error/failure modes.
- **Format:** prefer CSV/JSON. Use PII-shaped fake data only. Never use real
  PII. Include happy-path _and_ adversarial examples. Consider ML training and
  eval data.

### 6. Translate the proposed solution

Describe the build in engineering terms. Cover the components and what each does
in plain terms. Cover how they connect and the end-to-end data flow. Cover the
AI/ML capabilities and what they actually do. Translate branded names. For
example, "Intelligent Intake Hub" →
"OCR + NLP pipeline that extracts structured fields from scanned enrollment
forms". "Copay Guardian" → "Anomaly detection on weekly claims data".

### 7. Identify what's missing

Call out features without clear data sources. Call out AI capabilities without a
training-data strategy. Call out assumed integrations. Call out user workflows
that skip edge cases. Call out metrics promised without measurement
infrastructure. Call out timeline–scope mismatches.

### 8. Assemble the brief

Use the structure in
[references/brief-template.md](references/brief-template.md). Save to
`Knowledge/Projects/{Project Name} - Engineering Brief.md`. For multiple related
decks, write one combined brief with shared dependencies.

### 9. Save and report

Tell the user the file path. Give a 3-sentence project summary.

## Style

Use plain language. Choose the concrete over the abstract. Be honest about
uncertainty. Be opinionated when it helps, and flag dependency or timeline
risks. Keep sentences short. Engineers scan. They don't read essays.
