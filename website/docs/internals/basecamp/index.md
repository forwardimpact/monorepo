---
title: Basecamp Internals
description: "Scheduler architecture — component table, process tree, macOS app, cache directory, and state management."
---

## Architecture

```mermaid
flowchart TD
    CLI["fit-basecamp CLI"] --> Scheduler
    Scheduler --> State["state.json"]
    Scheduler --> Tasks["Configured Tasks"]
    Tasks --> Claude["Claude CLI"]
    Claude --> KB["Knowledge Base"]
    Claude --> Skills["KB Skills (.claude/skills/)"]
```

The composition root (`src/basecamp.js`) wires `StateManager` -> `AgentRunner`
-> `Scheduler` -> `SocketServer` with explicit dependency passing.

---

## Components

| Component       | Path                                         | Purpose                               |
| --------------- | -------------------------------------------- | ------------------------------------- |
| CLI & Scheduler | `products/basecamp/src/basecamp.js`          | Main entry point, daemon, task runner |
| State Manager   | `products/basecamp/src/state-manager.js`     | Task run state persistence            |
| Agent Runner    | `products/basecamp/src/agent-runner.js`      | Claude CLI process spawning           |
| Scheduler       | `products/basecamp/src/scheduler.js`         | Interval-based task execution         |
| Socket Server   | `products/basecamp/src/socket-server.js`     | IPC for macOS app communication       |
| KB Manager      | `products/basecamp/src/kb-manager.js`        | Knowledge base operations             |
| Default Config  | `products/basecamp/config/scheduler.json`    | Default task definitions              |
| KB Template     | `products/basecamp/template/`                | Template for new knowledge bases      |
| KB Skills       | `products/basecamp/template/.claude/skills/` | AI skill definitions for KB tasks     |
| macOS App       | `products/basecamp/macos/`                   | Native status menu bar app            |

---

## macOS App

Basecamp includes a native macOS menu bar application built in Swift. The app
provides a status menu icon, scheduler status display, and task execution
controls.

```
products/basecamp/macos/
  Info.plist
  Basecamp.entitlements
  Basecamp/
    Package.swift
    Sources/
      main.swift              # App entry point
      AppDelegate.swift       # Application delegate
      StatusMenu.swift        # Status menu implementation
      DaemonConnection.swift  # Daemon IPC
      ProcessManager.swift    # Process lifecycle
```

### Building

```sh
cd products/basecamp
bun run build:macos
```

### Process Tree (App Bundle)

When running as an app bundle, the process hierarchy is:

```
Basecamp.app (Swift launcher)
  -> fit-basecamp --daemon (Node.js scheduler)
     -> claude (spawned per task execution)
     -> claude (spawned per task execution)
```

The Swift launcher starts the daemon process and communicates with it via the
socket server for status updates and task control.

---

## State Management

Task state is stored in `~/.fit/basecamp/state.json`:

```json
{
  "sync-apple-mail": {
    "lastRun": "2025-01-15T10:30:00.000Z",
    "status": "success"
  }
}
```

The `StateManager` class reads and writes this file, tracking last run times and
status for each task. The scheduler uses this state to determine which tasks are
due for execution based on their configured intervals.

---

## Cache Directory

```
~/.cache/fit/basecamp/
  apple_mail/       Cached Apple Mail data
  apple_calendar/   Cached Apple Calendar data
  drafts/           Draft responses
  state/            Intermediate processing state
```

---

## Logging

Logs are written to `~/.fit/basecamp/logs/scheduler-YYYY-MM-DD.log`. Basecamp
uses a local `createLogger(logDir, fs)` function (not libtelemetry) since it is
a user-facing CLI tool.

---

## Related Documentation

- [Knowledge Systems Guide](/docs/guides/knowledge-systems/) -- Knowledge base
  setup and usage
- [Pathway Internals](/docs/internals/pathway/) -- Agent profile format used by
  tasks
