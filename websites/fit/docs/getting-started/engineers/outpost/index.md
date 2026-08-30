---
title: "Getting Started: Outpost for Engineers"
description: "Initialize your personal knowledge base, configure background AI tasks, and start the scheduler."
---

Outpost is your personal operations center. It syncs email and calendar, builds
a knowledge graph, drafts responses, and prepares meeting briefings. It runs all
of these as scheduled AI tasks in the background.

## Prerequisites

- **macOS** — required. Outpost syncs from Apple Mail and Apple Calendar.
  A transitive dependency (`@forwardimpact/libmacos`) declares
  `"os": ["darwin"]`. `npm install` fails on Linux and Windows with
  `EBADPLATFORM`. A cross-platform degraded install (without Apple sync) is
  on the roadmap. Until it ships, install on a Mac.
- **Mail and calendar accounts** — Outpost reads through Mail.app and
  Calendar.app. Outpost walks any account synced *inside* those apps. That
  includes a Gmail account synced over IMAP in Mail.app and a Google Calendar
  synced over CalDAV in Calendar.app. Outpost does not pick up mail or calendar
  that lives only outside those apps (the Gmail web app, a separate Outlook
  client).
- Node.js 22+
- npm
- Claude Code installed with **Homebrew** (`brew install claude`) — Outpost
  spawns `claude` as a subprocess. The Homebrew install supports
  `NODE_EXTRA_CA_CERTS` for enterprise CA certificates

If your network requires a custom CA bundle, add an `env` block to
`~/.fit/outpost/scheduler.json`:

```json
{
  "env": {
    "NODE_EXTRA_CA_CERTS": "~/.config/ssl/ca-bundle.pem"
  }
}
```

## Install

On macOS:

```sh
npm install @forwardimpact/outpost
```

On Linux or Windows this install fails with `EBADPLATFORM` and cites
`@forwardimpact/libmacos`. That dependency is a hard requirement today. No part
of the package degrades cleanly off Apple platforms yet. Switch to a Mac to
continue.

## Initialize a knowledge base

```sh
npx fit-outpost init
```

The command provisions the default `Team` knowledge base at
`~/.local/share/fit/outpost/Team`. Pass a name (for example,
`npx fit-outpost init personal`) to provision a second one beside it.

The knowledge base root is an Obsidian vault. After init it holds five tier
directories, the personal `Briefings/` directory, and the bundled files:

```text
~/.local/share/fit/outpost/Team/
├── 0-Draft/          # Tier 0: you only, never shared
├── 1-Management/     # Tier 1: senior managers
├── 2-Confidential/   # Tier 2: managers with hiring duties
├── 3-Team/           # Tier 3: the whole team
├── 4-Public/         # Tier 4: anyone
├── Briefings/        # Personal: daily briefings
├── registry.yaml     # Personal: metadata vocabularies
├── CLAUDE.md         # Personal: agent instructions
└── .claude/          # Personal: agents, skills, settings
```

The numbered tiers hold the knowledge graph. Each tier is one unit of
sharing. A lower tier number means a narrower audience. Every other root
entry is personal and never shared. Entity folders such as `3-Team/People/`
appear when an agent first writes to them.

## Validate the knowledge base

```sh
npx fit-outpost validate ~/.local/share/fit/outpost/Team
```

The command checks tier ranks, link direction and format, and note
frontmatter. A fresh knowledge base passes with no findings.

## Check status

```sh
npx fit-outpost status
```

## Run the scheduler

```sh
npx fit-outpost daemon
```

Outpost runs as a macOS status menu app. Scheduled AI tasks handle the
background work. The CLI scheduler works on any platform.

## macOS Privacy & Security

Outpost needs access to the live Mail and Calendar stores it reads. Grant every
permission to a single app, **fit-outpost.app**. That grant covers the whole
scheduler and the agents it runs. You never grant access to `node`, `claude`, or
any other helper process.

Outpost runs two kinds of agent, and they need different access:

- **`full` agents** sync the live Mail and Calendar stores or send mail. They
  read those stores and drive Mail under the one `fit-outpost.app` grant.
- **`restricted` agents** only process already-synced content and your knowledge
  base, which lives outside every protected folder
  (`~/.local/share/fit/outpost/`). They need **no** macOS grant. Even a
  compromised `restricted` agent cannot reach protected files.

When macOS prompts for the Mail and Calendar stores, grant **Full Disk Access**
to `fit-outpost.app`. If a draft-side skill sends mail, macOS also prompts once
under **Automation** to let `fit-outpost.app` control Mail. Click **Allow**.
Your knowledge base needs no grant.

---

## What's next

<div class="grid">

<!-- part:card:../../../../outpost -->
<!-- part:card:../../../products/knowledge-systems -->

</div>
