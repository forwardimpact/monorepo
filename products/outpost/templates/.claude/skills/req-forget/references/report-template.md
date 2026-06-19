# Erasure Report Template

Audit trail for `req-forget` Step 4. Save to
`Knowledge/Erasure/{Name}--{YYYY-MM-DD}.md`.

**The report itself must not contain personal data** beyond the subject's name
and the actions taken. Do not copy CV content, skills, or assessments into the
report — record only what was deleted, not what it contained.

````markdown
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
- `Knowledge/Candidates/{Name}/brief.md`
- `Knowledge/Candidates/{Name}/CV.pdf`
- `Knowledge/Candidates/{Name}/screening.md`
- `Knowledge/People/{Name}.md`
- {list all deleted files}

### Redacted References
- `Knowledge/Organizations/{Agency}.md` — removed backlink
- `Knowledge/Candidates/Insights.md` — removed {N} bullet(s)
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
- **Recruitment agencies** — notify {Agency} of the deletion and request
  they do the same.
- **Interview notes** — check physical notebooks and external apps.
- **Shared documents** — check Google Drive, SharePoint, etc.

## Verification

```bash
rg "{Name}" Knowledge/ ~/.cache/fit/outpost/
````

Expected: no matches except this erasure report.

```

```
