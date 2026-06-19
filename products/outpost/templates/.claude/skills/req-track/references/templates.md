# Templates

Markdown templates used by `req-track` for Role files and Candidate briefs.

## Role file stub

Used by Step 0b when a Req appears on a candidate brief but no Role file exists.

```markdown
# {Title from candidate Req field}

## Info
**Req:** {req number}
**Title:** {title from Req field}
**Level:** —
**Track:** —
**Discipline:** —
**Domain lead:** —
**Hiring manager:** —
**Locations:** —
**Positions:** —
**Channel:** hr
**Status:** open
**Opened:** —
**Last activity:** {today}

## Connected to
- Staffing/recruitment project

## Candidates
<!-- Rebuilt each cycle -->

## Notes
- Stub created automatically — enrich with data from emails, calendar, and imports.
```

## Role Candidates table

Step 0b rebuilds this table on each Role file by scanning briefs:

```markdown
## Candidates
| Candidate | Status | Channel | First seen |
|---|---|---|---|
| [[Candidates/{Name}/brief\|{Name}]] | {status} | {channel} | {date} |
```

Sort by First seen, newest first.

## Candidate brief

Used by Step 5 for new candidates. File:
`Knowledge/Candidates/{Full Name}/brief.md`.

```markdown
# {Full Name}

## Info
**Title:** {professional title/function}
**Rate:** {rate or "—"}
**Availability:** {availability or "—"}
**English:** {level or "—"}
**Location:** {location or "—"}
**Gender:** {Woman / Man / —}
**Source:** [[Organizations/{Agency}]] via [[People/{Recruiter Name}]]
**Status:** {pipeline status}
**First seen:** {YYYY-MM-DD}
**Last activity:** {YYYY-MM-DD}
{extra fields here — see below}

## Summary
{2-3 sentences: role, experience level, key strengths}

## CV
- [CV.pdf](./CV.pdf)

## Connected to
- [[Organizations/{Agency}]] — sourced by
- [[People/{Recruiter}]] — recruiter
- [[Roles/{Role filename without .md}]] — applied to
- [[People/{Hiring manager}]] — hiring manager
- [[People/{Domain lead}]] — domain lead

## Pipeline
- **{date}**: {event}

## Skills
{comma-separated agent-aligned engineering standard skill IDs}

## Interview Notes
{omit section if no interviews yet}

## Notes
{free-form observations — always present, even if empty}
```

Omit `## CV` when no CV attachment exists.

## Extra Info fields

Place after `Last activity`, in this order, only when known:

```markdown
**Role:** {internal requisition profile, e.g. "Staff Engineer"}
**Req:** [[Roles/{filename}|{req number}]] — {title}
**Channel:** {hr / vendor}
**Hiring manager:** {[[People/{name}]] or "—"}
**Domain lead:** {[[People/{name}]] or "—"}
**Internal/External:** {Internal / External / External (Prior Worker)}
**Model:** {engagement model, e.g. "B2B (via Agency) — conversion to FTE not possible"}
**Current title:** {current job title and employer}
**Email:** {personal or work email}
**Phone:** {phone number}
**LinkedIn:** {profile URL}
**Also known as:** {alternate spellings}
```

For vendor-pipeline candidates the Req backlink uses
`[[Roles/{filename}|Vendor]] — {description}`.

## Optional sections

Add between `## Skills` and `## Notes` when data is rich enough, in this order:
`## Education`, `## Certifications`, `## Work History`, `## Key Facts`,
`## Interview Notes` (`### YYYY-MM-DD — {description}` per interview).

`## Notes` is always last. If `## Open Items` exists, place it after Notes.
