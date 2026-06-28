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

### Where your data lives

Outpost runs on your Mac and keeps your data on it. This answers where your
context lives, where AI calls go, and Forward Impact's role — a different
question from the enterprise-CA note above.

**On-device storage.** Every place Outpost-handled content lands is on your
device:

- The knowledge base at the path you pass to `npx fit-outpost init`, including
  the `drafts/` directory inside it where drafted emails are written.
- Outpost's cache directory (`~/.cache/fit/outpost/`), holding all synced source
  content and each agent's per-wake output.
- Apple Mail's local store, which Outpost reads from.
- Apple Calendar's local store, which Outpost reads from. (See
  [Getting Started](#getting-started) for which accounts are picked up.)
- Outpost's scheduler home (`~/.fit/outpost/`) — config, runtime state, logs,
  and a local socket; the log and state files retain bounded excerpts of agent
  output.

**Where AI calls go.** Outpost delegates every AI call to the Claude Code CLI
already installed on your Mac; it does not select or override the endpoint. The
endpoint is therefore whichever provider your Claude Code is configured to reach
— by default the
[Anthropic API](https://docs.claude.com/en/docs/claude-code/settings). Each
call's prompt carries the user content the agent assembled for that wake
(knowledge-graph excerpts, synced mail and calendar content).

The model endpoint is not the only egress. Agents in the default install
templates also make outbound calls beyond it: scheduled scans of public sources,
and browser automation that sends messages through your chat web apps.

**Forward Impact's role.** The Outpost product runs no Forward Impact-operated
server that processes your content — it is a local scheduler around your own
Claude Code installation, and AI calls reach the provider you configured
(Anthropic by default), not Forward Impact.

**Regulated workloads.** No BAA, SOC 2 attestation, or enterprise
data-processing agreement exists for Outpost today. If your data is under a
regulated gate, run your own approval process before adopting it.

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
npx fit-outpost init                    # Initialize the default "Team" knowledge base
npx fit-outpost daemon                  # Start the scheduler
npx fit-outpost status                  # Check what's happening
```

### macOS Privacy & Security

Outpost needs access to the live Mail and Calendar stores it reads. Grant every
permission to a single app, **fit-outpost.app**, and the whole scheduler and the
agents it runs are covered. You never grant access to `node`, `claude`, or any
other helper process.

Outpost runs two kinds of agent, and they need different access:

- **`full` agents** sync the live Mail and Calendar stores or send mail. They
  read those stores and drive Mail under the one `fit-outpost.app` grant.
- **`restricted` agents** only process already-synced content and your knowledge
  base, which lives outside every protected folder
  (`~/.local/share/fit/outpost/`). They need **no** macOS grant — even if
  compromised, a `restricted` agent cannot reach protected files.

When macOS prompts for the Mail and Calendar stores, grant **Full Disk Access**
to `fit-outpost.app`. If a draft-side skill sends mail, macOS also prompts once
under **Automation** to let `fit-outpost.app` control Mail — click **Allow**.
Your knowledge base needs no grant.

<div class="grid">

<!-- part:card:../docs/getting-started/engineers/outpost -->

</div>
