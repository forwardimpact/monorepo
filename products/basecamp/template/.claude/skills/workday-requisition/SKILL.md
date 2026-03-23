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
- `knowledge/Roles/{Req ID} — {Title}.md` — created or updated role file
- Updated existing candidate briefs if candidate already exists

---

## Workday Export Format

The Workday export format varies between versions. The parser handles both
automatically using header-driven column mapping and dynamic header row
detection.

### Sheet 1 — Requisition Metadata

**Old format** — key-value pairs with Hiring Manager, Recruiter, Location:

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

**New format** — stage-count summary (no HM/Recruiter/Location):

| Row | Field             | Example                                |
| --- | ----------------- | -------------------------------------- |
| 1   | Title header      | `4951493 Principal Software Engineer…` |
| 2   | Active Candidates | `74 of 74`                             |
| 3   | Active Referrals  | `3 of 3`                               |
| 4   | Active Internal   | `4 of 4`                               |
| 7+  | Stage counts      | `56 → Considered`                      |

### Candidates Sheet

The parser auto-detects the candidates sheet and header row:

- **Old format**: 3+ sheets; candidates on "Candidates" sheet or Sheet3; header
  at row 3 (index 2); two "Job Application" columns
- **New format**: 2 sheets; candidates on Sheet2; header at row 8 (index 7);
  single "Job Application" column

Column mapping is header-driven — the parser reads the header row and maps
columns by name, not position. Columns that vary between exports (e.g. "Jobs
Applied to", "Referred by", "Convenience Task") are handled automatically.

**Core columns** (present in all formats):

| Header                 | Maps to brief field…                     |
| ---------------------- | ---------------------------------------- |
| Job Application        | `# {Name}`                               |
| Stage                  | Row detection only (not used for status) |
| Step / Disposition     | **Workday step** → status derivation     |
| Resume                 | Reference only (no file)                 |
| Date Applied           | **First seen**                           |
| Current Job Title      | **Current title**, Title                 |
| Current Company        | **Current title** suffix                 |
| Source                 | **Source**                               |
| Referred by            | **Source** suffix                        |
| Candidate Location     | **Location**                             |
| Phone                  | **Phone**                                |
| Email                  | **Email**                                |
| Availability Date      | **Availability**                         |
| Visa Requirement       | Notes                                    |
| Eligible to Work       | Notes                                    |
| Relocation             | Notes                                    |
| Salary Expectations    | **Rate**                                 |
| Non-Compete            | Notes                                    |
| Total Years Experience | Summary context                          |
| All Job Titles         | Work History context                     |
| Companies              | Work History context                     |
| Degrees                | Education                                |
| Fields of Study        | Education                                |
| Language               | **English** / Language                   |
| Resume Text            | `CV.md` content                          |

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

## Step 1b: Create or Update Role File

After parsing the export, create or update the corresponding Role file in
`knowledge/Roles/`. The filename convention is `{Req ID} — {Short Title}.md`.

```bash
ls knowledge/Roles/ | grep "{Req ID}"
```

### If the Role file does NOT exist

Create it using the requisition metadata from the export:

```markdown
# {Requisition Title}

## Info
**Req:** {Req ID}
**Title:** {Full title from export}
**Level:** {Infer from title: "Principal" → J100, "Staff" → J090, "Director" → J100 M-track, "Senior" → J070}
**Track:** {P-track for IC roles, M-track for Director/Manager roles}
**Discipline:** {Infer: "Software Engineer" → software_engineering, "Data Engineer" → data_engineering, "Data Scientist" → data_science}
**Domain lead:** —
**Hiring manager:** {From export metadata if available, or "—"}
**Locations:** {Primary Location from export}
**Positions:** —
**Channel:** hr
**Status:** open
**Opened:** {Recruiting Start Date from export}
**Last activity:** {today}

## Connected to
- Staffing/recruitment project

## Candidates
<!-- Rebuilt by track-candidates role sync -->

## Notes
- Created from requisition export on {today}.
```

### Resolving Domain Lead

The export rarely contains organizational hierarchy information directly. Use
cross-referencing to resolve it:

1. **Search the knowledge graph** for mentions of the req number:
   ```bash
   rg "{Req ID}" knowledge/
   ```
   Look in project timelines, People notes, and Topics for context about which
   area/VP owns this req.

2. **Check the Hiring Manager** (if available from export): look up their People
   note for `**Reports to:**` and walk up the chain to a VP or senior leader in
   a stakeholder map or organizational hierarchy note.

3. **Fallback**: If neither resolves, set `Domain lead: —` for enrichment by
   later cycles of `track-candidates` or `extract-entities`.

### If the Role file ALREADY exists

Update it with any new metadata from the export:

- Set `Hiring manager` if the export provides it and the Role file has `—`
- Update `Last activity` to today
- Add a Notes entry: `- Requisition export processed on {today}: {N} candidates`

---

## Step 2: Build Candidate Index

Scan existing candidate notes to avoid duplicates:

```bash
ls -d knowledge/Candidates/*/ 2>/dev/null
```

For each existing candidate, check if they match any imported candidate by name.
Use fuzzy matching — the Workday name may differ slightly from an existing note
(e.g. middle names, accents, spelling variations).

## Step 3: Determine Pipeline Status

Map the **Step / Disposition** column to the `track-candidates` pipeline status.
Do NOT use the Stage column for status — it is only used for row detection (stop
condition):

| Workday Step / Disposition             | Pipeline Status    |
| -------------------------------------- | ------------------ |
| `Considered`                           | `new`              |
| `Review`                               | `new`              |
| `Manager Resume Screen`                | `screening`        |
| `Schedule Recruiter Phone Screen`      | `screening`        |
| `Manager Request to Move Forward (HS)` | `screening`        |
| `Proposed Interview Slate`             | `screening`        |
| `Assessment`                           | `screening`        |
| `Manager Request to Decline (HS)`      | `rejected`         |
| `Interview` / `Phone Screen`           | `first-interview`  |
| `Second Interview`                     | `second-interview` |
| `Reference Check`                      | `second-interview` |
| `Offer`                                | `offer`            |
| `Employment Agreement`                 | `offer`            |
| `Background Check`                     | `hired`            |
| `Ready for Hire`                       | `hired`            |
| `Rejected` / `Declined`                | `rejected`         |

If the step value is empty or not recognized, default to `new`.

**Important:** The raw `step` value is always preserved in the JSON output and
should be stored in the candidate brief's **Pipeline** section (e.g.
`Applied via LinkedIn — Step: Manager Request to Move Forward (HS)`). This
allows the user to filter and query candidates by their exact Workday
disposition.

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
**Req:** [[Roles/{Role filename without .md}|{Req ID}]] — {Req Title}
**Channel:** hr
**Hiring manager:** {From Role file or "—"}
**Domain lead:** {From Role file or "—"}
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
- [[Roles/{Role filename without .md}]] — applied to
- {[[People/{Hiring manager}]] — hiring manager, if known}
- {[[People/{Domain lead}]] — domain lead, if known}
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
has a CV.md, flag them for the `screen-cv` skill for a framework-aligned
screening assessment.

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
- [ ] Gender field set to `—` (exports don't include gender signals)
- [ ] Role file created or updated in `knowledge/Roles/`
- [ ] Channel set to `hr` on all imported candidates
- [ ] Hiring manager and Domain lead inherited from Role file where available
- [ ] Req field backlinks to Role file
- [ ] Connected to section includes backlink to Role file
- [ ] Insights.md updated with strategic observations
- [ ] No duplicate candidate directories created
