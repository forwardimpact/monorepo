# Changelog Examples

Reference output for `upstream-skill` Step 4. Each modified skill has its own
`CHANGELOG.md` with reverse-chronological entries.

## Modified skill

`.claude/skills/req-track/CHANGELOG.md`:

```markdown
# req-track Changelog

Changes to this skill that should be considered for upstream inclusion in
the Forward Impact monorepo.

## 2026-03-01

**What:** Added gender field extraction for diversity tracking

**Why:** Recruitment pipeline lacked diversity metrics — pool composition
was invisible without structured gender data.

**Details:**
- Added Gender field to candidate brief template (Woman / Man / —)
- Added extraction rules: pronouns, gendered titles
- Added explicit note that the field has no bearing on hiring decisions
- Updated quality checklist to verify the gender field

---
```

## New skill

`.claude/skills/anarlog-process/CHANGELOG.md`:

```markdown
# anarlog-process Changelog

Changes to this skill that should be considered for upstream inclusion in
the Forward Impact monorepo.

## 2026-03-01

**What:** New skill for processing Anarlog meeting recordings

**Why:** Meeting notes were being lost — Anarlog captures transcriptions
but they weren't being integrated into the knowledge base.

**Details:**
- Reads transcription files from `~/.cache/fit/outpost/anarlog/`
- Extracts people, decisions, and action items
- Creates meeting notes in `knowledge/Meetings/`
- Links attendees to `knowledge/People/` entries

---
```

## Tweak to existing skill

`.claude/skills/extract-entities/CHANGELOG.md`:

```markdown
# extract-entities Changelog

Changes to this skill that should be considered for upstream inclusion in
the Forward Impact monorepo.

## 2026-02-15

**What:** Increased batch size from 5 to 10 files per run

**Why:** Processing was too slow for large inboxes — 5 files per batch
meant dozens of runs to catch up after a week of email.

**Details:**
- Changed batch size constant from 5 to 10 in Step 1
- Added a note about context window limits for batches > 15

---
```
