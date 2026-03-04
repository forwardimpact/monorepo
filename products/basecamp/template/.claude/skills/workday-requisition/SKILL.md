---
name: workday-requisition
description: >
  Import candidates from a Workday requisition export (.xlsx) into
  knowledge/Candidates/. Parses requisition metadata and candidate data,
  creates candidate briefs and CV.md files from resume text, and integrates
  with the existing track-candidates pipeline. Use when the user provides a
  Workday export file or asks to import candidates from an XLSX requisition
  export.
---

# Workday Requisition Import

Import candidates from a Workday requisition export (`.xlsx`) into
`knowledge/Candidates/`. Extracts requisition metadata and candidate profiles,
creates standardized candidate briefs and `CV.md` files from the embedded resume
text, and integrates with the existing `track-candidates` pipeline format.

## Trigger

Run this skill:

- When the user provides a Workday requisition export file (`.xlsx`)
- When the user asks to import candidates from Workday or an XLSX export
- When the user mentions a requisition ID and asks to process the export

## Prerequisites

- A Workday requisition export file (`.xlsx`) accessible on the filesystem
  (typically in `~/Downloads/`)
- The `xlsx` npm package installed in the KB root:
  ```bash
  npm install xlsx
  ```
- User identity configured in `USER.md`

## Inputs

- Path to the `.xlsx` file (e.g.
  `~/Downloads/4951493_Principal_Software_Engineer_–_Forward_Deployed_(Open).xlsx`)

## Outputs

- `knowledge/Candidates/{Full Name}/brief.md` — candidate profile note
- `knowledge/Candidates/{Full Name}/CV.md` — resume text rendered as markdown
- Updated existing candidate briefs if candidate already exists

---

## Workday Export Format

The Workday requisition export contains multiple sheets. This skill uses:

### Sheet 1 — Requisition Metadata

Key-value pairs, one per row:

| Row | Field                 | Example                                |
| --- | --------------------- | -------------------------------------- |
| 1   | Title header          | `4951493 Principal Software Engineer…` |
| 2   | Recruiting Start Date | `02/10/2026`                           |
| 3   | Target Hire Date      | `02/10/2026`                           |
| 4   | Primary Location      | `USA - NY - Headquarters`              |
| 5   | Hiring Manager Title  | `Hiring Manager`                       |
| 6   | Hiring Manager        | Name                                   |
| 7   | Recruiter Title       | `Recruiter`                            |
| 8   | Recruiter             | Name                                   |

### Sheet 3 — Candidates

Row 3 contains column headers. Data rows start at row 4. After the last
candidate, stage-summary rows appear (these are not candidates).

| Column | Field                  | Maps to brief field…     |
| ------ | ---------------------- | ------------------------ |
| B      | Candidate name         | `# {Name}`               |
| C      | Stage                  | Status derivation        |
| D      | Step / Disposition     | Status derivation        |
| G      | Resume filename        | Reference only (no file) |
| H      | Date Applied           | **First seen**           |
| I      | Current Job Title      | **Current title**, Title |
| J      | Current Company        | **Current title** suffix |
| K      | Source                 | **Source**               |
| L      | Referred by            | **Source** suffix        |
| N      | Availability Date      | **Availability**         |
| O      | Visa Requirement       | Notes                    |
| P      | Eligible to Work       | Notes                    |
| Q      | Relocation             | Notes                    |
| R      | Salary Expectations    | **Rate**                 |
| S      | Non-Compete            | Notes                    |
| T      | Candidate Location     | **Location**             |
| U      | Phone                  | **Phone**                |
| V      | Email                  | **Email**                |
| W      | Total Years Experience | Summary context          |
| X      | All Job Titles         | Work History context     |
| Y      | Companies              | Work History context     |
| Z      | Degrees                | Education                |
| AA     | Fields of Study        | Education                |
| AB     | Language               | **English** / Language   |
| AC     | Resume Text            | `CV.md` content          |

#### Name Annotations

Names may include parenthetical annotations:

- `(Prior Worker)` → Internal/External = `External (Prior Worker)`
- `(Internal)` → Internal/External = `Internal`
- No annotation + source contains "Internal" → `Internal`
- Otherwise → `External`

## Before Starting

1. Read `USER.md` to get the user's name, email, and domain.
2. Confirm the XLSX file path with the user (or use the provided path).
3. Ensure the `xlsx` package is installed:
   ```bash
   npm list xlsx 2>/dev/null || npm install xlsx
   ```

## Step 1: Parse the Export

Run the parse script to extract structured data:

```bash
node .claude/skills/workday-requisition/scripts/parse-workday.mjs "<path-to-xlsx>" --summary
```

This prints a summary of the requisition and all candidates. Review the output
to confirm the file parsed correctly and note the total candidate count.

For the full JSON output (used in subsequent steps):

```bash
node .claude/skills/workday-requisition/scripts/parse-workday.mjs "<path-to-xlsx>"
```

The full output is a JSON object with:

- `requisition` — metadata (id, title, location, hiringManager, recruiter)
- `candidates` — array of candidate objects with all extracted fields

## Step 2: Build Candidate Index

Scan existing candidate notes to avoid duplicates:

```bash
ls -d knowledge/Candidates/*/ 2>/dev/null
```

For each existing candidate, check if they match any imported candidate by name.
Use fuzzy matching — the Workday name may differ slightly from an existing note
(e.g. middle names, accents, spelling variations).

## Step 3: Determine Pipeline Status

Map Workday stage and step/disposition to the `track-candidates` pipeline
status:

| Workday Step / Disposition   | Pipeline Status    |
| ---------------------------- | ------------------ |
| `Considered`                 | `new`              |
| `Manager Resume Screen`      | `screening`        |
| `Assessment`                 | `screening`        |
| `Interview` / `Phone Screen` | `first-interview`  |
| `Second Interview`           | `second-interview` |
| `Reference Check`            | `second-interview` |
| `Offer`                      | `offer`            |
| `Employment Agreement`       | `offer`            |
| `Background Check`           | `hired`            |
| `Ready for Hire`             | `hired`            |
| `Rejected` / `Declined`      | `rejected`         |

If the step is identical to the stage (e.g. both "Considered"), default to
`new`.

## Step 4: Create CV.md from Resume Text

For each candidate with resume text, create
`knowledge/Candidates/{Clean Name}/CV.md`:

```markdown
# {Clean Name} — Resume

> Extracted from Workday requisition export {Req ID} on {today's date}.
> Original file: {Resume filename from column G}

---

{Resume text from column AC, preserving original formatting}
```

**Formatting rules for resume text:**

- Preserve paragraph breaks (double newlines)
- Convert ALL-CAPS section headers to `## Heading` format
- Preserve bullet points and lists
- Clean up excessive whitespace but keep structure
- Do not rewrite or summarize — reproduce faithfully

If a candidate has no resume text, skip the CV.md file.

## Step 5: Write Candidate Brief

### For NEW candidates

Create the candidate directory and brief:

```bash
mkdir -p "knowledge/Candidates/{Clean Name}"
```

Then create `knowledge/Candidates/{Clean Name}/brief.md` using the
`track-candidates` format:

```markdown
# {Clean Name}

## Info
**Title:** {Current Job Title or "—"}
**Rate:** {Salary Expectations or "—"}
**Availability:** {Availability Date or "—"}
**English:** {Language field or "—"}
**Location:** {Candidate Location or "—"}
**Gender:** —
**Source:** {Source} {via Referred by, if present}
**Status:** {pipeline status from Step 3}
**First seen:** {Date Applied, YYYY-MM-DD}
**Last activity:** {Date Applied, YYYY-MM-DD}
**Req:** {Req ID} — {Req Title}
**Internal/External:** {Internal / External / External (Prior Worker)}
**Current title:** {Current Job Title at Current Company}
**Email:** {Email or "—"}
**Phone:** {Phone or "—"}

## Summary
{2-3 sentences based on resume text: role focus, years of experience, key
strengths. If no resume text, use Current Job Title + Total Years Experience.}

## CV
- [CV.md](./CV.md)

## Connected to
- {Referred by person, if present}

## Pipeline
- **{Date Applied}**: Applied via {Source}

## Skills
{Extract key technical skills from resume text — use framework IDs where
possible via `npx fit-pathway skill --list`}

## Education
{Degrees and Fields of Study from the export columns}

## Work History
{All Job Titles and Companies from the export columns, formatted as a list}

## Notes
{Include any noteworthy fields here:}
{- Visa requirement (if present)}
{- Eligible to work (if present)}
{- Relocation willingness (if present)}
{- Non-compete status (if present)}
{- Total years of experience}
```

**Extra fields** (after Last activity, in order): Req, Internal/External,
Current title, Email, Phone, LinkedIn — include only when available. Follow the
order defined in the `track-candidates` skill.

### For EXISTING candidates

Read `knowledge/Candidates/{Name}/brief.md`, then apply targeted edits:

- Add or update **Req** field with this requisition's ID
- Update **Status** if the Workday stage is more advanced
- Update **Last activity** date if this application is more recent
- Add a new **Pipeline** entry:
  `**{Date Applied}**: Applied to {Req ID} — {Req Title} via {Source}`
- Update any missing fields (Email, Phone, Location) from the export
- Do NOT overwrite existing richer data with sparser Workday data

**Use precise edits — don't rewrite the entire file.**

## Step 6: Process in Batches

Workday exports can contain many candidates. Process in batches of **10
candidates per run** to stay within context limits.

For each batch:

1. Parse the JSON output (or re-run the parse script)
2. Process 10 candidates: create/update brief + CV.md
3. Report progress: `Processed {N}/{Total} candidates`

If the export has more than 10 candidates, tell the user how many remain and
offer to continue.

## Step 7: Capture Key Insights

After processing all candidates, review the batch for strategic observations and
add them to `knowledge/Candidates/Insights.md`:

- Candidates who stand out as strong matches
- Candidates better suited for a different role
- Notable patterns (source quality, experience distribution, skill gaps)

Follow the `track-candidates` Insights format: one bullet per insight under
`## Placement Notes` with `[[Candidates/Name/brief|Name]]` links.

## Step 8: Tag Skills with Framework IDs

When resume text mentions technical skills, map them to the engineering
framework:

```bash
npx fit-pathway skill --list
```

Use framework skill IDs in the **Skills** section of each brief. If a candidate
has a CV.md, flag them for the `analyze-cv` skill for a full framework-aligned
assessment.

## Quality Checklist

- [ ] XLSX parsed correctly — verify candidate count matches summary
- [ ] Requisition metadata extracted (ID, title, hiring manager, recruiter)
- [ ] Each candidate has a directory under `knowledge/Candidates/{Clean Name}/`
- [ ] CV.md created for every candidate with resume text
- [ ] CV.md faithfully reproduces resume text (no rewriting or summarizing)
- [ ] Brief follows `track-candidates` format exactly
- [ ] Info fields in standard order (Title → Rate → Availability → English →
      Location → Gender → Source → Status → First seen → Last activity → extras)
- [ ] Pipeline status correctly mapped from Workday stage/step
- [ ] Internal/External correctly derived from name annotations and source
- [ ] Name annotations stripped from directory names and headings
- [ ] Existing candidates updated (not duplicated) with precise edits
- [ ] Skills tagged using framework skill IDs where possible
- [ ] Gender field set to `—` (Workday exports don't include gender signals)
- [ ] Insights.md updated with strategic observations
- [ ] No duplicate candidate directories created
