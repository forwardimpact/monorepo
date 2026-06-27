---
name: req-track
description: Scan synced email threads for recruitment candidates, extract structured profiles, and create/update notes in Knowledge/Candidates/. Use when the user asks to track candidates, process recruitment emails, or update the hiring pipeline.
---

# Track Candidates

Scan synced email threads from `~/.cache/fit/outpost/apple_mail/` for
recruitment candidates. Extract structured candidate profiles and create or
update notes in `Knowledge/Candidates/`. Builds a local, searchable recruitment
pipeline from scattered email threads.

## Trigger

- The user asks to track, process, or update candidates.
- The user asks about recruitment pipeline status.
- After `sync-apple-mail` has pulled new threads.

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
- `Knowledge/Roles/*.md` — open role/requisition files (metadata inheritance).
- `~/.cache/fit/outpost/state/graph_processed` — processed-file index (shared
  with `extract-entities`).
- `~/.cache/fit/outpost/state/identity.md` — user identity for self-exclusion
  (written by the `person-identify` skill).

## Outputs

- `Knowledge/Candidates/{Full Name}/brief.md` — candidate profile note.
- `Knowledge/Candidates/{Full Name}/CV.pdf` (or `CV.docx`) — local CV copy.
- `Knowledge/Candidates/{Full Name}/headshot.jpeg` — candidate photo.
- `Knowledge/Roles/*.md` — created/updated role files (Candidates tables
  rebuilt).
- `~/.cache/fit/outpost/state/graph_processed` — updated with processed threads.

<do_confirm_checklist goal="Verify candidate processing batch is complete and
correct">

- [ ] Required Info fields present on every brief (Title, Source, Status, First
      seen, Last activity, Channel).
- [ ] Pipeline status reflects latest thread activity; timeline in chronological
      order.
- [ ] Bidirectional links present (Candidate ↔ Org / Recruiter / Role /
      Project).
- [ ] Role files synced — Candidates tables rebuilt, stubs created for any
      unknown reqs.
- [ ] CV and headshot copied into the candidate directory when available.
- [ ] Skills tagged with agent-aligned engineering standard IDs from
      `bunx fit-pathway skill --list`.
- [ ] Gender field populated only from explicit pronouns or titles.
- [ ] No duplicate candidate notes; all processed threads marked in the state
      file.

</do_confirm_checklist>

## Procedure

Process **10 files per run**.

### 1. Load context and pick the batch

Read the user's name, email, and domain from
`~/.cache/fit/outpost/state/identity.md` (run the `person-identify` skill first
if it is missing or stale). List new or changed source files:

```bash
node .claude/skills/extract-entities/scripts/state.mjs check
```

Filter the output to `apple_mail/*.md` only — calendar files are not relevant
here.

### 2. Build candidate, people, and org indexes

```bash
ls -d Knowledge/Candidates/*/
```

Read each existing brief's header (Name, Role, Source, Status) to build a mental
index. Also scan `Knowledge/People/`, `Knowledge/Organizations/`, and
`Knowledge/Projects/` to resolve recruiter names, agency orgs, and project
links.

### 3. Sync `Knowledge/Roles/`

This keeps role metadata current and enables inheritance.

1. Read each Role file's Info block to map Req → Role file path, Hiring manager,
   Domain lead, recruiter, Channel.
2. Find Reqs referenced by candidate briefs but missing a Role file:
   `rg "^\*\*Req:\*\*" Knowledge/Candidates/*/brief.md`. For each missing Req,
   create a stub using the **Role file stub** in
   [references/templates.md](references/templates.md), then enrich by searching
   the graph: `rg "{req_number}" Knowledge/`.
3. Rebuild each Role file's `## Candidates` table by scanning briefs:
   `rg -l "Req:.*{req_number}" Knowledge/Candidates/*/brief.md`. Use the **Role
   Candidates table** format from `references/templates.md`. Sort by First seen,
   newest first.
4. If a Role file has a hiring manager but no domain lead, walk the
   `**Reports to:**` chain in `Knowledge/People/` to a VP or senior leader.

### 4. Identify recruitment threads

For each thread in the batch, decide whether it contains recruitment content
using the signals in [references/signals.md](references/signals.md). Skip
threads that match no signal.

### 5. Extract candidate data

For each candidate found, populate the field map from
[references/fields.md](references/fields.md). That reference covers field
sources, the `Channel` rule, the hiring-manager / domain-lead resolution chain,
gender rules, source/recruiter resolution, CV copying, and headshot discovery.

### 6. Determine pipeline status

Assign a status using the table and advancement signals in
[references/statuses.md](references/statuses.md). Default to `new`. Read the
full thread chronologically; the most recent signal wins.

### 7. Build the pipeline timeline

Extract a chronological timeline — one `**{date}**: {event}` line per meaningful
event, capturing who did what. Skip noise (signature blocks, disclaimers,
forwarded headers).

### 8. Write or update the candidate note

For **new** candidates, create `Knowledge/Candidates/{Full Name}/brief.md` from
the **Candidate brief** template in
[references/templates.md](references/templates.md). Place the **Extra Info
fields** after `Last activity` in the order shown there. Add the **Optional
sections** when data warrants. Omit `## CV` if no attachment.

For **existing** candidates, apply targeted edits — do not rewrite the file:
update `Status` and `Last activity`, append Pipeline entries, fill in newly
known Info fields, and add new Skills.

### 9. Capture cross-candidate insights

Update `Knowledge/Candidates/Insights.md` only when an observation is
high-signal: candidate may suit a **different role**, is a **strong match** for
a specific team or leader, a meaningful **comparison between candidates**, or a
hiring trade-off needs to be **remembered across sessions**.

Skip per-candidate status and generic strengths/weaknesses — those belong on
`brief.md`. Format: one bullet under `## Placement Notes` with
`[[Candidates/Name/brief|Name]]` and relevant people/org backlinks.

### 10. Ensure bidirectional links

| If you add...            | Then also add...                                           |
| ------------------------ | ---------------------------------------------------------- |
| Candidate → Organization | Organization → Candidate                                   |
| Candidate → Recruiter    | Recruiter → Candidate (in Activity)                        |
| Candidate → Project      | Project → Candidate (in People section)                    |
| Candidate → Role         | Role → Candidate (in Candidates table — rebuilt by Step 3) |

Use absolute paths: `[[Candidates/Name/brief|Name]]`,
`[[Organizations/Agency]]`, `[[People/Recruiter]]`. Only add a backlink when the
target note doesn't already reference the candidate.

### 11. Mark each thread processed

```bash
node .claude/skills/extract-entities/scripts/state.mjs update "{file_path}"
```

Shares state with `extract-entities`, so the thread won't be re-scanned by
either skill until it changes.

### 12. Tag skills against the standard

```bash
bunx fit-pathway skill --list
```

Use agent-aligned engineering standard IDs (e.g. `data-integration`,
`full_stack_development`, `architecture_and_design`) in the `## Skills` section
instead of free-form tags. Flag any candidate with a CV attachment for
`req-screen`.
