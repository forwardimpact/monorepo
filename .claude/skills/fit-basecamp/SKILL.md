---
name: fit-basecamp
description: Work with the @forwardimpact/basecamp package. Use when modifying the scheduler, build system, KB template, KB skills, install scripts, or configuration.
---

# Basecamp Package

Personal knowledge system with scheduled Claude Code tasks. No server, no
database — just plain files, markdown, and the `claude` CLI.

## When to Use

- Modifying the scheduler logic (task execution, scheduling, state)
- Working with the build system (Deno compile, pkg creation)
- Adding or modifying KB template files (CLAUDE.md, USER.md)
- Adding or modifying KB skills (sync, extract, draft, etc.)
- Changing install/uninstall scripts
- Modifying scheduler configuration format
- Working with the LaunchAgent integration

## Package Structure

```
apps/basecamp/
  basecamp.js             # Main entry point and CLI
  build.js              # Deno compile + pkg build script
  config/
    scheduler.json      # Default scheduler configuration
  scripts/
    install.sh          # Installer (dev/repo context)
    uninstall.sh        # Uninstaller
    compile.sh          # Compile standalone binary
    build-pkg.sh        # Build macOS installer package (.pkg)
    postinstall         # pkg postinstall script (LaunchAgent + KB setup)
    pkg-resources/      # Installer welcome/conclusion HTML
  template/             # KB template (copied on --init)
    CLAUDE.md           # Claude Code instructions for KB
    USER.md             # User identity template
    .claude/
      settings.json     # Claude Code permissions
      skills/           # KB skills (8 built-in)
```

## CLI

```sh
npx fit-basecamp                     # Run due tasks once and exit
npx fit-basecamp --daemon            # Run continuously (poll every 60s)
npx fit-basecamp --run <task>        # Run a specific task immediately
npx fit-basecamp --init <path>       # Initialize a new knowledge base
npx fit-basecamp --install-launchd   # Install macOS LaunchAgent
npx fit-basecamp --uninstall-launchd # Remove macOS LaunchAgent
npx fit-basecamp --validate          # Validate agents and skills exist
npx fit-basecamp --status            # Show task status
npx fit-basecamp --help              # Show help
```

## Architecture

### Main CLI (`basecamp.js`)

Single-file CLI that:

1. Reads `~/.fit/basecamp/scheduler.json` for KB definitions and task configs
2. Checks each task against its schedule (interval, cron, or once)
3. Invokes `claude --print` with the task prompt in the target KB directory
4. Tracks state in `~/.fit/basecamp/state.json`

Key functions:

- `shouldRun(task, taskState, now)` — Schedule evaluation
- `runTask(taskName, task, config, state)` — Task execution
- `initKB(targetPath)` — Knowledge base initialization
- `installLaunchd()` / `uninstallLaunchd()` — macOS LaunchAgent management
- `cronMatches(expr, date)` — Cron expression matching
- `validate()` — Validate agent/skill references exist

### Cache Directory

Synced data lives outside the KB in `~/.cache/fit/basecamp/`:

```
~/.cache/fit/basecamp/
├── apple_mail/         # Synced email threads (.md)
├── apple_calendar/     # Synced calendar events (.json)
├── drafts/             # Email drafts (.md)
└── state/              # Runtime state (plain text files)
```

### Configuration

`~/.fit/basecamp/scheduler.json` — task definitions with:

- `kb` — Path to the knowledge base directory (supports `~`)
- `schedule` — Interval, cron, or one-time
- `prompt` — Text sent to Claude
- `skill` — Skill name (auto-discovered from `.claude/skills/`)
- `agent` — Optional Claude sub-agent name
- `enabled` — Toggle task on/off

### Build System (`build.js`)

Deno-based build that:

1. Compiles `basecamp.js` into a standalone binary via `deno compile`
2. Embeds the `template/` directory into the binary
3. Optionally creates macOS installer packages (.pkg)

Build targets: `aarch64-apple-darwin`, `x86_64-apple-darwin`

## KB Skills

Built-in skills in `template/.claude/skills/`:

| Skill                  | Directory               | Purpose                       |
| ---------------------- | ----------------------- | ----------------------------- |
| Sync Apple Mail        | `sync-apple-mail/`      | Sync Mail.app via SQLite      |
| Sync Apple Calendar    | `sync-apple-calendar/`  | Sync Calendar.app via SQLite  |
| Extract Entities       | `extract-entities/`     | Build knowledge graph         |
| Draft Emails           | `draft-emails/`         | Draft responses with context  |
| Meeting Prep           | `meeting-prep/`         | Create meeting briefings      |
| Create Presentations   | `create-presentations/` | Generate PDF slide decks      |
| Document Collaboration | `doc-collab/`           | Document editing workflows    |
| Organize Files         | `organize-files/`       | File organization and cleanup |
| Track Candidates       | `track-candidates/`     | Recruitment pipeline tracking |
| Process Hyprnote       | `process-hyprnote/`     | Hyprnote session extraction   |

Skills are Claude Code-native SKILL.md files. They are auto-discovered by Claude
from `.claude/skills/<name>/SKILL.md` inside each knowledge base.

## Common Tasks

### Adding a New KB Skill

1. Create `template/.claude/skills/{skill-name}/SKILL.md`
2. Add YAML front matter with `name`, `description`, and optional
   `compatibility`
3. Write the skill workflow (trigger, prerequisites, inputs, outputs, steps)
4. Update `template/CLAUDE.md` to list the new skill
5. If scheduled, add a default task entry to `config/scheduler.json`

### Modifying the Scheduler

- Schedule logic: `shouldRun()`, `cronMatches()`, `floorToMinute()`
- Task execution: `runTask()` — invokes `claude` CLI
- State management: `loadState()`, `saveState()`
- All in `basecamp.js` — single file, no dependencies

### Modifying the Build

- `build.js` — Deno build script (compile + pkg)
- `scripts/compile.sh` — Shell compile wrapper
- `scripts/build-pkg.sh` — Installer package creation
- `scripts/postinstall` — pkg postinstall script (runs as root)
- Both the JS and shell scripts work — JS is used by `npm run build`, shell
  scripts are used by the justfile

### Testing

The scheduler is a standalone script with no test framework. Test manually:

```sh
npx fit-basecamp --status            # Verify config loads
npx fit-basecamp --validate          # Verify skills/agents exist
npx fit-basecamp --run <task>        # Test a specific task
npx fit-basecamp --init /tmp/test-kb # Test KB initialization
```

## Verification

```sh
npx fit-basecamp --status     # Check config and state
npx fit-basecamp --validate   # Validate task references
npx fit-basecamp --help       # Verify CLI works
```
