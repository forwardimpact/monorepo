---
name: req-track
description: Scan synced email threads for recruitment candidates, extract structured profiles, and create/update notes in 2-Confidential/Candidates/. Use when the user asks to track candidates, process recruitment emails, or update the hiring pipeline.
---

# Track Candidates

Write tier: `2-Confidential`
Frontmatter: candidate

Scan synced email threads from `~/.cache/fit/outpost/apple_mail/` for
recruitment candidates. Extract structured candidate profiles and create or
update notes in `2-Confidential/Candidates/`.

## Trigger

- The user asks to track, process, or update candidates.
- The user asks about recruitment pipeline status.
- After `sync-apple-mail` pulls new threads.

## Prerequisites

- Synced email data in `~/.cache/fit/outpost/apple_mail/` (from
  `sync-apple-mail`).
- User identity — run the `person-identify` skill to populate
  `~/.cache/fit/outpost/state/identity.md`.

## Inputs

- `~/.cache/fit/outpost/apple_mail/*.md` — synced email threads.
- `~/.cache/fit/outpost/apple_mail/attachments/` — CV/resume attachments.
- `~/.cache/fit/outpost/apple_calendar/*.json` — calendar events (for
  cross-source inference).
- `2-Confidential/Roles/*.md` — role/requisition files (check the
  `**Status:**` field: `open` for active roles, `closed` for historical).
- `~/.cache/fit/outpost/state/graph_processed` — processed-file index (shared
  with `extract-entities`).
- `~/.cache/fit/outpost/state/identity.md` — user identity for self-exclusion
  (the `person-identify` skill writes it).

## Outputs

- `2-Confidential/Candidates/{Full Name}/brief.md` — candidate profile note.
- `2-Confidential/Candidates/{Full Name}/CV.pdf` (or `CV.docx`) — local CV.
- `2-Confidential/Candidates/{Full Name}/headshot.jpeg` — candidate photo.
- `2-Confidential/Roles/*.md` — role files created or updated. The
  `**Status:**` field determines visibility (open/closed).
- `~/.cache/fit/outpost/state/graph_processed` — updated with processed threads.

<do_confirm_checklist goal="Verify candidate processing batch is complete and
correct">

- [ ] Frontmatter (`type`, `created`, `updated`, `aliases`, registry `status`)
      and the required Info fields present on every brief.
- [ ] Pipeline status reflects the latest thread activity. Timeline in
      chronological order.
- [ ] Backlinks land on `2-Confidential` overlay notes, never on `3-Team`
      notes.
- [ ] Role files synced. Candidates tables rebuilt. Stubs created for any
      unknown reqs.
- [ ] CV and headshot copied into the candidate directory when available.
- [ ] Skills tagged with agent-aligned engineering standard IDs from
      `bunx fit-pathway skill --list`.
- [ ] Gender field populated only from explicit pronouns or titles.
- [ ] No duplicate candidate notes. All processed threads marked in the state
      file.

</do_confirm_checklist>

## Procedure

Process **10 files per run**.

### 1. Load context and pick the batch

Read the user's name, email, and domain from
`~/.cache/fit/outpost/state/identity.md`. Run the `person-identify` skill first
if that file is missing or stale. List new or changed source files:

```bash
node .claude/skills/extract-entities/scripts/state.mjs check
```

Filter the output to `apple_mail/*.md` only. Calendar files are not relevant
here.

### 2. Build candidate, people, and org indexes

```bash
ls -d 2-Confidential/Candidates/*/
```

Read each existing brief's header (Name, Role, Source, Status) to build a mental
index. Also scan `3-Team/People/`, `3-Team/Organizations/`, and
`3-Team/Projects/` to resolve recruiter names, agency orgs, and project links.

### 3. Sync `2-Confidential/Roles/`

Role files are flat here. The `**Status:**` field is `open` or `closed`.

1. Read each Role file's Info block to map Req → Role file path, Hiring manager,
   Domain lead, recruiter, Channel. Look up by filename substring so a req-less
   role stays findable:
   `ls 2-Confidential/Roles/ | grep "{partial_name_or_req}"`.
2. Find Reqs in candidate briefs that have no Role file:
   `rg "^\*\*Req:\*\*" 2-Confidential/Candidates/*/brief.md`. Check all Role
   files first. For a genuinely missing open role, create a stub with
   `**Status:** open` from the **Role file stub** in
   [references/templates.md](references/templates.md). Then enrich:
   `rg "{req_number}" [0-9]-*/`.
3. Scan briefs to rebuild each **open** Role file's `## Candidates` table:
   `rg -l "Req:.*{req_number}" 2-Confidential/Candidates/*/brief.md`. Use the
   **Role Candidates table** format from `references/templates.md`.
4. If a Role file has a hiring manager but no domain lead, walk the
   `**Reports to:**` chain in `3-Team/People/` to a VP or senior leader.
5. When a role closes (filled, cancelled, or frozen 6+ months), set its
   `**Status:**` field to `closed`. Do this only on a clear signal.

### 4. Identify recruitment threads

For each thread in the batch, decide whether it contains recruitment content
with the signals in [references/signals.md](references/signals.md). Skip
threads that match no signal.

### 5. Extract candidate data

For each candidate you find, populate the field map from
[references/fields.md](references/fields.md). It covers field sources, the
`Channel` rule, the hiring-manager / domain-lead resolution chain, gender rules,
source/recruiter resolution, how to copy a CV, and headshot discovery.

### 6. Determine pipeline status

Assign a status with the table and advancement signals in
[references/statuses.md](references/statuses.md). Default to `new`.

### 7. Build the pipeline timeline

Extract a chronological timeline. Write one `**{date}**: {event}` line per
meaningful event. Each line captures who did what. Skip noise (signature
blocks, disclaimers, forwarded headers).

### 8. Write or update the candidate note

For **new** candidates, create `2-Confidential/Candidates/{Full Name}/brief.md`
from the **Candidate brief** template in
[references/templates.md](references/templates.md). Place the **Extra Info
fields** after `Last activity` in the order shown there. Add the **Optional
sections** when data warrants. Omit `## CV` if no attachment.

For **existing** candidates, apply targeted edits. Do not rewrite the file.
Update `Status`, `Last activity`, and the frontmatter `status` and `updated`
keys. Append Pipeline entries, fill in newly known Info fields, and add new
Skills.

### 9. Capture cross-candidate insights

Update `2-Confidential/Candidates/Insights.md` only when an observation is
high-signal: the candidate may suit a **different role**, is a **strong match**
for a specific team or leader, a meaningful **comparison between candidates**,
or you must **remember a hiring trade-off across sessions**.

Skip per-candidate status and generic strengths/weaknesses. Those belong on
`brief.md`. Format: one bullet under `## Placement Notes` with
`[[2-Confidential/Candidates/Name/brief|Name]]` and relevant backlinks.

### 10. Make sure links are bidirectional

| If you add...            | Then also add...                                           |
| ------------------------ | ---------------------------------------------------------- |
| Candidate → Organization | Organization overlay → Candidate                           |
| Candidate → Recruiter    | Recruiter overlay → Candidate (in Activity)                |
| Candidate → Project      | Project overlay → Candidate                                |
| Candidate → Role         | Role → Candidate (in Candidates table — rebuilt by Step 3) |

Write each backlink on the entity's `2-Confidential` overlay note, never on
the `3-Team` note (rules and stub in `references/overlays.md`). Only add a
backlink when the overlay does not already reference the candidate.

### 11. Mark each thread processed

```bash
node .claude/skills/extract-entities/scripts/state.mjs update "{file_path}"
```

`req-track` and `extract-entities` share this state. Neither skill re-scans the
thread until it changes.

### 12. Tag skills against the standard

```bash
bunx fit-pathway skill --list
```

Use agent-aligned engineering standard IDs in the `## Skills` section instead
of free-form tags. Flag any candidate with a CV attachment for `req-screen`.
