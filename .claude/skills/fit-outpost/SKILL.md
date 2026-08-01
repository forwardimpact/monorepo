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

- Prepare daily briefings from email, calendar, and knowledge context —
  `npx fit-outpost wake briefing`
- Manage email drafts and prepare responses — `npx fit-outpost wake drafts`
- Maintain a personal knowledge graph of people, projects, and topics

**Manage the scheduler and knowledge base:**

- Run the scheduler continuously — `npx fit-outpost daemon`
- Check agent status and last decisions — `npx fit-outpost status`
- Wake a specific agent immediately — `npx fit-outpost wake <agent>`
- Initialize a new knowledge base — `npx fit-outpost init <path>`
- Update with the latest templates and skills — `npx fit-outpost update`
- Stop the scheduler — `npx fit-outpost stop`
- Validate agent/skill references — `npx fit-outpost validate`
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

The `init <path>` command copies the bundled template into the target
directory. The template holds `CLAUDE.md` (instructions), `.claude/agents/` and
`.claude/skills/` (built-in agents and skills), and `.claude/settings.json`
(permissions). `init` also scaffolds the knowledge base structure. The
`Knowledge/` graph (People, Organizations, Projects, Topics) is for the team to
share over a synced filesystem. The personal `Briefings/` directory sits at the
KB root, outside the shared graph. The template does not copy the user identity.
The `identify-user` skill resolves it live and caches it at
`~/.cache/fit/outpost/state/identity.md`. The `update` command on an existing
KB merges new files and keeps user customizations. It reconciles the settings
permissions. It does not replace them.

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

Synced data and runtime state live outside the KB. Notes, drafts, and briefings
live inside it.

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

1. Create `template/.claude/skills/{skill-name}/SKILL.md`
2. Add YAML front matter with `name`, `description`, optional `compatibility`
3. Write the skill workflow (trigger, prerequisites, inputs, outputs, steps)
4. Update `template/CLAUDE.md` to list the new skill
5. If scheduled, add a default task entry to `config/scheduler.json`
6. Run `npx fit-outpost update <kb-path>` for each existing KB to push the new
   skill. As an alternative, run `npx fit-outpost update` from inside the KB to
   update the current directory

## Verification

```sh
npx fit-outpost status         # Check config and agent state
npx fit-outpost validate       # Verify agent/skill references exist
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
