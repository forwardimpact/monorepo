# Candidate Brief Template

Brief layout and edit rules for `req-workday` Step 7. Save to
`2-Confidential/Candidates/{Clean Name}/brief.md`. Format follows `req-track`.
Frontmatter `status` uses the registry vocabulary (`registry.yaml`); the body
`**Status:**` keeps the raw pipeline stage.

```markdown
---
type: candidate
created: {Date Applied, YYYY-MM-DD}
updated: {Date Applied, YYYY-MM-DD}
aliases: [{name annotations or transliterations, or an empty list}]
status: {registry status: new / screening / interviewing / offer / hired / rejected / withdrawn}
---

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
**Req:** [[2-Confidential/Roles/{Role filename}|{Req ID}]] — {Req Title}
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
- [[2-Confidential/Roles/{Role filename}]] — applied to
- {[[3-Team/People/{Hiring manager}]] — hiring manager, if known}
- {[[3-Team/People/{Domain lead}]] — domain lead, if known}
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

Write People-side backlinks (hiring manager, referrer) on the person's
`2-Confidential` overlay note, never on the `3-Team` note. Rules and stub:
`req-track`'s [overlays.md](../../req-track/references/overlays.md).

## Existing-candidate edits

Apply targeted edits to `brief.md`. Never rewrite it. Set or update `Req`.
Advance `Status` if the Workday step is more advanced. Update `Last activity`
and the frontmatter `updated` and `status` keys. Append
`**{Date Applied}**: Applied to {Req ID} — {Title} via {Source}` to
Pipeline. Fill only missing Email, Phone, and Location. Never overwrite richer
existing data with sparser Workday data.
