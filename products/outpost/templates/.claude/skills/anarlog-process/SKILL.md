---
name: anarlog-process
description: Process Anarlog meeting sessions (memos, summaries, transcripts) into the knowledge graph. Extracts people, organizations, projects, and topics from AI-generated meeting summaries and user notes. Creates or updates Obsidian-compatible notes in Knowledge/. Use when the user asks to process meeting notes or after Anarlog sessions.
---

# Process Anarlog

Process meeting sessions from Anarlog (a local AI meeting-notes app) into the
knowledge graph. Anarlog records meetings, transcribes them, and generates AI
summaries. This skill reads that output and feeds it into `Knowledge/`.
`extract-entities` processes emails and calendar events in the same way.

## Trigger

- The user asks to process meeting notes or Anarlog sessions.
- Anarlog recorded new meetings.
- The user asks to update the knowledge base from recent meetings.

## Prerequisites

- Anarlog installed. Sessions live at
  `~/Library/Application Support/anarlog/sessions/`.
- The user identity. The `person-identify` skill writes it to
  `~/.cache/fit/outpost/state/identity.md`.

## Inputs

- `~/Library/Application Support/anarlog/sessions/{uuid}/` — see
  [references/sessions.md](references/sessions.md) for the file shape and skip
  rules.
- `~/.cache/fit/outpost/state/graph_processed` — processed-file index (TSV,
  shared with `extract-entities`).
- `~/.cache/fit/outpost/state/identity.md` — user identity for self-exclusion
  (the `person-identify` skill writes it).

## Outputs

- `Knowledge/People/`, `Knowledge/Organizations/`, `Knowledge/Projects/`,
  `Knowledge/Topics/` — created or updated.
- `Knowledge/Priorities/` — **updated only**, never
  auto-created.
- `~/.cache/fit/outpost/state/graph_processed` — updated.

<do_confirm_checklist goal="Verify each session was processed correctly">

- [ ] Skip the empty, test, and onboarding sessions (per the skip rules).
- [ ] Read both `_memo.md` and `_summary.md` (when present). Consult the
      transcript only for disambiguation.
- [ ] Apply the "Would I prep?" test to each person. Exclude the user.
- [ ] Write interview sessions to `Knowledge/Candidates/`. Never write them
      to `Knowledge/People/`.
- [ ] Use an absolute path in every link (`[[Folder/Name]]`).
- [ ] Describe the relationship in each activity entry. Leave out the
      communication method.
- [ ] Auto-create no new `Priorities/` note (the user sets these). Update the
      progress on every priority the content references.
- [ ] Update `graph_processed` for every processed file (memo + summary).

</do_confirm_checklist>

## Procedure

### 0. Set up

Read the user's identity from `~/.cache/fit/outpost/state/identity.md` (run the
`person-identify` skill first if it is missing or stale). Scan unprocessed
sessions:

```bash
node .claude/skills/anarlog-process/scripts/scan.mjs
```

Flags: `--changed` (also detect changed memo/summary hashes), `--json`
(programmatic output), `--count` (count only), `--limit N` (default 20).

Process a session when its `_memo.md` is not in `graph_processed`. Also process
it when the memo hash changed (`--changed`). Also process it when its
`_summary.md` exists and is not in `graph_processed`, or when the summary
changed.

Process all unprocessed sessions in one run. **Don't write bespoke scan
scripts.** This script handles the edge cases (empty memos, missing summaries,
metadata fallback).

### 1. Build the knowledge index

```bash
ls Knowledge/People/ Knowledge/Organizations/ Knowledge/Projects/ \
   Knowledge/Topics/ Knowledge/Priorities/ \
   Knowledge/Conditions/ 2>/dev/null
```

Read each note's header to build a mental index of known entities (same approach
as `extract-entities` Step 0).

### 2. Read each session

For each unprocessed session, read in this order: `_meta.json`, `_memo.md`,
`_summary.md` (if present), `transcript.json` (only when disambiguation requires
it). See [references/sessions.md](references/sessions.md) for the file shapes
and the skip rules.

### 3. Classify the source

Anarlog sessions are **meetings** and follow the meeting rules from
`extract-entities`:

- **Can create** People, Organization, Project, and Topic notes.
- **Can update** existing notes, including Priorities. The user sets a
  Priority. Nothing auto-creates one.
- **Can detect** state changes.

Apply the "Would I prep for this person?" test from `extract-entities` Step 5
before you create a person note.

### 4. Extract entities and content

Combine the memo and the summary content (prefer the summary when both exist).
The extraction signals live in
[references/extraction.md](references/extraction.md). They cover entity types,
decisions, commitments, key facts, the activity-line format, the interview-note
rules, and the linking rules.

### 5. Write updates

For **new** entities, use the templates in
`.claude/skills/extract-entities/references/TEMPLATES.md`. For interview
sessions, use the candidate brief template from `req-track` (under
`Knowledge/Candidates/`).

For **existing** entities, never rewrite the file. Apply targeted edits:

- Add the new activity entry at the **top** of `## Activity`.
- Update `Last seen` / `Last activity`.
- Add new key facts (skip duplicates).
- Update open items (mark completed, add new).
- Apply state changes.

Verify bidirectional links per `extract-entities` Step 10 (Project ↔ Priority).

### 6. Update graph state

For each processed session:

```bash
node .claude/skills/extract-entities/scripts/state.mjs update \
  "$HOME/Library/Application Support/anarlog/sessions/{uuid}/_memo.md"

node .claude/skills/extract-entities/scripts/state.mjs update \
  "$HOME/Library/Application Support/anarlog/sessions/{uuid}/_summary.md"
```

(Skip the summary call if `_summary.md` doesn't exist.)
