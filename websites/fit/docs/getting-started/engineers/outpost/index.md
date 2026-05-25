---
title: "Getting Started: Outpost for Engineers"
description: "Initialize your personal knowledge base, configure background AI tasks, and start the scheduler."
---

Outpost is your personal operations center. It syncs email and calendar, builds
a knowledge graph, drafts responses, and prepares meeting briefings — all
running as scheduled AI tasks in the background.

## Prerequisites

- Node.js 22+
- npm
- macOS (for Apple Mail and Calendar sync)
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

```sh
npm install @forwardimpact/outpost
```

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

- **Outpost.app** — the TCC responsible process (Swift launcher)
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
