---
name: fit-svscan
description: >
  Run the supervision daemon that keeps a tree of services alive and accepts
  control commands over a Unix socket. Use when you need a pure supervisor behind
  `fit-rc` — it knows nothing about service order or oneshots, only how to keep
  processes running.
---

# Run the Supervision Daemon

`fit-svscan` is the supervision daemon that `fit-rc` drives. It manages a
supervision tree, restarts processes that exit, and listens on a Unix domain
socket for `add`, `remove`, `status`, `shutdown`, and `ping` commands. It is a
pure supervisor: it has no knowledge of service ordering or one-shot tasks —
that logic lives in `fit-rc`.

## When to Use

- Start the daemon behind a service manager — see the example below
- Provide the socket `fit-rc` connects to for start/stop/status
- Supervise a process tree with automatic restart

## Usage

```sh
npx fit-svscan --socket data/svscan.sock --pid data/svscan.pid --logdir data/logs
```

| Option      | Short | Default | Effect                            |
| ----------- | ----- | ------- | --------------------------------- |
| `--socket`  | `-s`  | required | Unix socket path for commands.   |
| `--pid`     | `-p`  | required | PID file path.                   |
| `--logdir`  | `-l`  | required | Directory for supervised logs.   |
| `--timeout` | `-t`  | `3000`  | Shutdown timeout in milliseconds. |

In normal operation you do not invoke `fit-svscan` directly — `fit-rc start`
launches it and sends it commands. Run it by hand only to operate the supervisor
standalone or to debug supervision behavior.

## Documentation

- [Start, Stop, or Check a Service](https://www.forwardimpact.team/docs/libraries/service-lifecycle/manage-service/index.md)
  — Manage services through one interface; `fit-svscan` is the supervision daemon
  `fit-rc` drives.
- [Manage Service Lifecycle from One Interface](https://www.forwardimpact.team/docs/libraries/service-lifecycle/index.md)
  — The full lifecycle setup, including supervision and observability.
