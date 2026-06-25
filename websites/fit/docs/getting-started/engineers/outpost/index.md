---
title: "Getting Started: Outpost for Engineers"
description: "Initialize your personal knowledge base, configure background AI tasks, and start the scheduler."
---

Outpost is your personal operations center. It syncs email and calendar, builds
a knowledge graph, drafts responses, and prepares meeting briefings — all
running as scheduled AI tasks in the background.

## Prerequisites

- **macOS** — required. Outpost syncs from Apple Mail and Apple Calendar,
  and a transitive dependency (`@forwardimpact/libmacos`) declares
  `"os": ["darwin"]`. `npm install` fails on Linux and Windows with
  `EBADPLATFORM`. A cross-platform degraded install (without Apple sync) is
  on the roadmap; until it ships, install on a Mac.
- **Mail and calendar accounts** — Outpost reads through Mail.app and
  Calendar.app. Any account synced *inside* those apps is walked,
  including an IMAP'd Gmail account in Mail.app and a CalDAV-synced
  Google Calendar in Calendar.app. Mail or calendar that lives only
  outside those apps (the Gmail web app, a separate Outlook client) is
  not picked up.
- Node.js 22+
- npm
- Claude Code installed via **Homebrew** (`brew install claude`) — Outpost
  spawns `claude` as a subprocess and the Homebrew install supports
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

On Linux or Windows this install fails with `EBADPLATFORM` citing
`@forwardimpact/libmacos`. That dependency is hard today; nothing in the
package degrades cleanly off-Apple yet. Switch to a Mac to continue.

## Initialize a knowledge base

```sh
npx fit-outpost init ~/Documents/Personal
```

## Check status

```sh
npx fit-outpost status
```

## Run the scheduler

```sh
npx fit-outpost daemon
```

Outpost runs as a macOS status menu app with scheduled AI tasks handling
background work. The CLI scheduler works on any platform.

## macOS Privacy & Security

Outpost agents need access to specific folders (Documents, Mail, Calendar). When
macOS prompts, grant only the folders each process needs via **System Settings >
Privacy & Security > Files & Folders**:

- **fit-outpost.app** — the TCC responsible process (Swift launcher)
- **node** — runs skill scripts with `#!/usr/bin/env node` shebangs
- **"2.1.72"** (or another version number) — this is the **Claude Code CLI**.
  macOS shows its version string instead of a name. Safe to grant per-folder
  access.

---

## What's next

<div class="grid">

<!-- part:card:../../../../outpost -->
<!-- part:card:../../../products/knowledge-systems -->

</div>
