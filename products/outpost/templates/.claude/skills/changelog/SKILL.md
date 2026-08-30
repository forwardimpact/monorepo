---
name: changelog
description: Record the knowledge-graph changes from the current session into one CHANGELOG.md per shared tier. The team can then see what changed and why. Use when the user asks to log, record, or write up the changes they just made to the knowledge base. This typically happens at the end of a session of edits.
---

# Changelog

Write tier: each shared tier (rank 1 and up)
Frontmatter: changelog

Record the changes to the **knowledge graph** (the tier directories) from the
current working session. Write them into one `CHANGELOG.md` per shared tier
(`<N>-<Label>/CHANGELOG.md`, ranks 1 and up), newest first. Teammates who
receive a tier can then see what changed in it and why.

The changelog is per tier because its audience is the tier's audience. An
entry never names a note in a narrower tier: a change to a tier-2 note goes
to `2-Confidential/CHANGELOG.md` only, never to `3-Team/CHANGELOG.md`.
`0-Draft/` keeps no changelog. Discover changelogs inside the tier
directories only.

This skill tracks **graph content**: the notes under each tier's entity
subdirectories (`People/`, `Organizations/`, `Projects/`, `Candidates/`, and
the rest). It does **not** track changes to instructions (`CLAUDE.md`,
agents, skills). The `upstream-instructions` skill owns those, and the root
instruction `CHANGELOG.md` is a personal surface this skill never touches.

## Trigger

- The user asks to write, update, or record a changelog after they edit the KB.
- A session added, modified, removed, or renamed notes in a shared tier. The
  user wants a record of those changes for the team.

## Inputs

- **The edits made in the current session** — the source of truth. A tier may
  sync over a mount with no version control, so never rely on commit history.
  Recall every note that you created, edited, removed, or renamed in a shared
  tier during this conversation.
- `~/.cache/fit/outpost/state/identity.md` — the current user's identity. Use
  its **Name** as the author on each entry. The tiers are shared, so every entry
  must name the team member who made the change. Resolve `~` to `$HOME` before
  you read it.
- `<N>-<Label>/CHANGELOG.md` per shared tier — the existing changelogs. Read
  them to see what is already recorded and to avoid duplicates.

## Outputs

- One `CHANGELOG.md` per shared tier that had changes: a
  reverse-chronological log that covers that tier's subdirectories. No
  per-folder or per-note changelogs, and none in `0-Draft/`.

## Ethics

The team shares each tier with its own audience. Every entry obeys the KB's
integrity rules: objective and factual, work-relevant, no personal judgments.
Assume the person a note is about will read its changelog entry. Describe
**what changed in the graph**. Do not record opinions about the people in it.

<do_confirm_checklist goal="Verify the changelog is accurate and shareable">

- [ ] Keep exactly one `CHANGELOG.md` per shared tier, at the tier root.
      Leave no stray per-folder changelog and none in `0-Draft/`.
- [ ] Route every entry to the changelog of the tier that holds the changed
      note. Never name a narrower tier's note in a wider tier's changelog.
- [ ] Write every entry as **one line**: type, **Scope** (tier-prefixed
      paths), **Who**, and a short pointer. No `What:`/`Why:` blocks.
- [ ] Make the pointer specific enough to locate the change (never "updated
      some notes").
- [ ] Use the real date of each change. Never guess a date.
- [ ] Add no duplicate entry for a change already in the changelog.
- [ ] Keep every entry factual and fit for the subject to read.
- [ ] Stamp the frontmatter core (`type: changelog`, `created`, `updated`) on
      a changelog you create; stamp `updated` on one you edit.
- [ ] Keep each file short (see Step 5). Compact or drop old entries when it
      grows.

</do_confirm_checklist>

## Procedure

### 1. Find what's already recorded, and who you are

```bash
head -30 3-Team/CHANGELOG.md 2>/dev/null          # per tier you changed
cat "$HOME/.cache/fit/outpost/state/identity.md"  # Name → the author
```

If `identity.md` is missing or stale, run the `person-identify` skill to refresh
it before you log the changes. Never guess the author.

### 2. Reconstruct this session's changes

Recall every change you made to the shared tiers during the current
conversation: creations, edits, removals, and renames. Group them by note,
then by tier. If you are unsure that a change landed, confirm it before you
log it:

```bash
rg --files [0-9]-*/ | rg "<note name>"            # confirm a note exists
cat "3-Team/People/Doe, Jane.md"                  # confirm content landed
```

Optionally, surface anything you edited recently and might have missed:

```bash
find [0-9]-* -name '*.md' -newermt '-1 day' -not -path '*/.*'
```

Use each tier's `CHANGELOG.md` only to avoid a duplicate of an entry already
there.

### 3. Classify each change

| Type       | Description                          |
| ---------- | ------------------------------------ |
| `added`    | New note created                     |
| `modified` | Existing note updated                |
| `removed`  | Note deleted                         |
| `renamed`  | Note renamed or moved                |

Some related changes form one logical edit. An example is a new project note
plus the backlinks to the people it involves. Record these as **one entry**
when they live in one tier. Changes that span tiers split into one entry per
tier, each naming only that tier's notes.

### 4. Write the changelog

Create or update the changed tiers' `CHANGELOG.md` files (newest first).
Group entries under one heading per day. Write one bullet per logical change.
A new changelog opens with the frontmatter core (`type: changelog`,
`created`, `updated`); an edited one gets a fresh `updated`.

```markdown
---
type: changelog
created: 2026-01-01
updated: 2026-01-01
---

# Team Changelog

Terse, newest-first pointers to changes in this tier. This is a hint for
teammates who sync the same files, not a precious record. The `changelog`
skill maintains it, and compacts and drops old entries as the file grows.

## <YYYY-MM-DD>

- **<added | modified | removed | renamed>** — _<Scope: tier-prefixed path(s)>_ · <Who> — <short pointer: what changed, and why only if it isn't obvious.>
```

**Keep entries brief — a pointer, not a summary.** One line each. State the
type, the scope (tier-prefixed paths), the author, and a short clause that
lets a teammate find the change and grasp its gist. Do **not** reproduce the
content of the edit. If someone needs the detail, they open the note.

Use the real date of the change (today's date is in context). Use the **Name**
from `identity.md` as `<Who>`. The team shares the file, so the author travels
on each entry.

Collapse related same-tier edits into one line. Several notes touched for one
purpose, or the same note created-then-reworked in a session, is a single
entry. Combine the types (e.g. `**added / renamed**`) and name the notes in
the scope.

### 5. Compact each file when it grows

A changelog is a **disposable hint file, not an archive**. The notes
themselves are the record. Keep it short. After you add this session's
entries, compact the file in the same pass when it has grown large (rough
guide: **more than ~150 lines, or older than ~2 months of daily headings**):

- **Roll up old days.** Fold each day older than ~2 weeks into one or two
  thematic lines per author.
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
- One `CHANGELOG.md` per shared tier, at the tier root, never per-folder.
- For changes to instructions (`CLAUDE.md`, agents, skills), use
  `upstream-instructions` instead; its root `CHANGELOG.md` is a separate
  personal artifact.
