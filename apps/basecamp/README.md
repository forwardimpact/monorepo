# @forwardimpact/basecamp

A personal knowledge system that runs as scheduled Claude Code tasks. No server,
no database — just plain files, markdown, and the `claude` CLI. Packaged as a
native macOS app bundle (`Basecamp.app`) with TCC-compliant process management.

Part of the [Forward Impact](https://www.forwardimpact.team) monorepo.

## Architecture

```
Basecamp.app/                             # macOS app bundle
└── Contents/
    ├── Info.plist                         # Bundle metadata (LSUIElement)
    ├── MacOS/
    │   ├── Basecamp                      # Swift launcher (TCC responsible)
    │   └── fit-basecamp                  # Deno scheduler (child process)
    └── Resources/
        ├── config/scheduler.json         # Default config
        └── template/                     # KB template

~/.fit/basecamp/                          # Scheduler home (user config)
├── scheduler.json                        # Task definitions
├── state.json                            # Task run state
├── basecamp.sock                         # IPC socket
└── logs/                                 # Scheduler logs

~/Documents/Personal/                     # Default personal knowledge base
├── CLAUDE.md                             # Claude Code instructions for this KB
├── knowledge/                            # The knowledge graph
│   ├── People/
│   ├── Organizations/
│   ├── Projects/
│   └── Topics/
├── .claude/skills/                       # Claude Code skill files
└── drafts/                               # Email drafts
```

### Process Tree

```
Basecamp (Swift launcher, CFBundleExecutable, TCC responsible)
├── fit-basecamp --daemon    (Deno scheduler, spawned via posix_spawn)
│   └── claude --print ...   (spawned via posix_spawn FFI)
└── [status menu UI]         (AppKit menu bar, in-process)
```

The Swift launcher is the main executable and TCC responsible process. It spawns
the Deno scheduler via `posix_spawn` so child processes inherit TCC attributes.
Users grant Calendar, Contacts, and other permissions once to Basecamp.app.

## Install from Package

1. Double-click `fit-basecamp-<version>.pkg`
2. Follow the installer prompts

The installer places `Basecamp.app` in `/Applications/` and initializes
`~/Documents/Personal/` as the default knowledge base.

After installing, open Basecamp from `/Applications/`. It runs as a menu bar app
— use "Quit Basecamp" from the status menu to stop it.

To uninstall, run `just uninstall` from the source tree.

## Install from Source

```bash
cd apps/basecamp

# Run the scheduler in dev mode
just daemon

# Or initialize a new KB
just init ~/Documents/Personal

# Configure your identity
vi ~/Documents/Personal/USER.md
```

## Building

Requires [Deno](https://deno.com) >= 2.x and Xcode Command Line Tools.

```bash
# Build scheduler + launcher binaries
just build

# Build + assemble Basecamp.app
just build-app

# Build + assemble + .pkg installer
just pkg

# Or via npm:
npm run build           # binaries only
npm run build:app       # + Basecamp.app
npm run build:pkg       # + .pkg installer
```

Output goes to `dist/`:

```
dist/
├── fit-basecamp             # Deno scheduler binary
├── Basecamp                 # Swift launcher binary
└── Basecamp.app/            # Assembled app bundle
```

## Multiple Knowledge Bases

The scheduler can run tasks across multiple knowledge bases. Each KB is an
independent directory with its own CLAUDE.md, skills, and knowledge graph.

### Adding a new KB

```bash
# Initialize a new knowledge base
deno run --allow-all src/basecamp.js --init ~/Documents/Team

# Edit the scheduler config to register it
vi ~/.fit/basecamp/scheduler.json
```

### Scheduler config format

`~/.fit/basecamp/scheduler.json`:

```json
{
  "tasks": {
    "sync-personal-mail": {
      "kb": "~/Documents/Personal",
      "schedule": { "type": "interval", "minutes": 5 },
      "enabled": true,
      "skill": "sync-apple-mail",
      "prompt": "Sync Apple Mail."
    },
    "sync-team-calendar": {
      "kb": "~/Documents/Team",
      "schedule": { "type": "interval", "minutes": 10 },
      "enabled": true,
      "skill": "sync-apple-calendar",
      "prompt": "Sync Apple Calendar."
    }
  }
}
```

### Task fields

| Field      | Required | Description                                                     |
| ---------- | -------- | --------------------------------------------------------------- |
| `kb`       | yes      | Path to the knowledge base directory (supports `~`)             |
| `schedule` | yes      | When to run (`interval`, `cron`, or `once`)                     |
| `prompt`   | yes      | The prompt sent to Claude                                       |
| `enabled`  | no       | Set to `false` to disable. Default: `true`                      |
| `agent`    | no       | Claude sub-agent name (passed as `--agent`)                     |
| `skill`    | no       | Skill name (matches `.claude/skills/<name>/SKILL.md` in the KB) |

### Schedule types

```json
{ "type": "interval", "minutes": 5 }
{ "type": "cron", "expression": "0 8 * * *" }
{ "type": "once", "runAt": "2025-02-12T10:00:00Z" }
```

## CLI Reference

```
fit-basecamp                     Run due tasks once and exit
fit-basecamp --daemon            Run continuously (poll every 60s)
fit-basecamp --run <task>        Run a specific task immediately
fit-basecamp --init <path>       Initialize a new knowledge base
fit-basecamp --status            Show knowledge bases and task status
fit-basecamp --validate          Validate agents and skills exist
fit-basecamp --help              Show this help
```

When running from source, use `deno run --allow-all src/basecamp.js` or
`just run` instead of `fit-basecamp`.

## Skills

Skills are Claude Code-native `SKILL.md` files that are auto-discovered from
`.claude/skills/<name>/SKILL.md` inside each knowledge base. The default KB
ships with these skills:

| Skill                  | Directory              | Purpose                                        |
| ---------------------- | ---------------------- | ---------------------------------------------- |
| Sync Apple Mail        | `sync-apple-mail`      | Sync Apple Mail threads via SQLite             |
| Sync Apple Calendar    | `sync-apple-calendar`  | Sync Apple Calendar events via SQLite          |
| Extract Entities       | `extract-entities`     | Process synced data into knowledge graph notes |
| Draft Emails           | `draft-emails`         | Draft email responses using knowledge context  |
| Meeting Prep           | `meeting-prep`         | Prepare briefings for upcoming meetings        |
| Create Presentations   | `create-presentations` | Create slide decks as PDF                      |
| Document Collaboration | `doc-collab`           | Document creation and collaboration            |
| Organize Files         | `organize-files`       | File organization and cleanup                  |

## Requirements

- Claude CLI (`claude`) installed and authenticated
- macOS 13+ (Ventura or later)
- Xcode Command Line Tools (for building the Swift launcher)
- Deno >= 2.x (for building the standalone binary)

## License

Apache-2.0
