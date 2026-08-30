# Erasure Report Template

Audit trail for `req-forget` Step 4. Save to
`2-Confidential/Erasure/{Name}--{YYYY-MM-DD}.md`.

**The report itself must not contain personal data** beyond the subject's name
and the actions taken. Do not copy CV content, skills, or assessments into the
report. Record only what you deleted. Do not record what it contained.

````markdown
---
type: erasure
created: {YYYY-MM-DD}
updated: {YYYY-MM-DD}
---

# Data Erasure Report — {Full Name}

**Date:** {YYYY-MM-DD HH:MM}
**Requested by:** {user or "GDPR Article 17 request"}
**Scope:** {all / recruitment-only}

## Data Subject
- **Name:** {Full Name}
- **Known aliases:** {aliases or "none"}
- **Known emails:** {emails or "none"}

## Actions Taken

### Deleted Files
- `2-Confidential/Candidates/{Name}/brief.md`
- `2-Confidential/Candidates/{Name}/CV.pdf`
- `2-Confidential/Candidates/{Name}/screening.md`
- `2-Confidential/People/{Name}.md` (overlay)
- `3-Team/People/{Name}.md`
- {list all deleted files, per tier}

### Redacted References
- `3-Team/Organizations/{Agency}.md` — removed backlink
- `2-Confidential/Candidates/Insights.md` — removed {N} bullet(s)
- `Briefings/{date}.md` — removed {N} line(s)
- {list all redacted files and what was removed}

### Cached Data Removed
- `~/.cache/fit/outpost/apple_mail/{thread}.md` — deleted (sole subject)
- `~/.cache/fit/outpost/apple_mail/{thread2}.md` — redacted (multi-person)
- {list all cache actions}

### State Files Cleaned
- `~/.cache/fit/outpost/state/recruiter_triage.md` — redacted
- {list all state file actions}

## Requires Manual Action

The following are outside this tool's reach:

- **Apple Mail** — original emails remain in the user's mailbox. Search
  Mail.app for "{Name}" and delete threads manually.
- **Apple Calendar** — events remain in Calendar.app.
- **Synced tier copies** — teammates who receive a shared tier hold their own
  copies. Notify them of the deletion.
- **Recruitment agencies** — notify {Agency} of the deletion and request
  they do the same.
- **Interview notes** — check physical notebooks and external apps.
- **Shared documents** — check Google Drive, SharePoint, etc.

## Verification

```bash
rg "{Name}" . ~/.cache/fit/outpost/
npx fit-outpost validate {kb-root}
```

Expected: no matches except this erasure report, and a clean validator run.
````
