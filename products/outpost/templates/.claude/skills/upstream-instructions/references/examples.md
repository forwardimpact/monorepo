# Changelog Examples

Reference output for `upstream-instructions` Step 5. There is **one** root
`CHANGELOG.md` with reverse-chronological entries. Each entry's **Scope** names
the surface(s) it touched — `CLAUDE.md`, `agent:<name>`, `skill:<name>` — and a
single entry may span several.

## Cross-surface change (one change, many files)

```markdown
## 2026-06-18

**Scope:** KB structure; CLAUDE.md; agents: librarian, chief-of-staff, recruiter; skills: extract-entities, anarlog-process, meeting-prep, req-decide
**Type:** removed

**What:** Dropped the Goals entity type; Priorities is now the only user-set
strategic layer.

**Why:** One strategic layer is simpler than two — time-bound targets fold into
Priorities, removing the Project↔Goal↔Priority coupling that earned nothing.

**Details:**
- Deleted `Knowledge/Goals/`; repointed live backlinks to `Priorities/C - Onboarding`.
- CLAUDE.md workspace-layout tree no longer lists `Goals/`.
- Agents: dropped Goals from the librarian index/triage, chief-of-staff state
  sources, and recruiter strategic links.
- extract-entities: removed Goals from resolution/index; renamed
  `templates-goals-priorities.md` → `templates-priorities.md`; deleted Goal link
  rules. anarlog-process / meeting-prep / req-decide: dropped Goals inputs.

---
```

## Modified skill

```markdown
## 2026-03-01

**Scope:** skill: req-track
**Type:** modified

**What:** Added gender field extraction for diversity tracking.

**Why:** The recruitment pipeline lacked diversity metrics — pool composition was
invisible without structured gender data.

**Details:**
- Added a Gender field to the candidate brief template (Woman / Man / —).
- Added extraction rules (pronouns, gendered titles) and a note that the field
  has no bearing on hiring decisions.
- Updated the quality checklist to verify the field.

---
```

## Modified agent

```markdown
## 2026-06-19

**Scope:** agents: all six profiles
**Type:** modified

**What:** Agents now read `Knowledge/Priorities/` at the start of every wake and
flag anything that threatens a priority.

**Why:** Sync, triage, and drafting were ignoring strategic context; signals that
could block a priority passed silently.

**Details:**
- Added a uniform `## Priorities` section and a `Priority Watch` output line to
  the five worker agents.
- The chief-of-staff consolidates each agent's `Priority Watch` flags into a
  dedicated section of the daily briefing.

---
```

## New skill

```markdown
## 2026-03-01

**Scope:** skill: anarlog-process
**Type:** added

**What:** New skill for processing Anarlog meeting recordings.

**Why:** Meeting notes were being lost — Anarlog captures transcriptions but they
weren't integrated into the knowledge base.

**Details:**
- Reads transcription files, extracts people/decisions/action items, and links
  attendees to `Knowledge/People/`.

---
```
