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
- [ ] Write every entry as **one line**: type, **Scope** (full paths),
      **Who**, and a short pointer. No `What:`/`Why:` blocks. No
      field-by-field detail.
- [ ] Make the pointer specific enough to locate the change (never "updated
      some notes").
- [ ] Use the real date of each change. Never guess a date.
- [ ] Add no duplicate entry for a change already in the changelog.
- [ ] Keep every entry factual and fit for the subject to read.
- [ ] Keep the file short (see Step 5). Compact or drop old entries when it
      grows.

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

Terse, newest-first pointers to changes in the shared knowledge graph. This
is a hint for teammates who sync the same files, not a precious record. The
`changelog` skill maintains it, and compacts and drops old entries as the
file grows.

## <YYYY-MM-DD>

- **<added | modified | removed | renamed>** — _<Scope: full path(s)>_ · <Who> — <short pointer: what changed, and why only if it isn't obvious.>
```

**Keep entries brief — a pointer, not a summary.** One line each. State the
type, the scope (full paths), the author, and a short clause that lets a
teammate find the change and grasp its gist. Do **not** reproduce the content
of the edit: no field-by-field detail, no quotes, no rationale essays. If
someone needs the detail, they open the note. When in doubt, cut.

Use the real date of the change (today's date is in context). Use the **Name**
from `identity.md` as `<Who>`. The team shares the file, so the author travels
on each entry. The day's heading alone is not enough. A day with edits from
more than one teammate then stays unambiguous.

Collapse related edits into one line. Several notes touched for one purpose,
or the same note created-then-reworked in a session, is a single entry.
Combine the types (e.g. `**added / renamed**`) and name the notes in the
scope.

### 5. Compact the file when it grows

The changelog is a **disposable hint file, not an archive**. The notes
themselves are the record. Keep it short. After you add this session's
entries, compact the file in the same pass when it has grown large (rough
guide: **more than ~150 lines, or older than ~2 months of daily headings**):

- **Roll up old days.** Fold each day older than ~2 weeks into one or two
  thematic lines per author (e.g. "Offsite prep · Jane — promoted the note to
  a Project, added roster/agenda, created the attendee notes").
- **Merge iterative churn.** Collapse a run of edits to the same file or
  topic into a single line that describes the net result.
- **Drop the stale tail.** Delete day headings older than ~2–3 months
  outright. The change already lives in the notes.

Be aggressive: losing granularity here costs nothing. Never rewrite an entry
to say something the edit did not do. Do not drop a *recent* change just to
save space.

## Notes

- This skill **documents only**. It records changes you already made. It does
  not make or undo edits.
- One `Knowledge/CHANGELOG.md` at the graph root, never per-folder.
- For changes to instructions (`CLAUDE.md`, agents, skills), use
  `upstream-instructions` instead.
