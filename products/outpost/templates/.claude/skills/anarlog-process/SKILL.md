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

- Anarlog installed. Meetings live in its local SQLite database (`app.db`).
  Read them only through Anarlog's typed, read-only interfaces (per its own
  `AGENTS.md`): prefer the **Anarlog MCP tools** (`get_meeting`,
  `get_meeting_transcript`) when connected, else the **bundled `anarlog-cli`**
  with `--json`. Never `grep`, crawl `sessions/`, or query SQLite directly.
- The user identity. The `person-identify` skill writes it to
  `~/.cache/fit/outpost/state/identity.md`.

## Inputs

- Meetings, read through `anarlog-cli` (`meetings list` / `get` /
  `transcript`) — see [references/sessions.md](references/sessions.md) for the
  CLI contract, content shapes, and skip rules. Older installs without the CLI
  fall back to flat files under
  `~/Library/Application Support/anarlog/sessions/{uuid}/`.
- `~/.cache/fit/outpost/state/graph_processed` — processed index (TSV, shared
  with `extract-entities`). New meetings key as `anarlog://{id}`. Legacy
  flat-file sessions keep their file-path keys and are never reprocessed.
- `~/.cache/fit/outpost/state/identity.md` — user identity for self-exclusion
  (the `person-identify` skill writes it).

## Outputs

- `Knowledge/People/`, `Knowledge/Organizations/`, `Knowledge/Projects/`,
  `Knowledge/Topics/` — created or updated.
- `Knowledge/Priorities/` — **updated only**, never
  auto-created.
- `Knowledge/Candidates/{Name}/transcript-{date}.md` — created for interview
  sessions (verbatim transcript; the input `req-assess` waits on).
- `~/.cache/fit/outpost/state/graph_processed` — updated.

<do_confirm_checklist goal="Verify each session was processed correctly">

- [ ] Skip the empty, test, and onboarding sessions (per the skip rules).
- [ ] Read both the note and the summary (when present). Consult the
      transcript only for disambiguation.
- [ ] Apply the "Would I prep?" test to each person. Exclude the user.
- [ ] Write interview sessions to `Knowledge/Candidates/`. Never write them
      to `Knowledge/People/`.
- [ ] Write a verbatim `transcript-{date}.md` for each interview session
      (skip when that date's file already exists).
- [ ] Use an absolute path in every link (`[[Folder/Name]]`).
- [ ] Describe the relationship in each activity entry. Leave out the
      communication method.
- [ ] Auto-create no new `Priorities/` note (the user sets these). Update the
      progress on every priority the content references.
- [ ] Update `graph_processed` for every processed meeting (`scan.mjs mark`).

</do_confirm_checklist>

## Procedure

### 0. Set up

Read the user's identity from `~/.cache/fit/outpost/state/identity.md` (run the
`person-identify` skill first if it is missing or stale). Scan unprocessed
meetings:

```bash
node .claude/skills/anarlog-process/scripts/scan.mjs
```

The scan reads meetings through `anarlog-cli` (bulk enumerate-and-hash has no
MCP equivalent), so it finds every meeting — even ones not yet exported to
flat files. Each row prints the meeting `id` for Steps 2 and 6.

Flags: `--changed` (re-check changed note/summary content), `--json`,
`--count`, `--limit N` (default 20), `--legacy` (force the flat-file
fallback); `cli-path` prints the resolved `anarlog-cli` binary.

A meeting needs processing when it has a substantive note or summary and
`graph_processed` has no `anarlog://{id}` record for it (or, with `--changed`,
its content hash differs). Already-processed flat-file sessions stay frozen.
Without `anarlog-cli`, the scan falls back to flat files automatically.

Process all unprocessed meetings in one run. **Don't write bespoke scan
scripts or query the database directly.** This script drives the supported
CLI and handles the edge cases.

### 1. Build the knowledge index

```bash
ls Knowledge/People/ Knowledge/Organizations/ Knowledge/Projects/ \
   Knowledge/Topics/ Knowledge/Priorities/ \
   Knowledge/Conditions/ 2>/dev/null
```

Read each note's header to build a mental index of known entities (same approach
as `extract-entities` Step 0).

### 2. Read each meeting

For each unprocessed meeting, prefer the MCP tool:
`get_meeting({ meeting_id: id })`. Fall back to the CLI (already resolved by
`scan.mjs`) when the MCP server is not connected:

```bash
CLI="$(node .claude/skills/anarlog-process/scripts/scan.mjs cli-path)"
"$CLI" --json meetings get {id}
```

This returns `note.markdown` (the user's own notes — high signal),
`summaries[].markdown` (the AI summary — usually the richest source),
`participants`, and `action_items`. Read the note and the summary. Pull the
transcript only when disambiguation requires it — MCP
`get_meeting_transcript({ meeting_id: id, offset: 0, limit: 200 })`, or CLI
`"$CLI" --json meetings transcript {id} --limit 200 --offset 0`.

**Exception — interview sessions:** once Step 3 classifies a meeting as an
interview, fetch the transcript **in full**: page with `offset`/`next_offset`
until a short page and concatenate `data.text`. This is persistence, not
extraction — Step 4 stays note/summary-only; Step 5 writes it verbatim.

MCP/CLI contract, content shapes, and skip rules:
[references/sessions.md](references/sessions.md). In `--legacy` mode, read the
`memoPath` / `summaryPath` files the scan reported instead (legacy
`transcript.json` is already complete — no pagination needed).

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

For interview sessions, also write the full transcript from Step 2 to
`Knowledge/Candidates/{Name}/transcript-{date}.md`: verbatim, no frontmatter,
speaker turns labeled by channel (`0` = user, `1` = other — cross-check
against `participants` when ambiguous). `{date}` is the meeting's
`started_at` (fall back to `created_at`), `YYYY-MM-DD`. Skip the write when
that date's file already exists. The file is pure persistence for
`req-assess`; never mine it for entities.

Verify bidirectional links per `extract-entities` Step 10 (Project ↔ Priority).

### 6. Update graph state

Mark each processed meeting so the scan does not pick it up again. This
records its `anarlog://{id}` content hash in `graph_processed`:

```bash
node .claude/skills/anarlog-process/scripts/scan.mjs mark {id} [{id}…]
```

Pass every meeting you processed in one call. If the scan ran in `--legacy`
mode, instead mark the flat files it reported:
`extract-entities/scripts/state.mjs update <memoPath> <summaryPath>`.
