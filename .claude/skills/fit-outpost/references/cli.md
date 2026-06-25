# CLI Reference

### Operations

```sh
npx fit-outpost                         # Wake due agents once and exit
npx fit-outpost daemon                  # Run continuously (poll every 60s)
npx fit-outpost wake <agent>            # Wake a specific agent immediately
npx fit-outpost stop                    # Gracefully stop daemon and all running agents
npx fit-outpost status                  # Show agent status and last decisions
npx fit-outpost validate                # Validate agent definitions exist
```

### Knowledge Base Management

```sh
npx fit-outpost init <path>             # Initialize a new knowledge base
npx fit-outpost update [path]           # Update KB at [path] (default: current dir)
```

### Key Paths

| Path                            | Purpose                              |
| ------------------------------- | ------------------------------------ |
| `~/.fit/outpost/scheduler.json` | Agent/task definitions               |
| `~/.fit/outpost/state.json`     | Runtime state (last run, etc.)       |
| `~/.fit/outpost/logs/`          | Agent execution logs                 |
| `~/.cache/fit/outpost/`         | Synced data (mail, calendar, drafts) |

### Configuration (`scheduler.json`)

Each task entry defines:

- `kb` — Path to the knowledge base directory (supports `~`)
- `schedule` — `{"type": "interval", "minutes": N}`,
  `{"type": "cron", "expression": "..."}`, or `{"type": "once"}`
- `prompt` — Text sent to Claude
- `skill` — Skill name (auto-discovered from `.claude/skills/`)
- `agent` — Optional Claude sub-agent name
- `enabled` — Toggle task on/off
