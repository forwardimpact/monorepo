---
name: changelog
description: Record the knowledge-graph changes from the current session into one shared Knowledge/CHANGELOG.md. The team can then see what changed and why. Use when the user asks to log, record, or write up the changes they just made to the knowledge base. This typically happens at the end of a session of edits.
---

# Changelog

Record the changes to the **knowledge graph** (`Knowledge/`) from the current
working session. Write them in one shared `Knowledge/CHANGELOG.md`, newest
first. Teammates who sync the same filesystem can then see what changed and why.

This skill tracks **graph content**. Graph content is the notes under
`Knowledge/People/`, `Organizations/`, `Projects/`, `Topics/`, `Candidates/`,
`Priorities/`, and the other subdirectories. It does **not** track changes to
instructions (`CLAUDE.md`, agents, skills). The `upstream-instructions` skill
owns those.

## Trigger

- The user asks to write, update, or record a changelog after they edit the KB.
- A session added, modified, removed, or renamed notes in `Knowledge/`. The user
  wants a record of those changes for the team.

## Inputs

- **The edits made in the current session** — the source of truth. The KB lives
  on a synced filesystem and has no version control, so no commit history exists
  to diff. Recall every note that you created, edited, removed, or renamed under
  `Knowledge/` during this conversation.
- `~/.cache/fit/outpost/state/identity.md` — the current user's identity. Use
  its **Name** as the author on each entry. The KB is shared, so every entry
  must name the team member who made the change. Resolve `~` to `$HOME` before
  you read it.
- `Knowledge/CHANGELOG.md` — the existing changelog. Read it to see what is
  already recorded and to avoid duplicates.

## Outputs

- `Knowledge/CHANGELOG.md` — a **single** reverse-chronological changelog that
  covers all graph subdirectories. No per-folder or per-note changelogs.

## Ethics

The team shares `Knowledge/`. Every entry obeys the KB's integrity rules:
objective and factual, work-relevant, no personal judgments. Assume the person a
note is about will read its changelog entry. Describe
**what changed in the graph**. Do not record opinions about the people in it.

<do_confirm_checklist goal="Verify the changelog is accurate and shareable">

- [ ] Keep exactly one `Knowledge/CHANGELOG.md`. Leave no stray per-folder
      changelog.
- [ ] Name the **Scope** in every entry, with the full path of each note or
      folder touched.
- [ ] Give each entry a **Who** (the author, from identity), a **What**, and a
      **Why**.
- [ ] Make each description specific enough to be useful (never "updated some
      notes").
- [ ] Use the real date of each change. Never guess a date.
- [ ] Add no duplicate entry for a change already in the changelog.
- [ ] Keep every entry factual and fit for the subject to read.

</do_confirm_checklist>

## Procedure

### 1. Find what's already recorded, and who you are

```bash
head -30 Knowledge/CHANGELOG.md 2>/dev/null     # newest date already logged, if any
cat "$HOME/.cache/fit/outpost/state/identity.md"  # Name → the author for this session's entries
```

If `identity.md` is missing or stale, run the `person-identify` skill to refresh
it before you log the changes. Never guess the author.

### 2. Reconstruct this session's changes

Recall every change you made to `Knowledge/` during the current conversation:
creations, edits, removals, and renames. Group them by note. If you are unsure
that a change landed, confirm it before you log it:

```bash
rg --files Knowledge/ | rg "<note name>"        # confirm a note exists
cat "Knowledge/People/Doe, Jane.md"             # confirm content landed
```

Optionally, surface anything you edited recently and might have missed:

```bash
find Knowledge -name '*.md' -newermt '-1 day' -not -path '*/.*'
```

Use `Knowledge/CHANGELOG.md` only to avoid a duplicate of an entry already
there.

### 3. Classify each change

| Type       | Description                          |
| ---------- | ------------------------------------ |
| `added`    | New note created                     |
| `modified` | Existing note updated                |
| `removed`  | Note deleted                         |
| `renamed`  | Note renamed or moved                |

Some related changes form one logical edit. An example is a new project note
plus the backlinks to the people it involves. Record these as **one entry**. The
Scope of that entry lists every note touched.

### 4. Write the changelog

Create or update `Knowledge/CHANGELOG.md` (newest first). Group entries under
one heading per day. Write one bullet per logical change:

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

Use the real date of the change (today's date is in context). Use the **Name**
from `identity.md` as `<Who>`. The team shares the file, so the author travels
on each entry. The day's heading alone is not enough. A day with edits from more
than one teammate then stays unambiguous. Keep each entry to its What and Why.
Write a ledger. Do not write a diff.

## Notes

- This skill **documents only**. It records changes you already made. It does
  not make or undo edits.
- One `Knowledge/CHANGELOG.md` at the graph root, never per-folder.
- For changes to instructions (`CLAUDE.md`, agents, skills), use
  `upstream-instructions` instead.
