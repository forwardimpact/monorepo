---
name: req-workday
description: >
  Import candidates from a Workday requisition export (.xlsx) into
  Knowledge/Candidates/. Parses requisition metadata and candidate data,
  creates candidate briefs and CV.md files from resume text, and integrates
  with the existing req-track pipeline. Use when the user provides a
  Workday export file or asks to import candidates from an XLSX requisition
  export.
---

# Workday Requisition Import

Import candidates from a Workday requisition export (`.xlsx`) into
`Knowledge/Candidates/`. Extract requisition metadata and candidate profiles,
create standardized briefs and `CV.md` files from the embedded resume text, and
integrate with the `req-track` pipeline format.

## Trigger

- The user provides a Workday requisition export (`.xlsx`).
- The user asks to import candidates from Workday or an XLSX export.
- The user mentions a requisition ID and asks to process the export.

## Prerequisites

- A Workday requisition export accessible on the filesystem.
- `read-excel-file` package installed:
  `bun pm ls read-excel-file 2>/dev/null || bun install read-excel-file`.
- User identity — run the `person-identify` skill to populate
  `~/.cache/fit/outpost/state/identity.md`.

## Inputs

- Path to the `.xlsx` file (e.g. `~/Downloads/4951493_…(Open).xlsx`).

## Outputs

- `Knowledge/Candidates/{Clean Name}/brief.md` — candidate profile.
- `Knowledge/Candidates/{Clean Name}/CV.md` — resume text as markdown.
- `Knowledge/Roles/{Req ID} — {Title}.md` — created or updated with
  `**Status:** open`. Update to `**Status:** closed` when the role closes.
- Updated existing briefs when a candidate already exists.

<do_confirm_checklist goal="Verify the Workday import is consistent with
req-track">

- [ ] XLSX parsed; candidate count matches the parser summary.
- [ ] Requisition metadata extracted (ID, title; HM/recruiter when available).
- [ ] Each candidate has a directory under `Knowledge/Candidates/{Clean Name}/`
      (annotation stripped).
- [ ] `CV.md` created for every candidate with resume text — faithfully
      reproduced (no rewriting).
- [ ] Pipeline status mapped from **Step / Disposition** (not Stage); raw step
      preserved in the Pipeline entry.
- [ ] Internal/External derived from name annotations and source.
- [ ] Existing candidates updated via targeted edits (not duplicated).
- [ ] Skills tagged with standard IDs; Gender set to `—` (export has no signal);
      Channel = `hr`; Req backlinks to the Role file.

</do_confirm_checklist>

## Procedure

Process **10 candidates per run**.

### 1. Set up

Read the user's identity from `~/.cache/fit/outpost/state/identity.md` (run the
`person-identify` skill first if it is missing or stale). Confirm the XLSX path.
Ensure the parser dependency is installed:

```bash
bun pm ls read-excel-file 2>/dev/null || bun install read-excel-file
```

### 2. Parse the export

```bash
node .claude/skills/req-workday/scripts/parse-workday.mjs "<path>" --summary
```

Review the summary for sanity (candidate count, header detection). For the JSON
consumed by later steps:

```bash
node .claude/skills/req-workday/scripts/parse-workday.mjs "<path>"
```

The output is `{ requisition, candidates }`. Format details (sheet shapes,
header indices, name annotations) are in
[references/xlsx-format.md](references/xlsx-format.md).

### 3. Create or update the Role file

```bash
ls Knowledge/Roles/ | grep "{Req ID}"
```

New role files go in `Knowledge/Roles/` with `**Status:** open`. Use the
**Role file stub** in
[references/templates.md](references/templates.md). Resolve the domain lead by:

1. `rg "{Req ID}" Knowledge/` — look in project timelines, People notes, Topics
   for context.
2. Reading the hiring manager's People note for `**Reports to:**` and walking up
   to a VP or senior leader.
3. Falling back to `Domain lead: —` for later cycles.

If the Role file already exists, follow the existing-file rules in
`references/templates.md`.

### 4. Build the candidate index

```bash
ls -d Knowledge/Candidates/*/ 2>/dev/null
```

Match imported candidates against existing notes by name (fuzzy — middle names,
accents, spelling variations).

### 5. Determine pipeline status

Map **Step / Disposition** to the `req-track` status using
[references/status-mapping.md](references/status-mapping.md). Preserve the raw
step value in the Pipeline entry.

### 6. Write `CV.md`

For every candidate with resume text, create
`Knowledge/Candidates/{Clean Name}/CV.md` using the **CV.md template** in
[references/templates.md](references/templates.md).

### 7. Write or update the brief

Column-to-field map: [references/field-mapping.md](references/field-mapping.md).
Brief layout (new candidates) and edit rules (existing candidates):
[references/templates.md](references/templates.md).

```bash
mkdir -p "Knowledge/Candidates/{Clean Name}"
```

For existing candidates, apply targeted Edit operations only — never rewrite the
file.

### 8. Capture insights

After the batch, review for strategic observations and add bullets to
`Knowledge/Candidates/Insights.md` under `## Placement Notes` with
`[[Candidates/Name/brief|Name]]` links. See `req-track` Step 5b for the
inclusion criteria.

### 9. Tag skills

```bash
bunx fit-pathway skill --list
```

Use standard skill IDs in each brief's `## Skills` section. Flag candidates with
a `CV.md` for `req-screen`.

### 10. Batch and report

Process 10 candidates per run. Report `Processed {N}/{Total}`. If more remain,
tell the user how many and offer to continue.
