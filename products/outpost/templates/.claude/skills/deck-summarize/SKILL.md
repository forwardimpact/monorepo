---
name: deck-summarize
description: Synthesize PowerPoint decks into engineer-friendly markdown briefs covering Jobs-To-Be-Done, dependencies, and synthetic data needs. Use when the user asks to break down, summarize, or make sense of a slide deck (.pptx) for engineering work.
compatibility: Node.js only — no external dependencies.
---

# Synthesize Deck

Turn messy PowerPoint specification decks into clear, actionable markdown briefs
that forward deployed engineers can build from. Strip business jargon and focus
on what matters: what needs to be built, what blocks progress, what data is
needed to start prototyping.

## Trigger

The user asks to summarize, synthesize, or break down a `.pptx` deck; make sense
of a specification or proposal deck for engineering; create an engineering brief
from a slide deck; or understand what a project deck is actually asking for.

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

- [ ] No invented requirements — every claim traces to the deck.
- [ ] Plain language; no marketing jargon (no "synergize", "orchestrate",
      "leverage", "intelligent \_\_\_ hub").
- [ ] JTBDs describe the user's goal, not the proposed solution; one job per
      statement; each includes the "so that".
- [ ] Data dependencies table flags blockers (missing, locked, compliance).
- [ ] Synthetic data needs name fields, ranges, edge cases, and volume.
- [ ] Gaps and open questions list what an engineer would notice missing.
- [ ] Brief is under 2,000 lines — a summary, not a transcription.
- [ ] Knowledge base looked up for mentioned people, orgs, and projects.

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

Read all extracted text before continuing.

### 2. Identify the core problem

Plain-language answers to: what process exists today; what's broken, slow, or
painful; who suffers. Don't restate the deck's framing.

### 3. Extract Jobs-To-Be-Done

Format: `When [situation], I need to [action], so that [outcome].`

Group by user role/persona. One job per statement. Use the user's goal, not the
proposed solution. A job should still make sense if you discard the deck's
solution. Don't restate the deck's feature list as jobs and don't reuse its
jargon.

### 4. Map dependencies

**4a. Data** — fill the table in
[references/brief-template.md](references/brief-template.md#data-dependencies-table).
Flag blockers (missing, locked, unstructured, compliance).

**4b. Systems & integrations** — every external system/API/platform: what the
integration does, read-only vs read-write, API vs manual/scraping, access
confirmed?

**4c. People & approvals** — approvals, reviews, or co-creation needed before
engineering can proceed. Flag long lead-time items (legal, compliance, vendor
contracts).

### 5. Define synthetic-data needs

For each core feature/use case:

- **Generate:** entity, key fields and types, realistic value ranges and
  distributions, edge cases that matter, volume for meaningful testing.
- **Simulate:** workflows and state transitions, time-series patterns,
  multi-actor interactions, error/failure modes.
- **Format:** prefer CSV/JSON; PII-shaped fake data only — never real PII;
  include happy-path _and_ adversarial examples; consider ML training/eval data.

### 6. Translate the proposed solution

Describe the build in engineering terms: components, what each does in plain
terms, how they connect, end-to-end data flow, AI/ML capabilities and what
they're actually doing. Translate branded names — e.g. "Intelligent Intake Hub"
→ "OCR + NLP pipeline that extracts structured fields from scanned enrollment
forms"; "Copay Guardian" → "Anomaly detection on weekly claims data".

### 7. Identify what's missing

Call out: features without clear data sources; AI capabilities without a
training-data strategy; assumed integrations; user workflows that skip edge
cases; metrics promised without measurement infrastructure; timeline–scope
mismatches.

### 8. Assemble the brief

Use the structure in
[references/brief-template.md](references/brief-template.md). Save to
`Knowledge/Projects/{Project Name} - Engineering Brief.md`. For multiple related
decks, write one combined brief with shared dependencies.

### 9. Save and report

Tell the user the file path and give a 3-sentence project summary.

## Writing style

Plain language, concrete over abstract, honest about uncertainty, opinionated
when helpful (flag dependency or timeline risks), short sentences. Engineers
scan, they don't read essays.
