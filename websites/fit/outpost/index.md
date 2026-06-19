---
title: Outpost
description: Walk into every meeting already oriented — scheduled AI tasks assemble your context and keep your knowledge organized.
layout: product
toc: false
hero:
  image: /assets/scene-outpost.svg
  alt: An engineer, an AI robot, and a business professional setting up an A-frame tent together
  subtitle: Set up camp. Outpost keeps you prepared — it syncs your email and calendar, builds a knowledge graph, drafts responses, and prepares meeting briefs. All running as scheduled AI tasks in the background.
  cta:
    - label: View on GitHub
      href: https://github.com/forwardimpact/monorepo/tree/main/products/outpost
    - label: View on npm
      href: https://www.npmjs.com/package/@forwardimpact/outpost
      secondary: true
---

Walking into a meeting cold because context was scattered across email, Slack,
and last week's notes. Outpost assembles and maintains that context so you
arrive already oriented.

## What becomes possible

### For Empowered Engineers

Keep track of people, projects, and threads without depending on memory. Walk
into every meeting already oriented. Set it up once and it keeps working in the
background — continuous awareness without continuous effort.

- Automatic email and calendar sync from Apple Mail and Calendar
- A knowledge graph of people, organizations, projects, and topics
- AI-drafted email responses using your full context
- Meeting preparation briefings before every call
- Presentation generation and file organization on autopilot

---

## How Outpost Works

### Core Skills

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

### Prerequisites

Outpost spawns `claude` as a subprocess without loading your shell profile.
Install Claude Code via **Homebrew** (`brew install claude`) rather than the
native binary — the Homebrew install runs on Node.js, which supports
`NODE_EXTRA_CA_CERTS` for enterprise CA certificates.

If your network requires a custom CA bundle, add an `env` block to
`~/.fit/outpost/scheduler.json`:

```json
{
  "env": {
    "NODE_EXTRA_CA_CERTS": "~/.config/ssl/ca-bundle.pem"
  }
}
```

---

## Choosing your posture

Before you turn Outpost on, decide how much it acts on your behalf. You record
this choice at `init`, and the scheduler honours it on every wake. There are two
postures, named the same in the CLI and in `fit-outpost status`:

- **`brief`** — the default. Outpost runs only skills whose every output stays
  inside its own knowledge base or cache: syncing your mail and calendar,
  building the knowledge graph, and preparing briefings. It never composes a
  reply, message, or document for someone else, and never moves files outside
  the knowledge base. This is the read-and-brief side of the line.
- **`brief+draft`** — everything `brief` does, plus the skills that compose
  content as you: email replies, chat messages, and documents. Outpost only
  drafts these for you to stage for review; nothing leaves until you give
  explicit approval. Choose this posture when you want help writing, not just
  awareness.

A fresh `init` defaults to `brief`. You opt into drafting deliberately — the
trust contract is something you turn on, not something you discover later.

## Getting Started

> **Outpost currently requires macOS.** Email and calendar sync read from
> Apple Mail and Apple Calendar, and a transitive dependency
> (`@forwardimpact/libmacos`) declares `"os": ["darwin"]`. `npm install
> @forwardimpact/outpost` will fail on Linux and Windows with `EBADPLATFORM`
> — there is no degraded mode today. A cross-platform degraded install
> (without Apple sync) is on the roadmap; until it ships, install Outpost on
> a Mac.
>
> **Which mail and calendar accounts are walked?** Outpost reads Mail.app's
> and Calendar.app's local stores, so any account synced *inside* those
> apps is picked up — including an IMAP'd Gmail account in Mail.app and a
> CalDAV-synced Google Calendar in Calendar.app. Mail or calendar that
> lives only outside those apps (the Gmail web app, a separate Outlook
> client) is not seen.

```sh
brew install claude                     # Runtime: Outpost spawns claude as a subprocess
npm install @forwardimpact/outpost      # macOS only
npx fit-outpost init ~/Documents/Team   # Initialize knowledge base
npx fit-outpost daemon                  # Start the scheduler
npx fit-outpost status                  # Check what's happening
```

### macOS Privacy & Security

Outpost agents need access to specific folders (Documents, Mail, Calendar). When
macOS prompts, grant only the folders each process needs via **System Settings >
Privacy & Security > Files & Folders**:

- **Outpost.app** — the TCC responsible process (Swift launcher)
- **node** — runs skill scripts with `#!/usr/bin/env node` shebangs
- **"2.1.72"** (or another version number) — this is the **Claude Code CLI**.
  macOS shows its version string instead of a name. Safe to grant per-folder
  access.

<div class="grid">

<!-- part:card:../docs/getting-started/engineers/outpost -->

</div>
