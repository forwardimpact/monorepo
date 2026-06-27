---
title: "Walk Into Every Meeting Already Oriented"
description: "Walk into any meeting already oriented — attendee context, open items, and talking points assembled before you sit down."
---

You need to prepare for a meeting without scrambling through inboxes and chat
threads for context on who you are meeting and what is outstanding with them.

## Prerequisites

Complete
[Keep Track of Context Without Effort](/docs/products/knowledge-systems/) first.
That guide covers knowledge base setup, agent scheduling, and the knowledge
graph structure. The steps below assume your Outpost agents are running and your
knowledge graph has been accumulating context from email and calendar syncs.

## Check your schedule

Start by seeing what is coming up. The calendar query script reads synced events
and filters by time window:

```sh
node .claude/skills/sync-apple-calendar/scripts/query.mjs --upcoming 2h
```

```text
=== 2026-05-04 (today) ===
09:00-09:30 | Daily standup | Engineering Team [in 45min]
10:00-10:30 | Auth migration sync | Sarah Chen, Bob Kumar [in 105min]

2 event(s) | now: 2026-05-04T08:15:00.000Z
```

The `--upcoming 2h` flag shows meetings starting within two hours, with a
countdown. Use `--today` for the full day or `--tomorrow` to prepare the evening
before.

## Look up attendees in the knowledge graph

Before generating a briefing, search the knowledge graph for each attendee.
This is the step that turns a generic calendar entry into useful preparation:

```sh
rg "Sarah Chen" ~/.local/share/fit/outpost/team/Knowledge/
```

```text
People/Sarah Chen.md:3:Engineering Manager at Acme Corp
People/Sarah Chen.md:8:Last seen: standup 2026-05-02
People/Sarah Chen.md:15:- 2026-04-28: Raised concern about auth migration timeline
Projects/Auth Migration.md:12:Lead: [[Sarah Chen]]
Projects/Auth Migration.md:18:Status: blocked on identity provider contract
Topics/Platform Reliability.md:5:Raised by [[Sarah Chen]] in Q1 review
```

The results span people, projects, and topics because the
librarian agent links entities with `[[backlinks]]` as it processes your email
and calendar. A single search surfaces the full picture rather than a single
file.

Read the person note for the full picture:

```sh
cat ~/.local/share/fit/outpost/team/Knowledge/People/Sarah\ Chen.md
```

The note contains context (role, what they focus on), a reverse-chronological
interaction history, and an Open Items section with unresolved commitments --
the details that disappear from memory between meetings but determine whether
someone feels heard.

## Wake the concierge for a fresh briefing

The concierge agent prepares meeting briefings automatically on its schedule.
If you want a briefing now rather than waiting for the next cycle, wake it on
demand:

```sh
npx fit-outpost wake concierge
```

```text
Waking concierge...
  Synced 4 calendar events
  Prepared briefing for 10:00 AM Auth migration sync
  Done (5.1s)
```

The concierge checks for meetings within the next two hours, looks up each
attendee in the knowledge graph, and assembles a briefing. If no meetings are
imminent, it reports idle.

## Read the daily briefing

The chief-of-staff agent compiles a broader daily briefing that includes
meeting prep alongside email highlights, open threads, and action items:

```sh
npx fit-outpost wake chief-of-staff
```

```text
Waking chief-of-staff...
  Compiled daily briefing (14 items)
  Done (7.2s)
```

The result is saved to `Briefings/2026-05-04-morning.md`. It
includes today's schedule (meetings marked `PREPPED` have attendee context
already assembled), priority actions linked to today's meetings, and open
commitments to the people you are seeing.

## Prepare for a specific meeting on demand

When you want to go deeper than the scheduled briefing, ask for meeting prep
directly in your knowledge base:

```sh
cd ~/.local/share/fit/outpost/team && claude "prep me for my 10am meeting"
```

The meeting-prep skill identifies the meeting from your calendar, looks up every
attendee in the knowledge graph, and produces a structured briefing with
sections for each person:

```text
Meeting Brief: Auth Migration Sync
10:00 today / Sarah Chen, Bob Kumar

About Sarah
Engineering Manager at Acme Corp. Leading the Auth Migration project
since Q4 2025. Focused on platform reliability and compliance deadlines.

Your History
- 2026-05-02: Standup -- mentioned identity provider contract unsigned
- 2026-04-28: Raised concern about auth migration timeline

Open Items
- Review staffing plan she shared 2026-04-15

Suggested Talking Points
- Identity provider contract status -- [[Auth Migration]] is blocked on this
- Staffing plan feedback -- Sarah asked 2026-04-15, still pending
```

Each section draws from a different part of the knowledge graph: person notes,
project status, and interaction history. Talking points are specific to this
meeting and these attendees, not generic templates.

For interview meetings, the briefing also surfaces candidate briefs from
`Knowledge/Candidates/` and pipeline status from `Knowledge/Roles/`.

## Verify

You have reached the outcome of this guide when:

- You can query your calendar with `--today` or `--upcoming 2h` and see
  meetings with attendee names.
- Searching the knowledge graph with `rg "name" Knowledge/` returns
  cross-referenced context about the people you are meeting.
- `npx fit-outpost wake concierge` produces a briefing for an upcoming meeting,
  drawing on knowledge graph data rather than generic placeholders.
- The chief-of-staff's daily briefing in `Briefings/` includes your
  schedule, priority actions tied to today's meetings, and open commitments to
  the people you are seeing.

If attendee context is thin, your knowledge graph may need more time to
accumulate data. Check that the postman and librarian agents are running --
`npx fit-outpost status` -- and that email sync is producing notes under
`Knowledge/People/`.

## What's next

<div class="grid">

<!-- part:card:.. -->

</div>
