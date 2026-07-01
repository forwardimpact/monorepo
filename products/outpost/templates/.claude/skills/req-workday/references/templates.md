# Output Templates

Reference templates for `req-workday` Steps 1b, 4, and 5.

## Role file stub

Use when no Role file exists for the requisition. Filename:
`Knowledge/Roles/{Req ID} — {Short Title}.md`. The `**Status:**` field
(`open`/`closed`) is updated in place — never move files.

```markdown
# {Requisition Title}

## Info
**Req:** {Req ID}
**Status:** open
**Title:** {Full title from export}
**Level:** {Infer from title: "Principal" → J100, "Staff" → J090, "Director" → J100 M-track, "Senior" → J070}
**Track:** {P-track for IC roles, M-track for Director/Manager roles}
**Discipline:** {Infer: "Software Engineer" → software-engineering, "Data Engineer" → data-engineering, "Data Scientist" → data-science}
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
<!-- Rebuilt by req-track role sync -->

## Notes
- Created from requisition export on {today}.
```

If the Role file already exists: set `Hiring manager` only when the export
provides one and the field is `—`; update `Last activity` to today; append
`- Requisition export processed on {today}: {N} candidates` to Notes.

## CV.md template

Save to `Knowledge/Candidates/{Clean Name}/CV.md` when resume text exists. Skip
when it doesn't.

```markdown
# {Clean Name} — Resume

> Extracted from Workday requisition export {Req ID} on {today's date}.
> Original file: {Resume filename from column G}

---

{Resume text from column AC, preserving original formatting}
```

**Formatting:** preserve paragraph breaks; convert ALL-CAPS headers to
`## Heading`; keep bullets/lists; never rewrite or summarise.

## Candidate brief

Save to `Knowledge/Candidates/{Clean Name}/brief.md`. Format follows
`req-track`.

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
**Status:** {pipeline status}
**First seen:** {Date Applied, YYYY-MM-DD}
**Last activity:** {Date Applied, YYYY-MM-DD}
**Req:** [[Roles/{Role filename}|{Req ID}]] — {Req Title}
**Channel:** hr
**Hiring manager:** {From Role file or "—"}
**Domain lead:** {From Role file or "—"}
**Internal/External:** {Internal / External / External (Prior Worker)}
**Current title:** {Current Job Title at Current Company}
**Email:** {Email or "—"}
**Phone:** {Phone or "—"}

## Summary
{2–3 sentences from resume text: focus, years of experience, key strengths.
Fall back to Current Job Title + Total Years Experience.}

## CV
- [CV.md](./CV.md)

## Connected to
- [[Roles/{Role filename}]] — applied to
- {[[People/{Hiring manager}]] — hiring manager, if known}
- {[[People/{Domain lead}]] — domain lead, if known}
- {Referred-by person, if present}

## Pipeline
- **{Date Applied}**: Applied via {Source} — Step: {Workday step}

## Skills
{Agent-aligned standard skill IDs from `bunx fit-pathway skill --list`}

## Education
{Degrees + Fields of Study}

## Work History
{All Job Titles + Companies}

## Notes
{Visa, Eligibility, Relocation, Non-compete, Years experience}
```

Gender is `—` (Workday exports carry no gender signals).

## Existing-candidate edits

Apply targeted edits to `brief.md` — never rewrite. Set/update `Req`, advance
`Status` if the Workday step is more advanced, update `Last activity`, append
`**{Date Applied}**: Applied to {Req ID} — {Title} via {Source}` to Pipeline,
fill only missing Email/Phone/ Location. Never overwrite richer existing data
with sparser Workday data.
