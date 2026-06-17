---
name: extract-entities
description: Process synced email/calendar files from ~/.cache/fit/outpost/ and ad-hoc document files (e.g. from ~/Desktop/ or ~/Downloads/) to extract structured knowledge into knowledge/ as Obsidian-compatible markdown notes. Use on a schedule, when the user asks to process/extract entities, or when invoked by another skill (e.g. organize-files). Builds the core knowledge graph from raw data.
---

# Extract Entities

Process synced email and calendar files from `~/.cache/fit/outpost/`, plus
ad-hoc documents passed by other skills, into Obsidian-compatible markdown notes
under `knowledge/`. The core knowledge-graph builder.

## Trigger

- Schedule (every 15 minutes) for synced data.
- The user asks to process / extract entities from synced data.
- Another skill passes ad-hoc file paths (e.g. `organize-files` after organising
  `~/Desktop/` and `~/Downloads/`).

## Prerequisites

- Synced data in `~/.cache/fit/outpost/` and/or ad-hoc paths.
- User identity from running the `identify-user` skill, which writes
  `~/.cache/fit/outpost/state/identity.md` (Name, Email, Domain).

## Inputs

- `~/.cache/fit/outpost/apple_mail/*.md`,
  `~/.cache/fit/outpost/apple_calendar/*.json`,
  `~/.cache/fit/outpost/teams_chat/*.md`.
- Ad-hoc paths: `.pdf`, `.txt`, `.md`, `.rtf`, `.doc`, `.docx`, `.csv`, `.xlsx`.
- `~/.cache/fit/outpost/state/graph_processed` — processed-file index (TSV,
  shared with `req-track` and `hyprnote-process`).
- `~/.cache/fit/outpost/state/identity.md` — user identity for self-exclusion
  (written by the `identify-user` skill).

## Outputs

- `knowledge/People/`, `knowledge/Organizations/`, `knowledge/Projects/`,
  `knowledge/Topics/` — created or updated.
- `knowledge/Goals/`, `knowledge/Priorities/` — **updated only**, never
  auto-created.
- `knowledge/Conditions/` — created when cross-cutting patterns are detected, or
  updated.
- `knowledge/Roles/`, `knowledge/Candidates/*/brief.md` — enriched with inferred
  metadata.
- `~/.cache/fit/outpost/state/graph_processed` — updated.

<do_confirm_checklist goal="Verify the batch produced clean, linked,
well-grounded notes">

- [ ] Source type correctly identified; meeting-vs-email rules applied (meetings
      create, emails only update).
- [ ] Self and `@user.domain` excluded from extraction.
- [ ] "Would I prep?" test applied; no stub profiles — every new People note has
      a substantive `## Summary`, calendar-only attendees routed to Organization
      `## Contacts`.
- [ ] All links use absolute paths `[[Folder/Name]]`; bidirectional links
      consistent (incl. Goal ↔ Project, Priority ↔ Goal).
- [ ] Summaries describe relationship, not communication method; key facts are
      substantive; open items are commitments.
- [ ] State changes logged with `[Field → value]`; no Goal or Priority entities
      auto-created.
- [ ] Conditions created only when ≥ 3 entities reference the same cross-cutting
      state; resolution detected when evidence supports.
- [ ] Recruitment: Req numbers detected and Role files created/enriched;
      HM/recruiter/domain-lead inferred where strongly supported.
- [ ] `graph_processed` updated for every processed file.

</do_confirm_checklist>

## Procedure

Process **10 files per run**. Write **one file at a time** — do not batch
writes.

### 0. Load context and pick the batch

Read the user's identity from `~/.cache/fit/outpost/state/identity.md` (run the
`identify-user` skill first if it is missing or stale). Find new/changed files:

```bash
node scripts/state.mjs check
```

Each line is a path. When invoked with ad-hoc paths, process those directly
instead of scanning `~/.cache/fit/outpost/` — still check each against
`graph_processed` and skip when the hash hasn't changed.

### 1. Build the knowledge index

```bash
find knowledge/People knowledge/Organizations knowledge/Projects \
     knowledge/Topics knowledge/Goals knowledge/Priorities \
     knowledge/Conditions -name "*.md" 2>/dev/null
```

For each note, `head -20` to capture key fields. Build a mental index of People,
Organizations, Projects, Goals, Priorities, Topics by name, email, organization,
role, status, and aliases.

### 2. Classify the source

Type detection, skip rules, warm-intro exception, and the source-type rules
summary: [references/sources.md](references/sources.md).

### 3. Read and parse the source

- **Emails:** Date, Subject, From, To/Cc, Thread ID, Body.
- **Meetings:** Date, Attendees, Transcript / Notes.
- **Ad-hoc documents:** Date (file mtime), Filename, Source path, Content. `.md`
  / `.txt` / `.rtf` direct; `.pdf` via `pdftotext` or `mdcat`; `.csv` as-is
  (look for names / emails / orgs in columns); `.doc` / `.docx` via
  `textutil -convert txt`.

Ad-hoc documents follow **meeting** rules (can create notes).

Exclude self per [references/sources.md](references/sources.md#self-exclusion).
Collect every name variant per
[references/resolution.md](references/resolution.md#name-variant-collection).

### 4. Resolve entities

For each variant, search the knowledge index. Apply the
[matching table](references/resolution.md#matching) and the
[disambiguation priority](references/resolution.md#disambiguation-priority).
Goals and Priorities are
[never auto-created](references/resolution.md#never-auto-create) — link to
existing entries only.

### 5. Identify new entities (meetings only)

Apply the
["Would I prep?" test](references/resolution.md#would-i-prep-for-this-person--step-5)
and the [role inference rules](references/resolution.md#role-inference). For
contacts who don't merit their own note, add to the Organization's `## Contacts`
section.

### 6. Extract content

Decisions, commitments, key facts, open items, activity lines, summaries:
[references/content.md](references/content.md). Be substantive; never write
filler or meta-commentary.

### 7. Detect state changes and structural enrichment

- **State changes** (Project status, open-item resolution, role / title changes,
  relationship changes): tables in
  [references/content.md](references/content.md#state-change-tables). Be
  conservative; log inline `[Field → value]`.
- **Recruitment** (Req-number detection, hiring-manager / recruiter /
  domain-lead inference):
  [references/recruitment.md](references/recruitment.md).
- **Goal & Priority links** (Step 7c): rules in
  [references/links.md](references/links.md#goals-step-7c) and
  [Priorities](references/links.md#priorities-step-7c). **Never auto-create.**
- **Conditions** (cross-cutting states affecting ≥ 3 entities):
  [references/conditions.md](references/conditions.md).

### 8. Check for duplicates

[references/content.md](references/content.md#duplicate-check-step-8) — skip
same-day same-source activity entries, dedupe key facts and open items, mark
contradictions "(needs clarification)".

### 9. Write updates

For **new** entities, use the templates indexed by
[references/TEMPLATES.md](references/TEMPLATES.md).

For **existing** entities, apply targeted edits — never rewrite the file:

- Add the new activity entry at the **top** of `## Activity` (reverse
  chronological).
- Update `Last seen`.
- Add new key facts (skip duplicates).
- Update open items (mark completed, add new).
- Apply state changes to fields.

### 10. Ensure bidirectional links

After writing, verify links go both ways using the
[bidirectional link rules](references/links.md#bidirectional-link-rules).

### 11. Update graph state

```bash
node scripts/state.mjs update "$FILE"
```

Run for every processed file. The state file is shared with `req-track` and
`hyprnote-process`, so this prevents either skill from re-scanning the same
input.
