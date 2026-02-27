---
name: manage-tasks
description: Create, update, list, and close tasks on per-person task boards in knowledge/Tasks/. Manages task lifecycle, extracts action items from other skills, and keeps boards current. Use when the user asks to add, update, or review tasks, or when chained from extract-entities or process-hyprnote.
---

# Manage Tasks

Manage per-person task boards in `knowledge/Tasks/`. Each person has a single
living document that tracks all their open, in-progress, blocked, and recently
completed tasks. Task boards are the **canonical source** for task tracking —
other notes (People, Projects) link to them rather than duplicating.

## Trigger

Run this skill:

- When the user asks to add, update, close, or list tasks
- When chained from `extract-entities` or `process-hyprnote` with extracted
  action items
- When the user asks to see someone's task board or workload
- On a schedule to perform housekeeping (prune done items, flag overdue)

## Prerequisites

- `knowledge/Tasks/` directory exists
- User identity configured in `USER.md`

## Inputs

### User-initiated

- Person name and task details from the user's request

### Chained from other skills

Action items extracted by `extract-entities` or `process-hyprnote`, passed as
structured data:

```
TASKS:
- Owner: {Full Name}
  Task: {Description — starts with a verb}
  Priority: high|medium|low
  Due: YYYY-MM-DD (if known)
  Source: meeting|email
  Source date: YYYY-MM-DD
  Project: {Project Name} (if applicable)
  Context: {Brief context about where this came from}
```

## Outputs

- `knowledge/Tasks/{Person Name}.md` — created or updated task boards

---

## Task Board Format

Each task board is a markdown file with four sections, always in this order:

```markdown
# {Person Name}

## In Progress
## Open
## Blocked
## Recently Done
```

All four sections are always present, even if empty.

**Task entry format:**

```
- [ ] **{Task title}** | {priority} | due {YYYY-MM-DD} | [[Projects/Name]]
  {Context line with source info and backlinks.}
```

**Key conventions:**

- **Priorities:** `high` | `medium` | `low` — omit if medium (default)
- **Due dates:** Only include if there's a real deadline. Format:
  `due YYYY-MM-DD`
- **No task IDs.** Tasks are identified by their bold title. Keep titles unique
  within a person's board.
- **Recently Done:** Keep the last 14 days. Older items pruned during
  housekeeping.

## Before Starting

1. Read `USER.md` to get user identity.
2. Determine the operation: **add**, **update**, **close**, **list**, or
   **housekeeping**.

## Step 1: Resolve the Person

For any task operation, resolve the person to their canonical name:

```bash
ls knowledge/Tasks/
rg "{name}" knowledge/People/
```

If the person doesn't have a task board yet, create one from the template
(Step 4 covers creation).

## Step 2: Read Current Task Board

```bash
cat "knowledge/Tasks/{Person Name}.md"
```

Parse existing tasks to:

- Avoid duplicates (same person, similar description)
- Understand current workload
- Find the right insertion point

## Step 3: Perform the Operation

### Add a Task

1. Check for duplicates — same person, similar task title or description. If a
   near-duplicate exists, update it instead of creating a new entry.
2. Determine the section:
   - Default: `## Open`
   - If user says "I'm working on" / "started" → `## In Progress`
   - If blocked → `## Blocked`
3. Format the task entry:
   ```
   - [ ] **{Task title}** | {priority} | due {YYYY-MM-DD} | [[Projects/Name]]
     {Context line with source info and backlinks.}
   ```
4. Add the entry at the **bottom** of the appropriate section.
5. If the task references a project, verify the project note exists.

### Update a Task

1. Find the task by title (fuzzy match OK — bold text between `**`).
2. Apply changes:
   - **Status change:** Move the entire entry between sections
   - **Priority change:** Update the `| {priority} |` segment
   - **Due date change:** Update or add `| due YYYY-MM-DD |`
   - **Add context:** Append to the indented line
3. Use the Edit tool for targeted modifications.

### Close a Task

1. Find the task by title.
2. Remove it from its current section.
3. Add to the **top** of `## Recently Done`:
   ```
   - [x] **{Task title}** | completed {YYYY-MM-DD}
   ```
   (Drop priority, due date, project link, and context — keep it compact.)

### List Tasks

Query across all task boards:

```bash
# All open/in-progress tasks
rg "^- \[ \] \*\*" knowledge/Tasks/

# Tasks for a specific project
rg "Projects/{Name}" knowledge/Tasks/

# High priority tasks
rg "\| high \|" knowledge/Tasks/

# Overdue tasks — find all due dates and compare against today
rg "due 20[0-9]{2}-[0-9]{2}-[0-9]{2}" knowledge/Tasks/

# Blocked tasks
rg -A1 "^- \[ \]" knowledge/Tasks/ | rg -B1 "Waiting on"
```

Present results in a clean summary, grouped by person or project as appropriate
for the user's question.

### Housekeeping (Scheduled)

Run across all task boards:

1. **Prune done items:** Remove completed tasks older than 14 days from
   `## Recently Done`.
2. **Flag overdue:** Any task with `due {date}` in the past that's still in
   `## Open` or `## In Progress` — check if it needs attention. Do NOT
   auto-modify the task; instead, report overdue items to the user.
3. **Deduplicate:** If identical tasks appear on the same board, merge them.
4. **Validate links:** Spot-check that `[[People/]]` and `[[Projects/]]`
   references point to existing notes.

## Step 4: Write Updates

### New task board

Create `knowledge/Tasks/{Person Name}.md` with all four sections:

```markdown
# {Person Name}

## In Progress

## Open

## Blocked

## Recently Done
```

### Existing task board

Use the Edit tool to make targeted changes — add, move, or modify individual
task entries. Do NOT rewrite the entire file.

## Step 5: Migrate Open Items (One-time)

When first setting up task boards, or when the user asks, migrate existing
`## Open items` from People and Project notes:

1. Scan notes for `## Open items` sections with content:
   ```bash
   rg -l "## Open items" knowledge/People/ knowledge/Projects/
   ```
2. For each note with open items, read the items and convert them to task board
   entries.
3. Add each item to the appropriate person's task board.
4. **Do NOT remove** the original open items from source notes — they serve as
   the historical record. The task board becomes the living tracker.

## Quality Checklist

- [ ] Task title is clear and actionable (starts with a verb)
- [ ] Priority set appropriately (omit if medium)
- [ ] Due date included only if there's a real deadline
- [ ] Project linked with `[[Projects/Name]]` if applicable
- [ ] No duplicate tasks on the board
- [ ] Recently Done pruned to last 14 days (housekeeping)
- [ ] All backlinks use absolute paths `[[Folder/Name]]`
- [ ] Context line is concise (1-2 lines max)
- [ ] New task board has all four sections present
