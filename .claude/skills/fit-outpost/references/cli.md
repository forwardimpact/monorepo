# CLI Reference

## Operations

```sh
npx fit-outpost                         # Wake due agents once and exit
npx fit-outpost daemon                  # Run continuously (poll every 60s)
npx fit-outpost wake <agent>            # Wake a specific agent immediately
npx fit-outpost stop                    # Gracefully stop daemon and all running agents
npx fit-outpost status                  # Show agent status and last decisions
npx fit-outpost validate [path]         # Validate agent definitions and knowledge bases
```

`validate` with a path runs the knowledge checks on that one KB root: tier
ranks, link direction, resolution, and format, literal path strings, legacy
layouts, and frontmatter and tags. Without a path, it checks the agent
definitions and then every configured knowledge base. A
`validation-baseline.json` file at the KB root downgrades known findings to
warnings. New findings exit non-zero. `--json` emits the findings as one
JSON array. A share recipient can validate a received subset of tiers the
same way.

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
