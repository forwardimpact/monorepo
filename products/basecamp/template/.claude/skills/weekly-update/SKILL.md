---
name: weekly-update
description: Generate or refresh a weekly priorities document. Pulls from task boards, recent activity, and calendar to create a point-in-time snapshot. Use when the user asks to update their weekly, prep for the week, or on a Monday morning schedule.
---

# Weekly Update

Generate or refresh a weekly priorities document in
`knowledge/Weeklies/{Person Name}/`. Each weekly is a point-in-time snapshot —
created at the start of the week, updated as priorities shift, and closed out
with a retrospective at end-of-week.

## Trigger

Run this skill:

- When the user asks to update their weekly or prep for the week
- Monday mornings (scheduled)
- When the user asks to review someone's weekly
- End-of-week to fill in accomplishments and retrospective

## Prerequisites

- `knowledge/Weeklies/` directory exists
- `knowledge/Tasks/{Person Name}.md` exists (task board — see `manage-tasks`
  skill)
- Calendar data in `~/.cache/fit/basecamp/apple_calendar/`
- User identity configured in `USER.md`

## Inputs

- `knowledge/Tasks/{Person Name}.md` — current task board
- `knowledge/People/{Person Name}.md` — recent activity, context
- `~/.cache/fit/basecamp/apple_calendar/*.json` — calendar events for the week
- Previous weekly document (if exists) — for continuity and carry-forward

## Outputs

- `knowledge/Weeklies/{Person Name}/{YYYY}-W{WW}.md` — the weekly document

---

## Weekly Document Format

```markdown
# {YYYY}-W{WW} — {Person Name}

> {Focus statement: one sentence summarizing the week's theme}

## Priorities

- [ ] Priority one — [[Projects/Name]]
- [ ] Priority two
- [x] Completed priority

## Key Meetings

- **Monday**: Meeting title with [[People/Name]] — purpose
- **Wednesday**: Meeting title — purpose

## Blockers

- Waiting on X from [[People/Name]]

## Accomplishments

- Completed X
- Shipped Y

## Retrospective

- **Went well:** ...
- **Didn't go as planned:** ...
- **Carry forward:** ...
```

**Key conventions:**

- **Week numbers:** ISO 8601 (e.g., `2026-W08`)
- **Priorities:** Top 3-7 items pulled from the task board
- **Key Meetings:** Substantive meetings only (skip recurring standups)
- **Retrospective:** Filled at end-of-week only
- **All backlinks** use absolute paths: `[[People/Name]]`, `[[Projects/Name]]`,
  `[[Tasks/Name]]`

## Before Starting

1. Read `USER.md` to identify the user.
2. Determine the target person (default: current user from `USER.md`).
3. Calculate the current ISO week number and date range:

```bash
# Current ISO week
date +%G-W%V

# Monday and Friday of current week (macOS)
date -v-mon +%Y-%m-%d
date -v+fri +%Y-%m-%d
```

4. Check if a weekly already exists for this week:

```bash
ls "knowledge/Weeklies/{Person Name}/" 2>/dev/null
```

5. Determine the mode:
   - **No existing weekly:** Create new (start-of-week)
   - **Existing weekly:** Update (mid-week or end-of-week)

## Step 1: Gather Context

### 1a. Read the task board

```bash
cat "knowledge/Tasks/{Person Name}.md"
```

Extract:

- `## In Progress` tasks → top priorities (already being worked on)
- `## Open` tasks with `high` priority or near due dates → candidate priorities
- `## Blocked` tasks → blockers section
- `## Recently Done` tasks completed this week → accomplishments

### 1b. Read recent activity

```bash
cat "knowledge/People/{Person Name}.md"
```

Look at the `## Activity` section for entries from this week. These inform
accomplishments and provide context for the focus statement.

### 1c. Read calendar for the week

Find events falling within the Monday–Friday range:

```bash
ls ~/.cache/fit/basecamp/apple_calendar/
```

Read each calendar event and filter by date. Extract:

- Meeting title
- Attendees (resolve to `[[People/Name]]` where possible)
- Time/day
- Description or agenda (if present)

Filter out:

- All-day placeholder events with no attendees ("Block", "OOO", "Focus time")
- Declined events
- Cancelled events

### 1d. Read previous weekly (if exists)

Check for last week's document:

```bash
ls "knowledge/Weeklies/{Person Name}/" | sort | tail -1
```

If it exists, read it to:

- Carry forward any `[ ]` unchecked priorities
- Note retrospective items that affect this week
- Maintain continuity of ongoing themes

## Step 2: Generate or Update

### Creating a new weekly (start of week)

1. **Focus:** Synthesize from highest-priority tasks and key meetings. What's
   the main theme? Write one sentence.
2. **Priorities:** Pull from task board:
   - All `## In Progress` items first
   - Then `high` priority `## Open` items
   - Then items with due dates this week
   - Carry forward incomplete priorities from last week
   - Cap at 5-7 items. If more exist, prioritize ruthlessly.
3. **Key Meetings:** From calendar. Format as
   `**{Day}**: {title} with [[People/Name]] — {purpose}`. Look up attendees in
   knowledge base to add context about purpose.
4. **Blockers:** From task board's `## Blocked` section. Include what's needed
   and from whom.
5. **Accomplishments:** Leave empty (or pre-fill with anything completed Monday
   morning).
6. **Retrospective:** Leave empty.

### Updating an existing weekly (mid-week)

1. Re-read the task board for changes since the weekly was last updated.
2. Mark completed priorities as `[x]`.
3. Add new priorities that emerged (append to the list).
4. Update blockers — remove resolved ones, add new ones.
5. Add accomplishments as they happen.
6. Do NOT touch the retrospective mid-week.

### End-of-week update

1. Final pass on priorities — mark all completed items `[x]`.
2. Fill in accomplishments from the full week's activity (task board + People
   note activity log).
3. Write a brief retrospective:
   - What went well?
   - What didn't go as planned?
   - What carries forward to next week?
4. Note any unchecked priorities — these will carry forward to next week's
   document.

## Step 3: Write the Document

### New weekly

Ensure the person's subdirectory exists:

```bash
mkdir -p "knowledge/Weeklies/{Person Name}"
```

Write the full document to: `knowledge/Weeklies/{Person Name}/{YYYY}-W{WW}.md`

### Existing weekly

Use the Edit tool for targeted updates — mark items complete, add new entries,
fill sections. Do NOT rewrite the entire file.

## Step 4: Cross-reference

After writing:

- If new priorities were identified that aren't on the task board, add them to
  the task board (the task board is canonical, the weekly references it).
- If blockers were resolved, update the task board accordingly.
- The weekly is a **snapshot that references** the task board — the task board
  is the source of truth for task status.

## Quality Checklist

- [ ] ISO week number and date range are correct
- [ ] Focus statement reflects the actual week theme (not generic)
- [ ] Priorities pulled from task board (not invented)
- [ ] Priorities capped at 5-7 items
- [ ] Key meetings pulled from calendar (not guessed)
- [ ] Meeting attendees resolved to `[[People/Name]]` where known
- [ ] Blockers match task board's blocked items
- [ ] Previous week's carry-forward items included
- [ ] All backlinks use absolute paths
- [ ] Retrospective only filled at end-of-week
