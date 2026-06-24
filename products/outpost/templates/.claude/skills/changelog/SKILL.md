---
name: changelog
description: Record the knowledge-graph changes made during the current session into a single shared Knowledge/CHANGELOG.md so the team can see what changed and why. Use when the user asks to log, record, or write up the changes they just made to the knowledge base — typically at the end of a session of edits.
---

# Changelog

Record the changes made to the **knowledge graph** (`Knowledge/`) during the
current working session in one shared `Knowledge/CHANGELOG.md`, newest first, so
teammates syncing the same filesystem can see what changed and why.

This tracks **graph content** — notes under `Knowledge/People/`,
`Organizations/`, `Projects/`, `Topics/`, `Candidates/`, `Priorities/`, and the
other subdirectories. It does **not** track changes to instructions (`CLAUDE.md`,
agents, skills) — that is the `upstream-instructions` skill's job.

## Trigger

- The user asks to write, update, or record a changelog after editing the KB.
- A session has added, modified, removed, or renamed notes in `Knowledge/` and
  the user wants those changes documented for the team.

## Inputs

- **The edits made in the current session** — the source of truth. The KB lives
  on a synced filesystem and is not version-controlled, so there is no commit
  history to diff. Recall every note created, edited, removed, or renamed under
  `Knowledge/` during this conversation.
- `~/.cache/fit/outpost/state/identity.md` — the current user's identity. Its
  **Name** is the author recorded on each entry. The KB is shared, so every
  change must be attributed to the team member who made it. Resolve `~` to
  `$HOME` before reading.
- `Knowledge/CHANGELOG.md` — the existing changelog, to see what's already
  recorded and avoid duplicates.

## Outputs

- `Knowledge/CHANGELOG.md` — a **single** reverse-chronological changelog
  covering all graph subdirectories. No per-folder or per-note changelogs.

## Ethics

`Knowledge/` is shared with the team. Every entry obeys the KB's integrity rules:
objective and factual, work-relevant, no personal judgments. Assume the person a
note is about will read its changelog entry. Describe **what changed in the
graph**, not opinions about the people in it.

<do_confirm_checklist goal="Verify the changelog is accurate and shareable">

- [ ] Exactly one `Knowledge/CHANGELOG.md`; no stray per-folder changelogs.
- [ ] Every entry names its **Scope** — the specific note(s) or folder(s) touched,
      by full path.
- [ ] Each entry has **Who** (author, from identity), **What**, and **Why**.
- [ ] Descriptions are specific enough to be useful (not "updated some notes").
- [ ] Dates are the date the change was actually made, not guessed.
- [ ] No duplicate entries for a change already in the changelog.
- [ ] Entries are factual and would be fine for the subject to read.

</do_confirm_checklist>

## Procedure

### 1. Find what's already recorded, and who you are

```bash
head -30 Knowledge/CHANGELOG.md 2>/dev/null     # newest date already logged, if any
cat "$HOME/.cache/fit/outpost/state/identity.md"  # Name → the author for this session's entries
```

If `identity.md` is missing or stale, run the `identify-user` skill to refresh
it before logging — don't guess the author.

### 2. Reconstruct this session's changes

Recall every change made to `Knowledge/` during the current conversation:
creations, edits, removals, renames. Group them by note. If you are unsure a
change landed, confirm it before logging:

```bash
rg --files Knowledge/ | rg "<note name>"        # confirm a note exists
cat "Knowledge/People/Doe, Jane.md"             # confirm content landed
```

Optionally surface anything edited recently that you might have missed:

```bash
find Knowledge -name '*.md' -newermt '-1 day' -not -path '*/.*'
```

Use `Knowledge/CHANGELOG.md` only to avoid duplicating an entry already there.

### 3. Classify each change

| Type       | Description                          |
| ---------- | ------------------------------------ |
| `added`    | New note created                     |
| `modified` | Existing note updated                |
| `removed`  | Note deleted                         |
| `renamed`  | Note renamed or moved                |

Related changes that form one logical edit (e.g. a new project note plus the
backlinks added to the people it involves) are recorded as **one entry** whose
Scope lists every note touched.

### 4. Write the changelog

Create or update `Knowledge/CHANGELOG.md` (newest first). Group entries under one
heading per day; one bullet per logical change:

```markdown
# Knowledge Changelog

Changes to the shared knowledge graph, newest first. Maintained by hand at the
end of editing sessions via the `changelog` skill. The KB is not
version-controlled, so this is the record of what changed and why.

## <YYYY-MM-DD>

- **<added | modified | removed | renamed>** — _<Scope: full path(s)>_ · <Who>
  **What:** <one-line summary of the change.>
  **Why:** <the reason — the email, meeting, or request that prompted it.>
```

Use the real date the change was made (today's date is in context) and the
**Name** from `identity.md` as `<Who>`. Because the file is shared, the author
travels on each entry — not just the day's heading — so a day with edits from
more than one teammate stays unambiguous. Keep each entry to its What and Why —
this is a ledger, not a diff.

## Notes

- This skill **documents only** — it records changes already made; it does not
  make or undo edits.
- One `Knowledge/CHANGELOG.md` at the graph root, never per-folder.
- For changes to instructions (`CLAUDE.md`, agents, skills), use
  `upstream-instructions` instead.
