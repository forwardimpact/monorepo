---
title: Basecamp
description: Set up camp — a personal knowledge system that keeps you briefed, organized, and ready.
---

<div class="page-header">
<img src="/assets/icons/basecamp.svg" alt="Basecamp" />

## Set Up Camp

</div>

<div class="product-value">
<p>
Basecamp is your personal operations center. It syncs your email and calendar,
builds a knowledge graph of the people and projects you work with, drafts
responses, prepares meeting briefs, and organizes your files — all running as
scheduled AI tasks in the background. No server, no database — just plain files,
markdown, and Claude.
</p>
</div>

### What you get

<ul class="benefits">
<li>Automatic email and calendar sync from Apple Mail and Calendar</li>
<li>A knowledge graph of people, organizations, projects, and topics</li>
<li>AI-drafted email responses that use your full context</li>
<li>Meeting preparation briefings before every call</li>
<li>Presentation generation from markdown to PDF</li>
<li>File organization and cleanup on autopilot</li>
<li>A macOS status menu showing what's running</li>
</ul>

### Who it's for

**Busy engineers and managers** who want an AI assistant that actually knows
their context — who they work with, what projects are active, and what's coming
up next.

**Anyone on macOS** who wants a set-and-forget knowledge system that runs
quietly in the background and keeps getting smarter about your work.

---

## Quick Start

<div class="quickstart">

### Initialize your knowledge base

```sh
npx fit-basecamp --init ~/Documents/Team
```

### Start the scheduler

```sh
npx fit-basecamp --daemon
```

### Check what's happening

```sh
npx fit-basecamp --status
```

### Run a specific task now

```sh
npx fit-basecamp --run sync-mail
```

</div>

---

## How It Works

Basecamp is a scheduler that runs Claude Code tasks on a timer. Each task has a
prompt, a schedule, and a target knowledge base directory.

1. The scheduler reads your task configuration
2. When a task is due, it invokes Claude with the task prompt
3. Claude reads the knowledge base's instructions and skill files
4. Claude executes the task — syncing data, extracting entities, drafting emails
5. Results are written as plain markdown and JSON files

Everything is transparent. Your knowledge graph is Obsidian-compatible markdown.
Your drafts are plain text. Your config is JSON. No magic, no lock-in.

---

## Built-in Skills

| Skill                    | What it does                                   |
| ------------------------ | ---------------------------------------------- |
| **Sync Apple Mail**      | Reads email threads from Mail.app via SQLite   |
| **Sync Apple Calendar**  | Reads upcoming events from Calendar.app        |
| **Extract Entities**     | Processes synced data into a knowledge graph   |
| **Draft Emails**         | Writes response drafts using your full context |
| **Meeting Prep**         | Creates briefings before upcoming meetings     |
| **Create Presentations** | Generates PDF slide decks from markdown        |
| **Document Collab**      | Assists with document creation and editing     |
| **Organize Files**       | Cleans up and organizes your files             |

---

## The Knowledge Base

Each knowledge base is a self-contained directory:

```
~/Documents/Team/
├── CLAUDE.md              # Instructions for AI tasks
├── knowledge/             # Knowledge graph (Obsidian-compatible)
│   ├── People/
│   ├── Organizations/
│   ├── Projects/
│   └── Topics/
├── .claude/skills/        # Task skill files
└── drafts/                # Email drafts
```

You can have multiple knowledge bases — for different teams, projects, or
contexts. The scheduler manages them all from one configuration.

---

## macOS Status Menu

Basecamp includes a native macOS status menu app that sits in your menu bar. It
shows the status of every scheduled task — what's running, what finished, and
when the next run is due. Click any task to run it immediately or see error
details.

---

## Technical Reference

### Standalone Binary

Basecamp compiles to a self-contained executable via Deno, embedding the
knowledge base template so `basecamp --init` works without source files:

```sh
npm run build           # Build for current architecture
npm run build:all       # Build for arm64 + x86_64
```

### Configuration

Task schedules are defined in `~/.fit/basecamp/scheduler.json`:

```json
{
  "tasks": {
    "sync-mail": {
      "kb": "~/Documents/Team",
      "schedule": { "type": "interval", "minutes": 5 },
      "prompt": "Sync Apple Mail.",
      "skill": "sync-apple-mail",
      "enabled": true
    }
  }
}
```

### CLI Reference

```sh
npx fit-basecamp                     # Run due tasks once
npx fit-basecamp --daemon            # Run continuously
npx fit-basecamp --run <task>        # Run a task immediately
npx fit-basecamp --init <path>       # Initialize a knowledge base
npx fit-basecamp --install-launchd   # Install macOS LaunchAgent
npx fit-basecamp --uninstall-launchd # Remove LaunchAgent
npx fit-basecamp --validate          # Check task references
npx fit-basecamp --status            # Show task status
```
