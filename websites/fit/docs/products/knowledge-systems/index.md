---
title: "Keep Track of Context Without Effort"
description: "Outpost maintains awareness of people, projects, and threads in the background. You do not walk into a meeting cold."
---

You have context scattered across email threads, calendar invites, chat
messages, and last week's notes. To keep track of it all, you depend on your
memory. Memory drops things. Outpost is a personal operations center that runs
AI agents on a schedule.

The agents sync your email and calendar. They build a knowledge graph of the
people and projects you work with. They prepare briefings before meetings. You
set it up once. It keeps working in the background.

By the end of this guide, Outpost runs against your knowledge base. It
maintains a continuously updated picture of your work context.

## Prerequisites

Complete the
[Getting Started: Outpost for Engineers](/docs/getting-started/engineers/outpost/)
guide first. That guide covers how to install Outpost, how to initialize the
knowledge base, and how to start the scheduler. This guide assumes your
knowledge base works and your scheduler runs.

## See what your agents do

Outpost ships with six agents. Each agent owns a slice of your context.
After the scheduler runs for a cycle or two, check what happened:

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

A `+` prefix marks an enabled agent. A `-` prefix marks a disabled agent.
Each entry shows a knowledge base path, a schedule, and a tally of wakes and
last actions. The four agents that matter most when you track context day to
day are:

| Agent              | What it maintains                                        |
| ------------------ | -------------------------------------------------------- |
| **postman**        | Syncs email from Apple Mail and drafts responses         |
| **concierge**      | Syncs calendar from Apple Calendar and prepares briefings|
| **librarian**      | Extracts people, projects, and topics into the knowledge graph |
| **chief-of-staff** | Reads all agent state and compiles a daily overview      |

The recruiter and head-hunter agents handle engineering recruitment workflows.
The default configuration includes them. They do not activate unless you have
candidate data in your knowledge base.

## Understand the knowledge graph

As agents sync email, calendar, and chat data, the librarian processes it into
a knowledge graph. The graph is plain markdown files inside numbered tier
directories at the knowledge base root. Each tier is one unit of sharing. A
lower tier number means a narrower audience:

```text
~/.local/share/fit/outpost/Team/  # The KB root: an Obsidian vault
├── 0-Draft/                # Tier 0: you only -- never shared
├── 1-Management/           # Tier 1: senior managers
├── 2-Confidential/         # Tier 2: managers with hiring duties
│   └── Candidates/         # Candidate records and assessments
├── 3-Team/                 # Tier 3: the whole team
│   ├── People/             # One note per person you interact with
│   ├── Organizations/      # Companies, teams, departments
│   ├── Projects/           # Active projects and initiatives
│   └── Topics/             # Technical topics and recurring themes
├── 4-Public/               # Tier 4: anyone
├── Briefings/              # Personal: briefings from chief-of-staff
├── registry.yaml           # Personal: metadata vocabularies
├── CLAUDE.md               # Personal: agent instructions for this KB
└── .claude/
    ├── agents/             # Agent definitions (one per agent)
    └── skills/             # Skill definitions agents use
```

The tier directories are the graph. Every other root entry is personal and
never shared. Sharing is cumulative. A member who receives tier 2 also
receives tiers 3 and 4. Shares travel over any folder-syncing mount, such as
OneDrive or Git. A shared tier directory is often a symlink into a
separately synced folder. Keep the vault root outside every cloud-synced
folder. Tier 0 then never leaves your machine.

Notes use Obsidian-compatible wiki links. Links in shared tiers are
tier-prefixed, for example `[[3-Team/People/Sarah Chen]]`. A note links only
to its own tier or to a wider one. Agents place each note in the widest tier
that excludes everyone who must not read it. You can browse the graph in
Obsidian or in any markdown editor. Each person note accumulates context from
every email, meeting, and conversation where they appeared. That is the kind
of background you would otherwise reconstruct from memory before a meeting.

You can search the graph directly:

```sh
rg "Sarah Chen" ~/.local/share/fit/outpost/Team/3-Team/
```

```text
People/Sarah Chen.md:3:Engineering Manager at Acme Corp
People/Sarah Chen.md:8:Last seen: standup 2026-05-02
Projects/Auth Migration.md:12:Lead: [[3-Team/People/Sarah Chen]]
Topics/Platform Reliability.md:5:Raised by [[3-Team/People/Sarah Chen]] in Q1 review
```

The search returns every note that mentions the person across all entity
types. You see the full context in one search.

## Split one entity across tiers with overlays

Some entities carry facts for different audiences. A colleague who is also a
candidate has a team-safe person note and confidential recruitment records.
An **overlay** keeps both without a leak. The overlay is a note in a
narrower tier. It declares its canonical note in the wider tier with a
one-way `canonical` link. The canonical note never links back. Three overlay
forms cover the common cases:

- **Facet** — the overlay holds the sections for the narrower audience.
- **Timeline split** — the canonical note keeps the wide-audience dated
  entries. The overlay holds narrower entries under the same date keys.
- **Inverse stub** — when the content is narrow but widely linked, a
  wider-tier stub carries only shareable identity facts. The narrow note
  links down to it.

## Send a copy to an ad-hoc audience with an export

Some audiences are not tiers. A deliverable for one named recipient and a
brief for a panel of peers are **export** cases. An export sends a copy of a
note or a note's body through mail, chat, or a file hand-over. The note
itself keeps its tier. Agents compose export bodies in `0-Draft/`. Nothing
leaves until you approve it.

## One metadata standard binds every tier

Agents stamp YAML frontmatter on every note they write. Every shared note
carries `type`, `created`, and `updated`. Conditional keys such as `aliases`
and `status` follow strict triggers. The vocabularies live in
`registry.yaml` at the KB root. You edit the registry. Agents only select
from it. Tags form a closed `topic/` taxonomy from the same registry.

The payoff is coherence across tiers. Obsidian Bases group notes by `type`
and `status` across every tier you hold. Aliases reunite a person note and
its candidate record in the quick switcher. Path-keyed graph groups color
each tier in the graph view. The note path stays the only tier authority.
Frontmatter never carries a tier or audience key.

## Customize agent schedules

The default schedule runs agents during business hours on weekdays. You may
want to adjust when agents run. For example, adjust it if you work across time
zones or want briefings earlier.

Agent schedules live in the Outpost configuration file at
`~/.fit/outpost/scheduler.json`. Each agent entry specifies a knowledge base
path, a required `privilege` level, a schedule, and whether the agent is
enabled. Use `full` for agents that sync the live mail/calendar stores or send
mail. Use `restricted` for agents that only process already-synced content:

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

To disable an agent and keep its configuration, set `"enabled": false`.
Restart the daemon after you edit the file:

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

Use this when new email arrived and you want the postman to sync it before a
meeting. Use it also when you want a fresh briefing:

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
the last one: new emails, upcoming meetings, open threads, and action items.

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

Omit the path to update the knowledge base in the current directory. You can
then run the command from inside the KB:

```sh
cd ~/.local/share/fit/outpost/Team
npx fit-outpost update
```

The update copies the latest `CLAUDE.md`, agent definitions, skill files, and
settings into your knowledge base. It merges new permissions into your existing
`settings.json`. It does not overwrite your customizations.

## Validate your setup

After you update or change agent configurations, confirm the setup:

```sh
npx fit-outpost validate
```

Expected output when all agents and knowledge bases are valid:

```text
Validating agents...

  [OK]  postman: agent definition
  [OK]  concierge: agent definition
  [OK]  librarian: agent definition
  [OK]  chief-of-staff: agent definition
  [OK]  recruiter: agent definition
  [OK]  head-hunter: agent definition

All OK.

Knowledge base: ~/.local/share/fit/outpost/Team
  OK
```

The validator first checks that each configured agent has a matching
definition file in `.claude/agents/`. The file can live in the knowledge
base or in your global `~/.claude/agents/` directory. A `[FAIL]` result
means the agent definition is missing. Run `npx fit-outpost update <path>`
to restore it, or run `npx fit-outpost update` from inside the knowledge
base.

The validator then runs the knowledge checks on each configured knowledge
base. It checks tier ranks, link direction, link resolution, link format,
literal path strings, legacy layouts, and note frontmatter and tags. A
`validation-baseline.json` file at the KB root downgrades known findings to
warnings. New findings exit with a non-zero code. Pass a path to check one
vault or a received share (`npx fit-outpost validate <path>`). Add `--json`
for machine-readable findings.

## Verify

You reach the outcome of this guide when:

- `npx fit-outpost status` shows agents with recent wake times and action
  summaries. Outpost tracks context automatically.
- Your knowledge base contains notes under `3-Team/People/`,
  `3-Team/Projects/`, and `3-Team/Organizations/`. The agents build the
  knowledge graph from your email and calendar.
- `Briefings/` contains at least one daily briefing. The chief-of-staff
  compiles context across all agents.
- You can search the graph with `rg "name" 3-Team/` and find cross-referenced
  context about a person or project.

If any of these are missing, check `npx fit-outpost status` for errors.
Then review the logs at `~/.fit/outpost/logs/`.

## What's next

<div class="grid">

<!-- part:card:meeting-prep -->

</div>
