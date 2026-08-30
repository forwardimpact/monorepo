---
name: meeting-prep
description: Prepare for meetings. Gather context from the knowledge base and calendar. Use when the user asks to prep for a meeting or wants a briefing on upcoming meetings. Creates personalized briefings with attendee history, open items, and suggested talking points.
---

# Meeting Prep

Write tier: none (the output is personal `Briefings/`)
Frontmatter: none

Help the user prepare for meetings. Gather context from the knowledge base and
calendar. Create personalized briefing documents with attendee history, open
items, and suggested talking points.

## Trigger

Run when the user asks to prep for a meeting, or wants a briefing on upcoming
meetings.

## Prerequisites

- Calendar data synced in `~/.cache/fit/outpost/apple_calendar/`
- A populated knowledge base (from the `extract-entities` skill)

## Inputs

- `~/.cache/fit/outpost/apple_calendar/*.json` — calendar events
- `3-Team/People/*.md` — attendee context
- `3-Team/Organizations/*.md` — company context
- `3-Team/Projects/*.md` — project context
- `3-Team/Priorities/*.md` — active priorities and strategic context to
  frame the brief
- `2-Confidential/Candidates/*/brief.md` — candidate context (for interview
  meetings)
- `2-Confidential/Roles/*.md` — role/requisition context (for interview
  meetings). Check the `**Status:**` field to distinguish active from historical
  reqs

## Outputs

- Meeting brief printed to the user (not saved to a file)

---

## Critical: Always Look Up Context First

**BEFORE you create any meeting brief, you MUST look up the attendees in the
knowledge base.**

When the user asks to prep for a meeting:

1. **STOP** — Do not create a generic brief
2. **SEARCH** — Look up each attendee: `rg -l "Attendee Name" [0-9]-*/`
3. **READ** — Read their notes: `cat "3-Team/People/Attendee Name.md"`
4. **UNDERSTAND** — Extract role, organization, history, open items
5. **THEN BRIEF** — Create the meeting brief with this context

## Key Principles

**Ask. Do not guess:**

- If unclear which meeting, ASK
- If multiple upcoming meetings, offer choices
- **WRONG:** "Here's a generic meeting prep template"
- **RIGHT:** "I see meetings with Sarah (2pm) and John (4pm). Which one?"

**Be thorough. Do not be generic:**

- Include specific history, open items, and context from the knowledge base
- Reference actual past interactions and commitments

## Process Flow

### Step 1: Identify the Meeting

Use the calendar query script to find upcoming meetings:

```bash
# Next 2 hours of meetings as JSON
node .claude/skills/sync-apple-calendar/scripts/query.mjs --upcoming 2h --json

# Today's full schedule
node .claude/skills/sync-apple-calendar/scripts/query.mjs --today
```

If "prep me for my next meeting":

- Query upcoming events with `--upcoming 2h`
- Find the next meeting with external attendees
- Confirm with the user if unclear

### Step 2: Parse Calendar Event

Extract: summary, start/end time, attendees (names and emails), description.

### Step 3: Gather Context from Knowledge Base

For each attendee:

```bash
rg -l "attendee_name" 3-Team/People/
rg -l "attendee_email" 3-Team/People/
cat "3-Team/People/Attendee Name.md"
cat "3-Team/Organizations/Their Company.md"
rg -l "attendee_name" 3-Team/Projects/
```

Extract: role/title, company, key facts, previous interactions, open items.

Also check `3-Team/Priorities/` for context relevant to the meeting topic.
For example, if the meeting is about hiring, surface the relevant hiring
Priority's status and progress.

### Step 4: Create Meeting Brief

Format:

```markdown
Meeting Brief: {Attendee Name}
{Time} today / {Company}

About {First Name}
{Role at company}. {Key background — 1-2 sentences}. {What they focus on}.

Your History
- {Date}: {Brief description of interaction/outcome}
- {Date}: {Brief description}
- {Date}: {Brief description}

Open Items
- {Action item} (they asked {date})
- {Action item}

Suggested Talking Points
- {Concrete suggestion based on history}
- {Reference relevant entities with [[wiki-links]]}
```

**Guidelines:**

- Use `[[Name]]` wiki-link syntax for cross-references
- Keep the "About" section to 2-3 sentences max
- History: reverse chronological, 3-5 most relevant items
- Talking points: concrete. Avoid generic suggestions
- If no notes exist for a person, mention that and offer to create one

### Interview Meeting Context

When you prepare for interview meetings (title contains "Interview",
"Screening", "Decomposition", "Panel", or a candidate name from
`2-Confidential/Candidates/`):

1. **Read the candidate brief:** `2-Confidential/Candidates/{Name}/brief.md`
2. **Read the Role file:** Look up the `Req` field and read the corresponding
   `2-Confidential/Roles/*.md` file. Check the `**Status:**` field for context.
3. **Include in the briefing:**
   - Candidate's current status, skills, and screening recommendation
   - Role context: hiring manager, domain lead, remaining positions
   - Other candidates on the same requisition and their statuses (from the Role
     file's Candidates table)
   - Previous interview assessments if this is a second/later stage
   - Panel brief if one exists (`panel.md`)
4. **Format as a dedicated section:**

```markdown
## Candidate: {Name}
**Role:** {Title from Role file} | **Req:** {req number}
**Hiring manager:** {name} | **Domain lead:** {name}
**Status:** {current pipeline status}
**Screening:** {Interview / Interview with focus areas / Pass}

### Pipeline for this req
- {N} candidates total, {N} interviewed, {N} remaining positions

### Key strengths
- {from screening.md}

### Focus areas for this interview
- {from screening.md or panel.md}
```

## Constraints

- Only prep for meetings with external attendees
- Skip internal calendar blocks (DND, Focus Time, Lunch)
- For meetings with multiple attendees, create sections for each key person
- Prioritize recent interactions (last 30 days)
