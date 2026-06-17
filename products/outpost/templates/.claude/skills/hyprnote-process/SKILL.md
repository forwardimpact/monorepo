---
name: hyprnote-process
description: Process Hyprnote meeting sessions (memos, summaries, transcripts) into the knowledge graph. Extracts people, organizations, projects, and topics from AI-generated meeting summaries and user notes, creating or updating Obsidian-compatible notes in knowledge/. Use when the user asks to process meeting notes or after Hyprnote sessions.
---

# Process Hyprnote

Process meeting sessions from Hyprnote (a local AI meeting-notes app) into the
knowledge graph. Hyprnote records meetings, transcribes them, and generates AI
summaries; this skill reads that output and feeds it into `knowledge/` — the
same way `extract-entities` processes emails and calendar events.

## Trigger

- The user asks to process meeting notes or Hyprnote sessions.
- New meetings have been recorded.
- The user asks to update the knowledge base from recent meetings.

## Prerequisites

- Hyprnote installed; sessions at
  `~/Library/Application Support/hyprnote/sessions/`.
- User identity from running the `identify-user` skill, which writes
  `~/.cache/fit/outpost/state/identity.md`.

## Inputs

- `~/Library/Application Support/hyprnote/sessions/{uuid}/` — see
  [references/sessions.md](references/sessions.md) for the file shape and skip
  rules.
- `~/.cache/fit/outpost/state/graph_processed` — processed-file index (TSV,
  shared with `extract-entities`).
- `~/.cache/fit/outpost/state/identity.md` — user identity for self-exclusion
  (written by the `identify-user` skill).

## Outputs

- `knowledge/People/`, `knowledge/Organizations/`, `knowledge/Projects/`,
  `knowledge/Topics/` — created or updated.
- `knowledge/Goals/`, `knowledge/Priorities/` — **updated only**, never
  auto-created.
- `~/.cache/fit/outpost/state/graph_processed` — updated.

<do_confirm_checklist goal="Verify each session was processed correctly">

- [ ] Empty / test / onboarding sessions skipped (per skip rules).
- [ ] Both `_memo.md` and `_summary.md` read (when present); transcript
      consulted only for disambiguation.
- [ ] "Would I prep?" test applied to each person; self excluded.
- [ ] Interview sessions wrote to `knowledge/Candidates/`, not
      `knowledge/People/`.
- [ ] All links use absolute paths `[[Folder/Name]]`.
- [ ] Activity entries describe relationship, not communication method.
- [ ] No new `Goals/` or `Priorities/` auto-created (user-set only); any
      referenced goal had its progress updated.
- [ ] `graph_processed` updated for every processed file (memo + summary).

</do_confirm_checklist>

## Procedure

### 0. Set up

Read the user's identity from `~/.cache/fit/outpost/state/identity.md` (run the
`identify-user` skill first if it is missing or stale). Scan unprocessed
sessions:

```bash
node .claude/skills/hyprnote-process/scripts/scan.mjs
```

Flags: `--changed` (also detect changed memo/summary hashes), `--json`
(programmatic output), `--count` (count only), `--limit N` (default 20).

A session needs processing when its `_memo.md` is not in `graph_processed`, or
its hash has changed (`--changed`), or its `_summary.md` exists and is not in
`graph_processed` (or has changed).

Process all unprocessed sessions in one run. **Don't write bespoke scan
scripts** — this script handles the edge cases (empty memos, missing summaries,
metadata fallback).

### 1. Build the knowledge index

```bash
ls knowledge/People/ knowledge/Organizations/ knowledge/Projects/ \
   knowledge/Topics/ knowledge/Goals/ knowledge/Priorities/ \
   knowledge/Conditions/ 2>/dev/null
```

Read each note's header to build a mental index of known entities (same approach
as `extract-entities` Step 0).

### 2. Read each session

For each unprocessed session, read in this order: `_meta.json`, `_memo.md`,
`_summary.md` (if present), `transcript.json` (only when disambiguation requires
it). File shapes and skip rules:
[references/sessions.md](references/sessions.md).

### 3. Classify the source

Hyprnote sessions are **meetings** and follow the meeting rules from
`extract-entities`:

- **Can create** People, Organization, Project, and Topic notes.
- **Can update** existing notes — including Goals and Priorities, which are
  user-set and never auto-created.
- **Can detect** state changes.

Apply the "Would I prep for this person?" test from `extract-entities` Step 5
before creating a person note.

### 4. Extract entities and content

Combine memo and summary content (prefer summary when both exist). Extraction
signals — entity types, decisions, commitments, key facts, activity-line format,
interview-note rules, and linking rules — live in
[references/extraction.md](references/extraction.md).

### 5. Write updates

For **new** entities, use the templates in
`.claude/skills/extract-entities/references/TEMPLATES.md`. For interview
sessions, use the candidate brief template from `req-track` (under
`knowledge/Candidates/`).

For **existing** entities, apply targeted edits — never rewrite the file:

- Add the new activity entry at the **top** of `## Activity`.
- Update `Last seen` / `Last activity`.
- Add new key facts (skip duplicates).
- Update open items (mark completed, add new).
- Apply state changes.

Verify bidirectional links per `extract-entities` Step 10 (Goal ↔ Project, Goal
↔ Priority, Project ↔ Priority).

### 6. Update graph state

For each processed session:

```bash
node .claude/skills/extract-entities/scripts/state.mjs update \
  "$HOME/Library/Application Support/hyprnote/sessions/{uuid}/_memo.md"

node .claude/skills/extract-entities/scripts/state.mjs update \
  "$HOME/Library/Application Support/hyprnote/sessions/{uuid}/_summary.md"
```

(Skip the summary call if `_summary.md` doesn't exist.)
