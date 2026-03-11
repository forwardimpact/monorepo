---
title: Basecamp
description: Set up camp — a personal knowledge system with scheduled AI tasks that keeps you briefed, organized, and field-ready.
layout: product
toc: false
hero:
  image: /assets/heros/basecamp.svg
  alt: An engineer, an AI robot, and a business professional setting up an A-frame tent together
  subtitle: Set up camp. Basecamp is your personal operations center — it syncs your email and calendar, builds a knowledge graph, drafts responses, prepares meeting briefs, and organizes your files. All running as scheduled AI tasks in the background.
  cta:
    - label: Documentation
      href: /docs/basecamp/
    - label: View on npm
      href: https://www.npmjs.com/package/@forwardimpact/basecamp
      secondary: true
---

> Everything you and your team know, in one place. Basecamp is a scheduler that
> runs Claude Code tasks on a timer — syncing data, extracting entities,
> drafting emails, preparing for meetings. No server, no database — just plain
> files, markdown, and Claude. Your knowledge base is Obsidian-compatible, your
> config is JSON, and everything is transparent.

### What you get

- Automatic email and calendar sync from Apple Mail and Calendar
- A knowledge graph of people, organizations, projects, and topics
- AI-drafted email responses that use your full context
- Meeting preparation briefings before every call
- Presentation generation from markdown to PDF
- File organization and cleanup on autopilot
- A macOS status menu showing what's running

---

### Who it's for

**Busy engineers and managers** who want an AI assistant that actually knows
their context — who they work with, what projects are active, and what's coming
up next.

**Anyone on macOS** who wants a set-and-forget knowledge system that runs
quietly in the background and keeps getting smarter about your work.

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

## Quick Start

```sh
npx fit-basecamp --init ~/Documents/Team   # Initialize knowledge base
npx fit-basecamp --daemon                   # Start the scheduler
npx fit-basecamp --status                   # Check what's happening
npx fit-basecamp --run sync-mail            # Run a task now
```
