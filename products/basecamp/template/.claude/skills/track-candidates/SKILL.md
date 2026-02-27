---
name: track-candidates
description: Scan synced email threads for recruitment candidates, extract structured profiles, and create/update notes in knowledge/Candidates/. Use when the user asks to track candidates, process recruitment emails, or update the hiring pipeline.
---

# Track Candidates

Scan synced email threads from `~/.cache/fit/basecamp/apple_mail/` for
recruitment candidates. Extract structured candidate profiles and create/update
notes in `knowledge/Candidates/`. This builds a local, searchable recruitment
pipeline from scattered email threads.

## Trigger

Run this skill:

- When the user asks to track, process, or update candidates
- When the user asks about recruitment pipeline status
- After `sync-apple-mail` has pulled new threads

## Prerequisites

- Synced email data in `~/.cache/fit/basecamp/apple_mail/` (from
  `sync-apple-mail`)
- User identity configured in `USER.md`

## Inputs

- `~/.cache/fit/basecamp/apple_mail/*.md` — synced email threads
- `~/.cache/fit/basecamp/apple_mail/attachments/` — CV/resume attachments
- `~/.cache/fit/basecamp/state/graph_processed` — tracks processed files (shared
  with `extract-entities`)
- `USER.md` — user identity for self-exclusion

## Outputs

- `knowledge/Candidates/{Full Name}/brief.md` — candidate profile note
- `knowledge/Candidates/{Full Name}/CV.pdf` — local copy of CV (or `CV.docx`)
- `~/.cache/fit/basecamp/state/graph_processed` — updated with processed threads

---

## Before Starting

1. Read `USER.md` to get the user's name, email, and domain.
2. Find new/changed email files to process:

```bash
python3 .claude/skills/extract-entities/scripts/state.py check
```

This outputs one file path per line for all source files that are new or changed.
Filter this list to only `apple_mail/*.md` files — calendar events are not
relevant for candidate tracking.

**Process in batches of 10 files per run.**

## Step 0: Build Candidate Index

Scan existing candidate notes to avoid duplicates:

```bash
ls -d knowledge/Candidates/*/
```

Each candidate has their own directory at `knowledge/Candidates/{Name}/`
containing standardized files:

- `brief.md` — the candidate profile note
- `CV.pdf` (or `CV.docx`) — local copy of CV (if available)

For each existing note, read the header fields (Name, Role, Source, Status) to
build a mental index of known candidates.

Also scan `knowledge/People/`, `knowledge/Organizations/`, and
`knowledge/Projects/` to resolve recruiter names, agency orgs, and project
links.

## Step 1: Identify Recruitment Emails

For each new/changed email thread, determine if it contains candidate
information. Look for these signals:

### CV/Resume Attachments

Check `~/.cache/fit/basecamp/apple_mail/attachments/{thread_id}/` for PDF or
DOCX files with candidate names in filenames.

### Recruiter Sender Domains

Emails from known recruitment agency domains. Map sender domains to
organizations using `knowledge/Organizations/` — look for notes tagged as
recruitment agencies.

If no known agencies exist yet, use sender patterns as hints:

- Multiple candidates presented by the same sender
- Structured profile formatting (rate, availability, skills)
- Forwarding candidate CVs on behalf of others

### Profile Presentation Patterns

Look for structured candidate descriptions containing:

- "Rate:" or rate/cost information
- "Availability:" or notice period
- "English:" or language level
- "Location:" or country/city
- Candidate name + role formatting (e.g. "Staff Software Engineer")
- "years of experience" or "YoE"
- Skills/tech stack listings

### Interview Scheduling

- "schedule a call", "schedule an interview"
- "first interview", "second interview", "technical interview"
- "interview slot", "available for a call"

### Follow-up on Existing Candidates

Threads that mention a candidate already in `knowledge/Candidates/` by name —
these update pipeline status.

**Skip threads that don't match any signal.** Not all email threads are
recruitment-related.

## Step 2: Extract Candidate Data

For each candidate found in a recruitment email, extract:

| Field | Source | Required |
|---|---|---|
| **Name** | Filename, email body, CV | Yes |
| **Role** | Email body, CV | Yes |
| **Rate** | Email body (e.g. "$120/hr", "€80/h") | If available |
| **Availability** | Email body (e.g. "1 month notice", "immediately") | If available |
| **English** | Email body (e.g. "B2", "Upper-intermediate") | If available |
| **Location** | Email body, CV | If available |
| **Source agency** | Sender domain → Organization | Yes |
| **Recruiter** | Email sender or CC'd recruiter | Yes |
| **CV path** | Attachment directory | If available |
| **Skills** | Email body, CV | If available |
| **Summary** | Email body, CV | Yes — 2-3 sentences |

### Determining Source and Recruiter

- Map sender email domain to an organization in `knowledge/Organizations/`.
- The person who sent or forwarded the candidate profile is the recruiter. Look
  them up in `knowledge/People/` and link with `[[People/Name]]`.
- If the organization or recruiter doesn't exist yet, create notes for them.

### CV Attachment Path

Check for attachments:

```bash
ls ~/.cache/fit/basecamp/apple_mail/attachments/{thread_id}/
```

Match CV files to candidates by name similarity in the filename. Copy the CV
into the candidate's directory with a standardized name:

```bash
mkdir -p "knowledge/Candidates/{Full Name}"
cp "~/.cache/fit/basecamp/apple_mail/attachments/{thread_id}/{filename}" \
   "knowledge/Candidates/{Full Name}/CV.pdf"
```

Use `CV.pdf` for PDF files and `CV.docx` for Word documents. The `## CV` link
in the brief uses a relative path: `./CV.pdf`.

## Step 3: Determine Pipeline Status

Assign a status based on the email context:

| Status | Signal |
|---|---|
| `new` | CV/profile received, no response yet |
| `screening` | Under review, questions asked about the candidate |
| `first-interview` | First interview scheduled or completed |
| `second-interview` | Second interview scheduled or completed |
| `offer` | Offer extended |
| `hired` | Accepted and onboarding |
| `rejected` | Explicitly passed on ("not a fit", "pass", "decline") |
| `on-hold` | Paused, waiting on notice period, or deferred |

**Default to `new`** if no response signals are found. Read the full thread
chronologically to determine the most recent status.

### Status Advancement Signals

Look for these patterns in the hiring manager's replies:

- "let's schedule" / "set up an interview" → `first-interview`
- "second round" / "follow-up interview" → `second-interview`
- "not what we're looking for" / "pass" → `rejected`
- "extend an offer" / "make an offer" → `offer`
- "they've accepted" / "start date" → `hired`
- "put on hold" / "come back to later" → `on-hold`
- No response to profile → remains `new`

## Step 4: Build Pipeline Timeline

Extract a chronological timeline from the thread:

```markdown
## Pipeline
- **2026-01-29**: Profile shared by {Recruiter} ({Agency})
- **2026-02-03**: {Recruiter} followed up asking about scheduling
- **2026-02-10**: {Hiring Manager} requested first interview
```

Each entry: `**{date}**: {what happened}` — one line per meaningful event.
Include who did what. Skip noise (signature blocks, disclaimers, forwarded
headers).

## Step 5: Write Candidate Note

### For NEW candidates

Create the candidate directory and note:

```bash
mkdir -p "knowledge/Candidates/{Full Name}"
```

Then create `knowledge/Candidates/{Full Name}/brief.md`:

```markdown
# {Full Name}

## Info
**Role:** {role title}
**Rate:** {rate or "—"}
**Availability:** {availability or "—"}
**English:** {level or "—"}
**Location:** {location or "—"}
**Source:** [[Organizations/{Agency}]] via [[People/{Recruiter Name}]]
**Status:** {pipeline status}
**First seen:** {date profile was shared, YYYY-MM-DD}
**Last activity:** {date of most recent thread activity, YYYY-MM-DD}

## Summary
{2-3 sentences: role, experience level, key strengths}

## CV
- [CV.pdf](./CV.pdf)

## Connected to
- [[Organizations/{Agency}]] — sourced by
- [[People/{Recruiter}]] — recruiter

## Pipeline
- **{date}**: {event}

## Skills
{comma-separated skill tags}

## Notes
```

If a CV attachment exists, **copy it into the candidate directory** before
writing the note.

If no CV attachment exists, omit the `## CV` section entirely.

### For EXISTING candidates

Read `knowledge/Candidates/{Full Name}/brief.md`, then apply targeted edits:

- Update **Status** if it has advanced
- Update **Last activity** date
- Add new **Pipeline** entries at the bottom (chronological order)
- Update **Rate**, **Availability**, or other fields if new information is
  available
- Add new **Skills** if mentioned

**Use precise edits — don't rewrite the entire file.**

## Step 5b: Capture Key Insights

After writing or updating candidate notes, check whether any **high-signal
observations** belong in `knowledge/Candidates/Insights.md`. This is a shared
file for cross-candidate strategic thinking.

**Add an insight only when:**

- A candidate may be better suited for a **different role** than the one they
  applied for
- A candidate stands out as a **strong match** for a specific team or leader
- There's a meaningful **comparison between candidates** (e.g. complementary
  strengths, overlapping profiles)
- A hiring decision or trade-off needs to be **remembered across sessions**

**Do NOT add:**

- Per-candidate status updates (that's what `brief.md` is for)
- Generic strengths/weaknesses already captured in interview notes
- Anything that only matters within a single candidate's context

Format: one bullet per insight under `## Placement Notes`, with
`[[Candidates/Name/brief|Name]]` links and relevant people/org backlinks.

## Step 6: Ensure Bidirectional Links

After writing candidate notes, verify links go both ways:

| If you add... | Then also add... |
|---|---|
| Candidate → Organization | Organization → Candidate |
| Candidate → Recruiter | Recruiter → Candidate (in Activity section) |
| Candidate → Project | Project → Candidate (in People section) |

Use absolute paths: `[[Candidates/Name/brief|Name]]`,
`[[Organizations/Agency]]`, `[[People/Recruiter]]`.

**Important:** Only add backlinks to Organization/People/Project notes if they
don't already reference the candidate. Check before editing.

## Step 7: Update Graph State

After processing each email thread, mark it as processed:

```bash
python3 .claude/skills/extract-entities/scripts/state.py update "{file_path}"
```

This uses the same state file as `extract-entities`, so threads processed here
won't be re-scanned by either skill (unless the file changes).

## Quality Checklist

- [ ] Scanned all new/changed email threads for recruitment signals
- [ ] Extracted all candidates found (check attachment directories too)
- [ ] Each candidate has a complete note with all available fields
- [ ] CV paths are correct and point to actual files
- [ ] Pipeline status reflects the latest thread activity
- [ ] Timeline entries are in chronological order
- [ ] Used `[[absolute/path]]` links throughout
- [ ] Bidirectional links are consistent
- [ ] Graph state updated for all processed threads
- [ ] No duplicate candidate notes created
- [ ] Key strategic insights added to `Insights.md` where warranted
