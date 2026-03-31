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
- `~/.cache/fit/basecamp/apple_calendar/*.json` — synced calendar events (for
  cross-source inference)
- `knowledge/Roles/*.md` — open role/requisition files (for metadata
  inheritance)
- `~/.cache/fit/basecamp/state/graph_processed` — tracks processed files (shared
  with `extract-entities`)
- `USER.md` — user identity for self-exclusion

## Outputs

- `knowledge/Candidates/{Full Name}/brief.md` — candidate profile note
- `knowledge/Candidates/{Full Name}/CV.pdf` — local copy of CV (or `CV.docx`)
- `knowledge/Candidates/{Full Name}/headshot.jpeg` — candidate headshot photo
- `knowledge/Roles/*.md` — created/updated role files (candidate tables rebuilt)
- `~/.cache/fit/basecamp/state/graph_processed` — updated with processed threads

---

## Before Starting

1. Read `USER.md` to get the user's name, email, and domain.
2. Find new/changed email files to process:

```bash
node .claude/skills/extract-entities/scripts/state.mjs check
```

This outputs one file path per line for all source files that are new or
changed. Filter this list to only `apple_mail/*.md` files — calendar events are
not relevant for candidate tracking.

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

## Step 0b: Role Sync

Synchronize `knowledge/Roles/` with the current candidate pipeline. This ensures
role files stay current and enables metadata inheritance.

### Build Role Index

```bash
ls knowledge/Roles/
```

Read each Role file's Info block to build a lookup of: Req → Role file path,
plus Hiring manager, Domain lead, recruiter, Channel for each role.

### Ensure Role Files Exist

Scan all candidate briefs for `**Req:**` values:

```bash
rg "^\*\*Req:\*\*" knowledge/Candidates/*/brief.md
```

For each distinct req number found in candidate briefs that does **not** have a
matching Role file, create a stub Role file:

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

Then attempt to enrich the stub by searching for the req number across the
knowledge graph:

```bash
rg "{req_number}" knowledge/
```

Look for mentions in project timeline entries, People notes, and email threads.
Extract hiring manager, domain lead, recruiter, locations, and level from the
surrounding context.

### Rebuild Candidate Tables

For each Role file, rebuild the `## Candidates` table by scanning briefs:

```bash
rg -l "Req:.*{req_number}" knowledge/Candidates/*/brief.md
```

For each matching candidate, read their Status and First seen, then rebuild the
table:

```markdown
## Candidates
| Candidate | Status | Channel | First seen |
|---|---|---|---|
| [[Candidates/{Name}/brief\|{Name}]] | {status} | {channel} | {date} |
```

Sort by First seen (newest first).

### Resolve Domain Lead

If a Role file has a hiring manager but no domain lead, attempt to resolve it:

1. Read the hiring manager's People note for a `**Reports to:**` field.
2. Walk up the reporting chain until reaching a VP or senior leader listed in a
   stakeholder map or organizational hierarchy note.
3. Set `Domain lead` on the Role file.

---

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

| Field                 | Source                                                       | Required            |
| --------------------- | ------------------------------------------------------------ | ------------------- |
| **Name**              | Filename, email body, CV                                     | Yes                 |
| **Title**             | Email body, CV — the candidate's professional title/function | Yes                 |
| **Rate**              | Email body (e.g. "$120/hr", "€80/h")                         | If available        |
| **Availability**      | Email body (e.g. "1 month notice", "immediately")            | If available        |
| **English**           | Email body (e.g. "B2", "Upper-intermediate")                 | If available        |
| **Location**          | Email body, CV                                               | If available        |
| **Source agency**     | Sender domain → Organization                                 | Yes                 |
| **Recruiter**         | Email sender or CC'd recruiter                               | Yes                 |
| **CV path**           | Attachment directory                                         | If available        |
| **Skills**            | Email body, CV                                               | If available        |
| **Gender**            | Name, pronouns, recruiter context                            | If identifiable     |
| **Summary**           | Email body, CV                                               | Yes — 2-3 sentences |
| **Role**              | Internal requisition profile being hired against             | If available        |
| **Req**               | Requisition ID from hiring system                            | If available        |
| **Channel**           | `hr` or `vendor` — see derivation rules below                | Yes                 |
| **Hiring manager**    | Cross-source inference — see below                           | If determinable     |
| **Domain lead**       | Resolved from hiring manager reporting chain                 | If determinable     |
| **Internal/External** | Whether candidate is internal or external                    | If available        |
| **Model**             | Engagement model (B2B, Direct Hire, etc.)                    | If available        |
| **Current title**     | CV or email body                                             | If available        |
| **Email**             | Email body, CV, signature                                    | If available        |
| **Phone**             | Email body, CV, signature                                    | If available        |
| **LinkedIn**          | Email body, CV                                               | If available        |
| **Also known as**     | Alternate name spellings or transliterations                 | If available        |

### Determining Channel

Set `Channel` based on the candidate's source:

- **`vendor`** — if the `Source` field links to an `[[Organizations/...]]` that
  is a recruitment vendor/partner (check the org note for keywords: supplier,
  recruitment partner, contractor, staffing), or if the `Req` field contains
  "via {vendor name}" rather than a system ID.
- **`hr`** — if the candidate came through a hiring system (has a numeric Req),
  applied internally, or was submitted by an internal recruiter.

### Cross-Source Inference for Hiring Manager and Domain Lead

These fields are rarely available in a single email. Use the following
resolution chain, stopping at the first match:

1. **Req-first inheritance:** If the candidate has a `Req`, look up the matching
   `knowledge/Roles/*.md` file. Inherit `Hiring manager` and `Domain lead` from
   the Role file.

2. **Calendar inference:** Search synced calendar events for interview events
   mentioning the candidate's name:

   ```bash
   rg -l "{Candidate Name}" ~/.cache/fit/basecamp/apple_calendar/
   ```

   Read matching events. The **organizer** of an interview event (who is not the
   user from `USER.md`) is likely the hiring manager. Record this on the
   candidate brief and update the Role file if it was missing.

3. **Email inference:** In the email thread where the candidate was submitted,
   check the To/CC fields for internal recipients (besides the user).
   Cross-reference against `knowledge/People/` notes — if a CC'd person has a
   role indicating hiring manager, record them.

4. **Reporting chain resolution:** Once a hiring manager is known, look up their
   People note for a `**Reports to:**` field. Walk up the reporting chain until
   reaching a VP or senior leader listed in a stakeholder map or organizational
   hierarchy note — that person is the domain lead.

5. **Staffing project timeline:** Search for the candidate name or their vendor
   in the staffing/recruitment project notes. Surrounding context often mentions
   the hiring manager.

If none of these resolve a value, use `—` and leave it for enrichment in future
cycles as more data arrives.

### Determining Gender

Record the candidate's gender when **explicitly stated** in the email or CV:

- Pronouns used by the recruiter ("she is available", "her CV attached")
- Gendered titles ("Ms.", "Mrs.", "Mr.")

Record as `Woman`, `Man`, or `—` (unknown). When uncertain, use `—` — **never
infer gender from names**, regardless of cultural context. Name-based inference
is unreliable and culturally biased. This field supports aggregate pool
diversity tracking; it has **no bearing** on hiring decisions, assessment
criteria, or candidate visibility.

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

Use `CV.pdf` for PDF files and `CV.docx` for Word documents. The `## CV` link in
the brief uses a relative path: `./CV.pdf`.

### Headshot Discovery

Search two locations for candidate headshot photos:

1. **Email attachments** —
   `~/.cache/fit/basecamp/apple_mail/attachments/{thread_id}/` may contain
   headshot images sent by recruiters alongside CVs. Look for `.jpg`, `.jpeg`,
   or `.png` files with candidate name fragments in the filename or that are
   clearly portrait photos (not logos, signatures, or email decorations like
   `image001.png`).

2. **Downloads folder** — search `~/Downloads/` recursively (including
   subdirectories) for headshot images:

```bash
find ~/Downloads -maxdepth 3 -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.heic" \) 2>/dev/null
```

Match images to candidates by name similarity in the filename (e.g.
`vitalii.jpeg` matches "Vitalii Huliai", `qazi.jpeg` matches "Qazi Rehman"). Use
first name, last name, or full name matching — case-insensitive.

When a headshot is found, copy it into the candidate directory with a
standardized name:

```bash
cp "{source_path}" "knowledge/Candidates/{Full Name}/headshot.jpeg"
```

Always use `headshot.jpeg` as the filename regardless of the source format. If
the source is PNG or HEIC, convert it first:

```bash
# PNG to JPEG
magick "{source}.png" "knowledge/Candidates/{Full Name}/headshot.jpeg"
# HEIC to JPEG
magick "{source}.heic" "knowledge/Candidates/{Full Name}/headshot.jpeg"
```

If headshots exist in both locations, prefer the Downloads folder version (more
likely to be a curated, high-quality photo).

## Step 3: Determine Pipeline Status

Assign a status based on the email context:

| Status             | Signal                                                |
| ------------------ | ----------------------------------------------------- |
| `new`              | CV/profile received, no response yet                  |
| `screening`        | Under review, questions asked about the candidate     |
| `first-interview`  | First interview scheduled or completed                |
| `second-interview` | Second interview scheduled or completed               |
| `work-trial`       | Paid work trial or assessment project in progress     |
| `offer`            | Offer extended                                        |
| `hired`            | Accepted and onboarding                               |
| `rejected`         | Explicitly passed on ("not a fit", "pass", "decline") |
| `withdrawn`        | Candidate withdrew from the process                   |
| `on-hold`          | Paused, waiting on notice period, or deferred         |

**Default to `new`** if no response signals are found. Read the full thread
chronologically to determine the most recent status.

### Status Advancement Signals

Look for these patterns in the hiring manager's replies:

- "let's schedule" / "set up an interview" → `first-interview`
- "second round" / "follow-up interview" → `second-interview`
- "work trial" / "assessment project" / "paid trial" → `work-trial`
- "not what we're looking for" / "pass" → `rejected`
- "candidate withdrew" / "no longer interested" / "accepted another offer" →
  `withdrawn`
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
**Title:** {professional title/function}
**Rate:** {rate or "—"}
**Availability:** {availability or "—"}
**English:** {level or "—"}
**Location:** {location or "—"}
**Gender:** {Woman / Man / —}
**Source:** [[Organizations/{Agency}]] via [[People/{Recruiter Name}]]
**Status:** {pipeline status}
**First seen:** {date profile was shared, YYYY-MM-DD}
**Last activity:** {date of most recent thread activity, YYYY-MM-DD}
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
{comma-separated skill tags}

## Interview Notes
{interview feedback, structured by date — omit section if no interviews yet}

## Notes
{free-form observations — always present, even if empty}
```

If a CV attachment exists, **copy it into the candidate directory** before
writing the note.

If no CV attachment exists, omit the `## CV` section entirely.

### Extra Info Fields

Place any of these **after Last activity** in the order shown, only when
available:

```markdown
**Role:** {internal requisition profile, e.g. "Staff Engineer"}
**Req:** {requisition ID — backlink to Role file, e.g. "[[Roles/4950237 — PSE Forward Deployed|4950237]]"}
**Channel:** {hr / vendor}
**Hiring manager:** {[[People/{name}]] or "—"}
**Domain lead:** {[[People/{name}]] or "—"}
**Internal/External:** {Internal / External / External (Prior Worker)}
**Model:** {engagement model, e.g. "B2B (via Agency) — conversion to FTE not possible"}
**Current title:** {current job title and employer}
**Email:** {personal or work email}
**Phone:** {phone number}
**LinkedIn:** {LinkedIn profile URL}
**Also known as:** {alternate name spellings}
```

When a `Req` is known, the value should backlink to the corresponding Role file
in `knowledge/Roles/`. Use the format:
`[[Roles/{filename without .md}|{req number}]] — {title}` for system reqs, or
`[[Roles/{filename without .md}|Vendor]] — {description}` for vendor pipeline
candidates.

### Additional Sections

Some candidates accumulate richer profiles over time. These optional sections go
**after Skills and before Notes**, in this order:

1. `## Education` — degrees, institutions, years
2. `## Certifications` — professional certifications
3. `## Work History` — chronological career history (when extracted from CV)
4. `## Key Facts` — notable bullet points from CV review
5. `## Interview Notes` — structured by date as `### YYYY-MM-DD — {description}`

`## Notes` is always the **last section**. If an `## Open Items` section exists
(pending questions or follow-ups), place it after Notes.

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

| If you add...            | Then also add...                                         |
| ------------------------ | -------------------------------------------------------- |
| Candidate → Organization | Organization → Candidate                                 |
| Candidate → Recruiter    | Recruiter → Candidate (in Activity section)              |
| Candidate → Project      | Project → Candidate (in People section)                  |
| Candidate → Role         | Role → Candidate (in Candidates table — rebuilt by sync) |

Use absolute paths: `[[Candidates/Name/brief|Name]]`,
`[[Organizations/Agency]]`, `[[People/Recruiter]]`.

**Important:** Only add backlinks to Organization/People/Project notes if they
don't already reference the candidate. Check before editing.

## Step 7: Update Graph State

After processing each email thread, mark it as processed:

```bash
node .claude/skills/extract-entities/scripts/state.mjs update "{file_path}"
```

This uses the same state file as `extract-entities`, so threads processed here
won't be re-scanned by either skill (unless the file changes).

## Step 8: Tag Skills with Framework IDs

When a candidate's email or CV mentions technical skills, map them to the
engineering framework using `fit-pathway`:

```bash
bunx fit-pathway skill --list
```

Use framework skill IDs (e.g. `data_integration`, `full_stack_development`,
`architecture_and_design`) in the **Skills** section of the candidate brief
instead of free-form tags. This enables consistent cross-candidate comparison.

If a candidate has a CV attachment, flag them for the `screen-cv` skill which
produces a framework-aligned screening assessment.

## Quality Checklist

- [ ] Scanned all new/changed email threads for recruitment signals
- [ ] Extracted all candidates found (check attachment directories too)
- [ ] Each candidate has a complete note with all available fields
- [ ] Info fields are in standard order (Title, Rate, Availability, English,
      Location, Gender, Source, Status, First seen, Last activity, then extras)
- [ ] Sections are in standard order (Info → Summary → CV → Connected to →
      Pipeline → Skills → Education/Certifications/Work History/Key Facts →
      Interview Notes → Notes → Open Items)
- [ ] CV paths are correct and point to actual files
- [ ] Pipeline status reflects the latest thread activity
- [ ] Timeline entries are in chronological order
- [ ] Used `[[absolute/path]]` links throughout
- [ ] Bidirectional links are consistent
- [ ] Graph state updated for all processed threads
- [ ] No duplicate candidate notes created
- [ ] Key strategic insights added to `Insights.md` where warranted
- [ ] Skills tagged using framework skill IDs where possible
- [ ] Gender field populated only from explicit pronouns/titles (never
      name-inferred)
- [ ] Channel field set on every candidate (`hr` or `vendor`)
- [ ] Hiring manager and Domain lead populated via cross-source inference where
      determinable
- [ ] Req field backlinks to corresponding Role file in `knowledge/Roles/`
- [ ] Connected to section includes backlink to Role file
- [ ] Role files have up-to-date Candidates tables (rebuilt by Step 0b)
- [ ] Headshots searched in email attachments and `~/Downloads/` (recursive)
- [ ] Found headshots copied as `headshot.jpeg` into candidate directory
