---
name: fit-outpost
description: >
  Keep track of people, projects, and threads without depending on
  memory. Use when context is scattered across email, calendar, and notes
  and you need a daily briefing, when managing email drafts, or when
  scheduling background AI tasks, maintaining a personal knowledge base,
  checking agent status, and waking agents on demand.
---

# Outpost Package

Personal knowledge system with scheduled Claude Code agents. No server, no
database — just plain files, markdown, and the `claude` CLI. Packaged as a
native macOS app bundle (`Outpost.app`) with TCC-compliant process management.

## When to Use

**Be prepared and productive:**

- Preparing daily briefings from email, calendar, and knowledge context — `npx fit-outpost wake briefing`
- Managing email drafts and response preparation — `npx fit-outpost wake drafts`
- Maintaining a personal knowledge graph of people, projects, and topics

**Manage the scheduler and knowledge base:**

- Running the scheduler continuously — `npx fit-outpost daemon`
- Checking agent status and last decisions — `npx fit-outpost status`
- Waking a specific agent immediately — `npx fit-outpost wake <agent>`
- Initializing a new knowledge base — `npx fit-outpost init <path>`
- Updating with latest templates and skills — `npx fit-outpost update`
- Stopping the scheduler — `npx fit-outpost stop`
- Validating agent/skill references — `npx fit-outpost validate`
- Adding, removing, disabling, or changing agent schedules — edit `~/.fit/outpost/scheduler.json`

---

## How It Works

### Scheduling

The scheduler polls configured tasks and evaluates whether each should wake:

- **Cron tasks** — the 5-field cron expression is matched against the current
  time; skipped if the agent already woke in the same minute
- **Interval tasks** — wakes when elapsed time since last wake exceeds the
  configured interval in minutes
- **Once tasks** — wakes exactly once when the scheduled time arrives

Tasks with `enabled: false` or an already-active agent are always skipped. Stale
agents left "active" from a previous daemon session are automatically reset on
startup.

### Task Execution

When a task wakes, the scheduler spawns a child process running
`claude --agent <name> --print` with the configured prompt. The process inherits
TCC attributes from the parent app bundle (via `posix_spawn` on macOS) so agents
can access Mail, Calendar, and other protected resources. Agent status, exit
code, and stderr are tracked in `state.json`.

### Knowledge Base Initialization

Running `init <path>` copies the bundled template into the target directory:
`CLAUDE.md` (instructions), `.claude/skills/` (built-in skills), and
`.claude/settings.json` (permissions). User identity is not a copied file — it
is resolved live by the `identify-user` skill, which caches it at
`~/.cache/fit/outpost/state/identity.md`. Running `update` on an existing KB
merges new files without overwriting user customizations — settings permissions
are reconciled rather than replaced.

---

## CLI Reference

See [`references/cli.md`](references/cli.md) for full command listings.

---

## Architecture

### Process Tree (App Bundle)

```
Outpost.app/Contents/MacOS/Outpost      ← Swift launcher, TCC responsible
├── fit-outpost daemon                   ← Node.js scheduler (posix_spawn)
│   └── claude --print ...                ← spawned via posix_spawn FFI
└── [status menu UI]                      ← AppKit menu bar, in-process
```

### Cache Directory

Synced data lives outside the KB:

```
~/.cache/fit/outpost/
├── apple_mail/         # Synced email threads (.md)
├── apple_calendar/     # Synced calendar events (.json)
├── drafts/             # Email drafts (.md)
└── state/              # Runtime state (plain text files)
```

---

## Common Tasks

### Managing Agent Schedules

Agent schedules are configured in `~/.fit/outpost/scheduler.json`. The file has
this structure:

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

Each key in `agents` is the agent name matching a definition in
`.claude/agents/`. The schedule types are:

- `{"type": "cron", "expression": "<5-field cron>"}` — standard cron
- `{"type": "interval", "minutes": N}` — every N minutes since last wake
- `{"type": "once"}` — fires once then never again

**Remove an agent** — delete its key from the `agents` object.

**Disable without removing** — set `"enabled": false` to keep the config but
stop the scheduler from waking it. Set back to `true` to re-enable.

**Change schedule** — edit the `schedule` object. Examples:

```json
"schedule": { "type": "cron", "expression": "*/15 8-18 * * 1-5" }
"schedule": { "type": "interval", "minutes": 30 }
```

### Adding a New KB Skill

1. Create `template/.claude/skills/{skill-name}/SKILL.md`
2. Add YAML front matter with `name`, `description`, optional `compatibility`
3. Write the skill workflow (trigger, prerequisites, inputs, outputs, steps)
4. Update `template/CLAUDE.md` to list the new skill
5. If scheduled, add a default task entry to `config/scheduler.json`
6. Run `npx fit-outpost update` to push the new skill to existing KBs

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
