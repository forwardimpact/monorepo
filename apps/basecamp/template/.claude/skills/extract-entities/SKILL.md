---
name: extract-entities
description: Process synced email/calendar files from ~/.cache/fit/basecamp/ and ad-hoc document files (e.g. from ~/Desktop/ or ~/Downloads/) to extract structured knowledge into knowledge/ as Obsidian-compatible markdown notes. Use on a schedule, when the user asks to process/extract entities, or when invoked by another skill (e.g. organize-files). Builds the core knowledge graph from raw data.
---

# Extract Entities

Process synced email and calendar files from `~/.cache/fit/basecamp/` and
extract structured knowledge into `knowledge/` as Obsidian-compatible markdown
notes. This is the core knowledge graph builder — it transforms raw data from
the sync skills into actionable, linked notes.

Also accepts **ad-hoc document files** passed by other skills (e.g. the
**`organize-files`** skill passes documents found in `~/Desktop/` and
`~/Downloads/`).

## Trigger

Run this skill:

- On a schedule (every 15 minutes) for synced data
- When the user asks to process/extract entities from synced data
- When invoked by another skill with ad-hoc file paths (e.g.
  **`organize-files`** after organizing `~/Desktop/` and `~/Downloads/`)

## Prerequisites

- Synced data in `~/.cache/fit/basecamp/` (from `sync-apple-mail` or
  `sync-apple-calendar` skills), **and/or**
- Ad-hoc file paths provided by the calling skill or user
- User identity configured in `USER.md` (Name, Email, Domain)

## Inputs

### Synced data (scheduled processing)

- `~/.cache/fit/basecamp/apple_mail/*.md` — synced email threads
- `~/.cache/fit/basecamp/apple_calendar/*.json` — synced calendar events

### Ad-hoc files (from other skills or user)

- Arbitrary file paths passed as input (e.g.
  `~/Downloads/Documents/Proposal.pdf`, `~/Desktop/Meeting_Notes.md`)
- Supported formats: `.pdf`, `.txt`, `.md`, `.rtf`, `.doc`, `.docx`, `.csv`,
  `.xlsx`
- Typically provided by the **`organize-files`** skill after organizing
  `~/Desktop/` and `~/Downloads/`

### State tracking

- `~/.cache/fit/basecamp/state/graph_processed` — tracks which files have been
  processed (TSV)
- `USER.md` — user identity (Name, Email, Domain) for self-exclusion

## Outputs

- `knowledge/People/*.md` — person notes
- `knowledge/Organizations/*.md` — organization notes
- `knowledge/Projects/*.md` — project notes
- `knowledge/Topics/*.md` — topic notes
- `~/.cache/fit/basecamp/state/graph_processed` — updated with newly processed
  files

---

## Before Starting

1.  Read `USER.md` to get the user's name, email, and domain
2.  Find new/changed files to process:

         python3 scripts/state.py check

    This outputs one file path per line for all source files that are new or
    have changed since last processing.

### Ad-hoc file inputs

When invoked with ad-hoc file paths (e.g. by the **`organize-files`** skill),
process those files directly instead of scanning `~/.cache/fit/basecamp/`. Check
each file against `graph_processed` the same way — skip if the hash hasn't
changed.

**Process in batches of 10 files per run.**

## Step 0: Build Knowledge Index

Before processing, scan all existing notes to build an index:

```bash
find knowledge/People knowledge/Organizations knowledge/Projects knowledge/Topics -name "*.md" 2>/dev/null
```

For each note, extract key fields:

```bash
head -20 "knowledge/People/Sarah Chen.md"
```

Build a mental index:

```
PEOPLE:
| Name | Email | Organization | Role | Aliases |

ORGANIZATIONS:
| Name | Domain | Aliases |

PROJECTS:
| Name | Status | Aliases |

TOPICS:
| Name | Keywords | Aliases |
```

## Step 1: Determine Source Type and Filter

### Determine type

- Has `Meeting:` or `Attendees:` or `Transcript:` → **meeting** (can create
  notes)
- Has `From:` and `To:` or `Subject:` → **email** (can only update existing
  notes)
- Is in `Voice Memos/` folder → **voice memo** (can create notes)
- Is in `apple_calendar/` → **calendar event** (enrich existing notes only)
- Is an **ad-hoc document** (from `~/Desktop/`, `~/Downloads/`, or passed by
  another skill) → **document** (can create notes)

### Filter: Skip These Sources

**ALWAYS process — never skip:**

- Calendar events — always process regardless of whether attendees are internal
  or external. Internal-only meetings are valuable for enriching project and
  topic notes (meeting context, decisions, agenda items). Only skip all-day
  placeholder events with no attendees and no description (e.g. "Block", "OOO").

**SKIP entirely (don't process):**

- Newsletters (unsubscribe links, "View in browser", bulk sender indicators)
- Marketing emails (promotional language, no-reply senders)
- Automated notifications (GitHub, Jira, Slack, CI/CD, shipping updates)
- Spam or cold outreach from unknown senders with no existing relationship
- Product update emails, release notes, changelogs
- Social media notifications
- Receipts and order confirmations
- Calendar invite emails that are just logistics
- Mass emails (many recipients, mailing list headers)

**PROCESS (but only update existing notes):**

- Emails from people who already have notes in `knowledge/People/`
- Emails that reference existing projects or organizations

**PROCESS (can create new notes):**

- Meeting transcripts with external attendees
- Voice memos

**Exception — Warm Intros:** If an email is a warm introduction from someone who
has a note, AND they're introducing a new person, create a note for the
introduced person.

Warm intro signals:

- Subject contains "Intro:", "Introduction:", "Meet", "Connecting"
- Body contains "introduce you to", "want to connect", "meet [Name]"
- New person is CC'd

## Step 2: Read and Parse Source File

### For emails

Extract: Date, Subject, From, To/Cc, Thread ID, Body.

### For meetings

Extract: Date, Attendees, Transcript/Notes.

### For ad-hoc documents

Extract: Date (file modification date), Filename, Source path, Content.

- `.md`, `.txt`, `.rtf` — read directly
- `.pdf` — extract text (`pdftotext` or `mdcat` if available)
- `.csv` — read as-is, look for names/emails/orgs in columns
- `.doc`, `.docx` — extract text (`textutil -convert txt` on macOS)

Ad-hoc documents follow **meeting** rules: they **can create** new entity notes.

### 2a: Exclude Self

Never create or update notes for:

- The user (matches name, email, or @domain from `USER.md`)
- Anyone @{user.domain} (colleagues at user's company)

### 2b: Extract All Name Variants

Collect every way entities are referenced:

**People:** Full names, first names, last names, initials, email addresses,
roles/titles, pronouns with clear antecedents.

**Organizations:** Full names, short names, abbreviations, email domains.

**Projects:** Explicit names, descriptive references ("the pilot", "the deal").

## Step 3: Look Up Existing Notes

For each variant, search the knowledge index built in Step 0.

```bash
rg -l "Sarah Chen|sarah@acme.com" knowledge/
cat "knowledge/People/Sarah Chen.md"
```

**Matching criteria:**

| Source has               | Note has                 | Match if                  |
| ------------------------ | ------------------------ | ------------------------- |
| First name "Sarah"       | Full name "Sarah Chen"   | Same organization context |
| Email "sarah@acme.com"   | Email field              | Exact match               |
| Email domain "@acme.com" | Organization "Acme Corp" | Domain matches org        |
| Any variant              | Aliases field            | Listed in aliases         |

## Step 4: Resolve Entities to Canonical Names

Build a resolution map from every source reference to its canonical form:

```
RESOLVED:
- "Sarah Chen" → [[People/Sarah Chen]]
- "sarah@acme.com" → [[People/Sarah Chen]]
- "Acme" → [[Organizations/Acme Corp]]

NEW ENTITIES (meeting — create notes):
- "Jennifer" (CTO) → Create [[People/Jennifer]]

NEW ENTITIES (email — do NOT create):
- "Random Person" → Skip

AMBIGUOUS:
- "Mike" (no context) → Skip
```

**Disambiguation priority:** Email match > Organization context > Role match >
Aliases > Recency.

## Step 5: Identify New Entities (Meetings Only)

For entities not resolved to existing notes, apply the **"Would I prep for this
person?"** test:

**CREATE a note for:**

- Decision makers or key contacts at customers, prospects, partners
- Investors or potential investors
- Candidates being interviewed
- Advisors or mentors with ongoing relationships
- Introducers who connect you to valuable contacts

**DO NOT create notes for:**

- Transactional service providers (bank employees, support reps)
- One-time administrative contacts
- Large group meeting attendees you didn't interact with
- Assistants handling only logistics

For people who don't get their own note, add to the Organization note's
`## Contacts` section instead.

### Role Inference

If role is not explicit, infer from context:

- Organizer of cross-company meeting → likely senior or partnerships
- Technical questions → likely engineering
- Pricing questions → likely procurement or finance
- "I'll need to check with my team" → manager
- "I can make that call" → decision maker

Format: `**Role:** Product Lead (inferred from evaluation discussions)`

## Step 6: Extract Content

For each entity that has or will have a note, extract:

### Decisions

Signals: "We decided...", "We agreed...", "Let's go with...", "Approved",
"Confirmed"

### Commitments

Signals: "I'll...", "We'll...", "Can you...", "Please send...", "By Friday"
Extract: Owner, action, deadline, status (open).

### Key Facts

Extract **substantive** information only:

- Specific numbers (budget, team size, timeline)
- Preferences or working style
- Background information
- Technical requirements
- What was discussed or proposed

**NEVER include:** Meta-commentary about missing data, placeholder text, or data
quality observations. If no key facts exist, leave the section empty.

### Open Items

Include commitments and next steps only:

```markdown
- [ ] Send API documentation — by Friday
- [ ] Schedule follow-up call with CTO
```

**NEVER include:** "Find their email", "Add their role", "Research company
background"

### Activity Summary

One line per source:

```markdown
- **2025-01-15** (meeting): Kickoff for [[Projects/Acme Integration]]. [[People/David Kim]] needs API access.
```

Always use canonical names with absolute paths (`[[People/Name]]`,
`[[Organizations/Name]]`).

### Summary

2-3 sentences answering: "Who is this person and why do I know them?" Focus on
the relationship, not the communication method.

**Good:** "VP Engineering at [[Organizations/Acme Corp]] leading the
[[Projects/Acme Integration]] pilot." **Bad:** "Attendee on the scheduled
meeting (Aug 12, 2024)."

## Step 7: Detect State Changes

Review extracted content for signals that existing note fields need updating:

### Project Status Changes

| Signal                                | New Status |
| ------------------------------------- | ---------- |
| "approved" / "signed" / "green light" | active     |
| "on hold" / "pausing" / "delayed"     | on hold    |
| "cancelled" / "not proceeding"        | cancelled  |
| "launched" / "completed" / "shipped"  | completed  |
| "exploring" / "considering"           | planning   |

### Open Item Resolution

| Signal                       | Action          |
| ---------------------------- | --------------- |
| "Here's the X you requested" | Mark X complete |
| "I've sent the X"            | Mark X complete |
| "X is done" / "X is ready"   | Mark X complete |

Change `- [ ]` to `- [x]` with completion date.

### Role/Title Changes

- New title in email signature
- "I've been promoted to..."
- Different role than what's in the note

### Relationship Changes

- "I've joined [New Company]"
- "We signed the contract" → prospect → customer
- New email domain for known person

**Be conservative:** Only apply clear, unambiguous state changes. If uncertain,
add to activity log but don't change fields.

Log state changes in activity with `[Field → value]` notation:

```markdown
- **2025-01-20** (email): Leadership approved pilot. [Status → active]
```

## Step 8: Check for Duplicates

Before writing:

- Check activity log for existing entries on this date from this source
- Compare key facts against existing — skip duplicates
- Check open items — don't add same item twice
- If new info contradicts existing, note both versions with "(needs
  clarification)"

## Step 9: Write Updates

**Write one file at a time. Do not batch writes.**

### For NEW entities (meetings only)

Create the note file using the templates in
[references/TEMPLATES.md](references/TEMPLATES.md).

### For EXISTING entities

Read the current note, then apply targeted edits:

- Add new activity entry at the TOP of the Activity section (reverse
  chronological)
- Update Last seen date
- Add new key facts (if not duplicates)
- Update open items (mark completed, add new ones)
- Apply state changes to fields

Use precise edits — don't rewrite the entire file.

## Step 10: Ensure Bidirectional Links

After writing, verify links go both ways:

| If you add...          | Then also add...                             |
| ---------------------- | -------------------------------------------- |
| Person → Organization  | Organization → Person (in People section)    |
| Person → Project       | Project → Person (in People section)         |
| Project → Organization | Organization → Project (in Projects section) |

Always use absolute links: `[[People/Sarah Chen]]`,
`[[Organizations/Acme Corp]]`, `[[Projects/Acme Integration]]`.

## Step 11: Update Graph State

After processing each file, update the state:

    python3 scripts/state.py update "$FILE"

## Source Type Rules Summary

| Source Type             | Creates Notes?  | Updates Notes? | Detects State Changes? |
| ----------------------- | --------------- | -------------- | ---------------------- |
| Calendar event          | No              | Yes (always)   | Yes                    |
| Meeting                 | Yes             | Yes            | Yes                    |
| Voice memo              | Yes             | Yes            | Yes                    |
| Ad-hoc document         | Yes             | Yes            | Yes                    |
| Email (known contact)   | No              | Yes            | Yes                    |
| Email (unknown contact) | No (SKIP)       | No             | No                     |
| Email (warm intro)      | Yes (exception) | Yes            | Yes                    |

## Quality Checklist

Before completing, verify:

- [ ] Correctly identified source as meeting or email
- [ ] Applied correct rules (meetings create, emails only update)
- [ ] Excluded self and @user.domain from entity extraction
- [ ] Applied "Would I prep?" test to each person
- [ ] Used absolute paths `[[Folder/Name]]` in ALL links
- [ ] Summaries describe relationship, not communication method
- [ ] Key facts are substantive (no filler)
- [ ] Open items are commitments (no "find their email" tasks)
- [ ] State changes logged with `[Field → value]` notation
- [ ] Bidirectional links are consistent
- [ ] Graph state updated for processed files
