---
name: meeting-prep
description: Prepare for meetings by gathering context from the knowledge base and calendar. Use when the user asks to prep for a meeting or wants a briefing on upcoming meetings. Creates personalized briefings with attendee history, open items, and suggested talking points.
---

# Meeting Prep

Help the user prepare for meetings by gathering context from the knowledge base
and calendar. Creates personalized briefing documents with attendee history,
open items, and suggested talking points.

## Trigger

Run when the user asks to prep for a meeting, or wants a briefing on upcoming
meetings.

## Prerequisites

- Calendar data synced in `~/.cache/fit/basecamp/apple_calendar/`
- Knowledge base populated (from `extract-entities` skill)

## Inputs

- `~/.cache/fit/basecamp/apple_calendar/*.json` — calendar events
- `knowledge/People/*.md` — attendee context
- `knowledge/Organizations/*.md` — company context
- `knowledge/Projects/*.md` — project context
- `knowledge/Candidates/*/brief.md` — candidate context (for interview meetings)
- `knowledge/Roles/*.md` — role/requisition context (for interview meetings)

## Outputs

- Meeting brief printed to the user (not saved to a file)

---

## Critical: Always Look Up Context First

**BEFORE creating any meeting brief, you MUST look up the attendees in the
knowledge base.**

When the user asks to prep for a meeting:

1. **STOP** — Do not create a generic brief
2. **SEARCH** — Look up each attendee: `rg -l "Attendee Name" knowledge/`
3. **READ** — Read their notes: `cat "knowledge/People/Attendee Name.md"`
4. **UNDERSTAND** — Extract role, organization, history, open items
5. **THEN BRIEF** — Create the meeting brief using this context

## Key Principles

**Ask, don't guess:**

- If unclear which meeting, ASK
- If multiple upcoming meetings, offer choices
- **WRONG:** "Here's a generic meeting prep template"
- **RIGHT:** "I see meetings with Sarah (2pm) and John (4pm). Which one?"

**Be thorough, not generic:**

- Include specific history, open items, and context from knowledge base
- Reference actual past interactions and commitments

## Processing Flow

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
- Confirm with user if unclear

### Step 2: Parse Calendar Event

Extract: summary, start/end time, attendees (names and emails), description.

### Step 3: Gather Context from Knowledge Base

For each attendee:

```bash
rg -l "attendee_name" knowledge/People/
rg -l "attendee_email" knowledge/People/
cat "knowledge/People/Attendee Name.md"
cat "knowledge/Organizations/Their Company.md"
rg -l "attendee_name" knowledge/Projects/
```

Extract: role/title, company, key facts, previous interactions, open items.

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
- Keep "About" section to 2-3 sentences max
- History: reverse chronological, 3-5 most relevant items
- Talking points: concrete, not generic
- If no notes exist for a person, mention that and offer to create one

### Interview Meeting Context

When preparing for interview meetings (title contains "Interview", "Screening",
"Decomposition", "Panel", or a candidate name from `knowledge/Candidates/`):

1. **Read the candidate brief:** `knowledge/Candidates/{Name}/brief.md`
2. **Read the Role file:** Look up the `Req` field and read the corresponding
   `knowledge/Roles/*.md` file.
3. **Include in the briefing:**
   - Candidate's current status, skills, and screening recommendation
   - Role context: hiring manager, domain lead, remaining positions
   - Other candidates on the same requisition and their statuses (from the
     Role file's Candidates table)
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
