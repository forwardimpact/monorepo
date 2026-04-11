---
title: "Knowledge Systems"
description: "Set up Basecamp for personal knowledge management — scheduler, tasks, and knowledge base structure."
---

Basecamp is a personal knowledge system. It schedules AI tasks that run in the
background against your personal knowledge base — syncing email, preparing
meeting briefings, organizing notes, and keeping you ready for the day ahead.

## Scheduler

The scheduler runs tasks on a configurable schedule. It supports three modes:

| Mode            | Command                                | Description                    |
| --------------- | -------------------------------------- | ------------------------------ |
| **Run once**    | `npx fit-basecamp`                     | Execute all due tasks and exit |
| **Daemon**      | `npx fit-basecamp daemon`              | Run continuously on schedule   |
| **Single task** | `npx fit-basecamp wake daily_briefing` | Run one specific task          |

The scheduler tracks task state in a `state.json` file, recording when each task
last ran and whether it succeeded. On each cycle, it checks which tasks are due
based on their schedule and runs them in order.

Logs are written to a log directory inside your knowledge base, one file per
task per run. Check recent activity:

```sh
npx fit-basecamp status
```

## Task Configuration

Tasks are defined in a `scheduler.json` file inside your knowledge base. Each
task specifies what to do and when:

```json
{
  "tasks": [
    {
      "id": "daily_briefing",
      "name": "Daily Briefing",
      "schedule": "0 7 * * *",
      "agent": "briefing",
      "enabled": true
    },
    {
      "id": "mail_sync",
      "name": "Email Sync",
      "schedule": "*/30 * * * *",
      "agent": "mail",
      "enabled": true
    }
  ]
}
```

Task properties:

| Property   | Description                            |
| ---------- | -------------------------------------- |
| `id`       | Unique task identifier                 |
| `name`     | Human-readable name                    |
| `schedule` | Cron expression for when the task runs |
| `agent`    | Which agent skill to use for execution |
| `enabled`  | Whether the task is active             |

Default tasks include:

| Task           | Schedule         | Purpose                       |
| -------------- | ---------------- | ----------------------------- |
| Mail sync      | Every 30 minutes | Sync and organize email       |
| Calendar prep  | Hourly           | Prepare meeting briefings     |
| Daily briefing | 7:00 AM          | Compile daily overview        |
| Weekly review  | Monday 8:00 AM   | Summarize the past week       |
| File organizer | Daily            | Organize knowledge base files |

Environment variables for mail and calendar integrations are configured in your
knowledge base's environment file.

## Knowledge Base Structure

A Basecamp knowledge base is a directory with a specific structure:

```
~/Documents/Personal/
├── .claude/
│   └── skills/           # Agent skill definitions
├── CLAUDE.md             # Agent instructions for this KB
├── USER.md               # Your profile and preferences
├── scheduler.json        # Task configuration
├── state.json            # Scheduler state (auto-managed)
├── mail/                 # Synced email
├── calendar/             # Calendar data and briefings
├── notes/                # Your notes and documents
├── files/                # Organized files
└── logs/                 # Task execution logs
```

### KB Skills

The `.claude/skills/` directory contains skill definitions that agents use when
executing tasks. Each skill is a directory with instructions for a specific
capability — how to process email, how to prepare a briefing, how to organize
files.

Skills are generated from your engineering framework (see
[Agent Teams](/docs/guides/agent-teams/)) but can also be customized for
personal workflows.

## Initialization

Set up a new knowledge base:

```sh
npx fit-basecamp init ~/Documents/Personal/
```

This creates the directory structure, copies default skill definitions, and
generates a starter `scheduler.json`. You can then customize the configuration
and add your own notes and files.

## Key Commands

| Command                        | Description                             |
| ------------------------------ | --------------------------------------- |
| `npx fit-basecamp init <path>` | Initialize a new knowledge base         |
| `npx fit-basecamp`             | Run all due tasks once                  |
| `npx fit-basecamp daemon`      | Run continuously                        |
| `npx fit-basecamp wake <id>`   | Run a single task                       |
| `npx fit-basecamp status`      | Show scheduler status                   |
| `npx fit-basecamp stop`        | Stop the daemon and all running agents  |
| `npx fit-basecamp update`      | Update KB with latest agents and skills |
| `npx fit-basecamp validate`    | Validate agent definitions              |

## Paths and Directories

| Path                    | Purpose                         |
| ----------------------- | ------------------------------- |
| `~/Documents/Personal/` | Default knowledge base location |
| `.claude/skills/`       | Agent skill definitions         |
| `scheduler.json`        | Task schedule configuration     |
| `state.json`            | Task execution state            |
| `logs/`                 | Execution logs                  |

## Related Documentation

- [CLI Reference](/docs/reference/cli/) — complete command documentation for
  `fit-basecamp`
- [Agent Teams](/docs/guides/agent-teams/) — how agent skills are generated from
  your framework
