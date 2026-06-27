---
title: "Keep Track of Context Without Effort"
description: "Stop walking into meetings cold — Outpost assembles and maintains awareness of people, projects, and threads in the background."
---

You have context scattered across email threads, calendar invites, chat
messages, and last week's notes. Keeping track of it all depends on memory --
yours -- and memory drops things. Outpost is a personal operations center that
runs AI agents on a schedule, syncing your email and calendar, building a
knowledge graph of the people and projects you work with, and preparing
briefings before meetings. You set it up once; it keeps working in the
background.

By the end of this guide, Outpost will be running against your knowledge base,
maintaining a continuously updated picture of your work context.

## Prerequisites

Complete the
[Getting Started: Outpost for Engineers](/docs/getting-started/engineers/outpost/)
guide first. That guide covers installation, knowledge base initialization, and
starting the scheduler. This guide assumes you have a working knowledge base
and a running scheduler.

## See what your agents are doing

Outpost ships with six agents, each responsible for a slice of your context.
After the scheduler has been running for a cycle or two, check what is
happening:

```sh
npx fit-outpost status
```

Expected output:

```text
Outpost Scheduler
==================

Agents:
  + postman
    KB: ~/.local/share/fit/outpost/Team  Schedule: {"type":"cron","expression":"*/15 8-18 * * 1-5"}
    Status: idle  Last wake: 5/4/2026, 9:15:00 AM  Wakes: 12
    Last action: Synced 3 new mail threads
  + concierge
    KB: ~/.local/share/fit/outpost/Team  Schedule: {"type":"cron","expression":"*/30 8-18 * * 1-5"}
    Status: idle  Last wake: 5/4/2026, 9:00:00 AM  Wakes: 6
    Last action: Prepared briefing for 10:00 AM standup
  + librarian
    KB: ~/.local/share/fit/outpost/Team  Schedule: {"type":"cron","expression":"0 9,12,15,18 * * 1-5"}
    Status: idle  Last wake: 5/4/2026, 9:00:00 AM  Wakes: 3
    Last action: Extracted 5 entities from recent mail
  + chief-of-staff
    KB: ~/.local/share/fit/outpost/Team  Schedule: {"type":"cron","expression":"0 7,18 * * 1-5"}
    Status: idle  Last wake: 5/4/2026, 7:00:00 AM  Wakes: 2
    Last action: Compiled daily briefing
  + recruiter
    KB: ~/.local/share/fit/outpost/Team  Schedule: {"type":"cron","expression":"0 8,12,17 * * 1-5"}
    Status: never-woken  Last wake: never  Wakes: 0
  + head-hunter
    KB: ~/.local/share/fit/outpost/Team  Schedule: {"type":"cron","expression":"0 9 * * 1-5"}
    Status: never-woken  Last wake: never  Wakes: 0
```

Each agent has a `+` or `-` prefix (enabled or disabled), a knowledge base
path, a schedule, and a running tally of wakes and last actions. The four
agents that matter most for day-to-day context tracking are:

| Agent              | What it maintains                                        |
| ------------------ | -------------------------------------------------------- |
| **postman**        | Syncs email from Apple Mail and drafts responses         |
| **concierge**      | Syncs calendar from Apple Calendar and prepares briefings|
| **librarian**      | Extracts people, projects, and topics into the knowledge graph |
| **chief-of-staff** | Reads all agent state and compiles a daily overview      |

The recruiter and head-hunter agents handle engineering recruitment workflows.
They are included in the default configuration but will not activate unless you
have candidate data in your knowledge base.

## Understand the knowledge graph

As agents sync email, calendar, and chat data, the librarian processes it into
a knowledge graph -- plain markdown files organized by entity type. Only the
`Knowledge/` graph is shared with the team over a synced filesystem (e.g.
OneDrive); the rest of the workspace stays personal and local:

```text
~/.local/share/fit/outpost/Team/          # Your workspace root -- NOT shared
├── Knowledge/                 # The knowledge graph -- SHARED with the team
│   ├── People/                # One note per person you interact with
│   ├── Organizations/         # Companies, teams, departments
│   ├── Projects/              # Active projects and initiatives
│   └── Topics/                # Technical topics and recurring themes
├── Briefings/                 # Daily briefings compiled by chief-of-staff
├── Drafts/                    # Email and chat drafts
├── CLAUDE.md                  # Agent instructions for this KB
└── .claude/
    ├── agents/                # Agent definitions (one per agent)
    └── skills/                # Skill definitions agents use
```

Notes use Obsidian-compatible `[[backlinks]]`, so the graph is browsable in
Obsidian or any markdown editor. Each person note accumulates context from
every email, meeting, and conversation where they appeared -- the kind of
background you would otherwise reconstruct from memory before a meeting.

You can search the graph directly:

```sh
rg "Sarah Chen" ~/.local/share/fit/outpost/Team/Knowledge/
```

```text
People/Sarah Chen.md:3:Engineering Manager at Acme Corp
People/Sarah Chen.md:8:Last seen: standup 2026-05-02
Projects/Auth Migration.md:12:Lead: [[Sarah Chen]]
Topics/Platform Reliability.md:5:Raised by [[Sarah Chen]] in Q1 review
```

This surfaces every note that mentions the person, across all entity types --
giving you the full picture rather than a single file.

## Customize agent schedules

The default schedule runs agents during business hours on weekdays. You may
want to adjust timing -- for example, if you work across time zones or want
briefings earlier.

Agent schedules live in the Outpost configuration file at
`~/.fit/outpost/scheduler.json`. Each agent entry specifies a knowledge base
path, a required `privilege` level (`full` for agents that sync the live
mail/calendar stores or send mail, `restricted` for agents that only process
already-synced content), a schedule, and whether the agent is enabled:

```json
{
  "agents": {
    "postman": {
      "kb": "~/.local/share/fit/outpost/Team",
      "privilege": "full",
      "schedule": { "type": "cron", "expression": "*/15 8-18 * * 1-5" },
      "enabled": true
    },
    "chief-of-staff": {
      "kb": "~/.local/share/fit/outpost/Team",
      "privilege": "restricted",
      "schedule": { "type": "cron", "expression": "0 7,18 * * 1-5" },
      "enabled": true
    }
  }
}
```

The `schedule` object supports three types:

| Type       | Format                                                         | Example                        |
| ---------- | -------------------------------------------------------------- | ------------------------------ |
| `cron`     | Standard cron expression in `{ "type": "cron", "expression": "..." }` | `*/30 8-18 * * 1-5` (every 30 min, business hours) |
| `interval` | Minutes between wakes in `{ "type": "interval", "minutes": N }` | `{ "type": "interval", "minutes": 10 }` |
| `once`     | Single run at a specific time in `{ "type": "once", "runAt": "..." }` | `{ "type": "once", "runAt": "2026-05-05T09:00:00Z" }` |

To disable an agent without removing its configuration, set `"enabled": false`.
After editing the file, restart the daemon:

```sh
npx fit-outpost stop
npx fit-outpost daemon
```

```text
Scheduler stopped.
Scheduler started (6 agents, daemon mode).
```

## Wake an agent on demand

You do not have to wait for the next scheduled cycle. To run an agent
immediately:

```sh
npx fit-outpost wake postman
```

```text
Waking postman...
  Synced 2 new mail threads
  Done (4.2s)
```

This is useful when you know new email has arrived and you want it synced
before a meeting, or when you want a fresh briefing:

```sh
npx fit-outpost wake chief-of-staff
```

```text
Waking chief-of-staff...
  Compiled daily briefing (12 items)
  Done (6.8s)
```

The chief-of-staff reads triage files from all other agents and compiles a
briefing in `Briefings/`. Each briefing summarizes what changed since
the last one -- new emails, upcoming meetings, open threads, and action items.

## Update agents and skills

Outpost ships updated agent definitions and skills with each release. To
fetch the latest into your knowledge base:

```sh
npx fit-outpost update ~/.local/share/fit/outpost/Team
```

```text
Updating ~/.local/share/fit/outpost/Team...
  CLAUDE.md              updated
  agents/postman.md      updated
  skills/sync-apple-mail unchanged
  settings.json          merged (2 new permissions)
  Done.
```

Omit the path to update the knowledge base in the current directory, so you
can run it from inside the KB itself:

```sh
cd ~/.local/share/fit/outpost/Team
npx fit-outpost update
```

The update copies the latest `CLAUDE.md`, agent definitions, skill files, and
settings into your knowledge base, merging new permissions into your existing
`settings.json` without overwriting your customizations.

## Validate your setup

After updating or making changes to agent configurations, confirm everything
is wired correctly:

```sh
npx fit-outpost validate
```

Expected output when all agents are valid:

```text
Validating agents...

  [OK]  postman: agent definition
  [OK]  concierge: agent definition
  [OK]  librarian: agent definition
  [OK]  chief-of-staff: agent definition
  [OK]  recruiter: agent definition
  [OK]  head-hunter: agent definition

All OK.
```

The validator checks that each configured agent has a matching agent definition
file in `.claude/agents/` (either in the knowledge base or in your global
`~/.claude/agents/` directory). A `[FAIL]` result means the agent definition
is missing -- run `npx fit-outpost update <path>` (or `npx fit-outpost update`
from inside the knowledge base) to restore it.

## Verify

You have reached the outcome of this guide when:

- `npx fit-outpost status` shows agents with recent wake times and action
  summaries -- context is being tracked automatically.
- Your knowledge base contains notes under `Knowledge/People/`,
  `Knowledge/Projects/`, and `Knowledge/Organizations/` -- the knowledge graph
  is being built from your email and calendar.
- `Briefings/` contains at least one daily briefing -- the
  chief-of-staff is compiling context across all agents.
- You can search the graph with `rg "name" Knowledge/` and find cross-referenced
  context about a person or project.

If any of these are missing, check `npx fit-outpost status` for errors and
review the logs at `~/.fit/outpost/logs/`.

## What's next

<div class="grid">

<!-- part:card:meeting-prep -->

</div>
