---
name: extract-entities
description: Process synced email/calendar files from ~/.cache/fit/outpost/ and ad-hoc document files (e.g. from ~/Desktop/ or ~/Downloads/). Extract structured knowledge into the tier directories as Obsidian-compatible markdown notes. Use on a schedule, when the user asks to process/extract entities, or when another skill invokes it (e.g. organize-files). Builds the core knowledge graph from raw data.
---

# Extract Entities

Write tier: `3-Team` (general entities); `2-Confidential` (Candidates,
Prospects, Roles, Erasure) Frontmatter: person, organization, project, topic,
priority, condition

Process synced email and calendar files from `~/.cache/fit/outpost/`, plus
ad-hoc documents from other skills, into Obsidian-compatible markdown notes
in the tier directories. This skill builds the core knowledge graph.

## Trigger

- The schedule runs every 15 minutes for synced data.
- The user asks to process / extract entities from synced data.
- Another skill passes ad-hoc file paths (e.g. `organize-files` after it
  organises `~/Desktop/` and `~/Downloads/`).

## Prerequisites

- Synced data in `~/.cache/fit/outpost/` and/or ad-hoc paths.
- User identity from the `person-identify` skill. That skill writes
  `~/.cache/fit/outpost/state/identity.md` (Name, Email, Domain).

## Inputs

- `~/.cache/fit/outpost/apple_mail/*.md`,
  `~/.cache/fit/outpost/apple_calendar/*.json`,
  `~/.cache/fit/outpost/teams_chat/*.md`.
- Ad-hoc paths: `.pdf`, `.txt`, `.md`, `.rtf`, `.doc`, `.docx`, `.csv`, `.xlsx`.
- `~/.cache/fit/outpost/state/graph_processed` — processed-file index (TSV,
  shared with `req-track` and `anarlog-process`).
- `~/.cache/fit/outpost/state/identity.md` — user identity for self-exclusion
  (the `person-identify` skill writes it).

## Outputs

- `3-Team/People/`, `3-Team/Organizations/`, `3-Team/Projects/`,
  `3-Team/Topics/` — created or updated.
- `3-Team/Priorities/` — **updated only**, never auto-created.
- `3-Team/Conditions/` — created when you detect cross-cutting patterns, or
  updated.
- `2-Confidential/Roles/*.md`, `2-Confidential/Candidates/*/brief.md` — enriched
  with inferred metadata. Create new role stubs with `**Status:** open`. Update
  to `**Status:** closed` when a role closes.
- `~/.cache/fit/outpost/state/graph_processed` — updated.

<do_confirm_checklist goal="Verify the batch produced clean, linked,
well-grounded notes">

- [ ] Identify the source type correctly. Apply the meeting-vs-email rules
      (meetings create, emails only update).
- [ ] Exclude yourself and `@user.domain` from the extraction.
- [ ] Apply the "Would I prep?" test. Write no stub profiles. Give every new
      People note a substantive `## Summary`. Route calendar-only attendees to
      the Organization `## Contacts` section.
- [ ] Use tier-prefixed absolute paths (`[[3-Team/People/Name]]`) for all
      links. Keep bidirectional links consistent (incl. Project ↔ Priority).
- [ ] Describe the relationship in each summary. Omit the communication
      method. Make key facts substantive. Make open items commitments.
- [ ] Log state changes with `[Field → value]`. Never auto-create a Priority
      entity.
- [ ] Create a Condition only when ≥ 3 entities reference the same
      cross-cutting state. Detect resolution when the evidence supports it.
- [ ] Recruitment: detect Req numbers and create or enrich Role files. Infer
      HM/recruiter/domain-lead where the evidence strongly supports it.
- [ ] Update `graph_processed` for every processed file.

</do_confirm_checklist>

## Procedure

Process **10 files per run**. Write **one file at a time**. Do not batch
writes.

### 0. Load context and pick the batch

Read the user's identity from `~/.cache/fit/outpost/state/identity.md`. Run the
`person-identify` skill first if the file is missing or stale. Find new or
changed files:

```bash
node scripts/state.mjs check
```

Each line is a path. When another skill gives you ad-hoc paths, process those
directly. Do not scan `~/.cache/fit/outpost/`. Still check each path against
`graph_processed`. Skip a path when its hash did not change.

### 1. Build the knowledge index

```bash
find 3-Team/People 3-Team/Organizations 3-Team/Projects 3-Team/Topics \
     3-Team/Priorities 3-Team/Conditions -name "*.md" 2>/dev/null
```

Run `head -20` on each note to capture the key fields. Build a mental index of
People, Organizations, Projects, Priorities, Topics by name, email,
organization, role, status, and aliases.

### 2. Classify the source

Find the type-detection rules, the skip rules, the warm-intro exception, and
the source-type summary in [references/sources.md](references/sources.md).

### 3. Read and parse the source

- **Emails:** Date, Subject, From, To/Cc, Thread ID, Body.
- **Meetings:** Date, Attendees, Transcript / Notes.
- **Ad-hoc documents:** Date (file mtime), Filename, Source path, Content. Read
  `.md`, `.txt`, and `.rtf` direct. Read `.pdf` with `pdftotext` or `mdcat`.
  Read `.csv` as-is and look for names, emails, or orgs in the columns. Read
  `.doc` and `.docx` with `textutil -convert txt`.

Ad-hoc documents follow **meeting** rules (can create notes).

Exclude yourself per
[references/sources.md](references/sources.md#self-exclusion).
Collect every name variant per
[references/resolution.md](references/resolution.md#name-variant-collection).

### 4. Resolve entities

For each variant, search the knowledge index. Apply the
[matching table](references/resolution.md#matching) and the
[disambiguation priority](references/resolution.md#disambiguation-priority).
Priorities are
[never auto-created](references/resolution.md#never-auto-create). Link to
existing entries only.

### 5. Identify new entities (meetings only)

Apply the
["Would I prep?" test](references/resolution.md#would-i-prep-for-this-person--step-5)
and the [role inference rules](references/resolution.md#role-inference). For
contacts who don't merit their own note, add them to the Organization's
`## Contacts` section.

### 6. Extract content

Find the rules for decisions, commitments, key facts, open items, activity
lines, and summaries in [references/content.md](references/content.md). Be
substantive. Never write filler or meta-commentary.

### 7. Detect state changes and structural enrichment

- **State changes** (Project status, open-item resolution, role / title changes,
  relationship changes): see the tables in
  [references/content.md](references/content.md#state-change-tables). Be
  conservative. Log inline `[Field → value]`.
- **Recruitment** (Req-number detection, hiring-manager / recruiter /
  domain-lead inference): see
  [references/recruitment.md](references/recruitment.md).
- **Priority links** (Step 7c): see the rules in
  [references/links.md](references/links.md#priorities-step-7c).
  **Never auto-create.**
- **Conditions** (cross-cutting states that affect ≥ 3 entities): see
  [references/conditions.md](references/conditions.md).

### 8. Check for duplicates

See [references/content.md](references/content.md#duplicate-check-step-8).
Skip same-day same-source activity entries. Dedupe key facts and open items.
Mark contradictions "(needs clarification)".

### 9. Write updates

For **new** entities, use the templates.
[references/TEMPLATES.md](references/TEMPLATES.md) indexes them.

For **existing** entities, never rewrite the file. Apply targeted edits:

- Add the new activity entry at the **top** of `## Activity` (reverse
  chronological).
- Update `Last seen`, and stamp frontmatter `updated` in the same edit.
- Add new key facts (skip duplicates).
- Update open items (mark completed, add new).
- Apply state changes to fields.

### 10. Ensure bidirectional links

After you write, verify that links go both ways. Use the
[bidirectional link rules](references/links.md#bidirectional-link-rules).

### 11. Update graph state

```bash
node scripts/state.mjs update "$FILE"
```

Run for every processed file. `req-track` and `anarlog-process` share the
state file. So neither skill scans the same input again.
