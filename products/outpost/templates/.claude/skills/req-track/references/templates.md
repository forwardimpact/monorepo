# Templates

Backlink rules and the overlay stub live in [overlays.md](overlays.md).

## Role file stub

Step 3 stub for a Req with no Role file, in `2-Confidential/Roles/`.

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

Step 3 scans briefs and rebuilds this table on each Role file. Sort by First
seen, newest first:

```markdown
## Candidates
| Candidate | Status | Channel | First seen |
|---|---|---|---|
| [[2-Confidential/Candidates/{Name}/brief\|{Name}]] | {status} | {channel} | {date} |
```

## Candidate brief

Step 8 uses this template for new candidates. File:
`2-Confidential/Candidates/{Full Name}/brief.md`. Frontmatter `status` uses
the registry vocabulary; the body `**Status:**` keeps the pipeline stage.

```markdown
---
type: candidate
created: {YYYY-MM-DD}
updated: {YYYY-MM-DD}
aliases: [{alternate spellings, or an empty list}]
status: {registry status: new / screening / interviewing / offer / hired / rejected / withdrawn}
---

# {Full Name}

## Info
**Title:** {professional title/function}
**Rate:** {rate or "—"}
**Availability:** {availability or "—"}
**English:** {level or "—"}
**Location:** {location or "—"}
**Gender:** {Woman / Man / —}
**Source:** [[3-Team/Organizations/{Agency}]] via [[3-Team/People/{Recruiter Name}]]
**Status:** {pipeline status}
**First seen:** {YYYY-MM-DD}
**Last activity:** {YYYY-MM-DD}
{extra fields here — see below}

## Summary
{2-3 sentences: role, experience level, key strengths}

## CV
- [CV.pdf](./CV.pdf)

## Connected to
- [[3-Team/Organizations/{Agency}]] — sourced by
- [[3-Team/People/{Recruiter}]] — recruiter
- [[2-Confidential/Roles/{Role filename without .md}]] — applied to
- [[3-Team/People/{Hiring manager}]] — hiring manager
- [[3-Team/People/{Domain lead}]] — domain lead

## Pipeline
- **{date}**: {event}

## Skills
{comma-separated agent-aligned engineering standard skill IDs}

## Notes
{free-form observations — always present, even if empty}
```

## Extra Info fields

Place after `Last activity`, in this order, only when known:

```markdown
**Role:** {internal requisition profile, e.g. "Staff Engineer"}
**Req:** [[2-Confidential/Roles/{filename}|{req number}]] — {title}
**Channel:** {hr / vendor}
**Hiring manager:** {[[3-Team/People/{name}]] or "—"}
**Domain lead:** {[[3-Team/People/{name}]] or "—"}
**Internal/External:** {Internal / External / External (Prior Worker)}
**Model:** {engagement model, e.g. "B2B (via Agency) — conversion to FTE not possible"}
**Current title:** {current job title and employer}
**Email:** {personal or work email}
**Phone:** {phone number}
**LinkedIn:** {profile URL}
**Also known as:** {alternate spellings — mirror them into `aliases`}
```

For vendor-pipeline candidates the Req backlink uses
`[[2-Confidential/Roles/{filename}|Vendor]] — {description}`.

Add optional sections between `## Skills` and `## Notes`, in this order:
`## Education`, `## Certifications`, `## Work History`, `## Key Facts`,
`## Interview Notes` (`### YYYY-MM-DD — {description}` per interview).

`## Notes` is always last. If `## Open Items` exists, place it after Notes.
