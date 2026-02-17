---
name: process-hyprnote
description: Process Hyprnote meeting sessions (memos, summaries, transcripts) into the knowledge graph. Extracts people, organizations, projects, and topics from AI-generated meeting summaries and user notes, creating or updating Obsidian-compatible notes in knowledge/. Use when the user asks to process meeting notes or after Hyprnote sessions.
---

# Process Hyprnote

Process meeting sessions from Hyprnote (a local AI meeting notes app) and
extract structured knowledge into `knowledge/`. Hyprnote records meetings,
transcribes them, and generates AI summaries. This skill reads that output and
feeds it into the knowledge graph — the same way `extract-entities` processes
emails and calendar events.

## Trigger

Run this skill:

- When the user asks to process meeting notes or Hyprnote sessions
- After new meetings have been recorded in Hyprnote
- When the user asks to update the knowledge base from recent meetings

## Prerequisites

- Hyprnote installed with session data at
  `~/Library/Application Support/hyprnote/sessions/`
- User identity configured in `USER.md`

## Inputs

- `~/Library/Application Support/hyprnote/sessions/{uuid}/` — session
  directories, each containing:
  - `_meta.json` — session metadata (title, created_at, participants)
  - `_memo.md` — user's markdown notes (YAML frontmatter + body)
  - `_summary.md` — AI-generated meeting summary (YAML frontmatter + body),
    optional
  - `transcript.json` — word-level transcript with speaker channels, optional
- `~/.cache/fit/basecamp/state/graph_processed` — tracks processed files (TSV)
- `USER.md` — user identity for self-exclusion

## Outputs

- `knowledge/People/*.md` — person notes (new or updated)
- `knowledge/Organizations/*.md` — organization notes (new or updated)
- `knowledge/Projects/*.md` — project notes (new or updated)
- `knowledge/Topics/*.md` — topic notes (new or updated)
- `~/.cache/fit/basecamp/state/graph_processed` — updated with processed session
  files

---

## Before Starting

1. Read `USER.md` to get the user's name, email, and domain.
2. List all session directories:

```bash
ls "$HOME/Library/Application Support/hyprnote/sessions/"
```

3. For each session, check if it needs processing by looking up its key files in
   the graph state:

```bash
grep -F "{file_path}" ~/.cache/fit/basecamp/state/graph_processed
```

A session needs processing if:

- Its `_memo.md` path is **not** in `graph_processed`, OR
- Its `_memo.md` hash has changed (compute SHA-256 and compare), OR
- Its `_summary.md` exists and is not in `graph_processed` or has changed

**Process all unprocessed sessions in one run** (typically few sessions).

## Step 0: Build Knowledge Index

Scan existing notes to avoid duplicates and resolve entities:

```bash
ls knowledge/People/ knowledge/Organizations/ knowledge/Projects/ knowledge/Topics/ 2>/dev/null
```

For each existing note, read the header fields to build a mental index of known
entities (same approach as `extract-entities` Step 0).

## Step 1: Read Session Data

For each unprocessed session, read files in this order:

### 1a. Read `_meta.json`

```json
{
  "created_at": "2026-02-16T13:01:59.187Z",
  "id": "7888363f-4cc6-4987-8470-92f386e5bdfc",
  "participants": [],
  "title": "Director-Level Hiring Pipeline",
  "user_id": "00000000-0000-0000-0000-000000000000"
}
```

Extract: **session date** (from `created_at`), **title**, **participants** (may
be empty — Hyprnote doesn't always populate this).

### 1b. Read `_memo.md`

YAML frontmatter (id, session_id) followed by the user's markdown notes.
Example:

```markdown
---
id: 213e0f78-a66a-468d-b8e5-bc3fbbe04bf4
session_id: 213e0f78-a66a-468d-b8e5-bc3fbbe04bf4
---

Chat with Sarah about the product roadmap.
```

The memo contains the user's own notes — names, observations, action items. This
is high-signal content; every name or observation here is intentional.

### 1c. Read `_summary.md` (if exists)

YAML frontmatter (id, position, session_id, title) followed by an AI-generated
meeting summary. This is the richest source — structured bullet points covering
topics discussed, decisions made, action items, and key details.

```markdown
---
id: 152d9bc9-0cdc-4fb2-9916-cb7670f3a6df
position: 1
session_id: 213e0f78-a66a-468d-b8e5-bc3fbbe04bf4
title: Summary
---

# Product Roadmap Review

- Both speakers reviewed the Q2 roadmap priorities...
```

### 1d. Read `transcript.json` (if exists, for disambiguation only)

The transcript is word-level with speaker channels:

```json
{
  "transcripts": [{
    "words": [
      {"channel": 0, "text": "Hello", "start_ms": 0, "end_ms": 500},
      {"channel": 1, "text": "Hi", "start_ms": 600, "end_ms": 900}
    ]
  }]
}
```

**Do NOT process the full transcript for entity extraction.** It's too noisy.
Only consult the transcript when you need to:

- Disambiguate a name mentioned in the summary or memo
- Confirm who said what (channel 0 = user, channel 1 = other speaker)
- Find context around a specific topic or decision

### 1e. Filter: Skip Empty Sessions

Skip sessions where:

- `_memo.md` body is empty or only contains `&nbsp;` / whitespace
- No `_summary.md` exists
- Title is empty or generic ("Hello", "Welcome to Hyprnote", "Test")

If a session has **either** a substantive memo **or** a `_summary.md`, process
it.

## Step 2: Classify Source

Hyprnote sessions are **meetings**. They follow meeting rules from
`extract-entities`:

- **CAN create** new People, Organization, Project, and Topic notes
- **CAN update** existing notes
- **CAN detect** state changes

Apply the same "Would I prep for this person?" test from `extract-entities` Step
5 when deciding whether to create a note for someone mentioned.

## Step 3: Extract Entities

Combine content from `_memo.md` and `_summary.md` (prefer summary when both
exist, as it's more detailed). Extract:

### People

Look for names in:

- Memo text ("chat with Sarah Chen", "interview with David Kim")
- Summary bullet points ("the user will serve as the senior engineer", "Alex
  from the platform team")
- Participant list in `_meta.json`

For each person:

- Resolve against knowledge index (Step 0)
- Extract role, organization, relationship to user
- Note what was discussed with/about them

### Organizations

- Explicit mentions ("Acme Corp", "TechCo", "Global Services")
- Inferred from people's roles or context

### Projects

- Explicit project names ("Customer Portal", "Q2 Migration")
- Described initiatives ("the hiring pipeline", "the product launch")

### Topics

- Recurring themes ("AI coding agents", "interview process", "architecture
  decisions")
- Only create Topic notes for subjects that span multiple meetings or are
  strategically important

### Self-exclusion

Never create or update notes for the user who matches name, email, or @domain
from `USER.md`.

**Exception for interview sessions:** If the session is clearly a job interview
(title or memo indicates "interview with {Name}"), the interviewee is a
**candidate** — create or update their note in `knowledge/Candidates/` instead
of `knowledge/People/`, following the candidate note template from
`track-candidates`.

## Step 4: Extract Content

For each entity that has or will have a note, extract from the session:

### Decisions

Signals in summaries: "decided", "agreed", "plan to", "established", "will serve
as"

### Commitments / Action Items

Signals: "will share", "plans to", "needs to", "to be created", "will upload"

Extract: Owner, action, deadline (if mentioned), status (open).

### Key Facts

- Specific numbers (headcount, budget, timeline)
- Preferences ("non-traditional backgrounds", "fusion of skills")
- Process details (interview stages, evaluation criteria)
- Strategic context (market trends, competitive landscape)

### Activity Summary

One line per session for each entity:

```markdown
- **2026-02-14** (meeting): Discussed hiring pipeline. 11 internal candidates,
plan to shortlist to 6-7. [[People/Sarah Chen]] managing the team.
```

### Interview Notes (for Candidates)

If the session is an interview, extract:

- Impressions and observations from the memo
- Technical assessment notes
- Strengths and concerns
- Any interview scoring or decisions

Add these to the candidate's `## Notes` section.

## Step 5: Write Updates

Follow the same patterns as `extract-entities` Steps 7-10:

### For NEW entities

Create notes using templates from
`.claude/skills/extract-entities/references/TEMPLATES.md`.

For **candidates** (interview sessions), use the candidate template from
`track-candidates` instead.

### For EXISTING entities

Apply targeted edits:

- Add new activity entry at the TOP of the Activity section
- Update Last seen / Last activity date
- Add new key facts (skip duplicates)
- Update open items (mark completed, add new)
- Apply state changes

**Use precise edits — don't rewrite the entire file.**

### Bidirectional links

Verify links go both ways (same rules as `extract-entities` Step 10). Always use
absolute paths: `[[People/Name]]`, `[[Organizations/Name]]`,
`[[Projects/Name]]`.

## Step 6: Update Graph State

After processing each session, mark its files as processed:

```bash
python3 .claude/skills/extract-entities/scripts/state.py update \
  "$HOME/Library/Application Support/hyprnote/sessions/{uuid}/_memo.md"

# Also mark _summary.md if it exists
python3 .claude/skills/extract-entities/scripts/state.py update \
  "$HOME/Library/Application Support/hyprnote/sessions/{uuid}/_summary.md"
```

This prevents reprocessing unless the files change.

## Quality Checklist

Before completing, verify:

- [ ] Skipped empty/test/onboarding sessions
- [ ] Read both `_memo.md` and `_summary.md` for each processed session
- [ ] Applied "Would I prep?" test to each person
- [ ] Excluded self and @user.domain from entity extraction
- [ ] Interview sessions created/updated Candidate notes (not People notes)
- [ ] Used absolute paths `[[Folder/Name]]` in ALL links
- [ ] Summaries describe relationship, not communication method
- [ ] Key facts are substantive (no filler)
- [ ] Open items are commitments (no meta-tasks)
- [ ] Bidirectional links are consistent
- [ ] Graph state updated for all processed session files
