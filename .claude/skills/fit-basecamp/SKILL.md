---
name: fit-basecamp
description: Work with the @forwardimpact/basecamp package. Use when modifying the scheduler, build system, KB template, KB skills, install scripts, or configuration.
---

# Basecamp Package

Personal knowledge system with scheduled Claude Code tasks. No server, no
database — just plain files, markdown, and the `claude` CLI. Packaged as a
native macOS app bundle (`Basecamp.app`) with TCC-compliant process management.

## When to Use

- Modifying the scheduler logic (task execution, scheduling, state)
- Working with the build system (Deno compile, Swift build, app bundle)
- Adding or modifying KB template files (CLAUDE.md, USER.md)
- Adding or modifying KB skills (sync, extract, draft, etc.)
- Changing install/uninstall scripts
- Modifying scheduler configuration format
- Working with the Swift app launcher or status menu
- Working with the posix_spawn FFI wrapper

## Package Structure

```
products/basecamp/
  src/
    basecamp.js           # Main entry point and CLI (cross-platform)
    posix-spawn.js        # Deno FFI wrapper for posix_spawn (macOS)
  macos/
    Basecamp/             # Swift package: app launcher + status menu
      Package.swift
      Sources/
        main.swift        # App entry point, NSApplication lifecycle
        AppDelegate.swift # Manages scheduler process and status menu
        ProcessManager.swift # posix_spawn wrapper, child lifecycle
        StatusMenu.swift  # Status bar UI
        DaemonConnection.swift # Unix socket IPC with scheduler
    Info.plist            # App bundle metadata
    Basecamp.entitlements # TCC entitlements
  config/
    scheduler.json        # Default scheduler configuration
  pkg/
    build.js              # Build orchestrator (Deno + Swift + app)
    macos/
      build-app.sh        # Assemble Basecamp.app bundle
      build-pkg.sh        # Build macOS installer package (.pkg)
      postinstall         # pkg postinstall script (LaunchAgent + KB setup)
      uninstall.sh        # Uninstaller
      welcome.html        # Installer welcome
      conclusion.html     # Installer conclusion
  template/               # KB template (copied on --init)
    CLAUDE.md             # Claude Code instructions for KB
    USER.md               # User identity template
    .claude/
      settings.json       # Claude Code permissions
      skills/             # KB skills (built-in)
```

## CLI

```sh
deno run --allow-all src/basecamp.js                     # Run due tasks once
deno run --allow-all src/basecamp.js --daemon             # Run continuously
deno run --allow-all src/basecamp.js --run <task>         # Run specific task
deno run --allow-all src/basecamp.js --init <path>        # Initialize a new KB
deno run --allow-all src/basecamp.js --status             # Show task status
deno run --allow-all src/basecamp.js --validate           # Validate references
deno run --allow-all src/basecamp.js --help               # Show help
```

## Architecture

### Process Tree (App Bundle)

```
Basecamp.app/Contents/MacOS/Basecamp      ← Swift launcher, TCC responsible
├── fit-basecamp --daemon                 ← Deno scheduler (posix_spawn)
│   └── claude --print ...                ← spawned via posix_spawn FFI
└── [status menu UI]                      ← AppKit menu bar, in-process
```

### Main CLI (`src/basecamp.js`)

Single-file CLI that:

1. Reads `~/.fit/basecamp/scheduler.json` for KB definitions and task configs
2. Checks each task against its schedule (interval, cron, or once)
3. Invokes `claude --print` with the task prompt in the target KB directory
4. Tracks state in `~/.fit/basecamp/state.json`

Key functions:

- `shouldRun(task, taskState, now)` — Schedule evaluation
- `runTask(taskName, task, config, state)` — Task execution (posix_spawn)
- `initKB(targetPath)` — Knowledge base initialization
- `getBundlePath()` — Detect app bundle, discover resources
- `cronMatches(expr, date)` — Cron expression matching
- `validate()` — Validate agent/skill references exist

### posix_spawn FFI (`src/posix-spawn.js`)

Deno FFI wrapper for `posix_spawn` (macOS only). Always used for spawning child
processes. Calls `responsibility_spawnattrs_setdisclaim` so child processes
inherit TCC attributes from the responsible binary (Basecamp.app).

### Swift App Launcher (`macos/Basecamp/`)

- `AppDelegate.swift` — Manages ProcessManager and StatusMenu
- `ProcessManager.swift` — Spawns scheduler via `posix_spawn`, monitors child
- `StatusMenu.swift` — Status bar UI, connects to scheduler via Unix socket IPC
- `DaemonConnection.swift` — Socket protocol (status, restart, run commands)

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

### Build System (`pkg/build.js`)

Deno-based build that:

1. Compiles `src/basecamp.js` into a standalone binary via `deno compile`
2. Builds the Swift app launcher via `swift build`
3. Assembles `Basecamp.app` bundle (via `build-app.sh`)
4. Optionally creates macOS installer packages (.pkg)

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
- Task execution: `runTask()` — invokes `claude` CLI via posix_spawn
- posix_spawn: always used, TCC disclaim via
  `responsibility_spawnattrs_setdisclaim`
- State management: `loadState()`, `saveState()`
- All in `src/basecamp.js` — single file, no dependencies

### Modifying the Build

- `pkg/build.js` — Build orchestrator (compile + swift build + app assembly)
- `pkg/macos/build-app.sh` — Assembles Basecamp.app bundle
- `pkg/macos/build-pkg.sh` — Installer package creation
- `pkg/macos/postinstall` — pkg postinstall script (runs as root)
- Justfile recipes wrap all build steps

### Modifying the Swift Launcher

- `macos/Basecamp/Sources/` — Swift source files
- `macos/Info.plist` — Bundle metadata (CFBundleIdentifier, LSUIElement, etc.)
- `macos/Basecamp.entitlements` — TCC entitlements
- Build with `just build-launcher` or
  `swift build -c release --package-path macos/Basecamp`

### Testing

The scheduler is a standalone script with no test framework. Test manually:

```sh
just status                              # Verify config loads
deno run --allow-all src/basecamp.js --validate   # Verify skills/agents exist
just run-task <task>                      # Test a specific task
just init /tmp/test-kb                   # Test KB initialization
```

## Verification

```sh
just status               # Check config and state
just run                  # Run due tasks once
just build                # Verify build works
just build-app            # Verify app bundle assembles
```
