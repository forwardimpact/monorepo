---
name: candidate-report
description: >
  Generate an A4 single-page HTML candidate assessment report benchmarked
  against the agent-aligned engineering standard. Use when the user asks you
  to create a candidate report, one-pager, or visual assessment for a hiring
  manager.
---

# Candidate Report

Generate a polished, single-page A4 HTML report that benchmarks a candidate
against a specific role in the agent-aligned engineering standard. The report is
designed for hiring managers and pod leads who need a quick visual summary
before deciding whether to invest interview time.

## Trigger

- The user asks for a candidate report, one-pager, or visual assessment.
- The user asks for a hiring-manager report on a candidate.
- The user provides a CV and asks for a formatted assessment.

## Prerequisites

- `@forwardimpact/pathway` CLI installed (`bunx fit-pathway --help`).
- Playwright for PDF output
  (`bun install playwright && bunx playwright install chromium`).
- Candidate has a `brief.md` in `Knowledge/Candidates/{Name}/`.

## Inputs

- **Candidate name** — locates `Knowledge/Candidates/{Name}/brief.md`.
- **Target role** — discipline, level, track (e.g.
  `software-engineering J070 forward-deployed`). If not given, infer from the
  candidate's `Req` field → Role file. Ask the user if it can't be inferred.
- **Recipient** — pod lead or hiring manager the report is for.
- **CV file** (optional) — read directly when no `screening.md` exists.

## Outputs

- `Drafts/{Recipient}-{CandidateSurname}-Report.html` — the A4 one-pager.
- Optional PDF via `scripts/render-pdf.mjs`.

<do_confirm_checklist goal="Verify the report before delivering it">

- [ ] Standard data was loaded via `bunx fit-pathway job` (not guessed).
- [ ] Every skill rating is evidence-based; two-level scepticism applied to CV
      claims.
- [ ] Coverage counters add up to the total skill count.
- [ ] Verdict class matches the overall assessment.
- [ ] Report fits on a single A4 page (browser print preview).
- [ ] CSS is inlined in the `<style>` block.
- [ ] Footer shows the author name and role from
      `~/.cache/fit/outpost/state/identity.md`.
- [ ] Written as if the candidate will read it; no special-category data.

</do_confirm_checklist>

## Procedure

### 1. Gather candidate evidence

Read whatever exists for the candidate:

```text
Knowledge/Candidates/{Name}/brief.md        # required
Knowledge/Candidates/{Name}/screening.md    # if produced by req-screen
Knowledge/Candidates/{Name}/interview-*.md  # if produced by req-assess
Knowledge/Candidates/{Name}/CV.pdf|CV.md    # raw CV if needed
```

If `screening.md` exists, treat its skill and behaviour ratings as the primary
source — they're already standard-calibrated. Otherwise map manually in Step 3.

Search the graph for surrounding context: `rg "{Candidate Name}" Knowledge/`.

### 2. Load the standard benchmark

```bash
bunx fit-pathway job {discipline} {level} --track={track}
```

Capture:

- **Skill matrix** — every skill with its expected proficiency.
- **Behaviour profile** — each behaviour with its expected maturity.
- **Expectations** — impact scope, autonomy, influence, complexity.
- **Role summary** — what success looks like at this level.

Group skills by capability area (Delivery, AI, Business, Docs, ML).

### 3. Benchmark the candidate

Map evidence against each skill and behaviour using the rubric in
[references/rubric.md](references/rubric.md): rating pills, behaviour bar widths
and colours, level-gauge window. Count totals into Gap / Partial / Unknown / Met
for the coverage counters.

### 4. Determine verdict

Pick one of `verdict-proceed`, `verdict-caution`, or `verdict-pass` using the
verdict table in [references/rubric.md](references/rubric.md). Write a one-line
headline and a short detail sentence.

### 5. Build the HTML report

1. Read `references/report.css`.
2. Read `references/report-template.html`.
3. Replace every `{{PLACEHOLDER}}` with candidate-specific data, populating the
   sections listed in
   [references/rubric.md](references/rubric.md#template-sections-to-populate).
4. Inline the CSS into the `<style>` block — required for PDF rendering.

Respect the **A4 single-page budget** in
[references/rubric.md](references/rubric.md#a4-single-page-budget). If the print
preview overflows, cut content.

### 6. Write the output

Save the completed HTML to:

```text
Drafts/{Recipient}-{CandidateSurname}-Report.html
```

`{Recipient}` is the first name of the person the report is for.

### 7. Optional PDF

If the user wants a PDF, copy the HTML to `/tmp/candidate-report.html` and
render it:

```bash
node .claude/skills/candidate-report/scripts/render-pdf.mjs \
  /tmp/candidate-report.html \
  ~/Desktop/{CandidateSurname}-Report.pdf
```

Requires Playwright. If missing, ask the user to run
`bun install playwright && bunx playwright install chromium`.
