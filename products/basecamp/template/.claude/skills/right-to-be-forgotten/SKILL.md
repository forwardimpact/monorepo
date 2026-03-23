---
name: right-to-be-forgotten
description: >
  Process GDPR Article 17 data erasure requests. Finds and removes all personal
  data related to a named individual from the knowledge base, cached data, and
  agent state files. Use when the user receives a right-to-be-forgotten request,
  asks to delete all data about a person, or needs to comply with a data
  erasure obligation.
compatibility: Requires macOS filesystem access
---

# Right to Be Forgotten

Process data erasure requests under GDPR Article 17 (Right to Erasure). Given a
person's name, systematically find and remove all personal data from the
knowledge base, cached synced data, and agent state files.

This skill produces an **erasure report** documenting what was found, what was
deleted, and what requires manual action — providing an audit trail for
compliance.

## Trigger

Run this skill:

- When the user receives a formal GDPR erasure request
- When the user asks to delete all data about a specific person
- When a candidate withdraws from a recruitment process and requests data
  deletion
- When the user asks to "forget" someone

## Prerequisites

- The person's full name (and any known aliases or email addresses)
- User confirmation before deletion proceeds

## Inputs

- **Name**: Full name of the data subject (required)
- **Aliases**: Alternative names, maiden names, nicknames (optional)
- **Email addresses**: Known email addresses (optional, improves search
  coverage)
- **Scope**: `all` (default) or `recruitment-only` (limits to candidate data)

## Outputs

- `knowledge/Erasure/{Name}--{YYYY-MM-DD}.md` — erasure report (audit trail)
- Deleted files and redacted references across the knowledge base

---

## Step 0: Confirm Intent

Before proceeding, clearly state to the user:

> **Data erasure request for: {Name}**
>
> This will permanently delete all personal data related to {Name} from:
>
> - Knowledge base notes (People, Candidates, Organizations mentions)
> - Cached email threads and attachments
> - Agent state and triage files
>
> This action cannot be undone. Proceed?

**Wait for explicit confirmation before continuing.**

## Step 1: Discovery — Find All References

Search systematically across every data location. Record every match.

### 1a. Knowledge Base — Direct Notes

```bash
# Candidate directory (recruitment data)
ls -d "knowledge/Candidates/{Name}/" 2>/dev/null

# People note
ls "knowledge/People/{Name}.md" 2>/dev/null

# Try common name variations
ls "knowledge/People/{First} {Last}.md" 2>/dev/null
ls "knowledge/People/{Last}, {First}.md" 2>/dev/null
```

### 1b. Knowledge Base — Backlinks and Mentions

```bash
# Search for all mentions across the entire knowledge graph
rg -l "{Name}" knowledge/
rg -l "{First name} {Last name}" knowledge/

# Search for Obsidian-style links
rg -l "\[\[.*{Name}.*\]\]" knowledge/

# Search by email address if known
rg -l "{email}" knowledge/
```

### 1c. Cached Data — Email Threads

```bash
# Search synced email threads for mentions
rg -l "{Name}" ~/.cache/fit/basecamp/apple_mail/ 2>/dev/null
rg -l "{email}" ~/.cache/fit/basecamp/apple_mail/ 2>/dev/null

# Check for attachment directories containing their files
find ~/.cache/fit/basecamp/apple_mail/attachments/ -iname "*{Name}*" 2>/dev/null
```

### 1d. Cached Data — Calendar Events

```bash
# Search calendar events
rg -l "{Name}" ~/.cache/fit/basecamp/apple_calendar/ 2>/dev/null
rg -l "{email}" ~/.cache/fit/basecamp/apple_calendar/ 2>/dev/null
```

### 1e. Agent State Files

```bash
# Search triage files for mentions
rg -l "{Name}" ~/.cache/fit/basecamp/state/ 2>/dev/null
```

### 1f. Drafts

```bash
# Search email drafts
rg -l "{Name}" drafts/ 2>/dev/null
```

Compile a complete inventory of every file and reference found.

## Step 2: Classify References

For each discovered reference, classify the required action:

| Reference Type                     | Action                                      | Example                                         |
| ---------------------------------- | ------------------------------------------- | ----------------------------------------------- |
| **Dedicated note** (sole subject)  | Delete entire file                          | `knowledge/People/{Name}.md`                    |
| **Dedicated directory**            | Delete entire directory                     | `knowledge/Candidates/{Name}/`                  |
| **Mention in another note**        | Redact: remove lines referencing the person | Backlink in `knowledge/Organizations/Agency.md` |
| **Email thread** (sole subject)    | Delete file                                 | `~/.cache/fit/basecamp/apple_mail/thread.md`    |
| **Email thread** (multiple people) | Redact: remove paragraphs about the person  | Thread discussing multiple candidates           |
| **Attachment** (their CV, etc.)    | Delete file                                 | `attachments/{thread}/CV.pdf`                   |
| **Triage/state file**              | Redact: remove lines mentioning them        | `recruiter_triage.md`                           |
| **Insights file**                  | Redact: remove bullets mentioning them      | `knowledge/Candidates/Insights.md`              |

## Step 3: Execute Deletions

Process in order from most specific to most general:

### 3a. Delete Dedicated Files and Directories

```bash
# Remove candidate directory (CV, brief, assessment — everything)
rm -rf "knowledge/Candidates/{Name}/"

# Remove people note
rm -f "knowledge/People/{Name}.md"

# Remove any attachments
find ~/.cache/fit/basecamp/apple_mail/attachments/ -iname "*{Name}*" -delete
```

### 3b. Redact Mentions in Other Notes

For each file that **mentions** the person but isn't dedicated to them:

1. Read the file
2. Remove lines, bullets, or sections that reference the person
3. Remove broken `[[backlinks]]` to deleted notes
4. Write the updated file

**Redaction rules:**

- Remove entire bullet points that mention the person by name
- Remove table rows containing the person's name
- Remove `## Connected to` entries linking to their deleted note
- If a section becomes empty after redaction, remove the section header too
- Do NOT remove surrounding context that doesn't identify the person

### 3c. Handle Email Threads

For threads where the person is the **sole subject** (e.g., a recruitment email
about only them):

```bash
rm -f "~/.cache/fit/basecamp/apple_mail/{thread}.md"
```

For threads with **multiple people**, redact only the paragraphs about this
person — leave the rest intact.

### 3d. Clean Agent State

Remove mentions from triage files:

```bash
# Regenerate triage files on next agent wake — just remove current mentions
for f in ~/.cache/fit/basecamp/state/*_triage.md; do
  if rg -q "{Name}" "$f" 2>/dev/null; then
    # Read, remove lines mentioning the person, write back
    rg -v "{Name}" "$f" > "$f.tmp" && mv "$f.tmp" "$f"
  fi
done
```

### 3e. Clean Processing State

Remove entries from the graph_processed state so deleted files aren't
incorrectly tracked:

```bash
# Remove processed-file entries for deleted paths
rg -v "{deleted_path}" ~/.cache/fit/basecamp/state/graph_processed \
  > ~/.cache/fit/basecamp/state/graph_processed.tmp \
  && mv ~/.cache/fit/basecamp/state/graph_processed.tmp \
       ~/.cache/fit/basecamp/state/graph_processed
```

## Step 4: Write Erasure Report

Create the audit trail at `knowledge/Erasure/{Name}--{YYYY-MM-DD}.md`:

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
- `knowledge/Candidates/{Name}/brief.md`
- `knowledge/Candidates/{Name}/CV.pdf`
- `knowledge/Candidates/{Name}/screening.md`
- `knowledge/People/{Name}.md`
- {list all deleted files}

### Redacted References
- `knowledge/Organizations/{Agency}.md` — removed backlink
- `knowledge/Candidates/Insights.md` — removed {N} bullet(s)
- {list all redacted files and what was removed}

### Cached Data Removed
- `~/.cache/fit/basecamp/apple_mail/{thread}.md` — deleted (sole subject)
- `~/.cache/fit/basecamp/apple_mail/{thread2}.md` — redacted (multi-person)
- {list all cache actions}

### State Files Cleaned
- `~/.cache/fit/basecamp/state/recruiter_triage.md` — redacted
- {list all state file actions}

## Requires Manual Action

The following data sources are outside this tool's reach:

- **Apple Mail** — original emails remain in the user's mailbox. Search for
  "{Name}" in Mail.app and delete threads manually.
- **Apple Calendar** — original events remain. Check Calendar.app for events
  mentioning "{Name}".
- **Recruitment agencies** — notify {Agency} that the candidate's data has been
  deleted and request they do the same.
- **Interview notes** — check physical notebooks or other apps for handwritten
  or external notes.
- **Shared documents** — check Google Drive, SharePoint, or other shared
  platforms for documents mentioning the person.

## Verification

After erasure, verify no traces remain:

```bash
rg "{Name}" knowledge/ ~/.cache/fit/basecamp/
````

Expected result: no matches (except this erasure report).

````

**IMPORTANT:** The erasure report itself must NOT contain personal data beyond
the name and the fact that data was deleted. Do not copy CV content, skill
assessments, or candidate details into the report. Record only what was deleted,
not what it contained.

## Step 5: Verify

Run a final search to confirm no references were missed:

```bash
rg "{Name}" knowledge/ ~/.cache/fit/basecamp/ drafts/
````

The only match should be the erasure report itself. If other matches remain,
process them and update the report.

## Scope Variants

### recruitment-only

When scope is `recruitment-only`, limit erasure to:

- `knowledge/Candidates/{Name}/` directory
- `knowledge/Candidates/Insights.md` mentions
- Recruitment-related email threads (from known agency domains)
- `recruiter_triage.md` state file

Leave `knowledge/People/{Name}.md` and general knowledge graph references intact
— the person may be a colleague or contact outside of recruitment.

### all (default)

Full erasure across all knowledge base locations, cached data, and state files.

## Quality Checklist

- [ ] User confirmed intent before any deletion
- [ ] Searched all data locations (knowledge, cache, state, drafts)
- [ ] All dedicated files/directories deleted
- [ ] All backlinks and mentions redacted from other notes
- [ ] Cached email threads and attachments handled
- [ ] Agent state files cleaned
- [ ] Processing state updated for deleted files
- [ ] Erasure report created with full audit trail
- [ ] Report does NOT contain personal data (only file paths and actions)
- [ ] Manual action items listed (Mail.app, Calendar.app, agencies)
- [ ] Final verification search shows no remaining references
- [ ] Broken backlinks cleaned up in referencing notes
