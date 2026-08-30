---
name: fit-outpost
description: >
  Keep track of people, projects, and threads. You do not depend on memory.
  Use when context is scattered across email, calendar, and notes and you
  need a daily briefing. Use when you manage email drafts. Use when you
  schedule background AI tasks, maintain a personal knowledge base, check
  agent status, and wake agents on demand.
---

# Outpost Package

Outpost is a personal knowledge system with scheduled Claude Code agents. It
needs no server and no database. It uses plain files, markdown, and the
`claude` CLI. Outpost ships as a native macOS app bundle (`fit-outpost.app`)
with TCC-compliant process management.

## When to Use

**Be prepared and productive:**

- Prepare daily briefings — `npx fit-outpost wake briefing`
- Manage email drafts and prepare responses — `npx fit-outpost wake drafts`
- Maintain a personal knowledge graph of people, projects, and topics

**Manage the scheduler and knowledge base:**

- Run the scheduler continuously — `npx fit-outpost daemon`
- Check agent status and last decisions — `npx fit-outpost status`
- Wake a specific agent immediately — `npx fit-outpost wake <agent>`
- Initialize a new knowledge base — `npx fit-outpost init <path>`
- Update with the latest templates and skills — `npx fit-outpost update`
- Stop the scheduler — `npx fit-outpost stop`
- Validate agent definitions and knowledge bases — `npx fit-outpost validate`
- Add, remove, disable, or change agent schedules — edit
  `~/.fit/outpost/scheduler.json`

---

## How It Works

### Schedules

The scheduler polls configured tasks and evaluates whether each should wake:

- **Cron tasks** — the scheduler matches the 5-field cron expression against
  the current time. It skips the task if the agent already woke in the same
  minute
- **Interval tasks** — the task wakes when the elapsed time since the last
  wake exceeds the configured interval in minutes
- **Once tasks** — the task wakes exactly once when the scheduled time arrives

The scheduler always skips tasks with `enabled: false` or an already-active
agent. On startup it resets stale agents left "active" from a previous daemon
session.

### Task Execution

When a task wakes, the scheduler spawns a child process. That process runs
`claude --agent <name> --print` with the configured prompt. The process inherits
TCC attributes from the parent app bundle (through `posix_spawn` on macOS).
Agents can then access Mail, Calendar, and other protected resources.
`state.json` tracks agent status, exit code, and stderr.

### Knowledge Base Initialization

The `init` command copies the bundled template (instructions, agents, skills,
settings, and the `registry.yaml` metadata vocabularies) and creates the five
default tier directories plus the personal `Briefings/` directory. The
`update` command merges new template files and keeps user customizations.

The KB root is an Obsidian vault. The numbered tier directories at the root
are the knowledge graph and the units of sharing:

| Tier | Directory         | Audience                               |
| ---- | ----------------- | -------------------------------------- |
| 0    | `0-Draft/`        | The owner only. Never shared.          |
| 1    | `1-Management/`   | Senior managers.                       |
| 2    | `2-Confidential/` | Managers with people or hiring duties. |
| 3    | `3-Team/`         | The whole team.                        |
| 4    | `4-Public/`       | Anyone, inside or outside the team.    |

A note links only to notes in its own tier or in a wider tier, with
tier-prefixed links such as `[[3-Team/People/Sarah Chen]]`. Place each note
in the widest tier that excludes everyone who must not read it. Every other
root entry is personal and never shared.

`validate [path] [--json]` checks tier ranks, link direction, resolution,
and format, literal path strings, legacy layouts, and frontmatter and tags,
on a full vault or a received share. A `validation-baseline.json` file at
the KB root downgrades known findings to warnings. New findings exit
non-zero. `--json` emits the findings as one JSON array.

---

## CLI Reference

See [`references/cli.md`](references/cli.md) for full command listings.

---

## Architecture

### Process Tree (App Bundle)

```text
fit-outpost.app/Contents/MacOS/Outpost  ← Swift launcher, TCC responsible
├── fit-outpost daemon                   ← Node.js scheduler (posix_spawn)
│   └── claude --print ...                ← spawned via posix_spawn FFI
└── [status menu UI]                      ← AppKit menu bar, in-process
```

### Cache Directory

Synced data and runtime state live outside the KB.

```text
~/.cache/fit/outpost/
├── apple_mail/         # Synced email threads (.md)
├── apple_calendar/     # Synced calendar events (.json)
├── teams_chat/         # Synced Teams chats (.md)
└── state/              # Runtime state (plain text files)
```

---

## Common Tasks

### Manage Agent Schedules

Configure agent schedules in `~/.fit/outpost/scheduler.json`. The file has this
structure:

```json
{
  "env": { ... },
  "agents": {
    "agent-name": {
      "kb": "~/path/to/knowledge-base",
      "schedule": { "type": "cron", "expression": "0 9 * * 1-5" },
      "enabled": true
    }
  }
}
```

Each key in `agents` is the agent name. The name matches a definition in
`.claude/agents/`. The schedule types are:

- `{"type": "cron", "expression": "<5-field cron>"}` — standard cron
- `{"type": "interval", "minutes": N}` — every N minutes since last wake
- `{"type": "once"}` — fires once then never again

**Remove an agent** — delete its key from the `agents` object.

**Disable without removal** — set `"enabled": false`. The config stays and the
scheduler does not wake the agent. Set it back to `true` to enable the agent
again.

**Change schedule** — edit the `schedule` object. Examples:

```json
"schedule": { "type": "cron", "expression": "*/15 8-18 * * 1-5" }
"schedule": { "type": "interval", "minutes": 30 }
```

### Add a New KB Skill

1. Create `templates/.claude/skills/{skill-name}/SKILL.md` with YAML front
   matter (`name`, `description`, optional `compatibility`)
2. Write the skill workflow (trigger, prerequisites, inputs, outputs, steps)
3. Update `templates/CLAUDE.md` to list the new skill
4. If scheduled, add a default task entry to `config/scheduler.json`
5. Run `npx fit-outpost update` in each existing KB to push the new skill

## Verification

```sh
npx fit-outpost status         # Check config and agent state
npx fit-outpost validate       # Validate agent definitions and knowledge bases
```

## Documentation

- [Outpost Overview](https://www.forwardimpact.team/outpost/index.md) — Product
  overview, audience model, and key concepts
- [Getting Started: Outpost for Engineers](https://www.forwardimpact.team/docs/getting-started/engineers/outpost/index.md)
  — From zero to your first daily briefing
- [Keep Track of Context Without Effort](https://www.forwardimpact.team/docs/products/knowledge-systems/index.md)
  — Maintain continuous awareness of people, projects, and threads
- [Walk Into Every Meeting Already Oriented](https://www.forwardimpact.team/docs/products/knowledge-systems/meeting-prep/index.md)
  — Assemble context so you arrive prepared
