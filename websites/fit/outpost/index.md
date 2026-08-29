---
title: Outpost
description: Walk into every meeting already oriented. Scheduled AI tasks assemble your context and keep your knowledge organized.
layout: product
toc: false
hero:
  image: /assets/scene-outpost.svg
  alt: An engineer, an AI robot, and a business professional setting up an A-frame tent together
  subtitle: Set up camp. Outpost keeps you prepared. A team of scheduled agents syncs your email, calendar, and chat. The agents build a knowledge graph, prepare meeting briefs, and draft responses in the background while you work.
  cta:
    - label: View on GitHub
      href: https://github.com/forwardimpact/monorepo/tree/main/products/outpost
    - label: View on npm
      href: https://www.npmjs.com/package/@forwardimpact/outpost
      secondary: true
---

You walk into a meeting cold because your context sits scattered across email,
Slack, and last week's notes. Outpost assembles and maintains that context. You
then arrive already oriented.

## What becomes possible

### For Empowered Engineers

Keep track of people, projects, and threads. You do not depend on memory. Walk
into every meeting already oriented. Set the team up once. A team of agents
then keeps your awareness current in the background.

- A team of scheduled agents that sync mail, calendar, and Teams chat while you
  work
- A shared knowledge graph of people, organizations, projects, and topics, kept
  current as messages arrive
- A daily briefing that synthesizes what changed into your priorities
- Meeting briefs assembled before every call from attendee history and open
  threads
- Drafted email replies, chat messages, documents, and slide decks grounded in
  your context, when you opt into drafting
- Optional recruitment agents that screen candidates against your engineering
  standard

---

## How Outpost Works

Outpost runs a **team of agents** rather than a single chat assistant. Each
agent has a job and wakes on its own schedule. On each wake, an agent observes
what changed, decides the most useful action, and does it. The agent then goes
back to sleep. You configure the team once. The team then works without
further input from you.

### Your agent team

A fresh install ships six agents. Each carries a small set of skills and a cron
schedule you can edit or disable in `~/.fit/outpost/scheduler.json`.

| Agent              | What it does                                             | Runs                    | Access     |
| ------------------ | -------------------------------------------------------- | ----------------------- | ---------- |
| **postman**        | Syncs mail and Teams, triages messages, drafts replies   | every 15 min, work hours | full       |
| **concierge**      | Syncs calendar, prepares meeting briefs, files transcripts | every 30 min, work hours | full       |
| **librarian**      | Extracts entities into the knowledge graph, organizes files | four times a day       | restricted |
| **chief-of-staff** | Synthesizes every agent's notes into a daily briefing    | morning and evening     | restricted |
| **recruiter**      | Screens CVs and assesses interviews against your standard | three times a day       | restricted |
| **head-hunter**    | Scans public sources for open candidates, never contacts them | each morning       | restricted |

Each agent writes a short note per wake. The **chief-of-staff** reads all of
them to assemble the daily briefing. You do not assemble it by hand.
`full` and `restricted` refer to macOS access. See
[macOS Privacy and Security](#macos-privacy-and-security) below. The recruitment
agents (`recruiter`, `head-hunter`) ground their judgments in your
[Pathway](/pathway/) engineering standard. Leave them disabled if you do not
hire.

### What your agents can do

The team's abilities come from skills. Skills are self-contained capabilities
the agents load as needed. The default install ships these skills, grouped by
purpose. Skills that compose content (marked **draft**) run only after you
opt into the [`brief+draft` posture](#choosing-your-posture).

| Area                       | Skills                                                                       |
| -------------------------- | ---------------------------------------------------------------------------- |
| **Sync sources**           | Apple Mail, Apple Calendar, Microsoft Teams chat                             |
| **Build the knowledge graph** | Extract entities, organize files (**draft**), record a changelog          |
| **Prepare for meetings**   | Meeting prep, process and trim meeting-notes sessions, follow up             |
| **Compose and send** (**draft**) | Draft email replies, send chat messages                                |
| **Documents and decks**    | Create and collaborate on documents (create is **draft**), create, review, and summarize slide decks |
| **Look people up**         | Identify yourself and look up anyone in the corporate directory              |
| **Recruit engineers**      | Scan, track, screen, assess, decide on, and forget candidates                |

Outpost auto-discovers skills from the knowledge base. You can add your own or
pull updates with `npx fit-outpost update`.

### Prerequisites

Outpost spawns `claude` as a subprocess. It does not load your shell profile.
Install Claude Code through **Homebrew** (`brew install claude`) rather than the
native binary. The Homebrew install runs on Node.js, which supports
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

Outpost runs on your Mac and keeps your data on it. This section covers where
your context lives, where AI calls go, and Forward Impact's role. The
enterprise-CA note above covers a different topic.

**On-device storage.** All content that Outpost handles lands on your
device:

- The knowledge base at the path you pass to `npx fit-outpost init`. It
  contains the `drafts/` directory, where Outpost writes drafted emails.
- Outpost's cache directory (`~/.cache/fit/outpost/`), which holds all synced
  source content and each agent's per-wake output.
- Apple Mail's local store, which Outpost reads from.
- Apple Calendar's local store, which Outpost reads from. See
  [Getting Started](#getting-started) for the accounts Outpost picks up.
- Outpost's scheduler home (`~/.fit/outpost/`), which holds config, runtime
  state, logs, and a local socket. The log and state files retain bounded
  excerpts of agent output.

**Where AI calls go.** Outpost delegates every AI call to the Claude Code CLI
already installed on your Mac. It does not select or override the endpoint.
The endpoint is therefore whichever provider you configured Claude Code to
reach. By default that is the
[Anthropic API](https://docs.claude.com/en/docs/claude-code/settings). Each
call's prompt carries the user content the agent assembled for that wake
(knowledge-graph excerpts, synced mail and calendar content).

The model endpoint is not the only egress. Agents in the default install
templates also make outbound calls beyond it. Those calls include scheduled
scans of public sources. They also include browser automation that sends
messages through your chat web apps.

**Forward Impact's role.** The Outpost product runs no Forward Impact-operated
server that processes your content. It is a local scheduler around your own
Claude Code installation. AI calls reach the provider you configured (Anthropic
by default). They do not reach Forward Impact.

**Regulated workloads.** No BAA, SOC 2 attestation, or enterprise
data-processing agreement exists for Outpost today. If your data is under a
regulated gate, run your own approval process before you adopt it.

---

## Choosing your posture

Before you turn Outpost on, decide how much it acts on your behalf. You record
this choice at `init`. The scheduler honours it on every wake. Outpost has two
postures. The CLI and `fit-outpost status` name them the same way:

- **`brief`** — the default. Outpost runs only skills whose every output stays
  inside its own knowledge base or cache. These skills sync your mail and
  calendar, build the knowledge graph, and prepare briefings. Outpost never
  composes a reply, message, or document for someone else. It never moves
  files outside the knowledge base. In this posture, Outpost reads and briefs
  only.
- **`brief+draft`** — everything `brief` does, plus the skills that compose
  content as you: email replies, chat messages, and documents. Outpost drafts
  these items and stages them for your review. Nothing leaves until you give
  explicit approval. Choose this posture when you also want help to write.

A fresh `init` defaults to `brief`. You opt into drafting deliberately. The
trust contract never turns on without your action.

## Getting Started

> **Outpost currently requires macOS.** Email and calendar sync read from
> Apple Mail and Apple Calendar. A transitive dependency
> (`@forwardimpact/libmacos`) declares `"os": ["darwin"]`. `npm install
> @forwardimpact/outpost` fails on Linux and Windows with `EBADPLATFORM`.
> No degraded mode exists today. A cross-platform degraded install
> (without Apple sync) is on the roadmap. Until it ships, install Outpost on
> a Mac.
>
> **Mail and calendar account coverage.** Outpost reads Mail.app's
> and Calendar.app's local stores. It picks up any account you sync *inside*
> those apps. That includes a Gmail account synced over IMAP in Mail.app and a
> Google Calendar synced over CalDAV in Calendar.app. Outpost does not see
> mail or calendar data that lives only outside those apps, for example the
> Gmail web app or a separate Outlook client.

```sh
brew install claude                     # Runtime: Outpost spawns claude as a subprocess
npm install @forwardimpact/outpost      # macOS only
npx fit-outpost init                    # Initialize the default "Team" knowledge base
npx fit-outpost daemon                  # Start the scheduler
npx fit-outpost status                  # Check what each agent is doing
```

After the scheduler runs, these commands drive the team day to day:

| Command                       | What it does                                            |
| ----------------------------- | ------------------------------------------------------- |
| `fit-outpost status`          | Show each agent's schedule, last wake, and last action  |
| `fit-outpost wake <agent>`    | Wake one agent now and do not wait for its schedule     |
| `fit-outpost posture [mode]`  | Show or set the adoption posture (`brief`, `brief+draft`) |
| `fit-outpost update`          | Pull the latest instructions, agents, and skills into a KB |
| `fit-outpost validate`        | Confirm every configured agent has a definition         |
| `fit-outpost stop`            | Gracefully stop the daemon and any active agents         |

### macOS Privacy and Security

Outpost needs access to the live Mail and Calendar stores it reads. Grant every
permission to a single app, **fit-outpost.app**. That grant covers the whole
scheduler and the agents it runs. You never grant access to `node`, `claude`,
or any other helper process.

Outpost runs two kinds of agent. They need different access:

- **`full` agents** sync the live Mail and Calendar stores or send mail. They
  read those stores and drive Mail under the one `fit-outpost.app` grant.
- **`restricted` agents** only process already-synced content and your knowledge
  base, which lives outside every protected folder
  (`~/.local/share/fit/outpost/`). They need **no** macOS grant. A
  `restricted` agent cannot reach protected files, even if an attacker
  compromises it.

When macOS prompts for the Mail and Calendar stores, grant **Full Disk Access**
to `fit-outpost.app`. If a draft-side skill sends mail, macOS also prompts once
under **Automation** to let `fit-outpost.app` control Mail. Click **Allow**.
Your knowledge base needs no grant.

<div class="grid">

<!-- part:card:../docs/getting-started/engineers/outpost -->

</div>
