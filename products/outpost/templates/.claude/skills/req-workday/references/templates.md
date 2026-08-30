# Output Templates

Role and CV templates for `req-workday` Steps 3 and 6. The candidate brief
template and edit rules live in [brief.md](brief.md).

## Role file stub

Use when no Role file exists for the requisition. Filename:
`2-Confidential/Roles/{Req ID} — {Short Title}.md`. Update the `**Status:**`
field (`open`/`closed`) in place. Never move files.

```markdown
# {Requisition Title}

## Info
**Req:** {Req ID}
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

If the Role file already exists, set `Hiring manager` only when the export
provides one and the field is `—`. Then update `Last activity` to today. Then
append `- Requisition export processed on {today}: {N} candidates` to Notes.

## CV.md template

Save to `2-Confidential/Candidates/{Clean Name}/CV.md` when resume text
exists. Skip the file when it does not.

```markdown
# {Clean Name} — Resume

> Extracted from Workday requisition export {Req ID} on {today's date}.
> Original file: {Resume filename from column G}

---

{Resume text from column AC, preserving original formatting}
```

**Formatting:** preserve paragraph breaks. Convert ALL-CAPS headers to
`## Heading`. Keep bullets and lists. Never rewrite or summarise.
